import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type {
  CancelNfceInput,
  FiscalSettingsInput,
  ProductTaxProfileInput,
  RetryNfceInput,
  TaxProfileInput,
  UpdateTaxProfileInput,
} from "./fiscal.schemas.ts";

export interface IFiscalService {
  settings(actor: ActorContext): Promise<unknown>;
  saveSettings(actor: ActorContext, input: FiscalSettingsInput): Promise<unknown>;
  profiles(actor: ActorContext): Promise<unknown>;
  createProfile(actor: ActorContext, input: TaxProfileInput): Promise<unknown>;
  updateProfile(actor: ActorContext, id: string, input: UpdateTaxProfileInput): Promise<unknown>;
  assignProduct(actor: ActorContext, productId: string, input: ProductTaxProfileInput): Promise<unknown>;
  document(actor: ActorContext, tabId: string): Promise<unknown>;
  retry(actor: ActorContext, tabId: string, input: RetryNfceInput): Promise<unknown>;
  cancel(actor: ActorContext, tabId: string, input: CancelNfceInput): Promise<unknown>;
}
