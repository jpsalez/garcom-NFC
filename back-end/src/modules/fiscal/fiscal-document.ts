import type { fiscal_documents, tabs } from "../../../generated/prisma/client.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { RestaurantTransaction } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { TabLedger } from "../tabs/tab-ledger.ts";
import { FiscalRepository } from "./fiscal.repository.ts";

export const reviewAfterMs = 5 * 60 * 1000;

// Valor da nota: itens ativos menos descontos; taxa, couvert e gorjeta ficam fora (DEC-19).
export function noteCents(tab: Pick<tabs, "subtotal_cents">, adjustments: TabLedger["adjustments"]) {
  const discounts = adjustments
    .filter(({ type, removed_at }) => type === "DISCOUNT" && !removed_at)
    .reduce((sum, { computed_cents }) => sum + Math.abs(computed_cents), 0);
  return tab.subtotal_cents - discounts;
}

// Chamar no mesmo unit.run do fechamento. A emissão acontece depois do commit.
export async function reserveFiscalDocument(
  { db, restaurant }: RestaurantTransaction,
  tab: tabs,
  adjustments: TabLedger["adjustments"],
  customerDocument?: string,
) {
  const repository = new FiscalRepository(db);
  const settings = await repository.settings(restaurant.id);
  const total = noteCents(tab, adjustments);
  if (!settings?.enabled || total <= 0) return null;
  return repository.createDocument(restaurant.id, {
    tab_id: tab.id,
    provider: settings.provider,
    environment: settings.environment,
    total_cents: total,
    customer_document: customerDocument ?? null,
  });
}

// Sem retorno do provedor e sem ID: só uma pessoa, conferindo no painel do provedor, decide.
export function needsReview(document: fiscal_documents, now = new Date()) {
  return (
    document.status === "PENDING" &&
    document.dispatched_at !== null &&
    document.external_id === null &&
    document.dispatched_at.getTime() <= now.getTime() - reviewAfterMs
  );
}

export function fiscalDocumentView(document: fiscal_documents) {
  return {
    id: document.id,
    tab_id: document.tab_id,
    provider: document.provider,
    environment: document.environment,
    status: document.status,
    needs_review: needsReview(document),
    attempt: document.attempt,
    total_cents: document.total_cents,
    number: document.number,
    series: document.series,
    access_key: document.access_key,
    protocol: document.protocol,
    sefaz_status: document.sefaz_status,
    sefaz_message: document.sefaz_message,
    xml_url: document.xml_url,
    danfe_url: document.danfe_url,
    qrcode_url: document.qrcode_url,
    issued_at: document.issued_at,
    cancel_requested_at: document.cancel_requested_at,
    cancelled_at: document.cancelled_at,
    cancel_reason: document.cancel_reason,
    created_at: document.created_at,
  };
}

export type FiscalDocumentView = ReturnType<typeof fiscalDocumentView>;

// DEC-22: com NFC-e ativa, o estorno espera o cancelamento da nota (devolução por NF-e está fora do escopo).
export async function ensureNoActiveNfce(db: DbClient, tab: Pick<tabs, "restaurant_id" | "id">) {
  const document = await new FiscalRepository(db).documentByTab(tab.restaurant_id, tab.id);
  if (document?.status === "AUTHORIZED")
    throw new ConflictError(
      "Cancele a NFC-e da comanda antes de estornar o pagamento",
      "FISCAL_DOCUMENT_AUTHORIZED",
    );
  if (document?.status === "PENDING" || document?.status === "PROCESSING")
    throw new ConflictError(
      "A NFC-e da comanda está em emissão; conclua e cancele a nota antes de estornar",
      "FISCAL_DOCUMENT_IN_PROGRESS",
    );
}
