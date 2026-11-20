import { injectable } from "tsyringe";
import {
  accessKey,
  body,
  FiscalProviderError,
  fiscalRequest,
  integer,
  isAmbiguousStatus,
  reais,
  text,
} from "./fiscal-http.ts";
import type {
  CancelResult,
  FiscalAccount,
  IFiscalProvider,
  NfceInput,
  NfceResult,
} from "./fiscal-provider.interface.ts";

// Contrato: https://docs.notaas.com.br/docs/nfe/endpoints (x-api-key, modelo 65, 202 com invoiceId).
// O ambiente e o CSC ficam no projeto da Notaas, não na requisição.
const baseUrl = () =>
  (process.env.NOTAAS_API_URL?.trim() || "https://platform.notaas.com.br/api/v1").replace(/\/$/, "");
const headers = ({ token }: FiscalAccount) => ({ "x-api-key": token, "Content-Type": "application/json" });

// A Notaas exige nome e endereço quando há destinatário; por isso o CPF/CNPJ do cliente não é enviado.
function nfceBody(input: NfceInput) {
  return {
    modelo: 65,
    naturezaOperacao: "Venda ao consumidor",
    dataEmissao: input.issuedAt.toISOString(),
    items: input.items.map((item) => ({
      codigo: item.code,
      descricao: item.description,
      ncm: item.ncm,
      cfop: item.cfop,
      csosn: item.csosn,
      origem: item.origin,
      unidade: item.unit,
      quantidade: item.quantity,
      valorUnitario: reais(item.unitPriceCents),
      valorTotal: reais(item.grossCents),
      ...(item.discountCents ? { desconto: reais(item.discountCents) } : {}),
    })),
    pagamentos: input.payments.map((payment) => ({
      tipoPagamento: payment.tPag,
      valor: reais(payment.amountCents),
      ...(payment.tPag === "99" ? { descricaoPagamento: "Outros" } : {}),
      ...(payment.card
        ? {
            tipoIntegracao: payment.card.integrated ? 1 : 2,
            bandeira: payment.card.brand,
            ...(payment.card.authorizationCode ? { autorizacao: payment.card.authorizationCode } : {}),
          }
        : {}),
    })),
  };
}

const statusMap: Record<string, NfceResult["status"]> = {
  queued: "PROCESSING",
  processing: "PROCESSING",
  issued: "AUTHORIZED",
  error: "REJECTED",
  inutilized: "REJECTED",
  cancelled: "CANCELLED",
};

function notaasResult(invoiceId: string, data: Record<string, unknown>): NfceResult {
  const status = statusMap[String(data.status)];
  if (!status) throw new FiscalProviderError();
  return {
    status,
    externalId: invoiceId,
    number: integer(data.numero),
    series: integer(data.serie),
    accessKey: accessKey(data.chaveAcesso),
    protocol: text(data.protocolo ?? data.nProt, 64),
    sefazStatus: text(data.codigoStatus ?? data.cStat, 16),
    sefazMessage: text(data.motivo ?? data.xMotivo ?? data.errorMessage),
    xmlUrl: text(data.xmlUrl, 1000),
    danfeUrl: text(data.pdfUrl, 1000),
    qrcodeUrl: text(data.qrCode, 2000),
  };
}

const errorOf = (data: Record<string, unknown> | null) => {
  const error = data?.error;
  return error && typeof error === "object" ? (error as Record<string, unknown>) : data;
};

@injectable()
export class NotaasProvider implements IFiscalProvider {
  readonly kind = "NOTAAS";
  // Reenviar cria outra nota e consome outro número.
  readonly idempotentReference = false;

  async emit(account: FiscalAccount, input: NfceInput): Promise<NfceResult> {
    const response = await fiscalRequest(new URL(`${baseUrl()}/nfe/emitir`), {
      method: "POST",
      headers: headers(account),
      body: JSON.stringify(nfceBody(input)),
    });
    if (isAmbiguousStatus(response.status)) throw new FiscalProviderError();
    const data = await body(response);
    const invoiceId = text(data?.invoiceId, 128);
    if (response.ok) {
      if (!invoiceId) throw new FiscalProviderError();
      return { status: "PROCESSING", externalId: invoiceId };
    }
    // 4xx: a nota não entrou na fila.
    const error = errorOf(data);
    return {
      status: "REJECTED",
      externalId: input.reference,
      sefazStatus: text(error?.code, 16) ?? String(response.status),
      sefazMessage: text(error?.message) ?? "Emissão recusada pelo provedor",
    };
  }

  async status(account: FiscalAccount, invoiceId: string) {
    const url = new URL(`${baseUrl()}/nfe/invoices/${encodeURIComponent(invoiceId)}/status`);
    const response = await fiscalRequest(url, { method: "GET", headers: headers(account) });
    if (response.status === 404) return null;
    const data = await body(response);
    if (!response.ok || !data) throw new FiscalProviderError();
    return notaasResult(invoiceId, data);
  }

  async cancel(account: FiscalAccount, invoiceId: string, reason: string): Promise<CancelResult> {
    const response = await fiscalRequest(new URL(`${baseUrl()}/nfe/cancelar`), {
      method: "POST",
      headers: headers(account),
      body: JSON.stringify({ invoiceId, motivo: reason }),
    });
    if (isAmbiguousStatus(response.status)) throw new FiscalProviderError();
    if (response.ok) return { state: "REQUESTED" };
    const error = errorOf(await body(response));
    // Antes de declarar falha, confirma que a nota não ficou cancelada (ex.: pedido repetido).
    if ((await this.status(account, invoiceId))?.status === "CANCELLED") return { state: "CANCELLED" };
    return {
      state: "FAILED",
      sefazStatus: text(error?.code, 16) ?? String(response.status),
      sefazMessage: text(error?.message) ?? "Cancelamento recusado pelo provedor",
    };
  }
}
