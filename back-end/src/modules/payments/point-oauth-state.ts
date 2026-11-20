import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { provider_environment } from "../../../generated/prisma/enums.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ForbiddenError } from "../../shared/errors/http-errors.ts";

const stateSchema = z.object({
  restaurantId: z.uuid(),
  userId: z.uuid(),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  nonce: z.uuid(),
  expiresAt: z.number().int(),
});

function signature(payload: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ForbiddenError("OAuth do Mercado Pago indisponível");
  return createHmac("sha256", secret).update("mercado-pago:oauth:").update(payload).digest();
}

export function signPointState(actor: ActorContext, environment: provider_environment) {
  const payload = Buffer.from(
    JSON.stringify({
      restaurantId: actor.restaurantId,
      userId: actor.id,
      environment,
      nonce: randomUUID(),
      expiresAt: Date.now() + 10 * 60 * 1_000,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyPointState(state: string, actor: ActorContext) {
  try {
    const [payload, signed, extra] = state.split(".");
    if (!payload || !signed || extra !== undefined) throw new Error();
    const actual = Buffer.from(signed, "base64url");
    const expected = signature(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();

    const parsed = stateSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (
      parsed.expiresAt <= Date.now() ||
      parsed.restaurantId !== actor.restaurantId ||
      parsed.userId !== actor.id
    )
      throw new Error();
    return parsed;
  } catch {
    throw new ForbiddenError("State OAuth inválido ou expirado");
  }
}
