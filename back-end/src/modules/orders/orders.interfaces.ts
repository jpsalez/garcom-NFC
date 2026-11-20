import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { TableContext } from "./orders.repository.interface.ts";
import type { orderView } from "./order-progress.ts";
import type { OrdersQuery } from "./orders.schemas.ts";
export type OrderView = ReturnType<typeof orderView>;
export interface IOrdersService {
  submit(context: TableContext, input: unknown): Promise<{ order: OrderView; replayed: boolean }>;
  posSubmit(actor: ActorContext, input: unknown): Promise<{ order: OrderView; replayed: boolean }>;
  list(
    actor: ActorContext,
    query: OrdersQuery,
  ): Promise<{ items: OrderView[]; next_cursor: string | null; server_time: Date }>;
  get(actor: ActorContext, id: string): Promise<OrderView>;
  deviceList(
    context: TableContext,
    query: OrdersQuery,
  ): Promise<{ items: OrderView[]; next_cursor: string | null; server_time: Date }>;
  deviceGet(context: TableContext, id: string): Promise<OrderView>;
  transition(actor: ActorContext, id: string, input: unknown): Promise<OrderView>;
  events(actor: ActorContext, id: string, after: number, limit: number): Promise<unknown>;
  context(context: TableContext): Promise<unknown>;
}
