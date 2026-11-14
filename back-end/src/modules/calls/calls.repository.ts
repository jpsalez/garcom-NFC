import { inject, injectable } from "tsyringe";
import { call_state, type type_call } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateCallData, ICallRepository, UpdateCallData } from "./calls.repository.interface.ts";

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

  // Só finaliza se ainda estiver OPEN: dois garçons ao mesmo tempo, um ganha ({ count: 0 } = perdeu)
  markDone(restaurantId: string, id: string, doneBy: string) {
    return this.db.calls.updateMany({
      where: { id, restaurant_id: restaurantId, status: call_state.OPEN },
      data: { status: call_state.DONE, done_at: new Date(), done_by: doneBy },
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
