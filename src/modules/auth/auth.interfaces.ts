import type { Prisma, restaurants, role, users } from "../../../generated/prisma/client.ts";
import type { createUserInput, loginUserInput } from "./auth.schema.ts";

// Objeto final que o repository grava: senha já hasheada e role definida pelo service
export type CreateUserData = {
  name: string;
  restaurant_id?: string;
  email: string;
  password_hash: string;
  role: role;
};

export interface IRestaurantRepository {
  create(data: Prisma.restaurantsCreateInput): Promise<restaurants>;
  findById(id: string): Promise<restaurants | null>;
  findBySlug(slug: string): Promise<restaurants | null>;
  update(id: string, data: Prisma.restaurantsUpdateInput): Promise<restaurants>;
  delete(id: string): Promise<restaurants>;
}

export interface IUserRepository {
  create(data: CreateUserData): Promise<users>;
  findByEmail(email: string): Promise<users | null>;
  findById(restaurantId: string, id: string): Promise<users | null>;
  findMany(restaurantId: string): Promise<users[]>;
  update(restaurantId: string, id: string, data: Prisma.usersUpdateInput): Promise<users>;
  delete(restaurantId: string, id: string): Promise<users>;
}


// Usuário sem o hash da senha, seguro para devolver na resposta
export type PublicUser = Omit<users, "password_hash">;

export type LoginResult = {
  token: string;
  user: PublicUser;
};

export interface IAuthService {
  register(createUser: createUserInput): Promise<PublicUser>;
  login(credentials: loginUserInput): Promise<LoginResult>;
}
