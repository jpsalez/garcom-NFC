import { inject, injectable } from "tsyringe";
import type { fiscal_documents, fiscal_settings } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { encryptSecret } from "../../shared/utils/crypto.ts";
import type { IFiscalService } from "./fiscal.interfaces.ts";
import { FiscalRepository } from "./fiscal.repository.ts";
import type {
  CancelNfceInput,
  FiscalSettingsInput,
  ProductTaxProfileInput,
  RetryNfceInput,
  TaxProfileInput,
  UpdateTaxProfileInput,
} from "./fiscal.schemas.ts";
import { fiscalDocumentView, needsReview } from "./fiscal-document.ts";
import type { FiscalEmissionService } from "./fiscal-emission.service.ts";

function restaurantOf(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return actor.restaurantId;
}

const settingsView = (settings: fiscal_settings | null) => ({
  enabled: settings?.enabled ?? false,
  provider: settings?.provider ?? "MOCK",
  environment: settings?.environment ?? "HOMOLOGACAO",
  cnpj: settings?.cnpj ?? null,
  has_credential: Boolean(settings?.provider_credential_encrypted),
  default_tax_profile_id: settings?.default_tax_profile_id ?? null,
});

// Trocar de provedor descarta a credencial anterior: um token nunca vai para outro fornecedor.
function credentialFor(input: FiscalSettingsInput, current: fiscal_settings | null) {
  if (input.credential) return encryptSecret(input.credential);
  if (input.credential === null || current?.provider !== input.provider) return null;
  return current.provider_credential_encrypted;
}

const notAllowed = (message: string, code: string) => new ConflictError(message, code);

@injectable()
export class FiscalService implements IFiscalService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("FiscalEmissionService") private emission: FiscalEmissionService,
  ) {}

  async settings(actor: ActorContext) {
    return { settings: settingsView(await new FiscalRepository(this.db).settings(restaurantOf(actor))) };
  }

  async saveSettings(actor: ActorContext, input: FiscalSettingsInput) {
    // Simulação nunca vale como documento fiscal.
    if (input.provider === "MOCK" && input.environment === "PRODUCAO")
      throw notAllowed("O provedor simulado só funciona em homologação", "FISCAL_MOCK_PRODUCTION");
    const saved = await this.unit.run(
      restaurantOf(actor),
      async ({ db, restaurant }) => {
        const repository = new FiscalRepository(db);
        const current = await repository.settings(restaurant.id);
        const credential = credentialFor(input, current);
        if (input.enabled && input.provider !== "MOCK" && !credential)
          throw notAllowed("Informe a credencial do provedor fiscal", "FISCAL_CREDENTIAL_REQUIRED");
        const profileId =
          input.default_tax_profile_id === undefined
            ? current?.default_tax_profile_id
            : input.default_tax_profile_id;
        if (profileId && !(await repository.profile(restaurant.id, profileId)))
          throw new NotFoundError("Perfil tributário não encontrado");
        return repository.saveSettings(restaurant.id, {
          enabled: input.enabled,
          provider: input.provider,
          environment: input.environment,
          cnpj: input.cnpj,
          provider_credential_encrypted: credential,
          default_tax_profile_id: profileId ?? null,
        });
      },
      { actor, capability: "fiscal:configure" },
    );
    return { settings: settingsView(saved) };
  }

  async profiles(actor: ActorContext) {
    return { profiles: await new FiscalRepository(this.db).profiles(restaurantOf(actor)) };
  }

  async createProfile(actor: ActorContext, input: TaxProfileInput) {
    const profile = await this.unit.run(
      restaurantOf(actor),
      ({ db, restaurant }) => new FiscalRepository(db).createProfile(restaurant.id, input),
      { actor, capability: "fiscal:configure" },
    );
    return { profile };
  }

  async updateProfile(actor: ActorContext, id: string, input: UpdateTaxProfileInput) {
    const profile = await this.unit.run(
      restaurantOf(actor),
      async ({ db, restaurant }) => {
        const repository = new FiscalRepository(db);
        if (!(await repository.profile(restaurant.id, id)))
          throw new NotFoundError("Perfil tributário não encontrado");
        return repository.updateProfile(restaurant.id, id, input);
      },
      { actor, capability: "fiscal:configure" },
    );
    return { profile };
  }

  async assignProduct(actor: ActorContext, productId: string, { tax_profile_id }: ProductTaxProfileInput) {
    await this.unit.run(
      restaurantOf(actor),
      async ({ db, restaurant }) => {
        const repository = new FiscalRepository(db);
        if (tax_profile_id && !(await repository.profile(restaurant.id, tax_profile_id)))
          throw new NotFoundError("Perfil tributário não encontrado");
        if (!(await repository.assignProduct(restaurant.id, productId, tax_profile_id)))
          throw new NotFoundError("Produto não encontrado");
      },
      { actor, capability: "fiscal:configure" },
    );
    return { product_id: productId, tax_profile_id };
  }

  async document(actor: ActorContext, tabId: string) {
    return { fiscal_document: fiscalDocumentView(await this.documentOf(restaurantOf(actor), tabId)) };
  }

  private async documentOf(restaurantId: string, tabId: string) {
    const document = await new FiscalRepository(this.db).documentByTab(restaurantId, tabId);
    if (!document) throw new NotFoundError("Nota fiscal não encontrada");
    return document;
  }

  async retry(actor: ActorContext, tabId: string, input: RetryNfceInput) {
    const document = await this.documentOf(restaurantOf(actor), tabId);
    if (input.invoice_id) await this.link(actor, document, input.invoice_id);
    else await this.restart(actor, document, input.confirm_not_issued === true);
    return { fiscal_document: await this.emission.dispatch(document) };
  }

  // A pessoa achou a nota no painel do provedor: o job confirma pelo status antes de valer.
  private async link(actor: ActorContext, document: fiscal_documents, invoiceId: string) {
    if (!needsReview(document) || document.provider !== "NOTAAS")
      throw notAllowed("Esta nota não está aguardando conferência", "FISCAL_RETRY_NOT_ALLOWED");
    const linked = await this.guarded(
      actor,
      document,
      { status: ["PENDING"], dispatched: true },
      {
        status: "PROCESSING",
        external_id: invoiceId,
      },
    );
    await this.emission.syncNow(linked);
  }

  private async restart(actor: ActorContext, document: fiscal_documents, confirmed: boolean) {
    const allowed = document.status === "REJECTED" || (needsReview(document) && confirmed);
    if (!allowed) throw notAllowed("Esta nota não pode ser reenviada agora", "FISCAL_RETRY_NOT_ALLOWED");
    const settings = await new FiscalRepository(this.db).settings(document.restaurant_id);
    await this.guarded(
      actor,
      document,
      { status: [document.status] },
      {
        status: "PENDING",
        attempt: document.attempt + 1,
        provider: settings?.provider ?? document.provider,
        environment: settings?.environment ?? document.environment,
        dispatched_at: null,
        external_id: null,
        sefaz_status: null,
        sefaz_message: null,
      },
    );
  }

  private async guarded(
    actor: ActorContext,
    document: fiscal_documents,
    guard: Parameters<FiscalRepository["updateDocument"]>[2],
    data: Parameters<FiscalRepository["updateDocument"]>[3],
  ) {
    const updated = await this.unit.run(
      document.restaurant_id,
      ({ db }) =>
        new FiscalRepository(db).updateDocument(
          document.restaurant_id,
          document.id,
          { ...guard, attempt: document.attempt },
          data,
        ),
      { actor, capability: "fiscal:emit" },
    );
    if (!updated) throw notAllowed("A nota mudou; consulte de novo", "FISCAL_DOCUMENT_CHANGED");
    return updated;
  }

  async cancel(actor: ActorContext, tabId: string, { reason }: CancelNfceInput) {
    const document = await this.documentOf(restaurantOf(actor), tabId);
    if (document.status !== "AUTHORIZED" || document.cancel_requested_at || !document.external_id)
      throw notAllowed("Só uma nota autorizada pode ser cancelada", "FISCAL_CANCEL_NOT_ALLOWED");
    const requested = await this.unit.run(
      document.restaurant_id,
      ({ db, now }) =>
        new FiscalRepository(db).updateDocument(
          document.restaurant_id,
          document.id,
          { status: ["AUTHORIZED"], attempt: document.attempt, cancelRequested: false },
          { cancel_requested_at: now, cancel_reason: reason },
        ),
      { actor, capability: "fiscal:configure" },
    );
    if (!requested) throw notAllowed("A nota mudou; consulte de novo", "FISCAL_DOCUMENT_CHANGED");
    await this.emission.requestCancel(requested, reason);
    return this.document(actor, tabId);
  }
}
