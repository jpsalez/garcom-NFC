import type { payment_requests } from "../../../generated/prisma/client.ts";

export function paymentRequestView(request: payment_requests) {
  return {
    id: request.id,
    tab_id: request.tab_id,
    payer_label: request.payer_label,
    preferred_method: request.preferred_method,
    requested_amount_cents: request.requested_amount_cents,
    selection: request.selection_json,
    status: request.status,
    payment_id: request.payment_id,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}
