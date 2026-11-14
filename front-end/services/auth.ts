import { api } from "@/lib/api";
import type { Session } from "@/lib/session";

export function login(email: string, password: string) {
  return api<Session>("/auth/login", { method: "POST", body: { email, password } });
}
