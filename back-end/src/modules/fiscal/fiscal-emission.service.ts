import { inject, injectable } from "tsyringe";
import type { fiscal_documents } from "../../../generated/prisma/client.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { decryptSecret } from "../../shared/utils/crypto.ts";
import { logOperation } from "../../shared/utils/request-context.ts";
import { loadTabLedger } from "../tabs/tab-ledger.ts";
import { TabsRepository } from "../tabs/tabs.repository.ts";
import { getTab } from "../tabs/tabs-state.ts";
import { type DocumentGuard, type DocumentUpdate, FiscalRepository } from "./fiscal.repository.ts";
import { fiscalDocumentView } from "./fiscal-document.ts";
import { notifyFiscal } from "./fiscal-events.ts";
import { findDocumentsToSync } from "./fiscal-sync.queries.ts";
import { buildNfceInput } from "./nfce-input.ts";
import { FiscalProviderError } from "./providers/fiscal-http.ts";
import type { NfceResult } from "./providers/fiscal-provider.interface.ts";
import type { FiscalProviderRegistry } from "./providers/fiscal-provider.registry.ts";

export type DocumentKey = Pick<fiscal_documents, "id" | "restaurant_id">;
const inFlight = { allowInactive: true };

export function resultData(result: NfceResult, now: Date): DocumentUpdate {
  return {
    status: result.status,
    external_id: result.externalId,
    number: result.number,
    series: result.series,
    access_key: result.accessKey,
    protocol: result.protocol,
    sefaz_status: result.sefazStatus ?? null,
    sefaz_message: result.sefazMessage ?? null,
    xml_url: result.xmlUrl,
    danfe_url: result.danfeUrl,
    qrcode_url: result.qrcodeUrl,
    issued_at: result.status === "AUTHORIZED" ? now : undefined,
    cancelled_at: result.status === "CANCELLED" ? now : undefined,
  };
}

const errorFields = (error: unknown) => ({
  error: error instanceof Error ? error.name : "unknown",
  code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined,
});

// Emissão e acompanhamento das NFC-e: HTTP sempre fora da transação do restaurante.
@injectable()
export class FiscalEmissionService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
    @inject("FiscalProviderRegistry") private providers: FiscalProviderRegistry,
  ) {}

  // Depois do commit do fechamento. Nunca lança: a comanda já está fechada e paga.
  async dispatch(key: DocumentKey) {
    try {
      await this.send(key);
      const document = await new FiscalRepository(this.db).document(key.restaurant_id, key.id);
      return document ? fiscalDocumentView(document) : null;
    } catch (error) {
      logOperation({ event: "fiscal.dispatch_failed", document_id: key.id, ...errorFields(error) });
      return null;
    }
  }

  private async send(key: DocumentKey) {
    const current = await new FiscalRepository(this.db).document(key.restaurant_id, key.id);
    if (current?.status !== "PENDING" || current.dispatched_at) return;
    // Sem credencial válida a nota espera a configuração, sem HTTP e sem ser rejeitada.
    const account = await this.account(current).catch((error: unknown) =>
      this.waitConfiguration(current, error),
    );
    if (!account) return;
    // Só erro determinístico (AppError) rejeita; falha de infraestrutura volta para o job tentar de novo.
    const claimed = await this.claim(key).catch((error: unknown) => {
      if (!(error instanceof AppError)) throw error;
      return { document: current, problem: `Falha ao montar a nota (${error.code})` };
    });
    if (!claimed) return;
    if ("problem" in claimed) return this.rejectLocally(claimed.document, claimed.problem);
    try {
      const result = await this.providers.get(current.provider).emit(account, claimed.input);
      await this.apply(claimed.document, ["PENDING"], result);
    } catch (error) {
      if (!(error instanceof FiscalProviderError)) throw error;
      logOperation({ event: "fiscal.emission_undetermined", document_id: current.id });
    }
  }

  private rejectLocally(document: fiscal_documents, problem: string) {
    return this.apply(document, ["PENDING"], {
      status: "REJECTED",
      externalId: `${document.id}-${document.attempt}`,
      sefazStatus: "LOCAL",
      sefazMessage: problem,
    });
  }

  private async waitConfiguration(document: fiscal_documents, error: unknown) {
    if (!(error instanceof ConflictError)) throw error;
    logOperation({ event: "fiscal.waiting_configuration", document_id: document.id, code: error.code });
    // Também adia o documento na fila do job.
    await this.update(
      document,
      { status: ["PENDING"] },
      { sefaz_message: `Aguardando configuração fiscal (${error.code})` },
    );
    return null;
  }

  // Marca o envio e monta a nota na mesma transação; a referência idempotente fica gravada antes do HTTP.
  private claim({ restaurant_id: restaurantId, id }: DocumentKey) {
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new FiscalRepository(db);
        const current = await repository.document(restaurantId, id);
        if (!current) return null;
        const reference = `${current.id}-${current.attempt}`;
        const provider = this.providers.get(current.provider);
        const document = await repository.updateDocument(
          restaurantId,
          id,
          { status: ["PENDING"], attempt: current.attempt, dispatched: false },
          { dispatched_at: now, external_id: provider.idempotentReference ? reference : null },
        );
        if (!document) return null;
        return { document, ...(await this.prepare(db, document)) };
      },
      inFlight,
    );
  }

  private async prepare(db: DbClient, document: fiscal_documents) {
    const repository = new FiscalRepository(db);
    const settings = await repository.settings(document.restaurant_id);
    if (!settings) return { problem: "Configuração fiscal ausente" };
    const tab = await getTab(new TabsRepository(db), document.restaurant_id, document.tab_id);
    const ledger = await loadTabLedger(db, tab);
    const productIds = [
      ...new Set(ledger.orders.flatMap(({ items }) => items.map(({ product_id }) => product_id))),
    ];
    const rows = await repository.productProfiles(document.restaurant_id, productIds);
    const profiles = new Map(rows.map(({ id, fiscal_tax_profile }) => [id, fiscal_tax_profile]));
    const fallback = settings.default_tax_profile_id
      ? await repository.profile(document.restaurant_id, settings.default_tax_profile_id)
      : null;
    return buildNfceInput(document, settings, ledger, profiles, fallback);
  }

  // A credencial só vale para o provedor e o ambiente em que a nota foi emitida.
  async account(document: fiscal_documents) {
    const settings = await new FiscalRepository(this.db).settings(document.restaurant_id);
    if (settings?.provider !== document.provider || settings.environment !== document.environment)
      throw new ConflictError("O provedor ou o ambiente fiscal mudou", "FISCAL_PROVIDER_CHANGED");
    const encrypted = settings.provider_credential_encrypted;
    if (document.provider === "MOCK") return { token: "", environment: document.environment };
    if (!encrypted) throw new ConflictError("Credencial fiscal ausente", "FISCAL_CREDENTIAL_REQUIRED");
    return { token: decryptSecret(encrypted), environment: document.environment };
  }

  private async apply(
    document: fiscal_documents,
    from: DocumentGuard["status"],
    result: NfceResult,
    extra: DocumentUpdate = {},
  ) {
    const updated = await this.unit.run(
      document.restaurant_id,
      ({ db, now }) =>
        new FiscalRepository(db).updateDocument(
          document.restaurant_id,
          document.id,
          { status: from, attempt: document.attempt },
          { ...resultData(result, now), ...extra },
        ),
      inFlight,
    );
    if (updated) notifyFiscal(this.notifier, updated);
    return updated;
  }

  // Consulta imediata depois de uma conferência manual; falha fica para o job.
  async syncNow(key: DocumentKey) {
    try {
      await this.sync(key);
    } catch (error) {
      logOperation({ event: "fiscal.sync_undetermined", document_id: key.id, ...errorFields(error) });
    }
  }

  async requestCancel(document: fiscal_documents, reason: string) {
    if (!document.external_id) return;
    const provider = this.providers.get(document.provider);
    try {
      const result = await provider.cancel(await this.account(document), document.external_id, reason);
      const sefaz = { sefazStatus: result.sefazStatus, sefazMessage: result.sefazMessage };
      if (result.state === "CANCELLED")
        await this.apply(document, ["AUTHORIZED"], {
          status: "CANCELLED",
          externalId: document.external_id,
          ...sefaz,
        });
      if (result.state === "FAILED") await this.cancelRefused(document, sefaz);
      // REQUESTED: o job confirma pelo status.
    } catch (error) {
      if (!(error instanceof FiscalProviderError)) throw error;
      logOperation({ event: "fiscal.cancel_undetermined", document_id: document.id });
    }
  }

  private async cancelRefused(
    document: fiscal_documents,
    sefaz: { sefazStatus?: string; sefazMessage?: string },
  ) {
    await this.update(
      document,
      { status: ["AUTHORIZED"], cancelRequested: true },
      {
        cancel_requested_at: null,
        cancel_reason: null,
        sefaz_status: sefaz.sefazStatus,
        sefaz_message: sefaz.sefazMessage,
      },
    );
    throw new ConflictError(
      `Cancelamento recusado: ${sefaz.sefazMessage ?? "sem motivo informado"}`,
      "FISCAL_CANCEL_REJECTED",
    );
  }

  // Job: emite o que ficou sem envio e consulta o que está em andamento.
  async reconcile() {
    const candidates = await findDocumentsToSync(this.db, new Date(Date.now() - 45_000), 20);
    for (const key of candidates) {
      try {
        await this.sync(key);
      } catch (error) {
        logOperation({ event: "fiscal.sync_undetermined", document_id: key.id, ...errorFields(error) });
        await this.touch(key).catch(() => undefined);
      }
    }
  }

  private async sync(key: DocumentKey) {
    const document = await new FiscalRepository(this.db).document(key.restaurant_id, key.id);
    if (!document) return;
    if (document.status === "PENDING" && !document.dispatched_at) return this.send(key);
    if (document.status === "AUTHORIZED" && document.cancel_requested_at) return this.syncCancel(document);
    if (!document.external_id || (document.status !== "PENDING" && document.status !== "PROCESSING")) return;
    const provider = this.providers.get(document.provider);
    const result = await provider.status(await this.account(document), document.external_id);
    if (result) return this.apply(document, ["PENDING", "PROCESSING"], result);
    // Referência idempotente ainda inexistente no provedor: reenviar com a mesma referência é seguro.
    if (document.status === "PENDING" && provider.idempotentReference) {
      await this.release(document);
      return this.send(key);
    }
    if (document.status === "PROCESSING" && !provider.idempotentReference)
      return this.lostExternalId(document);
    await this.touch(key);
  }

  // ID sem nota no provedor (atraso de consistência ou vínculo errado): volta para conferência humana,
  // guardando o ID antigo para a pessoa conferir no painel antes de qualquer reenvio.
  private lostExternalId(document: fiscal_documents) {
    logOperation({ event: "fiscal.external_id_not_found", document_id: document.id });
    return this.update(
      document,
      { status: ["PROCESSING"] },
      {
        status: "PENDING",
        external_id: null,
        sefaz_status: "NOT_FOUND",
        sefaz_message: `Notaas não encontrou ${document.external_id}; confira no painel antes de reenviar`,
      },
    );
  }

  private async syncCancel(document: fiscal_documents) {
    if (!document.external_id) return;
    const provider = this.providers.get(document.provider);
    const result = await provider.status(await this.account(document), document.external_id);
    if (result?.status === "CANCELLED") return this.apply(document, ["AUTHORIZED"], result);
    // Pedido sem efeito depois de 10 min: libera um novo pedido de cancelamento.
    const requestedAt = document.cancel_requested_at?.getTime() ?? 0;
    if (requestedAt < Date.now() - 10 * 60 * 1000)
      return this.update(
        document,
        { status: ["AUTHORIZED"], cancelRequested: true },
        { cancel_requested_at: null, cancel_reason: null },
      );
    await this.touch(document);
  }

  private release(document: fiscal_documents) {
    return this.update(document, { status: ["PENDING"], dispatched: true }, { dispatched_at: null });
  }

  private touch(key: DocumentKey) {
    return this.unit.run(
      key.restaurant_id,
      ({ db, now }) => new FiscalRepository(db).touch(key.restaurant_id, key.id, now),
      inFlight,
    );
  }

  private update(document: fiscal_documents, guard: Omit<DocumentGuard, "attempt">, data: DocumentUpdate) {
    return this.unit.run(
      document.restaurant_id,
      ({ db }) =>
        new FiscalRepository(db).updateDocument(
          document.restaurant_id,
          document.id,
          { ...guard, attempt: document.attempt },
          data,
        ),
      inFlight,
    );
  }
}
