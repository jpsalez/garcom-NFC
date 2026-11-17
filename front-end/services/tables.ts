import { api } from "@/lib/api";
import type { Device } from "@/lib/device";
import type { Table } from "@/lib/types";

const inFlight = new Map<string, Promise<Device>>();

// Rota pública do QR Code: abre o atendimento da mesa (ou entra no que já existe) e devolve o token do aparelho.
// Chamadas simultâneas para o mesmo código dividem um único scan (cada scan cria um token novo no servidor).
export function scanTable(code: string) {
  let scan = inFlight.get(code);
  if (!scan) {
    scan = api<Device>(`/public/tables/${encodeURIComponent(code)}/scan`, { method: "POST", renew: false }).finally(() => inFlight.delete(code));
    inFlight.set(code, scan);
  }
  return scan;
}

// Gestão das mesas (OWNER). Desativar encerra o atendimento aberto; excluir só vale sem histórico (409 TABLE_HAS_SESSIONS).
export function listTables() {
  return api<Table[]>("/tables");
}

export function createTable(label: string) {
  return api<Table>("/tables", { method: "POST", body: { label } });
}

export function updateTable(id: string, body: { label?: string; active?: boolean }) {
  return api<Table>(`/tables/${id}`, { method: "PATCH", body });
}

export function removeTable(id: string) {
  return api<void>(`/tables/${id}`, { method: "DELETE" });
}

// SVG do QR Code; gerar o QR de uma mesa inativa a reativa
export function tableQrCode(id: string) {
  return api<string>(`/tables/${id}/qrcode`, { text: true });
}
