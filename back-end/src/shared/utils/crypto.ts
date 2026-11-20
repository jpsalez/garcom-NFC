import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../errors/AppError.ts";

function credentialKey() {
  const value = process.env.CREDENTIALS_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new AppError("Chave de credenciais não configurada", 503, undefined, "CREDENTIALS_KEY_UNAVAILABLE");
  return Buffer.from(value, "hex");
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(encoded: string) {
  const [version, iv, tag, ciphertext, extra] = encoded.split(":");
  const key = credentialKey();
  try {
    if (version !== "v1" || !iv || !tag || ciphertext === undefined || extra !== undefined) throw new Error();
    const nonce = Buffer.from(iv, "base64");
    if (nonce.length !== 12) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new AppError("Credencial armazenada inválida", 503, undefined, "CREDENTIALS_UNAVAILABLE");
  }
}
