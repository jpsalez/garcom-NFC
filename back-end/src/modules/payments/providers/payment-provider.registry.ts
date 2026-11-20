import { inject, injectable } from "tsyringe";
import type { payment_provider_type } from "../../../../generated/prisma/enums.ts";
import { ConflictError } from "../../../shared/errors/http-errors.ts";
import type {
  IManualPaymentProvider,
  IPaymentProvider,
  IPointPaymentProvider,
} from "./payment-provider.interface.ts";

@injectable()
export class PaymentProviderRegistry {
  constructor(
    @inject("ManualPaymentProvider") private manual: IManualPaymentProvider,
    @inject("MercadoPagoProvider") private point: IPointPaymentProvider,
  ) {}

  get(kind: "MANUAL"): IManualPaymentProvider;
  get(kind: "MERCADO_PAGO"): IPointPaymentProvider;
  get(kind: payment_provider_type): IPaymentProvider;
  get(kind: payment_provider_type): IPaymentProvider {
    if (kind === "MANUAL") return this.manual;
    if (kind === "MERCADO_PAGO") return this.point;
    throw new ConflictError("Provedor de pagamento indisponível", "PAYMENT_PROVIDER_UNAVAILABLE");
  }
}
