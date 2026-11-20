import type { Prisma, order_events } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { OrdersQuery } from "./orders.schemas.ts";
const orderInclude = { items: { orderBy: { position: "asc" as const }, include: { selections: true } } };
const staffOrderInclude = {
  ...orderInclude,
  events: {
    where: { action: "TRANSITIONED", to_stage: "READY" },
    orderBy: { sequence: "desc" },
    select: {
      order_item_id: true,
      quantity: true,
      created_at: true,
      sequence: true,
      resulting_order_version: true,
    },
  },
} satisfies Prisma.ordersInclude;
export const pendingOrderItem = {
  OR: [{ pending_quantity: { gt: 0 } }, { preparing_quantity: { gt: 0 } }, { ready_quantity: { gt: 0 } }],
} satisfies Prisma.order_itemsWhereInput;
export { orderInclude, staffOrderInclude };
export type OrderRecord = Prisma.ordersGetPayload<{ include: typeof orderInclude }> &
  Partial<Pick<Prisma.ordersGetPayload<{ include: typeof staffOrderInclude }>, "events">>;
export type OrderReadOptions = { includeReadyHistory?: boolean };
export type TableContext = { restaurantId: string; sessionId: string; tokenId: string; tableLabel: string };
type DeviceSubmission = {
  source: "LOCAL_MENU";
  fulfillment_type: "DINE_IN";
  session_id: string;
  submitted_by_token_id: string;
  actor?: never;
};

type PosSubmission = {
  source: "POS";
  fulfillment_type: "DINE_IN" | "COUNTER";
  session_id?: string;
  submitted_by_token_id?: never;
  actor: ActorContext;
};

export type OrderSubmission = {
  tab_id: string;
  table_label_snapshot: string;
  publication_id: string;
  submission_key: string;
  request_hash: string;
  total_cents: number;
} & (DeviceSubmission | PosSubmission);

export interface IOrdersRepository {
  get(restaurantId: string, id: string, options?: OrderReadOptions): Promise<OrderRecord>;
  findSubmission(restaurantId: string, key: string): Promise<OrderRecord | null>;
  list(restaurantId: string, query: OrdersQuery, tokenId?: string): Promise<OrderRecord[]>;
  hasPendingForSession(restaurantId: string, sessionId: string): Promise<boolean>;
  events(restaurantId: string, orderId: string, after: number, limit: number): Promise<order_events[]>;
}
