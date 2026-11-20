import { randomBytes } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { print_destinations } from "../../../generated/prisma/client.ts";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { hashToken } from "../../shared/utils/token.ts";
import type { IPrintingService, PrintingStatus } from "./printing.interfaces.ts";
import type { AgentProof, IPrintingRepository } from "./printing.repository.interface.ts";
import { PrintingRepository } from "./printing.repository.ts";

const destination = "KITCHEN";
const pairingTtlMs = 10 * 60 * 1000;
const clearCode = { pairing_code_hash: null, pairing_expires_at: null };

function status(row: print_destinations | null): PrintingStatus {
  return {
    destination,
    enabled: row?.enabled ?? false,
    paired: Boolean(row?.credential_hash),
    last_contact_at: row?.last_contact_at ?? null,
  };
}

@injectable()
export class PrintingService implements IPrintingService {
  constructor(
    @inject("PrintingRepository") private repository: IPrintingRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}

  private tenant(actor: ActorContext) {
    requireCapability(actor, "printing:configure");
    if (!actor.restaurantId) throw new ForbiddenError();
    return actor.restaurantId;
  }

  async get(actor: ActorContext) {
    return status(await this.repository.get(this.tenant(actor), destination));
  }

  async setEnabled(actor: ActorContext, enabled: boolean) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (enabled && !row?.credential_hash)
          throw new ConflictError("Pareie o agente antes de ativar a impressão", "PRINT_AGENT_NOT_PAIRED");
        if (!row || row.enabled === enabled) return status(row);
        return status(await repository.update(restaurantId, destination, { enabled }));
      },
      { actor, capability: "printing:configure" },
    );
  }

  async issueCode(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const code = randomBytes(10).toString("hex");
        const expiresAt = new Date(now.getTime() + pairingTtlMs);
        await new PrintingRepository(db).savePairingCode(
          restaurantId,
          destination,
          hashToken(code),
          expiresAt,
        );
        return { code, expires_at: expiresAt };
      },
      { actor, capability: "printing:configure" },
    );
  }

  async revoke(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    await this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new PrintingRepository(db);
        if (!(await repository.get(restaurantId, destination))) return;
        await repository.update(restaurantId, destination, {
          ...clearCode,
          enabled: false,
          credential_hash: null,
          last_contact_at: null,
        });
      },
      { actor, capability: "printing:configure" },
    );
  }

  private async scope(proof: AgentProof) {
    const scope = await this.repository.findByHash(proof);
    if (!scope) throw new UnauthorizedError("Pareamento de impressão inválido");
    return { restaurantId: scope.restaurant_id, destination: scope.destination };
  }

  async pair(code: string) {
    const hash = hashToken(code);
    const { restaurantId, destination } = await this.scope({ pairing_code_hash: hash });
    return this.unit.run(
      restaurantId,
      async ({ db, now, restaurant }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (
          !restaurant.active ||
          row?.pairing_code_hash !== hash ||
          !row.pairing_expires_at ||
          row.pairing_expires_at <= now
        )
          throw new UnauthorizedError("Pareamento de impressão inválido");
        const credential = `print_${randomBytes(32).toString("base64url")}`;
        await repository.update(restaurantId, destination, {
          ...clearCode,
          enabled: false,
          credential_hash: hashToken(credential),
          last_contact_at: now,
        });
        return { destination, credential };
      },
      { allowInactive: true },
    );
  }

  async contact(credential: string) {
    const hash = hashToken(credential);
    const { restaurantId, destination } = await this.scope({ credential_hash: hash });
    await this.unit.run(
      restaurantId,
      async ({ db, now, restaurant }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (!restaurant.active || row?.credential_hash !== hash)
          throw new UnauthorizedError("Pareamento de impressão inválido");
        await repository.update(restaurantId, destination, { last_contact_at: now });
      },
      { allowInactive: true },
    );
  }
}
