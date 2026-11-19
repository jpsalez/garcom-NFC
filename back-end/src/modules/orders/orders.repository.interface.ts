import type { Prisma, order_events } from "../../../generated/prisma/client.ts";
import type { OrdersQuery } from "./orders.schemas.ts";
const orderInclude = { items: { orderBy: { position: "asc" as const }, include: { selections: true } } };
export { orderInclude };
export type OrderRecord = Prisma.ordersGetPayload<{ include: typeof orderInclude }>;
export type TableContext = { restaurantId: string; sessionId: string; tokenId: string; tableLabel: string };
export interface IOrdersRepository {
  get(restaurantId: string, id: string): Promise<OrderRecord>;
  findSubmission(restaurantId: string, key: string): Promise<OrderRecord | null>;
  list(restaurantId: string, query: OrdersQuery, tokenId?: string): Promise<OrderRecord[]>;
  hasPendingForSession(restaurantId: string, sessionId: string): Promise<boolean>;
  events(restaurantId: string, orderId: string, after: number, limit: number): Promise<order_events[]>;
}
