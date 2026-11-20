import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { print_destination } from "../../../generated/prisma/client.ts";

export type PrintingStatus = {
  destination: print_destination;
  enabled: boolean;
  paired: boolean;
  last_contact_at: Date | null;
};

export interface IPrintingService {
  get(actor: ActorContext): Promise<PrintingStatus>;
  setEnabled(actor: ActorContext, enabled: boolean): Promise<PrintingStatus>;
  issueCode(actor: ActorContext): Promise<{ code: string; expires_at: Date }>;
  revoke(actor: ActorContext): Promise<void>;
  pair(code: string): Promise<{ destination: print_destination; credential: string }>;
  contact(credential: string): Promise<void>;
}
