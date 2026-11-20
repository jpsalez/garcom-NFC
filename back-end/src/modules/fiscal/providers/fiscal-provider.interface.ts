import type { fiscal_environment, fiscal_provider_type } from "../../../../generated/prisma/enums.ts";

export type NfceItem = {
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  csosn: string;
  origin: number;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  grossCents: number;
  discountCents: number;
};

export type NfcePayment = {
  tPag: "01" | "03" | "04" | "10" | "17" | "99";
  amountCents: number;
  // Cartão: tpIntegra 1 quando a maquininha é integrada (N1/N2), 2 quando é manual (N0).
  card?: { integrated: boolean; brand: string; authorizationCode?: string };
};

export type NfceInput = {
  reference: string;
  issuedAt: Date;
  cnpj: string;
  customerDocument?: string | null;
  items: NfceItem[];
  payments: NfcePayment[];
};

export type NfceResult = {
  status: "PROCESSING" | "AUTHORIZED" | "REJECTED" | "CANCELLED";
  externalId: string;
  number?: number;
  series?: number;
  accessKey?: string;
  protocol?: string;
  sefazStatus?: string;
  sefazMessage?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  qrcodeUrl?: string;
};

export type CancelResult = {
  state: "CANCELLED" | "REQUESTED" | "FAILED";
  sefazStatus?: string;
  sefazMessage?: string;
};
export type FiscalAccount = { token: string; environment: fiscal_environment };

// Erros só para resultado ambíguo; recusa definitiva volta como REJECTED/FAILED.
export interface IFiscalProvider {
  readonly kind: fiscal_provider_type;
  // Provedores que deduplicam pela referência podem repetir a emissão com a mesma referência.
  readonly idempotentReference: boolean;
  emit(account: FiscalAccount, input: NfceInput): Promise<NfceResult>;
  status(account: FiscalAccount, externalId: string): Promise<NfceResult | null>;
  cancel(account: FiscalAccount, externalId: string, reason: string): Promise<CancelResult>;
}
