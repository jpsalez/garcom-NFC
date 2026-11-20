import type { PublicRestaurant } from "../restaurants/public-restaurant.ts";
import type { createRestaurantInput } from "./administration.schema.ts";

export interface IAdministrationService {
  createRestaurant(input: createRestaurantInput): Promise<PublicRestaurant>;
  listRestaurants(): Promise<PublicRestaurant[]>;
  setRestaurantActive(id: string, active: boolean, userId: string): Promise<PublicRestaurant>;
}
