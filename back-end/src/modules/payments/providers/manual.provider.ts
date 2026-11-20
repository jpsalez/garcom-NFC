import { injectable } from "tsyringe";
import { ValidationError } from "../../../shared/errors/http-errors.ts";
import type { IPaymentProvider, ManualChargeInput } from "./payment-provider.interface.ts";

@injectable()
export class ManualPaymentProvider implements IPaymentProvider {
  readonly kind = "MANUAL";

  recordCharge({ method, amount_cents, received_cents }: ManualChargeInput) {
    if (received_cents !== null && (method !== "CASH" || received_cents < amount_cents))
      throw new ValidationError(undefined, "Valor recebido só vale para dinheiro e deve cobrir o pagamento");
    return {
      status: "APPROVED" as const,
      change_cents: received_cents === null ? 0 : received_cents - amount_cents,
    };
  }
}
