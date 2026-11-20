import { api } from "@/lib/api";
import { clearSession, saveSession, type Session, type User } from "@/lib/session";

export function login(email: string, password: string) {
  return api<Session>("/auth/login", { method: "POST", body: { email, password }, renew: false });
}

// Cadastra o restaurante e o OWNER; a API não devolve token, quem chama entra em seguida com login()
export function register(body: { name: string; email: string; password: string; restaurantName: string }) {
  return api<void>("/auth/register", { method: "POST", body, renew: false });
}

export function getCurrentUser() {
  return api<User>("/auth/me", { cache: "no-store" });
}

// Ao abrir o app: descobre se os cookies ainda valem (renova se o acesso venceu). Qualquer falha vale como sem login.
export async function restoreSession() {
  try {
    saveSession({ user: await getCurrentUser() });
  } catch {
    clearSession();
  }
}

// Sai na hora; a API revoga o refresh token e limpa os cookies (se o aviso falhar, o token expira sozinho)
export async function logout() {
  clearSession();
  await api("/auth/logout", { method: "POST", renew: false }).catch(() => {});
}

// Pede o link de redefinição por e-mail; a API responde igual para qualquer e-mail
export function forgotPassword(email: string) {
  return api<void>("/auth/forgot-password", { method: "POST", body: { email }, renew: false });
}

export function resetPassword(token: string, password: string) {
  return api<void>("/auth/reset-password", { method: "POST", body: { token, password }, renew: false });
}

// Troca a senha de quem está logado; a API derruba as outras sessões e grava um par novo de cookies para esta
export function changePassword(currentPassword: string, newPassword: string) {
  return api<Session>("/auth/password", { method: "PATCH", body: { currentPassword, newPassword } });
}
