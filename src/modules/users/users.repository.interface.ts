import type { Prisma, role, staff_category, users } from "../../../generated/prisma/client.ts";

// Objeto final que o repository grava: senha já hasheada e role definida pelo service
export type CreateUserData = {
  name: string;
  restaurant_id?: string;
  email: string;
  password_hash: string;
  role: role;
  category?: staff_category;
};

export interface IUserRepository {
  create(data: CreateUserData): Promise<users>;
  findByEmail(email: string): Promise<users | null>;
  findForAuth(id: string): Promise<(users & { restaurant: { active: boolean } | null }) | null>;
  findById(restaurantId: string, id: string): Promise<users | null>;
  findMany(restaurantId: string): Promise<users[]>;
  update(restaurantId: string, id: string, data: Prisma.usersUpdateInput): Promise<users>;
  delete(restaurantId: string, id: string): Promise<users>;
}
