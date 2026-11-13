import type { restaurants } from "../../../generated/prisma/client.ts";
import type { createRestaurantInput } from "./administration.schema.ts";

export interface IAdministrationService {
  createRestaurant(input: createRestaurantInput): Promise<restaurants>;
  listRestaurants(): Promise<restaurants[]>;
  setRestaurantActive(id: string, active: boolean): Promise<restaurants>;
}
