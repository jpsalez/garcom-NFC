import { inject, injectable } from "tsyringe";
import type { call_state, calls, type_call } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { CallView, Device, ICallsService } from "./calls.interfaces.ts";
import type { ICallRepository } from "./calls.repository.interface.ts";

const toView = (call: calls, label: string): CallView => ({
  id: call.id,
  type: call.type,
  status: call.status,
  created_at: call.created_at,
  done_at: call.done_at,
  table: { label },
});

@injectable()
export class CallsService implements ICallsService {
  private readonly callRepository: ICallRepository;

  constructor(@inject("CallRepository") callRepository: ICallRepository) {
    this.callRepository = callRepository;
  }

  // Um chamado aberto por tipo e atendimento: tocar de novo devolve o que já existe, com o created_at original
  async create(device: Device, type: type_call) {
    const open = await this.callRepository.findOpen(device.restaurantId, device.sessionId, type);
    if (open) return { call: toView(open, device.tableLabel), created: false };

    try {
      const call = await this.callRepository.create({
        restaurant_id: device.restaurantId,
        session_id: device.sessionId,
        token_id: device.tokenId,
        type,
      });
      return { call: toView(call, device.tableLabel), created: true };
    } catch (err) {
      // Toques simultâneos: o índice calls_one_open_per_type barrou o segundo; devolve o que venceu
      const winner = await this.callRepository.findOpen(device.restaurantId, device.sessionId, type);
      if (!winner) throw err;
      return { call: toView(winner, device.tableLabel), created: false };
    }
  }

  async list(restaurantId: string, status: call_state) {
    const calls = await this.callRepository.findMany(restaurantId, { status });
    // serverTime deixa o balcão corrigir o relógio do cronômetro (DEC-03)
    return { serverTime: new Date(), calls: calls.map((c) => toView(c, c.table_session.table.label)) };
  }

  async done(restaurantId: string, id: string, userId: string) {
    const { count } = await this.callRepository.markDone(restaurantId, id, userId);
    const call = await this.callRepository.findById(restaurantId, id);
    if (!call) throw new NotFoundError("Chamado não encontrado");
    if (count === 0) throw new ConflictError("Este chamado já foi finalizado ou cancelado", "CALL_NOT_OPEN");
    return call;
  }
}
