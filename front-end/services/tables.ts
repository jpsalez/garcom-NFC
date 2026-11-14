import { api } from "@/lib/api";
import type { Device } from "@/lib/device";
import type { Table } from "@/lib/types";

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

// Gestão das mesas (OWNER). Desativar encerra o atendimento aberto; excluir só vale sem histórico (409 TABLE_HAS_SESSIONS).
export const listTables = (token: string) => api<Table[]>("/tables", { token });
export const createTable = (token: string, label: string) => api<Table>("/tables", { method: "POST", body: { label }, token });
export const updateTable = (token: string, id: string, body: { label?: string; active?: boolean }) =>
  api<Table>(`/tables/${id}`, { method: "PATCH", body, token });
export const removeTable = (token: string, id: string) => api<void>(`/tables/${id}`, { method: "DELETE", token });
// SVG do QR Code; gerar o QR de uma mesa inativa a reativa
export const tableQrCode = (token: string, id: string) => api<string>(`/tables/${id}/qrcode`, { token, text: true });
