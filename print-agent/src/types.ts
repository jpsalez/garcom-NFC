export type PrintOutcome = "SENT" | "FAILED_BEFORE_SEND" | "UNCERTAIN";
export type TransportKind = "emulator" | "lp";

export interface PrintSelection {
  group_name: string;
  option_name: string;
  quantity: number;
}

export interface PrintItem {
  item_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  notes: string | null;
  selections: PrintSelection[];
}

export interface PrintPayload {
  order_id: string;
  created_at: string;
  table_label: string;
  items: PrintItem[];
  reprint?: { label: string };
}

export interface ClaimedJob {
  id: string;
  destination: "KITCHEN";
  reservation_id: string;
  expires_at: string;
  payload_version: number;
  order_version: number;
  payload: PrintPayload;
}

export interface AgentConfig {
  apiUrl: string;
  destination: "KITCHEN";
  credential: string;
  transport: TransportKind;
  printer?: string;
  emulatorOutputPath?: string;
}

export interface PrintTransport {
  send(data: Buffer): Promise<void>;
}

export class BeforeSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeforeSendError";
  }
}

export class UncertainPrintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UncertainPrintError";
  }
}

export class CredentialRevokedError extends Error {
  constructor(message = "Credencial do agente inválida ou revogada") {
    super(message);
    this.name = "CredentialRevokedError";
  }
}
