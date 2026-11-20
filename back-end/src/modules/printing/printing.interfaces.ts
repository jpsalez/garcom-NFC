import type { jobView, printPayload } from "./print-job.ts";
import type { PrintReprint, PrintReview, PrintingJobsQuery } from "./printing.schemas.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { print_destination, print_job_status } from "../../../generated/prisma/client.ts";

export type PrintingStatus = {
  destination: print_destination;
  enabled: boolean;
  paired: boolean;
  last_contact_at: Date | null;
  test_status: print_job_status | null;
};

type PrintJobView = ReturnType<typeof jobView>;

export type PrintPayload = ReturnType<typeof printPayload>;
export type PrinterDocument = PrintPayload | "TEST";

export interface IPrintingService {
  get(actor: ActorContext): Promise<PrintingStatus>;
  setEnabled(actor: ActorContext, enabled: boolean): Promise<PrintingStatus>;
  provision(actor: ActorContext): Promise<{ username: string; password: string; url: string }>;
  revoke(actor: ActorContext): Promise<void>;
  queueTest(actor: ActorContext): Promise<PrintingStatus>;
  poll(credential: string, ready: boolean): Promise<string | null>;
  download(credential: string, token: string): Promise<PrinterDocument>;
  confirm(credential: string, token: string, success: boolean): Promise<void>;
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
