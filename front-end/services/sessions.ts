import { api } from "@/lib/api";
import type { ActiveSession } from "@/lib/types";

export function listSessions(token: string) {
  return api<ActiveSession[]>("/sessions", { token });
}

export function extendSession(token: string, id: string) {
  return api<unknown>(`/sessions/${id}/extend`, { method: "POST", token });
}

export function closeSession(token: string, id: string) {
  return api<unknown>(`/sessions/${id}/close`, { method: "POST", token });
}
