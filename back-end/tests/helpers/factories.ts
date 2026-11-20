import { generatePublicCode } from "../../src/shared/utils/token.ts";
import { prisma } from "./db.ts";

let n = 0;
const uid = () => `${Date.now()}-${++n}`;

export function createRestaurant(name = "Restaurante") {
  return prisma.restaurants.create({ data: { name, slug: `rest-${uid()}` } });
}

export function createTable(restaurantId: string, label = "Mesa 1") {
  return prisma.tables.create({
    data: { restaurant_id: restaurantId, label, public_code: generatePublicCode() },
  });
}

export async function createSession(
  restaurantId: string,
  tableId: string,
  status: "ACTIVE" | "CLOSED" = "ACTIVE",
  expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000),
) {
  const restaurant = await prisma.restaurants.update({
    where: { id: restaurantId },
    data: { next_tab_number: { increment: 1 } },
    select: { next_tab_number: true },
  });
  return prisma.table_sessions.create({
    data: {
      restaurant_id: restaurantId,
      table_id: tableId,
      tab_number: restaurant.next_tab_number - 1,
      status,
      expires_at: expiresAt,
    },
  });
}
