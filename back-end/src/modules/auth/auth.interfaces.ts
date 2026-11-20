import type { users } from "../../../generated/prisma/client.ts";
import type { PublicRestaurant } from "../restaurants/public-restaurant.ts";
import type { changePasswordInput, createUserInput, loginUserInput } from "./auth.schema.ts";

// Usuário sem o hash da senha, seguro para devolver na resposta
export type PublicUser = Omit<users, "password_hash">;

export type RegisterResult = {
  user: PublicUser;
  restaurant: PublicRestaurant;
};

// token: JWT de acesso (curto); refreshToken: troca por um par novo em POST /auth/refresh
export type LoginResult = {
  token: string;
  refreshToken: string;
  user: PublicUser;
};

export interface ITokenCleanupService {
  // Apaga refresh tokens e links de redefinição vencidos; devolve quantos apagou
  purgeExpired(): Promise<number>;
}

export interface IAuthService {
  register(createUser: createUserInput): Promise<RegisterResult>;
  login(credentials: loginUserInput): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<LoginResult>;
  logout(refreshToken: string): Promise<void>;
  // Troca a senha, derruba as sessões dos outros aparelhos e devolve um par novo para este
  changePassword(userId: string, input: changePasswordInput): Promise<LoginResult>;
  me(userId: string): Promise<PublicUser>;
}
