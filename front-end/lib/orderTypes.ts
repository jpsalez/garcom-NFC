export type OrderStage = "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

export type OrderSubmission = {
  submission_key: string;
  publication_id: string;
  items: {
    product_id: string;
    variant_id: string;
    quantity: number;
    selections: { option_id: string; quantity: number }[];
    notes?: string;
  }[];
};

export type PosOrderSubmission = {
  table_id: string;
  publication_id: string;
  submission_key: string;
  items: {
    product_id: string;
    variant_id: string;
    quantity: number;
    selections: { option_id: string; quantity: number }[];
    notes?: string;
  }[];
};

export type Order = {
  id: string;
  session_id?: string | null;
  table_label: string;
  tab_number?: number;
  source?: "LOCAL_MENU" | "POS";
  fulfillment_type: "DINE_IN";
  currency: string;
  total_cents: number;
  cancelled_cents: number;
  active_total_cents: number;
  version: number;
  created_at: string;
  updated_at: string;
  progress: {
    pending: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
    is_completed: boolean;
    is_cancelled: boolean;
  };
  items: {
    id: string;
    product_id: string;
    variant_id: string;
    name: string;
    variant_name: string;
    quantity: number;
    base_price_cents: number;
    unit_price_cents: number;
    line_total_cents: number;
    notes: string | null;
    pending_quantity: number;
    preparing_quantity: number;
    ready_quantity: number;
    delivered_quantity: number;
    cancelled_quantity: number;
    selections: { option_id: string; group_name: string; name: string; quantity: number; price_delta_cents: number }[];
  }[];
};

export type OrderPage = { items: Order[]; next_cursor: string | null; server_time: string };
export type OrderQuery = {
  session_id?: string;
  from?: string;
  to?: string;
  progress?: "open" | "ready" | "completed" | "cancelled";
  limit?: number;
  cursor?: string;
};
export type DeviceOrderQuery = Pick<OrderQuery, "limit" | "cursor">;
export type OrderTransition = {
  expected_version: number;
  operations: { item_id: string; from_stage: OrderStage; to_stage: OrderStage; quantity: number; reason?: string }[];
};
export type OrderEvent = {
  id: string;
  restaurant_id: string;
  order_id: string;
  order_item_id: string | null;
  sequence: number;
  action: "CREATED" | "TRANSITIONED";
  quantity: number | null;
  from_stage: OrderStage | null;
  to_stage: OrderStage | null;
  actor_user_id: string | null;
  actor_type: "USER" | "TABLE_DEVICE" | "SYSTEM";
  actor_role_snapshot: "SUPER_ADMIN" | "OWNER" | "STAFF" | null;
  actor_category_snapshot: "WAITER" | "MANAGER" | "CLEANING" | "KITCHEN" | "OTHER" | null;
  actor_label_snapshot: string | null;
  reason: string | null;
  resulting_order_version: number;
  created_at: string;
};
export type TableContext = {
  session_id: string;
  expires_at: string;
  table: { label: string };
  can_order: boolean;
  reason: "CUSTOMER_ORDERING_DISABLED" | "MENU_NOT_PUBLISHED" | null;
};
export type OrderingSettings = { customer_ordering_enabled: boolean; version: number };

export function formatTableTab(tableLabel: string, tabNumber?: number | null) {
  return typeof tabNumber === "number" && Number.isFinite(tabNumber) && tabNumber > 0
    ? `${tableLabel} · Comanda #${tabNumber}`
    : tableLabel;
}
