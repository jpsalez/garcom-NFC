import type { print_delivery_mode, print_destination, print_destinations } from "../../../generated/prisma/client.ts";

export type DestinationKey = Pick<print_destinations, "restaurant_id" | "destination">;

export interface IPrintingRepository {
  findByHash(credentialHash: string, options?: { activeMode: print_delivery_mode }): Promise<DestinationKey | null>;
  get(restaurantId: string, destination: print_destination): Promise<print_destinations | null>;
}
