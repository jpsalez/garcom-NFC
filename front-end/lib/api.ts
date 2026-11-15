import { clearSession, readSession, saveSession, type Session } from "@/lib/session";

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
  // JWT do balcão (Authorization) ou token do aparelho da mesa (X-Table-Token)
  token?: string;
  deviceToken?: string;
  // Resposta que não é JSON (ex.: SVG do QR Code)
  text?: boolean;
};

let renewing: Promise<Session | null> | null = null;

// Troca o refresh token por um par novo. Pedidos que falham juntos compartilham uma só renovação (o refresh token vale uma vez).
// Devolve null se o login não pode ser renovado; falha de rede lança e não derruba a sessão.
export function refreshSession() {
  renewing ??= renew().finally(() => {
    renewing = null;
  });
  return renewing;
}

async function renew(): Promise<Session | null> {
  const current = readSession();
  if (!current) return null;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!response.ok) return null;
  const session = (await response.json()) as Session;
  saveSession(session);
  return session;
}

export async function api<T>(path: string, options: Options = {}, canRetry = true): Promise<T> {
  const { method = "GET", body, token, deviceToken, text } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceToken) headers["X-Table-Token"] = deviceToken;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  if (text && response.ok) return (await response.text()) as T;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      // JWT de acesso vencido: renova uma vez e repete o pedido
      const fresh = canRetry ? await refreshSession() : null;
      if (fresh) return api<T>(path, { ...options, token: fresh.token }, false);
      // Sem renovação (usuário desativado ou refresh vencido): limpar a sessão manda a tela de volta ao login (RequireAuth)
      clearSession();
    }
    throw new ApiError(response.status, data.code ?? "ERROR", data.message ?? "Erro inesperado");
  }
  return data as T;
}
