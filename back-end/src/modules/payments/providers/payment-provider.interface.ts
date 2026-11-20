import type {
  payment_method,
  payment_status,
  provider_environment,
} from "../../../../generated/prisma/enums.ts";

export type PointPaymentMethod = Extract<payment_method, "CREDIT" | "DEBIT" | "VOUCHER" | "PIX">;

export type ManualChargeInput = {
  method: payment_method;
  amount_cents: number;
  received_cents: number | null;
};

export interface IManualPaymentProvider {
  readonly kind: "MANUAL";
  recordCharge(input: ManualChargeInput): { status: "APPROVED"; change_cents: number };
}

export type ProviderCredentials = {
  merchantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  live?: boolean;
};

export type ProviderTerminal = { id: string; operating_mode: string };

export type PointChargeInput = {
  id: string;
  idempotency_key: string;
  method: PointPaymentMethod;
  amount_cents: number;
  installments: number;
  deviceId: string;
};

export type PointChargeResult = {
  id: string;
  reference: string;
  merchantId: string;
  deviceId: string;
  amountCents: number;
  status: Extract<payment_status, "PROCESSING" | "APPROVED" | "DECLINED" | "CANCELLED" | "EXPIRED">;
  canCancel: boolean;
  method?: PointPaymentMethod;
  paidCents?: number;
  brand?: string;
  installments?: number;
  nsu?: string;
  authorizationCode?: string;
  providerPaymentId: string;
};

export interface IPointPaymentProvider {
  readonly kind: "MERCADO_PAGO";
  authorizationUrl(state: string): string;
  exchangeCode(code: string, environment: provider_environment): Promise<ProviderCredentials>;
  refreshCredentials(refreshToken: string): Promise<ProviderCredentials>;
  listTerminals(accessToken: string): Promise<ProviderTerminal[]>;
  createCharge(accessToken: string, input: PointChargeInput): Promise<PointChargeResult>;
  getChargeStatus(accessToken: string, externalId: string): Promise<PointChargeResult>;
  cancelCharge(accessToken: string, externalId: string): Promise<PointChargeResult | null>;
  parseWebhook(dataId: unknown, requestId: string | undefined, signature: string | undefined): string;
}

export type IPaymentProvider = IManualPaymentProvider | IPointPaymentProvider;
