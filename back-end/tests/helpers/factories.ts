import { prisma } from "./db.ts";

let n = 0;
const uid = () => `${Date.now()}-${++n}`;

export function createRestaurant(name = "Restaurante") {
  return prisma.restaurants.create({ data: { name, slug: `rest-${uid()}` } });
}

export function createTable(restaurantId: string, label = "Mesa 1") {
  return prisma.tables.create({
    data: { restaurant_id: restaurantId, label, public_code: `code-${uid()}` },
  });
}

export function createSession(restaurantId: string, tableId: string, status: "ACTIVE" | "CLOSED" = "ACTIVE", expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)) {
  return prisma.table_sessions.create({
    data: {
      restaurant_id: restaurantId,
      table_id: tableId,
      status,
      expires_at: expiresAt,
    },
  });
}
