import { inject, injectable } from "tsyringe";
import type { reason, table_sessions, tables, tableStatus } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import { runInTransaction } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { generateSessionToken } from "../../shared/utils/token.ts";
import { CallRepository } from "../calls/calls.repository.ts";
import type { ITableRepository } from "../tables/tables.repository.interface.ts";
import type { ISessionsService } from "./sessions.interfaces.ts";
import type { ISessionTokenRepository, ITableSessionRepository } from "./sessions.repository.interface.ts";
import { SessionTokenRepository, TableSessionRepository } from "./sessions.repository.ts";

// Duração do atendimento (DEC-02): 4 h, também é o quanto "estender" acrescenta
const sessionTtlMs = () => (Number(process.env.TABLE_SESSION_TTL) || 14400) * 1000;

@injectable()
export class SessionsService implements ISessionsService {
  private readonly tableRepository: ITableRepository;
  private readonly sessionRepository: ITableSessionRepository;
  private readonly tokenRepository: ISessionTokenRepository;
  private readonly notifier: INotifier;

  constructor(
    @inject("TableRepository") tableRepository: ITableRepository,
    @inject("TableSessionRepository") sessionRepository: ITableSessionRepository,
    @inject("SessionTokenRepository") tokenRepository: ISessionTokenRepository,
    @inject("Notifier") notifier: INotifier,
  ) {
    this.tableRepository = tableRepository;
    this.sessionRepository = sessionRepository;
    this.tokenRepository = tokenRepository;
    this.notifier = notifier;
  }

  // Rota pública: o tenant vem da própria mesa. Mesa/restaurante inativos respondem como se não existissem.
  async scan(publicCode: string) {
    const table = await this.tableRepository.findByPublicCode(publicCode);
    if (!table?.active || !table.restaurant.active) throw new NotFoundError("Mesa não encontrada");

    const session = await this.activeOrOpen(table);
    const { token, tokenHash } = generateSessionToken();
    await this.tokenRepository.create({ session_id: session.id, token_hash: tokenHash });
    return { token, expires_at: session.expires_at, table: { label: table.label }, restaurant: { name: table.restaurant.name } };
  }

  async open(restaurantId: string, tableId: string) {
    const table = await this.tableRepository.findById(restaurantId, tableId);
    if (!table) throw new NotFoundError("Mesa não encontrada");
    if (await this.findActive(restaurantId, tableId)) {
      throw new ConflictError("A mesa já tem um atendimento ativo", "SESSION_ALREADY_ACTIVE");
    }
    return this.create(table);
  }

  async close(restaurantId: string, id: string, userId: string) {
    await this.getActive(restaurantId, id);
    const closed = await this.finish(restaurantId, id, "STAFF", userId);
    if (!closed) throw new ConflictError("O atendimento já foi encerrado", "SESSION_CLOSED");
    return closed;
  }

  async extend(restaurantId: string, id: string) {
    const session = await this.getActive(restaurantId, id);
    const base = Math.max(session.expires_at.getTime(), Date.now());
    const extended = await this.sessionRepository.update(restaurantId, id, { expires_at: new Date(base + sessionTtlMs()) });
    this.notifier.toRestaurant(restaurantId, "session:extended", { id, expires_at: extended.expires_at });
    return extended;
  }

  async expireDue() {
    const due = await this.sessionRepository.findExpired(new Date());
    // Um por vez: muitos vencidos juntos (ex.: API ficou fora do ar) não disputam o pool de conexões.
    // Falha em um atendimento não trava os demais (só o id e a mensagem vão para o log).
    let closed = 0;
    for (const session of due) {
      try {
        if (await this.finish(session.restaurant_id, session.id, "TIMEOUT")) closed++;
      } catch (err) {
        console.error(`Falha ao encerrar o atendimento ${session.id}:`, err instanceof Error ? err.message : err);
      }
    }
    return closed;
  }

  list(restaurantId: string, status: tableStatus) {
    return this.sessionRepository.findMany(restaurantId, { status });
  }

  private async create(table: Pick<tables, "id" | "label" | "restaurant_id">) {
    const session = await this.sessionRepository.create({
      restaurant_id: table.restaurant_id,
      table_id: table.id,
      expires_at: new Date(Date.now() + sessionTtlMs()),
    });
    const { id, label } = table;
    this.notifier.toRestaurant(table.restaurant_id, "session:opened", { id: session.id, table: { id, label }, expires_at: session.expires_at });
    return session;
  }

  private async activeOrOpen(table: Pick<tables, "id" | "label" | "restaurant_id">) {
    const restaurantId = table.restaurant_id;
    const active = await this.findActive(restaurantId, table.id);
    if (active) return active;
    try {
      return await this.create(table);
    } catch (err) {
      // Scans simultâneos: o índice table_sessions_one_active barrou o segundo; usa o atendimento que venceu
      const winner = await this.sessionRepository.findActiveByTable(restaurantId, table.id);
      if (!winner) throw err;
      return winner;
    }
  }

  // Atendimento vencido é encerrado aqui, no primeiro uso depois do vencimento (ainda não há job)
  private async findActive(restaurantId: string, tableId: string) {
    const session = await this.sessionRepository.findActiveByTable(restaurantId, tableId);
    if (session && !session.keep_open && session.expires_at <= new Date()) {
      await this.finish(restaurantId, session.id, "TIMEOUT");
      return null;
    }
    return session;
  }

  // Mesmo erro para "não existe" e "é de outro restaurante"
  private async getActive(restaurantId: string, id: string): Promise<table_sessions> {
    const session = await this.sessionRepository.findById(restaurantId, id);
    if (!session) throw new NotFoundError("Atendimento não encontrado");
    if (session.status !== "ACTIVE") throw new ConflictError("O atendimento já foi encerrado", "SESSION_CLOSED");
    return session;
  }

  // Encerrar vale tudo ou nada: sessão fechada, tokens revogados e chamados abertos cancelados.
  // Devolve null se outro pedido encerrou antes. Tokens e chamados não recebem restaurantId: a sessão já é do tenant.
  private async finish(restaurantId: string, id: string, closedReason: reason, closedBy?: string) {
    const closed = await runInTransaction(async (tx) => {
      const sessions = new TableSessionRepository(tx);
      const { count } = await sessions.closeIfActive(restaurantId, id, { closed_reason: closedReason, closed_by: closedBy });
      if (count === 0) return null;
      await new SessionTokenRepository(tx).revokeAllBySession(id, new Date());
      await new CallRepository(tx).cancelOpenBySession(id);
      return sessions.findById(restaurantId, id);
    });
    // Avisa o balcão só depois do commit
    if (closed) this.notifier.toRestaurant(restaurantId, "session:closed", { id, reason: closedReason });
    return closed;
  }
}
