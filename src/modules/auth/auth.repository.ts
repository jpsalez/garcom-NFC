import { role } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma, type DbClient } from "../../shared/providers/prisma.ts";


export type CreateUserData = {
  name: string;
  restaurant_id: string;
  email: string;
  password_hash: string;
  role: role;
};

export class RestaurantRepository {
  private readonly db: DbClient;

  constructor(db: DbClient = prisma) {
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

export class UserRepository {
  private readonly db: DbClient;

  constructor(db: DbClient = prisma) {
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
