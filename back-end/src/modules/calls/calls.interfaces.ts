import type { call_state, calls, type_call } from "../../../generated/prisma/client.ts";

// Aparelho do cliente, já validado pelo ensureTableToken
export type Device = { tokenId: string; sessionId: string; restaurantId: string; tableLabel: string };

export type CallView = {
  id: string;
  type: type_call;
  status: call_state;
  created_at: Date;
  done_at: Date | null;
  table: { label: string };
};

export interface ICallsService {
  // created=false quando já havia um chamado aberto do mesmo tipo (DEC-03)
  create(device: Device, type: type_call): Promise<{ call: CallView; created: boolean }>;
  list(restaurantId: string, status: call_state): Promise<{ serverTime: Date; calls: CallView[] }>;
  done(restaurantId: string, id: string, userId: string): Promise<calls>;
}
