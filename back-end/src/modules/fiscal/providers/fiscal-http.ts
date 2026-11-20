import { AppError } from "../../../shared/errors/AppError.ts";

// Resultado desconhecido: a nota pode ou não ter sido criada. Nunca reenviar às cegas.
export class FiscalProviderError extends AppError {
  constructor() {
    super("Provedor fiscal indisponível", 502, undefined, "FISCAL_PROVIDER_UNAVAILABLE");
  }
}

export async function fiscalRequest(url: URL, init: RequestInit) {
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new FiscalProviderError();
  }
}

export const isAmbiguousStatus = (status: number) => status >= 500 || status === 429 || status === 408;
export const reais = (cents: number) => Math.round(cents) / 100;
export const body = (response: Response): Promise<Record<string, unknown> | null> =>
  response.json().then(
    (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null),
    () => null,
  );

export const text = (value: unknown, max = 500) =>
  typeof value === "string" || typeof value === "number" ? String(value).slice(0, max) : undefined;
export const integer = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
export const accessKey = (value: unknown) => {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length === 44 ? digits : undefined;
};

// Código de bandeira da SEFAZ (tBand) a partir do nome gravado no pagamento.
export function brandCode(brand: string | null) {
  const name = (brand ?? "").toLowerCase();
  const codes: [string, string][] = [
    ["visa", "01"],
    ["master", "02"],
    ["amex", "03"],
    ["american", "03"],
    ["diners", "05"],
    ["elo", "06"],
    ["hiper", "07"],
  ];
  return codes.find(([key]) => name.includes(key))?.[1] ?? "99";
}
