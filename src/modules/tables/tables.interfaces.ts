import type { tables } from "../../../generated/prisma/client.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

export interface ITablesService {
  list(restaurantId: string): Promise<tables[]>;
  create(restaurantId: string, input: createTableInput): Promise<tables>;
  update(restaurantId: string, id: string, input: updateTableInput): Promise<tables>;
}
