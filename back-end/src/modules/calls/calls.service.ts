import { inject, injectable } from "tsyringe";
import type { call_state, calls, type_call } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import { runInTransaction } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import type { CallView, Device, ICallsService } from "./calls.interfaces.ts";
import { CallRepository } from "./calls.repository.ts";
import type { ICallRepository } from "./calls.repository.interface.ts";

const toView = (call: calls, label: string): CallView => ({
  id: call.id,
  session_id: call.session_id,
  type: call.type,
  status: call.status,
  created_at: call.created_at,
  done_at: call.done_at,
  table: { label },
});

@injectable()
export class CallsService implements ICallsService {
  private readonly callRepository: ICallRepository;
  private readonly notifier: INotifier;

  constructor(@inject("CallRepository") callRepository: ICallRepository, @inject("Notifier") notifier: INotifier) {
    this.callRepository = callRepository;
    this.notifier = notifier;
  }

  // Um chamado aberto por tipo e atendimento: tocar de novo devolve o que já existe, com o created_at original
  async create(device: Device, type: type_call) {
    const open = await this.callRepository.findOpen(device.restaurantId, device.sessionId, type);
    if (open) return { call: toView(open, device.tableLabel), created: false };

    let call: calls;
    try {
      call = await runInTransaction(async (tx) => {
        // O token foi validado antes: se o atendimento encerrou nesse intervalo, o chamado não nasce.
        // A trava faz um encerramento simultâneo esperar este commit e cancelar o chamado junto com os demais.
        if (!(await new TableSessionRepository(tx).lockActive(device.restaurantId, device.sessionId))) {
          throw new UnauthorizedError("Token da mesa inválido ou expirado");
        }
        return new CallRepository(tx).create({
          restaurant_id: device.restaurantId,
          session_id: device.sessionId,
          token_id: device.tokenId,
          type,
        });
      });
    } catch (err) {
      // Toques simultâneos: o índice calls_one_open_per_type barrou o segundo; devolve o que venceu
      const winner = await this.callRepository.findOpen(device.restaurantId, device.sessionId, type);
      if (!winner) throw err;
      return { call: toView(winner, device.tableLabel), created: false };
    }
    const view = toView(call, device.tableLabel);
    this.notifier.toRestaurant(device.restaurantId, "call:created", view);
    return { call: view, created: true };
  }

  async list(restaurantId: string, status: call_state, since?: Date) {
    const calls = await this.callRepository.findMany(restaurantId, { status, since });
    // serverTime deixa o balcão corrigir o relógio do cronômetro (DEC-03)
    return { serverTime: new Date(), calls: calls.map((c) => toView(c, c.table_session.table.label)) };
  }

  async done(restaurantId: string, id: string, userId: string) {
    const { count } = await this.callRepository.markDone(restaurantId, id, userId);
    const call = await this.callRepository.findById(restaurantId, id);
    if (!call) throw new NotFoundError("Chamado não encontrado");
    if (count === 0) throw new ConflictError("Este chamado já foi finalizado ou cancelado", "CALL_NOT_OPEN");
    this.notifier.toRestaurant(restaurantId, "call:done", { id });
    return call;
  }
}
