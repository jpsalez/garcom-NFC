import type {
  fiscal_documents,
  fiscal_settings,
  fiscal_tax_profiles,
} from "../../../generated/prisma/client.ts";
import type { TabLedger } from "../tabs/tab-ledger.ts";
import { activeLineCents } from "../tabs/tabs-pricing.ts";
import { discountsFor, notePayments, tPagByMethod } from "./fiscal.mapper.ts";
import { brandCode } from "./providers/fiscal-http.ts";
import type { NfceInput, NfceItem, NfcePayment } from "./providers/fiscal-provider.interface.ts";

type Profiles = Map<string, fiscal_tax_profiles | null>;

function noteItems(ledger: TabLedger, profiles: Profiles, fallback: fiscal_tax_profiles | null) {
  const items: Omit<NfceItem, "discountCents">[] = [];
  const missing: string[] = [];
  for (const item of ledger.orders.flatMap(({ items }) => items)) {
    const quantity = item.quantity - item.cancelled_quantity;
    if (quantity <= 0) continue;
    const profile = profiles.get(item.product_id) ?? fallback;
    const description = `${item.product_name_snapshot} ${item.variant_name_snapshot}`.trim().slice(0, 120);
    if (!profile) {
      missing.push(description);
      continue;
    }
    const { ncm, cfop, csosn, origin, unit } = profile;
    items.push({
      code: item.product_id,
      description,
      ncm,
      cfop,
      csosn,
      origin,
      unit,
      quantity,
      unitPriceCents: item.unit_price_cents,
      grossCents: activeLineCents(item),
    });
  }
  return { items, missing };
}

function notePaymentsOf(ledger: TabLedger, totalCents: number) {
  const approved = ledger.payments
    .filter(({ status }) => status === "APPROVED")
    .map((payment): NfcePayment => {
      const card = payment.method === "CREDIT" || payment.method === "DEBIT";
      return {
        tPag: tPagByMethod[payment.method],
        amountCents: payment.amount_cents,
        ...(card
          ? {
              card: {
                integrated: payment.provider !== "MANUAL",
                brand: brandCode(payment.card_brand),
                authorizationCode: payment.authorization_code ?? undefined,
              },
            }
          : {}),
      };
    });
  return notePayments(approved, totalCents);
}

// Monta a NFC-e de uma comanda fechada; lista os itens sem perfil tributário em vez de inventar NCM.
export function buildNfceInput(
  document: fiscal_documents,
  settings: fiscal_settings,
  ledger: TabLedger,
  profiles: Profiles,
  fallback: fiscal_tax_profiles | null,
): { input: NfceInput } | { problem: string } {
  const { items, missing } = noteItems(ledger, profiles, fallback);
  if (missing.length) return { problem: `Sem perfil tributário: ${missing.join(", ")}`.slice(0, 500) };
  const gross = items.map(({ grossCents }) => grossCents);
  const discount = gross.reduce((sum, value) => sum + value, 0) - document.total_cents;
  if (discount < 0) return { problem: "Itens abaixo do valor da nota" };
  const discounts = discountsFor(gross, discount);
  return {
    input: {
      reference: `${document.id}-${document.attempt}`,
      issuedAt: new Date(),
      cnpj: settings.cnpj,
      customerDocument: document.customer_document,
      items: items.map((item, index) => ({ ...item, discountCents: discounts[index] ?? 0 })),
      payments: notePaymentsOf(ledger, document.total_cents),
    },
  };
}
