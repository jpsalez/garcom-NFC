import type { jobView, printPayload } from "./print-job.ts";
import type { PrintReprint, PrintReview, PrintingJobsQuery } from "./printing.schemas.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { print_delivery_mode, print_destination, print_job_status } from "../../../generated/prisma/client.ts";

export type PrintingStatus = {
  destination: print_destination;
  enabled: boolean;
  paired: boolean;
  last_contact_at: Date | null;
  test_status: print_job_status | null;
  mode: print_delivery_mode;
  paper_width: number;
  test_confirmed: boolean;
  test_id: string | null;
};

type PrintJobView = ReturnType<typeof jobView>;

export type PrintPayload = ReturnType<typeof printPayload>;
export type PrinterDocument = PrintPayload | "TEST";

export interface IPrintingService {
  get(actor: ActorContext): Promise<PrintingStatus>;
  setEnabled(actor: ActorContext, enabled: boolean): Promise<PrintingStatus>;
  provision(actor: ActorContext): Promise<{ username: string; password: string; url: string }>;
  provisionBrowser(actor: ActorContext, paperWidth: 58 | 80): Promise<string>;
  verifyBrowserTest(actor: ActorContext, testId: string): Promise<PrintingStatus>;
  issueStationSocketTicket(credential: string): Promise<string>;
  authenticateStationSocket(ticket: string): Promise<string>;
  claimBrowser(credential: string): Promise<{ token: string; document: PrinterDocument; paper_width: number; valid_for_ms: number } | null>;
  reportBrowser(credential: string, token: string, submitted: boolean): Promise<void>;
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
