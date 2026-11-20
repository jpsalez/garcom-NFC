import type { DbClient } from "../../shared/providers/prisma.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";
import { PrintingRepository } from "./printing.repository.ts";

export async function enqueueOriginal(db: DbClient, order: OrderRecord) {
  const restaurantId = order.restaurant_id;
  const repository = new PrintingRepository(db);
  const destination = "KITCHEN";
  if (!(await repository.get(restaurantId, destination))?.enabled) return;
  await repository.createOriginal(restaurantId, order.id, destination, {
    order_id: order.id,
    created_at: order.created_at.toISOString(),
    table_label: order.table_label_snapshot,
    items: order.items.map((item) => ({
      item_id: item.id,
      product_name: item.product_name_snapshot,
      variant_name: item.variant_name_snapshot,
      quantity: item.quantity,
      notes: item.notes,
      selections: item.selections.map((selection) => ({
        group_name: selection.group_name_snapshot,
        option_name: selection.option_name_snapshot,
        quantity: selection.selected_quantity,
      })),
    })),
  });
}
