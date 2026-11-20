import { clearSession, saveSession, type Session } from "@/lib/session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Erro da API no formato { error, code, message, details? } (DEC-12): trate pelo `code`, não pela mensagem
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  // Token do aparelho da mesa (X-Table-Token); a sessão do balcão vai nos cookies
  deviceToken?: string;
  // false: 401 não é login vencido (login, rotas públicas), então não tenta renovar
  renew?: boolean;
  // Resposta que não é JSON (ex.: SVG do QR Code)
  text?: boolean;
  // Imagem privada com autenticação e renovação de sessão.
  blob?: boolean;
};

let renewing: Promise<Session | null> | null = null;

// Troca o refresh token (cookie) por um par novo, também nos cookies. Pedidos que falham juntos compartilham uma só renovação (o refresh token vale uma vez).
// Devolve null se o login não pode ser renovado; falha de rede lança e não derruba a sessão.
export function refreshSession() {
  renewing ??= renew().finally(() => {
    renewing = null;
  });
  return renewing;
}

async function renew(): Promise<Session | null> {
  const response = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!response.ok) return null;
  const session = (await response.json()) as Session;
  saveSession(session);
  return session;
}

export async function api<T>(path: string, options: Options = {}, canRetry = true): Promise<T> {
  const { method = "GET", body, deviceToken, renew = !deviceToken, text, blob } = options;
  const headers: Record<string, string> = {};
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (deviceToken) headers["X-Table-Token"] = deviceToken;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  if (text && response.ok) return (await response.text()) as T;
  if (blob && response.ok) return (await response.blob()) as T;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && renew) {
      // JWT de acesso vencido: renova uma vez e repete o pedido
      const fresh = canRetry ? await refreshSession() : null;
      if (fresh) return api<T>(path, options, false);
      // Sem renovação (usuário desativado ou refresh vencido): limpar a sessão manda a tela de volta ao login (RequireAuth)
      clearSession();
    }
    throw new ApiError(response.status, data.code ?? "ERROR", data.message ?? "Erro inesperado");
  }
  return data as T;
}
