import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateUserData, IRestaurantRepository, IUserRepository } from "./auth.interfaces.ts";

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

  findById(id: string) {
    return this.db.restaurants.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.db.restaurants.findUnique({ where: { slug } });
  }

  update(id: string, data: Prisma.restaurantsUpdateInput) {
    return this.db.restaurants.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.db.restaurants.delete({ where: { id } });
  }
}

@injectable()
export class UserRepository implements IUserRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateUserData) {
    return this.db.users.create({ data });
  }

  // Login: ainda não há tenant, e-mail é único globalmente
  findByEmail(email: string) {
    return this.db.users.findUnique({ where: { email } });
  }

  findById(restaurantId: string, id: string) {
    return this.db.users.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  findMany(restaurantId: string) {
    return this.db.users.findMany({ where: { restaurant_id: restaurantId } });
  }

  update(restaurantId: string, id: string, data: Prisma.usersUpdateInput) {
    return this.db.users.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  delete(restaurantId: string, id: string) {
    return this.db.users.delete({ where: { id, restaurant_id: restaurantId } });
  }
}
