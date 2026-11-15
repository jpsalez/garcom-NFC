import { api } from "@/lib/api";
import { clearSession, readSession, type Session } from "@/lib/session";

export function login(email: string, password: string) {
  return api<Session>("/auth/login", { method: "POST", body: { email, password } });
}

// Sai na hora e avisa a API para revogar o refresh token (se o aviso falhar, ele expira sozinho)
export async function logout() {
  const session = readSession();
  clearSession();
  if (session) await api("/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } }).catch(() => {});
}
