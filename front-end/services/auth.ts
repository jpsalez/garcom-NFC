import { api } from "@/lib/api";
import { clearSession, readSession, type Session } from "@/lib/session";

export function login(email: string, password: string) {
  return api<Session>("/auth/login", { method: "POST", body: { email, password } });
}

// Cadastra o restaurante e o OWNER; a API não devolve token, quem chama entra em seguida com login()
export function register(body: { name: string; email: string; password: string; restaurantName: string }) {
  return api<void>("/auth/register", { method: "POST", body });
}

// Sai na hora e avisa a API para revogar o refresh token (se o aviso falhar, ele expira sozinho)
export async function logout() {
  const session = readSession();
  clearSession();
  if (session) await api("/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } }).catch(() => {});
}

// Pede o link de redefinição por e-mail; a API responde igual para qualquer e-mail
export function forgotPassword(email: string) {
  return api<void>("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(token: string, password: string) {
  return api<void>("/auth/reset-password", { method: "POST", body: { token, password } });
}

// Troca a senha de quem está logado; a API derruba as outras sessões e devolve um par novo para esta
export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return api<Session>("/auth/password", { method: "PATCH", body: { currentPassword, newPassword }, token });
}
