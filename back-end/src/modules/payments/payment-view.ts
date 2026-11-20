import type { PaymentRecord } from "./payments.repository.interface.ts";

export function paymentView(payment: PaymentRecord) {
  return {
    id: payment.id,
    tab_id: payment.tab_id,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount_cents: payment.amount_cents,
    received_cents: payment.received_cents,
    change_cents: payment.change_cents,
    tip_cents: payment.tip_cents,
    installments: payment.installments,
    payer_label: payment.payer_label,
    card_brand: payment.card_brand,
    nsu: payment.nsu,
    authorization_code: payment.authorization_code,
    acquirer_cnpj: payment.acquirer_cnpj,
    confirmed_at: payment.confirmed_at,
    created_at: payment.created_at,
    refunded_at: payment.refunded_at,
    refund_reason: payment.refund_reason,
    allocations: payment.allocations.map(({ id, order_item_id, covered_cents, covered_units_bps }) => ({
      id,
      order_item_id,
      covered_cents,
      covered_units_bps,
    })),
  };
}
