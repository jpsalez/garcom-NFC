import { type ZodType, z } from "zod";
import { AppError } from "../../../shared/errors/AppError.ts";

export class PointProviderError extends AppError {
  constructor(
    readonly definitiveRejection = false,
    readonly status?: number,
  ) {
    super("Mercado Pago indisponível", 502, undefined, "PROVIDER_UNAVAILABLE");
  }
}

export function mercadoPagoSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AppError("Mercado Pago não configurado", 503, undefined, "MERCADO_PAGO_NOT_CONFIGURED");
  return value;
}

export async function requestPoint(path: string, init: RequestInit, token?: string) {
  const base = process.env.MERCADO_PAGO_API_URL?.trim() || "https://api.mercadopago.com";
  try {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return await fetch(new URL(path, base), {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new PointProviderError();
  }
}

const pointErrorsSchema = z.object({ errors: z.array(z.object({ code: z.string() })) });

async function definitiveRejection(response: Response) {
  if (response.status !== 409) return [400, 401, 403, 404, 405, 422].includes(response.status);
  const error = pointErrorsSchema.safeParse(await response.json().catch(() => null));
  return error.success && error.data.errors.some(({ code }) => code === "already_queued_order_for_terminal");
}

export async function parsePointResponse<T>(response: Response, schema: ZodType<T>) {
  if (!response.ok) {
    // Uma chave em conflito pode identificar uma cobrança já aceita.
    throw new PointProviderError(await definitiveRejection(response), response.status);
  }
  const body: unknown = await response.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) throw new PointProviderError();
  return result.data;
}
