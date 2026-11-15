import { useSyncExternalStore } from "react";

export type Role = "SUPER_ADMIN" | "OWNER" | "STAFF";
export type User = { id: string; name: string; email: string; role: Role; restaurant_id: string | null };
// Só o usuário: o JWT e o refresh token ficam em cookies httpOnly, que o JavaScript não lê
export type Session = { user: User };

// undefined = ainda descobrindo (restoreSession em services/auth); null = sem login
let current: Session | null | undefined;
const listeners = new Set<() => void>();

function set(next: Session | null) {
  current = next;
  listeners.forEach((notify) => notify());
}

export const saveSession = (session: Session) => set(session);
export const clearSession = () => set(null);

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, () => current, () => undefined);
}
