import { clearSession } from "@/lib/session";

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
};

export async function api<T>(path: string, { method = "GET", body, token, deviceToken }: Options = {}): Promise<T> {
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
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Token do balcão vencido ou usuário desativado: limpar a sessão manda a tela de volta ao login (RequireAuth)
    if (response.status === 401 && token) clearSession();
    throw new ApiError(response.status, data.code ?? "ERROR", data.message ?? "Erro inesperado");
  }
  return data as T;
}
