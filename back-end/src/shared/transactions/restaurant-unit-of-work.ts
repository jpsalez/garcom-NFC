import { injectable } from "tsyringe";
import { RestaurantRepository } from "../../modules/restaurants/restaurants.repository.ts";
import { UserRepository } from "../../modules/users/users.repository.ts";
import { requireCapability } from "../authorization/capabilities.ts";
import type { ActorContext } from "../authorization/capabilities.ts";
import { AppError } from "../errors/AppError.ts";
import { NotFoundError, UnauthorizedError } from "../errors/http-errors.ts";
import { runInTransaction } from "../providers/prisma.ts";
import type { IRestaurantUnitOfWork, RestaurantTransaction } from "./restaurant-unit-of-work.interface.ts";
import { performance } from "node:perf_hooks";
import { logOperation } from "../utils/request-context.ts";

@injectable()
export class RestaurantUnitOfWork implements IRestaurantUnitOfWork {
  async run<T>(
    restaurantId: string,
    work: (context: RestaurantTransaction) => Promise<T>,
    options: Parameters<IRestaurantUnitOfWork["run"]>[2] = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const started = performance.now();
      let lockWait = 0;
      try {
        const result = await runInTransaction(async (db) => {
          const repository = new RestaurantRepository(db);
          await repository.lock(restaurantId);
          lockWait = performance.now() - started;
          const restaurant = await repository.findById(restaurantId);
          if (!restaurant || (!restaurant.active && !options.allowInactive))
            throw new NotFoundError("Restaurante não encontrado");
          let actor: ActorContext | undefined;
          if (options.actor) {
            const user = await new UserRepository(db).findById(restaurantId, options.actor.id);
            if (!user?.active) throw new UnauthorizedError("Usuário inválido ou inativo");
            actor = { id: user.id, restaurantId, role: user.role, category: user.category };
            if (options.capability) requireCapability(actor, options.capability);
          }
          const [clock] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          if (!clock) throw new Error("Relógio do banco indisponível");
          return work({ db, restaurant, now: clock.now, actor });
        });
        logOperation({
          event: "restaurant.transaction",
          restaurant_id: restaurantId,
          operation: options.capability ?? "restaurant.operation",
          attempt,
          wait_ms: Math.round(lockWait),
          duration_ms: Math.round(performance.now() - started),
          success: true,
        });
        return result;
      } catch (error) {
        const failure = error as { code?: string; meta?: { code?: string } };
        logOperation({
          event: "restaurant.transaction",
          restaurant_id: restaurantId,
          operation: options.capability ?? "restaurant.operation",
          attempt,
          error_code: failure.code,
          duration_ms: Math.round(performance.now() - started),
          success: false,
        });
        if (
          failure.code !== "P2034" &&
          !(failure.code === "P2010" && ["40P01", "40001"].includes(failure.meta?.code ?? ""))
        )
          throw error;
        if (attempt >= 2)
          throw new AppError("Repita a operação", 503, undefined, "RETRYABLE_TRANSACTION_FAILURE");
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
      }
    }
  }
}
