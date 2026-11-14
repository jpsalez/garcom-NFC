import { inject, injectable } from "tsyringe";
import { call_state, type type_call } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateCallData, ICallRepository } from "./calls.repository.interface.ts";

@injectable()
export class CallRepository implements ICallRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateCallData) {
    return this.db.calls.create({ data });
  }

  findById(restaurantId: string, id: string) {
    return this.db.calls.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  findOpen(restaurantId: string, sessionId: string, type: type_call) {
    return this.db.calls.findFirst({
      where: { restaurant_id: restaurantId, session_id: sessionId, type, status: call_state.OPEN },
    });
  }

  // Cards do balcão, por ordem de chegada
  findMany(restaurantId: string, filter: { status?: call_state; since?: Date } = {}) {
    return this.db.calls.findMany({
      where: { restaurant_id: restaurantId, status: filter.status, created_at: { gte: filter.since } },
      orderBy: { created_at: "asc" },
      include: {
        table_session: { select: { id: true, table: { select: { id: true, label: true } } } },
      },
    });
  }

  // Só finaliza se ainda estiver OPEN: dois garçons ao mesmo tempo, um ganha ({ count: 0 } = perdeu)
  markDone(restaurantId: string, id: string, doneBy: string) {
    return this.db.calls.updateMany({
      where: { id, restaurant_id: restaurantId, status: call_state.OPEN },
      data: { status: call_state.DONE, done_at: new Date(), done_by: doneBy },
    });
  }

  // Retorna { count } com a quantidade de chamados cancelados
  cancelOpenBySession(sessionId: string) {
    return this.db.calls.updateMany({
      where: { session_id: sessionId, status: call_state.OPEN },
      data: { status: call_state.CANCELLED },
    });
  }

}
