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

// Contrato: https://doc.focusnfe.com.br/docs/nfce-operacoes-disponiveis-na-api (v2, Basic com token).
function baseUrl({ environment }: FiscalAccount) {
  const configured =
    environment === "PRODUCAO" ? process.env.FOCUS_NFE_PROD_URL : process.env.FOCUS_NFE_HOMOLOG_URL;
  const fallback =
    environment === "PRODUCAO" ? "https://api.focusnfe.com.br/v2" : "https://homologacao.focusnfe.com.br/v2";
  return (configured?.trim() || fallback).replace(/\/$/, "");
}

const headers = ({ token }: FiscalAccount) => ({
  Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
  "Content-Type": "application/json",
});

function nfceBody(input: NfceInput) {
  const document = input.customerDocument;
  return {
    cnpj_emitente: input.cnpj,
    data_emissao: input.issuedAt.toISOString(),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    ...(document?.length === 11 ? { cpf_destinatario: document } : {}),
    ...(document?.length === 14 ? { cnpj_destinatario: document } : {}),
    items: input.items.map((item, index) => ({
      numero_item: index + 1,
      codigo_produto: item.code,
      descricao: item.description,
      codigo_ncm: item.ncm,
      cfop: item.cfop,
      icms_origem: item.origin,
      icms_situacao_tributaria: item.csosn,
      unidade_comercial: item.unit,
      unidade_tributavel: item.unit,
      quantidade_comercial: item.quantity,
      quantidade_tributavel: item.quantity,
      valor_unitario_comercial: reais(item.unitPriceCents),
      valor_unitario_tributavel: reais(item.unitPriceCents),
      valor_bruto: reais(item.grossCents),
      ...(item.discountCents ? { valor_desconto: reais(item.discountCents) } : {}),
    })),
    formas_pagamento: input.payments.map((payment) => ({
      forma_pagamento: payment.tPag,
      valor_pagamento: reais(payment.amountCents),
      ...(payment.card
        ? {
            tipo_integracao: payment.card.integrated ? 1 : 2,
            bandeira_operadora: payment.card.brand,
            ...(payment.card.authorizationCode ? { numero_autorizacao: payment.card.authorizationCode } : {}),
          }
        : {}),
    })),
  };
}

const statusMap: Record<string, NfceResult["status"]> = {
  autorizado: "AUTHORIZED",
  erro_autorizacao: "REJECTED",
  denegado: "REJECTED",
  cancelado: "CANCELLED",
  processando_autorizacao: "PROCESSING",
};

// Os caminhos de XML e DANFE vêm relativos ao host da API.
const absolute = (account: FiscalAccount, path: unknown) =>
  typeof path === "string" && path ? new URL(path, new URL(baseUrl(account)).origin).toString() : undefined;

function focusResult(account: FiscalAccount, reference: string, data: Record<string, unknown>): NfceResult {
  const status = statusMap[String(data.status)];
  if (!status) throw new FiscalProviderError();
  return {
    status,
    externalId: reference,
    number: integer(data.numero),
    series: integer(data.serie),
    accessKey: accessKey(data.chave_nfe),
    protocol: text(data.numero_protocolo ?? data.protocolo, 64),
    sefazStatus: text(data.status_sefaz, 16),
    sefazMessage: text(data.mensagem_sefaz),
    xmlUrl: absolute(account, data.caminho_xml_nota_fiscal),
    danfeUrl: absolute(account, data.caminho_danfe),
    qrcodeUrl: text(data.qrcode_url, 2000),
  };
}

const rejection = (reference: string, data: Record<string, unknown> | null, status: number): NfceResult => ({
  status: "REJECTED",
  externalId: reference,
  sefazStatus: text(data?.codigo, 16) ?? String(status),
  sefazMessage: text(data?.mensagem) ?? "Emissão recusada pelo provedor",
});

@injectable()
export class FocusNfeProvider implements IFiscalProvider {
  readonly kind = "FOCUS_NFE";
  readonly idempotentReference = true;

  async emit(account: FiscalAccount, input: NfceInput) {
    const url = new URL(`${baseUrl(account)}/nfce`);
    url.searchParams.set("ref", input.reference);
    const response = await fiscalRequest(url, {
      method: "POST",
      headers: headers(account),
      body: JSON.stringify(nfceBody(input)),
    });
    if (isAmbiguousStatus(response.status)) throw new FiscalProviderError();
    const data = await body(response);
    if (response.ok) {
      // 2xx sem corpo legível: a nota pode existir; o job consulta a ref.
      if (!data) throw new FiscalProviderError();
      return focusResult(account, input.reference, data);
    }
    if (data?.codigo === "pending_operation") throw new FiscalProviderError();
    // Credencial recusada: nada foi processado.
    if (response.status === 401 || response.status === 403)
      return rejection(input.reference, data, response.status);
    // Outros 4xx só viram recusa se a ref não existir no provedor.
    const existing = await this.status(account, input.reference);
    if (existing) return existing;
    if (data?.codigo === "already_processed") throw new FiscalProviderError();
    return rejection(input.reference, data, response.status);
  }

  async status(account: FiscalAccount, reference: string) {
    const url = new URL(`${baseUrl(account)}/nfce/${encodeURIComponent(reference)}`);
    const response = await fiscalRequest(url, { method: "GET", headers: headers(account) });
    if (response.status === 404) return null;
    const data = await body(response);
    if (!response.ok || !data) throw new FiscalProviderError();
    return focusResult(account, reference, data);
  }

  async cancel(account: FiscalAccount, reference: string, reason: string): Promise<CancelResult> {
    const url = new URL(`${baseUrl(account)}/nfce/${encodeURIComponent(reference)}`);
    const response = await fiscalRequest(url, {
      method: "DELETE",
      headers: headers(account),
      body: JSON.stringify({ justificativa: reason }),
    });
    if (isAmbiguousStatus(response.status)) throw new FiscalProviderError();
    const data = await body(response);
    const sefaz = {
      sefazStatus: text(data?.status_sefaz ?? data?.codigo, 16),
      sefazMessage: text(data?.mensagem_sefaz ?? data?.mensagem),
    };
    if (response.ok && data?.status === "cancelado") return { state: "CANCELLED", ...sefaz };
    // Antes de declarar falha, confirma que a nota não ficou cancelada (ex.: pedido repetido).
    const current = await this.status(account, reference);
    if (current?.status === "CANCELLED") return { state: "CANCELLED", ...sefaz };
    return { state: "FAILED", ...sefaz };
  }
}
