import type { Prisma, tab_kind, tab_status, tabs } from "../../../generated/prisma/client.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";

export type CreateTabData = Pick<
  Prisma.tabsUncheckedCreateInput,
  | "number"
  | "kind"
  | "table_id"
  | "table_label_snapshot"
  | "label"
  | "guests_count"
  | "service_fee_bps"
  | "opened_by_user_id"
  | "opened_at"
>;

export type UpdateTabData = Partial<
  Pick<
    tabs,
    | "kind"
    | "table_id"
    | "table_label_snapshot"
    | "label"
    | "guests_count"
    | "status"
    | "version"
    | "subtotal_cents"
    | "service_fee_cents"
    | "total_cents"
    | "closed_at"
    | "closed_by_user_id"
    | "business_date"
    | "cancel_reason"
  >
>;

export type TabListFilter = {
  status?: tab_status[];
  kind?: tab_kind;
  table_id?: string;
  business_date?: Date;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
};

export type TabListRow = tabs & { _count: { orders: number } };

export interface ITabsRepository {
  create(restaurantId: string, data: CreateTabData): Promise<tabs>;
  get(restaurantId: string, id: string): Promise<tabs | null>;
  findOpenByTable(restaurantId: string, tableId: string): Promise<tabs | null>;
  list(restaurantId: string, filter: TabListFilter): Promise<TabListRow[]>;
  update(restaurantId: string, id: string, data: UpdateTabData): Promise<tabs>;
  orders(restaurantId: string, tabId: string): Promise<OrderRecord[]>;
  hasOrders(restaurantId: string, tabId: string): Promise<boolean>;
}
