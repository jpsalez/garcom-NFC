import { api } from "@/lib/api";
import type { Call, CallType } from "@/lib/types";

// serverTime deixa o balcão corrigir o relógio do cronômetro (DEC-03)
export function listCalls(token: string, status: Call["status"], since?: Date) {
  const query = new URLSearchParams({ status });
  if (since) query.set("since", since.toISOString());
  return api<{ serverTime: string; calls: Call[] }>(`/calls?${query}`, { token });
}

export function finishCall(token: string, id: string) {
  return api<unknown>(`/calls/${id}/done`, { method: "PATCH", token });
}

// Rotas do cliente (token do aparelho): 201 criou, 200 já havia um chamado aberto do tipo
export function createCall(deviceToken: string, type: CallType) {
  return api<Call>("/public/calls", { method: "POST", body: { type }, deviceToken });
}
