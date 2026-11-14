import type { tables } from "../../../generated/prisma/client.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

export type TableView = tables & { public_url: string };

export interface ITablesService {
  list(restaurantId: string): Promise<TableView[]>;
  create(restaurantId: string, input: createTableInput): Promise<TableView>;
  update(restaurantId: string, id: string, input: updateTableInput): Promise<TableView>;
  qrCode(restaurantId: string, id: string): Promise<string>;
  remove(restaurantId: string, id: string): Promise<void>;
}
