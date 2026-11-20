export type PrintDestination = "KITCHEN";

export type PrintJobStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SUPPRESSED"
  | "UNCERTAIN"
  | "REVIEW_REQUIRED";

export type PrintingStatus = {
  destination: PrintDestination;
  enabled: boolean;
  paired: boolean;
  last_contact_at: string | null;
  test_status: PrintJobStatus | null;
};

export type PrinterSetup = {
  url: string;
  username: string;
  password: string;
};

export type PrintJob = {
  id: string;
  order_id: string;
  destination: PrintDestination;
  status: PrintJobStatus;
  order_version: number | null;
  attempts: number;
  next_attempt_at: string | null;
  expires_at: string | null;
  original_job_id: string | null;
  requested_by: string | null;
  reason: string | null;
  created_at: string;
};

export type PrintJobPage = {
  jobs: PrintJob[];
  next_cursor: string | null;
  server_time: string;
};

export type PrintJobsQuery = {
  status?: PrintJobStatus;
  destination?: PrintDestination;
  order_id?: string;
  limit?: number;
  cursor?: string;
};

export type PrintReviewDecision = "RELEASE" | "DISCARD";

export type PrintReviewInput = {
  job_ids: string[];
  decision: PrintReviewDecision;
};

export type PrintReprintInput = {
  idempotency_key: string;
  reason: string;
};
