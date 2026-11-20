import { ConflictError, ValidationError } from "../../shared/errors/http-errors.ts";
import type { OrderRecord } from "./orders.repository.interface.ts";
import type { Transition } from "./orders.schemas.ts";
export type Counters = Pick<
  OrderRecord["items"][number],
  "pending_quantity" | "preparing_quantity" | "ready_quantity" | "delivered_quantity" | "cancelled_quantity"
>;
const keys = {
  PENDING: "pending_quantity",
  PREPARING: "preparing_quantity",
  READY: "ready_quantity",
  DELIVERED: "delivered_quantity",
  CANCELLED: "cancelled_quantity",
} as const;
export function move(item: Counters, op: Transition): Counters {
  const targets: Record<Transition["from_stage"], readonly string[]> = {
    PENDING: ["PREPARING", "READY", "DELIVERED", "CANCELLED"],
    PREPARING: ["READY", "DELIVERED", "CANCELLED"],
    READY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
  };
  if (!targets[op.from_stage].includes(op.to_stage) || item[keys[op.from_stage]] < op.quantity)
    throw new ConflictError("Transição ou quantidade inválida", "INVALID_ORDER_TRANSITION");
  if ((op.to_stage === "CANCELLED") !== Boolean(op.reason))
    throw new ValidationError(undefined, "Motivo obrigatório apenas no cancelamento");
  const result = {
    pending_quantity: item.pending_quantity,
    preparing_quantity: item.preparing_quantity,
    ready_quantity: item.ready_quantity,
    delivered_quantity: item.delivered_quantity,
    cancelled_quantity: item.cancelled_quantity,
  };
  result[keys[op.from_stage]] -= op.quantity;
  result[keys[op.to_stage]] += op.quantity;
  return result;
}
export function orderView(order: OrderRecord, staff = false) {
  const quantities = order.items.reduce(
    (sum, item) => ({
      pending: sum.pending + item.pending_quantity,
      preparing: sum.preparing + item.preparing_quantity,
      ready: sum.ready + item.ready_quantity,
      delivered: sum.delivered + item.delivered_quantity,
      cancelled: sum.cancelled + item.cancelled_quantity,
    }),
    { pending: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0 },
  );
  const cancelledCents = order.items.reduce(
    (sum, item) => sum + item.unit_price_cents * item.cancelled_quantity,
    0,
  );
  return {
    id: order.id,
    ...(staff ? { session_id: order.session_id } : {}),
    tab_number: order.tab_number_snapshot,
    table_label: order.table_label_snapshot,
    source: order.source,
    fulfillment_type: order.fulfillment_type,
    currency: order.currency,
    total_cents: order.total_cents,
    cancelled_cents: cancelledCents,
    active_total_cents: order.total_cents - cancelledCents,
    version: order.version,
    created_at: order.created_at,
    updated_at: order.updated_at,
    progress: {
      ...quantities,
      is_completed:
        !quantities.pending && !quantities.preparing && !quantities.ready && quantities.delivered > 0,
      is_cancelled:
        quantities.cancelled > 0 &&
        !quantities.pending &&
        !quantities.preparing &&
        !quantities.ready &&
        !quantities.delivered,
    },
    items: order.items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      name: item.product_name_snapshot,
      variant_name: item.variant_name_snapshot,
      quantity: item.quantity,
      base_price_cents: item.base_price_cents,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      notes: item.notes,
      pending_quantity: item.pending_quantity,
      preparing_quantity: item.preparing_quantity,
      ready_quantity: item.ready_quantity,
      delivered_quantity: item.delivered_quantity,
      cancelled_quantity: item.cancelled_quantity,
      selections: item.selections.map((option) => ({
        option_id: option.option_id,
        group_name: option.group_name_snapshot,
        name: option.option_name_snapshot,
        quantity: option.selected_quantity,
        price_delta_cents: option.price_delta_cents,
      })),
    })),
  };
}
