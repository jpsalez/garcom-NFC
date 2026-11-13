import type { restaurants, users } from "../../../generated/prisma/client.ts";
import type { createUserInput, loginUserInput } from "./auth.schema.ts";

// Usuário sem o hash da senha, seguro para devolver na resposta
export type PublicUser = Omit<users, "password_hash">;

export type RegisterResult = {
  user: PublicUser;
  restaurant: restaurants;
};

export type LoginResult = {
  token: string;
  user: PublicUser;
};

export interface IAuthService {
  register(createUser: createUserInput): Promise<RegisterResult>;
  login(credentials: loginUserInput): Promise<LoginResult>;
}
