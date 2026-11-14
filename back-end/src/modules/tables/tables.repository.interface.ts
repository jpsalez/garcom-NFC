import type { Prisma, tables } from "../../../generated/prisma/client.ts";

export type CreateTableData = {
  restaurant_id: string;
  label: string;
  public_code: string;
};

export type TableWithRestaurant = Prisma.tablesGetPayload<{
  include: { restaurant: { select: { id: true; name: true; slug: true } } };
}>;

export interface ITableRepository {
  create(data: CreateTableData): Promise<tables>;
  findById(restaurantId: string, id: string): Promise<tables | null>;
  findByPublicCode(publicCode: string): Promise<TableWithRestaurant | null>;
  findMany(restaurantId: string, filter?: { active?: boolean }): Promise<tables[]>;
  update(restaurantId: string, id: string, data: Prisma.tablesUpdateInput): Promise<tables>;
  hasSessions(restaurantId: string, id: string): Promise<boolean>;
  delete(restaurantId: string, id: string): Promise<tables>;
}
