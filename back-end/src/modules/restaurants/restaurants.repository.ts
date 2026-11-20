import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantRepository } from "./restaurants.repository.interface.ts";
import { type CreateRestaurantData, initialRestaurantData } from "./restaurant-initialization.ts";

@injectable()
export class RestaurantRepository implements IRestaurantRepository {
  private readonly db: DbClient;

  // Em transações: new RestaurantRepository(tx)
  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateRestaurantData) {
    return this.db.restaurants.create({ data: initialRestaurantData(data) });
  }

  findAll() {
    return this.db.restaurants.findMany({ orderBy: { created_at: "desc" } });
  }

  findById(restaurantId: string) {
    return this.db.restaurants.findUnique({ where: { id: restaurantId } });
  }

  findBySlug(slug: string) {
    return this.db.restaurants.findUnique({ where: { slug } });
  }

  // Trava a linha do restaurante até o fim da transação: pedidos que mudam a equipe dele passam um de cada vez
  async lock(restaurantId: string) {
    await this.db.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId} FOR UPDATE`;
  }

  update(restaurantId: string, data: Prisma.restaurantsUpdateInput) {
    return this.db.restaurants.update({ where: { id: restaurantId }, data });
  }
}
