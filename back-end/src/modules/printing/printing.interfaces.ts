import type { jobView, printPayload } from "./print-job.ts";
import type { PrintReprint, PrintResult, PrintReview, PrintingJobsQuery } from "./printing.schemas.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { print_destination } from "../../../generated/prisma/client.ts";

export type PrintingStatus = {
  destination: print_destination;
  enabled: boolean;
  paired: boolean;
  last_contact_at: Date | null;
};

type PrintJobView = ReturnType<typeof jobView>;

type ClaimedPrintJob = {
  id: string;
  destination: print_destination;
  reservation_id: string;
  expires_at: Date;
  payload_version: number;
  order_version: number;
  payload: ReturnType<typeof printPayload>;
};

export interface IPrintingService {
  get(actor: ActorContext): Promise<PrintingStatus>;
  setEnabled(actor: ActorContext, enabled: boolean): Promise<PrintingStatus>;
  issueCode(actor: ActorContext): Promise<{ code: string; expires_at: Date }>;
  revoke(actor: ActorContext): Promise<void>;
  pair(code: string): Promise<{ destination: print_destination; credential: string }>;
  contact(credential: string): Promise<void>;
  claim(credential: string): Promise<ClaimedPrintJob | null>;
  result(credential: string, id: string, input: PrintResult): Promise<void>;
  list(
    actor: ActorContext,
    query: PrintingJobsQuery,
  ): Promise<{
    jobs: PrintJobView[];
    next_cursor: string | null;
    server_time: Date;
  }>;
  reprint(
    actor: ActorContext,
    orderId: string,
    input: PrintReprint,
  ): Promise<{
    job: PrintJobView;
    replayed: boolean;
  }>;
  review(actor: ActorContext, input: PrintReview): Promise<PrintingStatus>;
}
