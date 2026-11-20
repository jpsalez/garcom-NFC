import { randomBytes, randomUUID } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { print_destinations } from "../../../generated/prisma/client.ts";
import {
  type ActorContext,
  type Capability,
  requireCapability,
} from "../../shared/authorization/capabilities.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/http-errors.ts";
import type {
  IRestaurantUnitOfWork,
  RestaurantTransaction,
} from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { encodeCursor } from "../../shared/utils/cursor.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import {
  agentOfflineMs,
  jobView,
  kitchenDestination as destination,
  printPayload,
  reservationTtlMs,
  resultUpdate,
} from "./print-job.ts";
import type { PrintReprint, PrintResult, PrintReview, PrintingJobsQuery } from "./printing.schemas.ts";
import { hashToken } from "../../shared/utils/token.ts";
import type { IPrintingService, PrintingStatus } from "./printing.interfaces.ts";
import type { AgentProof, IPrintingRepository } from "./printing.repository.interface.ts";
import { PrintingRepository } from "./printing.repository.ts";

const pairingTtlMs = 10 * 60 * 1000;
const clearCode = { pairing_code_hash: null, pairing_expires_at: null };

function offlineSince(now: Date) {
  return new Date(now.getTime() - agentOfflineMs);
}

function status(row: print_destinations | null): PrintingStatus {
  return {
    destination,
    enabled: row?.enabled ?? false,
    paired: Boolean(row?.credential_hash),
    last_contact_at: row?.last_contact_at ?? null,
  };
}

@injectable()
export class PrintingService implements IPrintingService {
  constructor(
    @inject("PrintingRepository") private repository: IPrintingRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}

  private tenant(actor: ActorContext, capability: Capability = "printing:configure") {
    requireCapability(actor, capability);
    if (!actor.restaurantId) throw new ForbiddenError();
    return actor.restaurantId;
  }

  async get(actor: ActorContext) {
    return status(await this.repository.get(this.tenant(actor), destination));
  }

  async setEnabled(actor: ActorContext, enabled: boolean) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (enabled && !row?.credential_hash)
          throw new ConflictError("Pareie o agente antes de ativar a impressão", "PRINT_AGENT_NOT_PAIRED");
        if (!row || row.enabled === enabled) return status(row);
        await repository.hold(restaurantId, destination, enabled ? offlineSince(now) : undefined);
        return status(
          await repository.update(restaurantId, destination, {
            enabled,
            ...(enabled ? {} : { interrupted_at: now }),
          }),
        );
      },
      { actor, capability: "printing:configure" },
    );
  }

  async issueCode(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const code = randomBytes(10).toString("hex");
        const expiresAt = new Date(now.getTime() + pairingTtlMs);
        await new PrintingRepository(db).savePairingCode(
          restaurantId,
          destination,
          hashToken(code),
          expiresAt,
        );
        return { code, expires_at: expiresAt };
      },
      { actor, capability: "printing:configure" },
    );
  }

  async revoke(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        if (!(await repository.get(restaurantId, destination))) return;
        await repository.hold(restaurantId, destination);
        await repository.update(restaurantId, destination, {
          ...clearCode,
          enabled: false,
          interrupted_at: now,
          credential_hash: null,
          last_contact_at: null,
        });
      },
      { actor, capability: "printing:configure" },
    );
  }

  private async scope(proof: AgentProof) {
    const scope = await this.repository.findByHash(proof);
    if (!scope) throw new UnauthorizedError("Pareamento de impressão inválido");
    return { restaurantId: scope.restaurant_id, destination: scope.destination };
  }

  async pair(code: string) {
    const hash = hashToken(code);
    const { restaurantId, destination } = await this.scope({ pairing_code_hash: hash });
    return this.unit.run(
      restaurantId,
      async ({ db, now, restaurant }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (
          !restaurant.active ||
          row?.pairing_code_hash !== hash ||
          !row.pairing_expires_at ||
          row.pairing_expires_at <= now
        )
          throw new UnauthorizedError("Pareamento de impressão inválido");
        const credential = `print_${randomBytes(32).toString("base64url")}`;
        await repository.hold(restaurantId, destination);
        await repository.update(restaurantId, destination, {
          ...clearCode,
          enabled: false,
          interrupted_at: now,
          credential_hash: hashToken(credential),
          last_contact_at: now,
        });
        return { destination, credential };
      },
      { allowInactive: true },
    );
  }

  private async withAgent<T>(
    credential: string,
    work: (context: RestaurantTransaction, row: print_destinations, hash: string) => Promise<T>,
  ) {
    const hash = hashToken(credential);
    const { restaurantId, destination } = await this.scope({ credential_hash: hash });
    return this.unit.run(
      restaurantId,
      async (context) => {
        const { db, now, restaurant } = context;
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (!restaurant.active || row?.credential_hash !== hash)
          throw new UnauthorizedError("Pareamento de impressão inválido");
        await repository.expire(restaurantId, destination, now);
        await repository.hold(restaurantId, destination, offlineSince(now));
        await repository.update(restaurantId, destination, { last_contact_at: now });
        return work(context, row, hash);
      },
      { allowInactive: true },
    );
  }

  async contact(credential: string) {
    await this.withAgent(credential, async () => {});
  }

  claim(credential: string) {
    return this.withAgent(
      credential,
      async ({ db, now }, { restaurant_id: restaurantId, destination, enabled }, hash) => {
        const repository = new PrintingRepository(db);
        if (!enabled || (await repository.sending(restaurantId, destination))) return null;
        await repository.suppressCancelled(restaurantId, destination, now);
        const job = await repository.next(restaurantId, destination, now);
        if (!job) return null;

        const order = await new OrdersRepository(db).get(restaurantId, job.order_id);
        const payload = printPayload(order, job.original_job_id !== null);
        const reservationId = randomUUID();
        const expiresAt = new Date(now.getTime() + reservationTtlMs);
        await repository.updateJob(restaurantId, destination, job.id, {
          status: "SENDING",
          order_version: order.version,
          payload,
          attempts: { increment: 1 },
          next_attempt_at: null,
          reservation_id: reservationId,
          reservation_expires_at: expiresAt,
          reservation_credential_hash: hash,
          reported_outcome: null,
        });
        return {
          id: job.id,
          destination,
          reservation_id: reservationId,
          expires_at: expiresAt,
          payload_version: job.payload_version,
          order_version: order.version,
          payload,
        };
      },
    );
  }

  async result(credential: string, id: string, input: PrintResult) {
    const accepted = await this.withAgent(credential, async ({ db, now }, row, hash) => {
      const { restaurant_id: restaurantId, destination } = row;
      const repository = new PrintingRepository(db);
      const job = await repository.job(restaurantId, destination, id);
      if (!job) return "missing";
      if (job.reservation_id !== input.reservation_id || job.reservation_credential_hash !== hash)
        return "conflict";
      if (job.reported_outcome === input.outcome) return "accepted";
      if (job.status !== "SENDING" || !job.reservation_expires_at) return "conflict";

      const reservedAt = job.reservation_expires_at.getTime() - reservationTtlMs;
      const canRetry = row.enabled && (!row.interrupted_at || row.interrupted_at.getTime() < reservedAt);
      await repository.updateJob(
        restaurantId,
        destination,
        id,
        resultUpdate(job, input.outcome, now, canRetry),
      );
      return "accepted";
    });
    // A expiração e o contato precisam persistir mesmo se o resultado recebido for rejeitado.
    if (accepted === "missing") throw new NotFoundError("Comanda não encontrada");
    if (accepted === "conflict")
      throw new ConflictError(
        "Reserva vencida, substituída ou com resultado divergente",
        "PRINT_RESERVATION_CONFLICT",
      );
  }

  list(actor: ActorContext, query: PrintingJobsQuery) {
    const restaurantId = this.tenant(actor, "printing:operate");
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        await repository.expire(restaurantId, query.destination, now);
        await repository.hold(restaurantId, query.destination, offlineSince(now));
        const records = await repository.list(restaurantId, query);
        const rows = records.slice(0, query.limit);
        const last = rows.at(-1);
        return {
          jobs: rows.map(jobView),
          next_cursor: records.length > query.limit && last ? encodeCursor(last) : null,
          server_time: now,
        };
      },
      { actor, capability: "printing:operate" },
    );
  }

  review(actor: ActorContext, input: PrintReview) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (
          input.decision === "RELEASE" &&
          (!row?.last_contact_at || row.last_contact_at <= offlineSince(now))
        )
          throw new ConflictError(
            "O agente precisa voltar a se conectar antes da liberação",
            "PRINT_AGENT_OFFLINE",
          );
        const next = input.decision === "RELEASE" ? "PENDING" : "SUPPRESSED";
        const { count } = await repository.review(restaurantId, destination, input.job_ids, next);
        if (count !== input.job_ids.length)
          throw new ConflictError("A lista de revisão mudou", "PRINT_REVIEW_CONFLICT");
        return status(row);
      },
      { actor, capability: "printing:configure" },
    );
  }

  reprint(actor: ActorContext, orderId: string, input: PrintReprint) {
    const restaurantId = this.tenant(actor, "printing:operate");
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const sourceEvent = `REPRINT:${input.idempotency_key.toLowerCase()}`;
        const existing = await repository.findBySource(restaurantId, destination, orderId, sourceEvent);
        if (existing) {
          if (existing.reason !== input.reason || existing.requested_by !== actor.id)
            throw new ConflictError("Chave de segunda via já utilizada", "PRINT_REPRINT_KEY_CONFLICT");
          return { job: jobView(existing), replayed: true };
        }
        return {
          job: jobView(
            await this.createReprint(restaurantId, { db, now }, orderId, actor.id, sourceEvent, input.reason),
          ),
          replayed: false,
        };
      },
      { actor, capability: "printing:operate" },
    );
  }

  private async createReprint(
    restaurantId: string,
    { db, now }: Pick<RestaurantTransaction, "db" | "now">,
    orderId: string,
    requestedBy: string,
    sourceEvent: string,
    reason: string,
  ) {
    const repository = new PrintingRepository(db);
    const order = await new OrdersRepository(db).get(restaurantId, orderId);
    const payload = printPayload(order, true);
    if (!payload.items.length) throw new ConflictError("Pedido cancelado", "PRINT_ORDER_CANCELLED");
    const original = await repository.findBySource(restaurantId, destination, orderId, "ORDER_CREATED");
    if (!original) throw new NotFoundError("Comanda original não encontrada");
    if (
      original.status === "REVIEW_REQUIRED" ||
      original.status === "PENDING" ||
      (original.status === "SENDING" &&
        original.reservation_expires_at &&
        original.reservation_expires_at > now)
    )
      throw new ConflictError("A comanda original ainda está em andamento", "PRINT_ORIGINAL_PENDING");

    await repository.expire(restaurantId, destination, now);
    const row = await repository.get(restaurantId, destination);
    const ready = row?.enabled && row.last_contact_at && row.last_contact_at > offlineSince(now);
    return repository.createReprint(restaurantId, destination, {
      order_id: orderId,
      source_event: sourceEvent,
      payload,
      payload_version: 1,
      original_job_id: original.id,
      requested_by: requestedBy,
      reason,
      status: ready ? "PENDING" : "REVIEW_REQUIRED",
    });
  }
}
