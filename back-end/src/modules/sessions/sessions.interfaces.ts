import type { table_sessions } from "../../../generated/prisma/client.ts";
import type { tableStatus } from "../../../generated/prisma/client.ts";
import type { TableSessionListItem } from "./sessions.repository.interface.ts";

export type ScanResult = {
  token: string;
  expires_at: Date;
  table: { label: string };
  restaurant: { name: string };
};

export interface ISessionsService {
  scan(publicCode: string): Promise<ScanResult>;
  open(restaurantId: string, tableId: string): Promise<table_sessions>;
  close(restaurantId: string, id: string, userId: string): Promise<table_sessions>;
  extend(restaurantId: string, id: string): Promise<table_sessions>;
  list(restaurantId: string, status: tableStatus): Promise<TableSessionListItem[]>;
}
