import type { users } from "../../../generated/prisma/client.ts";
import type { PublicUser } from "../auth/auth.interfaces.ts";

// Nunca devolve o hash da senha
export function toPublicUser(user: users): PublicUser {
  const { password_hash, ...publicUser } = user;
  return publicUser;
}
