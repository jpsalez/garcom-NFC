import { api } from "@/lib/api";
import type { ActiveSession } from "@/lib/types";

export function listSessions() {
  return api<ActiveSession[]>("/sessions");
}

export function extendSession(id: string) {
  return api<unknown>(`/sessions/${id}/extend`, { method: "POST" });
}

export function closeSession(id: string) {
  return api<unknown>(`/sessions/${id}/close`, { method: "POST" });
}
