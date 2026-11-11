import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateTableData, ITableRepository } from "./tables.repository.interface.ts";

@injectable()
export class TableRepository implements ITableRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateTableData) {
    return this.db.tables.create({ data });
  }

  findById(restaurantId: string, id: string) {
    return this.db.tables.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  // Rota pública (QR Code / NFC): o tenant vem da própria mesa
  findByPublicCode(publicCode: string) {
    return this.db.tables.findUnique({
      where: { public_code: publicCode },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
  }

  findMany(restaurantId: string, filter: { active?: boolean } = {}) {
    return this.db.tables.findMany({
      where: { restaurant_id: restaurantId, active: filter.active },
      orderBy: { label: "asc" },
    });
  }

  update(restaurantId: string, id: string, data: Prisma.tablesUpdateInput) {
    return this.db.tables.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  delete(restaurantId: string, id: string) {
    return this.db.tables.delete({ where: { id, restaurant_id: restaurantId } });
  }
}
