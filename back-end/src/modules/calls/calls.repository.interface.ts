import type { Prisma, call_state, calls, type_call } from "../../../generated/prisma/client.ts";

export type CreateCallData = {
  restaurant_id: string;
  session_id: string;
  token_id: string;
  type: type_call;
};

export type CallWithTable = Prisma.callsGetPayload<{
  include: {
    table_session: { select: { id: true; table: { select: { id: true; label: true } } } };
  };
}>;

export interface ICallRepository {
  create(data: CreateCallData): Promise<calls>;
  findById(restaurantId: string, id: string): Promise<calls | null>;
  findOpen(restaurantId: string, sessionId: string, type: type_call): Promise<calls | null>;
  findMany(restaurantId: string, filter?: { status?: call_state; since?: Date }): Promise<CallWithTable[]>;
  markDone(restaurantId: string, id: string, doneBy: string): Promise<Prisma.BatchPayload>;
  cancelOpenBySession(sessionId: string): Promise<Prisma.BatchPayload>;
}
