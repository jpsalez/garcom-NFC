import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateUserData, IUserRepository } from "./users.repository.interface.ts";

@injectable()
export class UserRepository implements IUserRepository {
  private readonly db: DbClient;

  // Em transações: new UserRepository(tx)
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

  // Autenticação do token: ainda não há tenant; traz se o restaurante está ativo
  findForAuth(id: string) {
    return this.db.users.findUnique({ where: { id }, include: { restaurant: { select: { active: true } } } });
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
