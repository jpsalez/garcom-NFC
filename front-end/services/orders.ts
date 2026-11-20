import { api } from "@/lib/api";
import type {
  DeviceOrderQuery,
  Order,
  OrderEvent,
  OrderingSettings,
  OrderPage,
  OrderQuery,
  OrderSubmission,
  OrderTransition,
  TableContext,
} from "@/lib/orderTypes";

function queryString(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

// Reutilize a mesma submission_key e os mesmos dados ao repetir um envio.
export function submitOrder(deviceToken: string, body: OrderSubmission) {
  return api<{ order: Order; replayed: boolean }>("/public/orders", { method: "POST", deviceToken, body });
}

export function listDeviceOrders(deviceToken: string, query: DeviceOrderQuery = {}) {
  return api<OrderPage>(`/public/orders${queryString(query)}`, { deviceToken });
}

export function getDeviceOrder(deviceToken: string, id: string) {
  return api<Order>(`/public/orders/${encodeURIComponent(id)}`, { deviceToken });
}

export function getTableContext(deviceToken: string) {
  return api<TableContext>("/public/table-context", { deviceToken });
}

export function listOrders(query: OrderQuery = {}) {
  return api<OrderPage>(`/orders${queryString(query)}`);
}

export async function listOpenOrders(): Promise<Pick<OrderPage, "items" | "server_time">> {
  const items: Order[] = [];
  let page = await listOrders({ progress: "open", limit: 100 });
  items.push(...page.items);
  while (page.next_cursor) {
    page = await listOrders({ progress: "open", limit: 100, cursor: page.next_cursor });
    items.push(...page.items);
  }
  return { items, server_time: page.server_time };
}

export function getOrder(id: string) {
  return api<Order>(`/orders/${encodeURIComponent(id)}`);
}

export function transitionOrder(id: string, body: OrderTransition) {
  return api<Order>(`/orders/${encodeURIComponent(id)}/transitions`, { method: "POST", body });
}

export function listOrderEvents(id: string, query: { after_sequence?: number; limit?: number } = {}) {
  return api<{ items: OrderEvent[]; next_sequence: number | null }>(
    `/orders/${encodeURIComponent(id)}/events${queryString(query)}`,
  );
}

export function getOrderingSettings() {
  return api<OrderingSettings>("/ordering-settings");
}

export function updateOrderingSettings(body: { expected_version: number; customer_ordering_enabled: boolean }) {
  return api<OrderingSettings>("/ordering-settings", { method: "PATCH", body });
}
