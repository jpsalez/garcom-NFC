import type { Prisma, restaurants } from "../../../generated/prisma/client.ts";
import type { ActorContext, Capability } from "../authorization/capabilities.ts";

export type RestaurantTransaction = {
  db: Prisma.TransactionClient;
  restaurant: restaurants;
  now: Date;
  actor?: ActorContext;
};
export interface IRestaurantUnitOfWork {
  run<T>(
    restaurantId: string,
    work: (context: RestaurantTransaction) => Promise<T>,
    options?: { actor?: ActorContext; capability?: Capability; allowInactive?: boolean },
  ): Promise<T>;
}
