import { useMemo, useSyncExternalStore } from "react";

export type Role = "SUPER_ADMIN" | "OWNER" | "STAFF";
export type User = { id: string; name: string; email: string; role: Role; restaurant_id: string | null };
export type Session = { token: string; user: User };

const KEY = "psiu.session";
const EVENT = "psiu:session";

// A sessão do balcão fica no localStorage; o evento avisa os componentes da mesma aba (o "storage" só vale entre abas)
export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Texto estável (string) como snapshot: o React compara por valor
const snapshot = () => localStorage.getItem(KEY);

function parse(raw: string | null): Session | null {
  try {
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

// undefined = ainda no servidor ou carregando; null = sem login (ou sessão corrompida)
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore(subscribe, snapshot, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw]);
}
