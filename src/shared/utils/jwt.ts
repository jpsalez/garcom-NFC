import jwt, { type SignOptions } from "jsonwebtoken";
import type { role } from "../../../generated/prisma/enums.ts";

// Dados que vão dentro do token (sub = id do usuário)
export type TokenPayload = {
  sub: string;
  restaurantId: string | null;
  role: role;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não definido no .env");
  return secret;
}

export function signToken(payload: TokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "1d") as SignOptions["expiresIn"];
  return jwt.sign(payload, getSecret(), { expiresIn, algorithm: "HS256" });
}

// Lança erro se o token for inválido, adulterado ou expirado
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });

  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Payload do token inválido");
  }

  return decoded as TokenPayload;
}
