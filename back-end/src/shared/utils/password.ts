import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// Formato salvo no banco: "<salt>:<hash>" (ambos em hex)
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

// Hash válido que nunca confere: o login o compara quando o e-mail não existe (mesmo tempo de resposta)
export const DUMMY_PASSWORD_HASH = `${"0".repeat(SALT_BYTES * 2)}:${"0".repeat(KEY_LENGTH * 2)}`;

export async function comparePassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const storedBuffer = Buffer.from(hash, "hex");
  const derived = await scryptAsync(password, salt, storedBuffer.length);

  // Comparação em tempo constante para evitar timing attack
  return storedBuffer.length === derived.length && timingSafeEqual(storedBuffer, derived);
}
