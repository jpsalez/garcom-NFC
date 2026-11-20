import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { decodeCursor } from "../../shared/utils/cursor.ts";
import { orderInclude, pendingOrderItem } from "../orders/orders.repository.interface.ts";
import type {
  CreateTabData,
  ITabsRepository,
  TabListFilter,
  UpdateTabData,
} from "./tabs.repository.interface.ts";

@injectable()
export class TabsRepository implements ITabsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  create(restaurantId: string, data: CreateTabData) {
    return this.db.tabs.create({ data: { ...data, restaurant_id: restaurantId } });
  }

  get(restaurantId: string, id: string) {
    return this.db.tabs.findUnique({ where: { restaurant_id_id: { restaurant_id: restaurantId, id } } });
  }

  findOpenByTable(restaurantId: string, tableId: string) {
    return this.db.tabs.findFirst({
      where: {
        restaurant_id: restaurantId,
        table_id: tableId,
        kind: "TABLE",
        status: { in: ["OPEN", "CLOSING"] },
      },
    });
  }

  list(restaurantId: string, filter: TabListFilter) {
    const cursor = decodeCursor(filter.cursor);
    return this.db.tabs.findMany({
      where: {
        restaurant_id: restaurantId,
        kind: filter.kind,
        table_id: filter.table_id,
        business_date: filter.business_date,
        status: filter.status && { in: filter.status },
        opened_at: { gte: filter.from, lte: filter.to },
        OR: cursor && [
          { opened_at: { lt: cursor.created_at } },
          { opened_at: cursor.created_at, id: { lt: cursor.id } },
        ],
      },
      orderBy: [{ opened_at: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
      include: { _count: { select: { orders: { where: { items: { some: pendingOrderItem } } } } } },
    });
  }

  update(restaurantId: string, id: string, data: UpdateTabData) {
    return this.db.tabs.update({ where: { restaurant_id_id: { restaurant_id: restaurantId, id } }, data });
  }

  orders(restaurantId: string, tabId: string) {
    return this.db.orders.findMany({
      where: { restaurant_id: restaurantId, tab_id: tabId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      include: orderInclude,
    });
  }

  async hasOrders(restaurantId: string, tabId: string) {
    return (
      (await this.db.orders.count({ where: { restaurant_id: restaurantId, tab_id: tabId }, take: 1 })) > 0
    );
  }
}
