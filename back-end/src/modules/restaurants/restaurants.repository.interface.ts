import type { Prisma, restaurants } from "../../../generated/prisma/client.ts";

export interface IRestaurantRepository {
  create(data: Prisma.restaurantsCreateInput): Promise<restaurants>;
  findAll(): Promise<restaurants[]>;
  findById(id: string): Promise<restaurants | null>;
  findBySlug(slug: string): Promise<restaurants | null>;
  update(id: string, data: Prisma.restaurantsUpdateInput): Promise<restaurants>;
  delete(id: string): Promise<restaurants>;
}
