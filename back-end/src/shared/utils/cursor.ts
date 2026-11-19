import { ValidationError } from "../errors/http-errors.ts";
export function encodeCursor(row: { created_at: Date; id: string }) {
  return Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id])).toString("base64url");
}
export function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      parsed[1].length > 64 ||
      !Number.isFinite(Date.parse(parsed[0]))
    )
      throw new Error();
    return { created_at: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new ValidationError(undefined, "Cursor inválido");
  }
}
