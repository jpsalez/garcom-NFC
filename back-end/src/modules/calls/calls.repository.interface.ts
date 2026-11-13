import type { Prisma, call_state, calls, type_call } from "../../../generated/prisma/client.ts";

export type CreateCallData = {
  restaurant_id: string;
  session_id: string;
  token_id: string;
  type: type_call;
};

export type UpdateCallData = {
  status?: call_state;
  done_at?: Date;
  done_by?: string;
};

export type CallWithTable = Prisma.callsGetPayload<{
  include: {
    table_session: { select: { id: true; table: { select: { id: true; label: true } } } };
  };
}>;

export interface ICallRepository {
  create(data: CreateCallData): Promise<calls>;
  findById(restaurantId: string, id: string): Promise<calls | null>;
  findMany(restaurantId: string, filter?: { status?: call_state }): Promise<CallWithTable[]>;
  findManyBySession(
    restaurantId: string,
    sessionId: string,
    filter?: { status?: call_state },
  ): Promise<calls[]>;
  update(restaurantId: string, id: string, data: UpdateCallData): Promise<calls>;
  cancelOpenBySession(sessionId: string): Promise<Prisma.BatchPayload>;
  delete(restaurantId: string, id: string): Promise<calls>;
}
