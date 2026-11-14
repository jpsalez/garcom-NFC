import { api } from "@/lib/api";
import type { Device } from "@/lib/device";

const inFlight = new Map<string, Promise<Device>>();

// Rota pública do QR Code: abre o atendimento da mesa (ou entra no que já existe) e devolve o token do aparelho.
// Chamadas simultâneas para o mesmo código dividem um único scan (cada scan cria um token novo no servidor).
export function scanTable(code: string) {
  let scan = inFlight.get(code);
  if (!scan) {
    scan = api<Device>(`/public/tables/${encodeURIComponent(code)}/scan`, { method: "POST" }).finally(() => inFlight.delete(code));
    inFlight.set(code, scan);
  }
  return scan;
}
