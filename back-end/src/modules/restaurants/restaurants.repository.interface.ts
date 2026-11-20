import type { Prisma, restaurants } from "../../../generated/prisma/client.ts";
import type { CreateRestaurantData } from "./restaurant-initialization.ts";

export interface IRestaurantRepository {
  create(data: CreateRestaurantData): Promise<restaurants>;
  findAll(): Promise<restaurants[]>;
  findById(restaurantId: string): Promise<restaurants | null>;
  findBySlug(slug: string): Promise<restaurants | null>;
  update(restaurantId: string, data: Prisma.restaurantsUpdateInput): Promise<restaurants>;
}
