import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantRepository } from "./restaurants.repository.interface.ts";

@injectable()
export class RestaurantRepository implements IRestaurantRepository {
  private readonly db: DbClient;

  // Em transações: new RestaurantRepository(tx)
  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: Prisma.restaurantsCreateInput) {
    return this.db.restaurants.create({ data });
  }

  findAll() {
    return this.db.restaurants.findMany({ orderBy: { created_at: "desc" } });
  }

  findById(id: string) {
    return this.db.restaurants.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.db.restaurants.findUnique({ where: { slug } });
  }

  update(id: string, data: Prisma.restaurantsUpdateInput) {
    return this.db.restaurants.update({ where: { id }, data });
  }

}
