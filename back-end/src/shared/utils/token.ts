import { randomInt } from "node:crypto";

// Sem 0/o/1/l/i: ninguém erra ao digitar ou ler o código impresso
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PUBLIC_CODE_LENGTH = 12;

// Código da URL pública da mesa (QR/NFC). Aleatório de verdade: nunca Math.random().
export function generatePublicCode() {
  let code = "";
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
