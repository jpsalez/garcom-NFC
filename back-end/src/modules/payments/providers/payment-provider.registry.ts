import { inject, injectable } from "tsyringe";
import type { payment_provider_type } from "../../../../generated/prisma/enums.ts";
import { ConflictError } from "../../../shared/errors/http-errors.ts";
import type { IPaymentProvider } from "./payment-provider.interface.ts";

@injectable()
export class PaymentProviderRegistry {
  constructor(@inject("ManualPaymentProvider") private manual: IPaymentProvider) {}

  get(kind: payment_provider_type) {
    if (kind !== this.manual.kind)
      throw new ConflictError("Provedor de pagamento indisponível", "PAYMENT_PROVIDER_UNAVAILABLE");
    return this.manual;
  }
}
