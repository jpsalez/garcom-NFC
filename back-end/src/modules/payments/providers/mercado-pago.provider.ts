import { createHmac, timingSafeEqual } from "node:crypto";
import { injectable } from "tsyringe";
import { z } from "zod";
import type { provider_environment } from "../../../../generated/prisma/enums.ts";
import { AppError } from "../../../shared/errors/AppError.ts";
import {
  mercadoPagoSetting,
  PointProviderError,
  parsePointResponse,
  requestPoint,
} from "./mercado-pago-http.ts";
import { createOrderBody, pointChargeResult, pointOrderSchema } from "./mercado-pago-order.ts";
import type {
  IPointPaymentProvider,
  PointChargeInput,
  ProviderTerminal,
} from "./payment-provider.interface.ts";

const credentialsSchema = z.object({
  user_id: z.union([z.string().regex(/^\d+$/).max(128), z.number().int().positive()]).transform(String),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(365 * 24 * 60 * 60),
  live_mode: z.boolean().optional(),
});

const terminalPageSchema = z.object({
  data: z.object({
    terminals: z.array(z.object({ id: z.string().min(1).max(128), operating_mode: z.string() })),
  }),
  paging: z.object({ total: z.number().int().nonnegative() }),
});

function invalidSignature(): never {
  throw new AppError("Assinatura do webhook inválida", 401, undefined, "INVALID_WEBHOOK_SIGNATURE");
}

function signedPointId(dataId: unknown, requestId?: string, signature?: string) {
  if (
    typeof dataId !== "string" ||
    !/^ORD[a-z0-9]{1,125}$/i.test(dataId) ||
    !requestId ||
    !/^[\w-]{1,128}$/.test(requestId) ||
    !signature
  )
    invalidSignature();

  const fields = signature.split(",").map((part) => part.trim());
  const timestamps = fields.filter((part) => part.startsWith("ts="));
  const signatures = fields.filter((part) => part.startsWith("v1="));
  const ts = timestamps[0]?.slice(3) ?? "";
  const digest = signatures[0]?.slice(3) ?? "";
  if (
    timestamps.length !== 1 ||
    signatures.length !== 1 ||
    !/^(?:\d{10}|\d{13})$/.test(ts) ||
    !/^[a-f0-9]{64}$/i.test(digest)
  )
    invalidSignature();

  const time = ts.length === 10 ? Number(ts) * 1_000 : Number(ts);
  if (Math.abs(Date.now() - time) > 10 * 60 * 1_000) invalidSignature();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", mercadoPagoSetting("MERCADO_PAGO_WEBHOOK_SECRET"))
    .update(manifest)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(digest, "hex"))) invalidSignature();
  return dataId;
}

@injectable()
export class MercadoPagoProvider implements IPointPaymentProvider {
  readonly kind = "MERCADO_PAGO";

  authorizationUrl(state: string) {
    const url = new URL("https://auth.mercadopago.com.br/authorization");
    url.search = new URLSearchParams({
      client_id: mercadoPagoSetting("MERCADO_PAGO_CLIENT_ID"),
      redirect_uri: mercadoPagoSetting("MERCADO_PAGO_REDIRECT_URI"),
      response_type: "code",
      platform_id: "mp",
      state,
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string, environment: provider_environment) {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: mercadoPagoSetting("MERCADO_PAGO_REDIRECT_URI"),
      test_token: String(environment === "SANDBOX"),
    });
  }

  refreshCredentials(refreshToken: string) {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  private async tokenRequest(grant: Record<string, string | boolean>) {
    const response = await requestPoint("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        ...grant,
        client_id: mercadoPagoSetting("MERCADO_PAGO_CLIENT_ID"),
        client_secret: mercadoPagoSetting("MERCADO_PAGO_CLIENT_SECRET"),
      }),
    });
    const token = await parsePointResponse(response, credentialsSchema);
    return {
      merchantId: token.user_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      live: token.live_mode,
    };
  }

  async listTerminals(accessToken: string) {
    const terminals: ProviderTerminal[] = [];
    const limit = 50;
    for (let offset = 0; ; offset += limit) {
      const response = await requestPoint(
        `/terminals/v1/list?limit=${limit}&offset=${offset}`,
        { method: "GET" },
        accessToken,
      );
      const page = await parsePointResponse(response, terminalPageSchema);
      terminals.push(...page.data.terminals);
      if (offset + limit >= page.paging.total) return terminals;
      if (page.data.terminals.length === 0) throw new PointProviderError();
    }
  }

  async createCharge(accessToken: string, input: PointChargeInput) {
    const response = await requestPoint(
      "/v1/orders",
      {
        method: "POST",
        headers: { "X-Idempotency-Key": input.idempotency_key },
        body: JSON.stringify(createOrderBody(input)),
      },
      accessToken,
    );
    return pointChargeResult(await parsePointResponse(response, pointOrderSchema));
  }

  async getChargeStatus(accessToken: string, externalId: string) {
    const response = await requestPoint(
      `/v1/orders/${encodeURIComponent(externalId)}`,
      { method: "GET" },
      accessToken,
    );
    return pointChargeResult(await parsePointResponse(response, pointOrderSchema));
  }

  async cancelCharge(accessToken: string, externalId: string) {
    const response = await requestPoint(
      `/v1/orders/${encodeURIComponent(externalId)}/cancel`,
      {
        method: "POST",
        headers: { "X-Idempotency-Key": `cancel-${externalId}`, "x-allow-cancelable-status": "at_terminal" },
      },
      accessToken,
    );
    if (response.status === 202) return null;
    return pointChargeResult(await parsePointResponse(response, pointOrderSchema));
  }

  parseWebhook(dataId: unknown, requestId?: string, signature?: string) {
    return signedPointId(dataId, requestId, signature);
  }
}
