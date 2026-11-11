import { call_state, type_call } from "../../../generated/prisma/client.ts";
import { prisma, type DbClient } from "../../shared/providers/prisma.ts";

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

export class CallRepository {
  private readonly db: DbClient;

  constructor(db: DbClient = prisma) {
    this.db = db;
  }

  create(data: CreateCallData) {
    return this.db.calls.create({ data });
  }

  findById(restaurantId: string, id: string) {
    return this.db.calls.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  // Cards do balcão, por ordem de chegada
  findMany(restaurantId: string, filter: { status?: call_state } = {}) {
    return this.db.calls.findMany({
      where: { restaurant_id: restaurantId, status: filter.status },
      orderBy: { created_at: "asc" },
      include: {
        table_session: { select: { id: true, table: { select: { id: true, label: true } } } },
      },
    });
  }

  findManyBySession(restaurantId: string, sessionId: string, filter: { status?: call_state } = {}) {
    return this.db.calls.findMany({
      where: { restaurant_id: restaurantId, session_id: sessionId, status: filter.status },
      orderBy: { created_at: "asc" },
    });
  }

  update(restaurantId: string, id: string, data: UpdateCallData) {
    return this.db.calls.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  // Retorna { count } com a quantidade de chamados cancelados
  cancelOpenBySession(sessionId: string) {
    return this.db.calls.updateMany({
      where: { session_id: sessionId, status: call_state.OPEN },
      data: { status: call_state.CANCELLED },
    });
  }

  delete(restaurantId: string, id: string) {
    return this.db.calls.delete({ where: { id, restaurant_id: restaurantId } });
  }
}
