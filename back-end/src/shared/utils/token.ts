import { createHash, randomBytes, randomInt } from "node:crypto";

// Sem 0/o/1/l/i: ninguém erra ao digitar ou ler o código impresso
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PUBLIC_CODE_LENGTH = 12;

// Código da URL pública da mesa (QR/NFC). Aleatório de verdade: nunca Math.random().
export function generatePublicCode() {
  let code = "";
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

// Token do aparelho do cliente: o valor vai só para ele; o banco guarda apenas o hash
export function generateSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
