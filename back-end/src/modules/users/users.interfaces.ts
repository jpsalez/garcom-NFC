import type { role } from "../../../generated/prisma/enums.ts";
import type { PublicUser } from "../auth/auth.interfaces.ts";
import type { createRestaurantUserInput, updateUserInput } from "./users.schema.ts";

// allowedRoles: papéis que quem chama pode ver ou alterar (OWNER só lida com STAFF)
export interface IUsersService {
  list(restaurantId: string, allowedRoles: role[]): Promise<PublicUser[]>;
  create(restaurantId: string, input: createRestaurantUserInput): Promise<PublicUser>;
  update(restaurantId: string, id: string, input: updateUserInput, allowedRoles: role[]): Promise<PublicUser>;
  remove(restaurantId: string, id: string, allowedRoles: role[]): Promise<void>;
}
