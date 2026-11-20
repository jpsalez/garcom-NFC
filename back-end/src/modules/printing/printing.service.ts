import { randomBytes, randomUUID } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { print_delivery_mode, print_destinations } from "../../../generated/prisma/client.ts";
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
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { encodeCursor } from "../../shared/utils/cursor.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import {
  printerOfflineMs,
  jobView,
  kitchenDestination as destination,
  printPayload,
  reservationTtlMs,
} from "./print-job.ts";
import type { PrintReprint, PrintReview, PrintingJobsQuery } from "./printing.schemas.ts";
import { hashToken } from "../../shared/utils/token.ts";
import type { IPrintingService, PrintPayload, PrintingStatus } from "./printing.interfaces.ts";
import type { IPrintingRepository } from "./printing.repository.interface.ts";
import { PrintingRepository } from "./printing.repository.ts";
import { readStationSocketTicket, signStationSocketTicket } from "./station-socket-ticket.ts";

const browserHeartbeatMs = 30_000;
const testTtlMs = 5 * 60 * 1000;
const clearTest = { test_token: null, test_status: null, test_expires_at: null, browser_test_confirmed: false };

function activeTest(row: print_destinations, now: Date) {
  return row.test_token && row.test_expires_at && row.test_expires_at > now &&
    (row.test_status === "PENDING" || row.test_status === "SENDING");
}

function offlineSince(now: Date) {
  return new Date(now.getTime() - printerOfflineMs);
}

function status(row: print_destinations | null, now = new Date()): PrintingStatus {
  let testStatus = row?.test_status ?? null;
  if (row && !activeTest(row, now)) {
    if (testStatus === "PENDING") testStatus = "FAILED";
    if (testStatus === "SENDING") testStatus = "UNCERTAIN";
  }
  return {
    destination,
    enabled: row?.enabled ?? false,
    paired: Boolean(row?.credential_hash),
    last_contact_at: row?.last_contact_at ?? null,
    test_status: testStatus,
    mode: row?.mode ?? "CLOUDPRNT",
    paper_width: row?.paper_width ?? 80,
    test_confirmed: testStatus === "SENT" && (row?.mode !== "BROWSER" || row.browser_test_confirmed),
    test_id: row?.test_token ?? null,
  };
}

@injectable()
export class PrintingService implements IPrintingService {
  constructor(
    @inject("PrintingRepository") private repository: IPrintingRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
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
    const updated = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (enabled && !row?.enabled) {
          if (!row?.credential_hash || !status(row, now).test_confirmed) {
            throw new ConflictError("Conclua a impressão de teste antes de ativar", "PRINT_TEST_REQUIRED");
          }
          if (!row.last_contact_at || row.last_contact_at <= offlineSince(now)) {
            throw new ConflictError("Conecte a impressora antes de ativar", "PRINT_PRINTER_OFFLINE");
          }
        }
        if (!row || row.enabled === enabled) return status(row, now);
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
    if (enabled && updated.mode === "BROWSER") this.notifier.wakePrintStation(restaurantId);
    return updated;
  }

  async provision(actor: ActorContext) {
    const serverUrl = new URL("/api/v1/printing/cloudprnt", process.env.PUBLIC_APP_URL);
    if (process.env.NODE_ENV === "production" && serverUrl.protocol !== "https:") {
      throw new ConflictError("O endereço público da API precisa usar HTTPS", "PRINT_HTTPS_REQUIRED");
    }
    const password = await this.rotateCredential(actor, "CLOUDPRNT", 80);
    return { username: "psiu", password, url: serverUrl.href };
  }

  provisionBrowser(actor: ActorContext, paperWidth: 58 | 80) {
    return this.rotateCredential(actor, "BROWSER", paperWidth);
  }

  private async rotateCredential(actor: ActorContext, mode: print_delivery_mode, paperWidth: number) {
    const restaurantId = this.tenant(actor);
    const credential = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const prefix = mode === "BROWSER" ? "station" : "cloud";
        const credential = `${prefix}_${randomBytes(32).toString("base64url")}`;
        await repository.hold(restaurantId, destination);
        await repository.interruptSending(restaurantId, destination);
        await repository.saveCredential(restaurantId, destination, { hash: hashToken(credential), now, mode, paperWidth });
        return credential;
      },
      { actor, capability: "printing:configure" },
    );
    this.notifier.disconnectPrintStation(restaurantId);
    return credential;
  }

  async revoke(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        if (!(await repository.get(restaurantId, destination))) return;
        await repository.hold(restaurantId, destination);
        await repository.interruptSending(restaurantId, destination);
        await repository.update(restaurantId, destination, {
          ...clearTest,
          enabled: false,
          interrupted_at: now,
          credential_hash: null,
          last_contact_at: null,
        });
      },
      { actor, capability: "printing:configure" },
    );
    this.notifier.disconnectPrintStation(restaurantId);
  }

  async queueTest(actor: ActorContext) {
    const restaurantId = this.tenant(actor);
    const updated = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (!row?.last_contact_at || row.last_contact_at <= offlineSince(now)) {
          throw new ConflictError("Conecte a impressora antes de testar", "PRINT_PRINTER_OFFLINE");
        }
        if (activeTest(row, now)) return status(row, now);
        const updated = await repository.update(restaurantId, destination, {
          browser_test_confirmed: false,
          test_token: randomUUID(),
          test_status: "PENDING",
          test_expires_at: new Date(now.getTime() + testTtlMs),
        });
        return status(updated, now);
      },
      { actor, capability: "printing:configure" },
    );
    if (updated.mode === "BROWSER" && updated.test_status === "PENDING") this.notifier.wakePrintStation(restaurantId);
    return updated;
  }

  verifyBrowserTest(actor: ActorContext, testId: string) {
    const restaurantId = this.tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (row?.mode !== "BROWSER" || row.test_status !== "SENT" || row.test_token !== testId) {
          throw new ConflictError("Envie uma nova via de teste antes de confirmar", "PRINT_TEST_REQUIRED");
        }
        const verified = await repository.update(restaurantId, destination, { browser_test_confirmed: true });
        return status(verified, now);
      },
      { actor, capability: "printing:configure" },
    );
  }

  async issueStationSocketTicket(credential: string) {
    const hash = hashToken(credential);
    await this.stationRestaurant(hash);
    return signStationSocketTicket(hash);
  }

  authenticateStationSocket(ticket: string) {
    return this.stationRestaurant(readStationSocketTicket(ticket));
  }

  private async stationRestaurant(credentialHash: string) {
    const scope = await this.repository.findByHash(credentialHash, { activeMode: "BROWSER" });
    if (!scope) throw new UnauthorizedError("Credencial de impressão inválida");
    return scope.restaurant_id;
  }

  private async withPrinter<T>(
    credential: string,
    mode: print_delivery_mode,
    work: (context: RestaurantTransaction, row: print_destinations, hash: string) => Promise<T>,
  ) {
    const hash = hashToken(credential);
    const scope = await this.repository.findByHash(hash);
    if (!scope) throw new UnauthorizedError("Credencial de impressão inválida");
    const { restaurant_id: restaurantId, destination } = scope;
    return this.unit.run(
      restaurantId,
      async (context) => {
        const { db, now, restaurant } = context;
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (!restaurant.active || row?.credential_hash !== hash || row.mode !== mode)
          throw new UnauthorizedError("Credencial de impressão inválida");
        await repository.expire(restaurantId, destination, now);
        await repository.hold(restaurantId, destination, offlineSince(now));
        if (mode !== "BROWSER" || !row.last_contact_at || now.getTime() - row.last_contact_at.getTime() >= browserHeartbeatMs) {
          await repository.update(restaurantId, destination, { last_contact_at: now });
        }
        return work(context, row, hash);
      },
      { allowInactive: true },
    );
  }

  private async nextToken({ db, now }: RestaurantTransaction, row: print_destinations) {
    const repository = new PrintingRepository(db);
    const { restaurant_id: restaurantId, destination } = row;
    if (await repository.sending(restaurantId, destination)) return null;
    if (activeTest(row, now)) return row.test_status === "PENDING" ? row.test_token : null;
    if (!row.enabled) return null;
    await repository.suppressCancelled(restaurantId, destination, now);
    return (await repository.next(restaurantId, destination, now))?.id ?? null;
  }

  poll(credential: string, ready: boolean) {
    return this.withPrinter(credential, "CLOUDPRNT", (context, row) =>
      ready ? this.nextToken(context, row) : Promise.resolve(null),
    );
  }

  async download(credential: string, token: string) {
    const payload = await this.withPrinter(credential, "CLOUDPRNT", (context, row, hash) =>
      this.reserveDocument(context, row, hash, token),
    );
    if (!payload) throw new NotFoundError("Comanda indisponível");
    return payload;
  }

  claimBrowser(credential: string) {
    return this.withPrinter(credential, "BROWSER", async (context, row, hash) => {
      const token = await this.nextToken(context, row);
      if (!token) return null;
      // A estação recebe o documento só na transação que o reservou.
      const document = await this.reserveDocument(context, row, hash, token);
      return document ? { token, document, paper_width: row.paper_width, valid_for_ms: reservationTtlMs } : null;
    });
  }

  private async reserveDocument(context: RestaurantTransaction, row: print_destinations, hash: string, token: string) {
    if (token !== row.test_token) return this.downloadOrder(context, row, hash, token);
    const { db, now } = context;
    const repository = new PrintingRepository(db);
    const { restaurant_id: restaurantId, destination } = row;
    if (!activeTest(row, now) || await repository.sending(restaurantId, destination)) return null;
    if (row.test_status === "PENDING") {
      await repository.update(restaurantId, destination, {
        test_status: "SENDING",
        test_expires_at: new Date(now.getTime() + reservationTtlMs),
      });
    }
    return "TEST" as const;
  }

  private async downloadOrder(
    { db, now }: Pick<RestaurantTransaction, "db" | "now">,
    row: print_destinations,
    hash: string,
    token: string,
  ) {
    const repository = new PrintingRepository(db);
    if (!row.enabled || (activeTest(row, now) && row.test_status === "SENDING")) return null;
    const { restaurant_id: restaurantId, destination } = row;
    const job = await repository.job(restaurantId, destination, token);
    if (job?.status === "SENDING" && job.reservation_credential_hash === hash) {
      return job.payload as PrintPayload;
    }
    if (job?.status !== "PENDING" || (job.next_attempt_at && job.next_attempt_at > now)) return null;
    if (await repository.sending(restaurantId, destination)) return null;
    const order = await new OrdersRepository(db).get(restaurantId, job.order_id);
    const payload = printPayload(order, job.original_job_id !== null);
    if (!payload.items.length) {
      await repository.updateJob(restaurantId, destination, job.id, {
        status: "SUPPRESSED", order_version: order.version, next_attempt_at: null,
      });
      return null;
    }
    await repository.updateJob(restaurantId, destination, job.id, {
      status: "SENDING",
      order_version: order.version,
      payload,
      attempts: { increment: 1 },
      next_attempt_at: null,
      reservation_id: randomUUID(),
      reservation_expires_at: new Date(now.getTime() + reservationTtlMs),
      reservation_credential_hash: hash,
      reported_outcome: null,
      delivery_mode: row.mode,
    });
    return payload;
  }

  confirm(credential: string, token: string, success: boolean) {
    return this.report(credential, "CLOUDPRNT", token, success);
  }

  reportBrowser(credential: string, token: string, submitted: boolean) {
    return this.report(credential, "BROWSER", token, submitted);
  }

  private async report(credential: string, mode: print_delivery_mode, token: string, success: boolean) {
    await this.withPrinter(credential, mode, async ({ db, now }, row, hash) => {
      const repository = new PrintingRepository(db);
      const { restaurant_id: restaurantId, destination } = row;
      const result = success ? "SENT" : "UNCERTAIN";
      if (token === row.test_token) {
        if (row.test_status === "SENDING" && activeTest(row, now)) {
          await repository.update(restaurantId, destination, { test_status: result });
        }
        return;
      }
      const job = await repository.job(restaurantId, destination, token);
      if (job?.status === "SENDING" && job.reservation_credential_hash === hash) {
        await repository.updateJob(restaurantId, destination, token, { status: result, reported_outcome: result });
      }
    });
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

  async review(actor: ActorContext, input: PrintReview) {
    const restaurantId = this.tenant(actor);
    const updated = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const row = await repository.get(restaurantId, destination);
        if (
          input.decision === "RELEASE" &&
          (!row?.last_contact_at || row.last_contact_at <= offlineSince(now))
        )
          throw new ConflictError(
            "A impressora precisa voltar a se conectar antes da liberação",
            "PRINT_PRINTER_OFFLINE",
          );
        const next = input.decision === "RELEASE" ? "PENDING" : "SUPPRESSED";
        const { count } = await repository.review(restaurantId, destination, input.job_ids, next);
        if (count !== input.job_ids.length)
          throw new ConflictError("A lista de revisão mudou", "PRINT_REVIEW_CONFLICT");
        return status(row);
      },
      { actor, capability: "printing:configure" },
    );
    if (input.decision === "RELEASE" && updated.enabled && updated.mode === "BROWSER") {
      this.notifier.wakePrintStation(restaurantId);
    }
    return updated;
  }

  async reprint(actor: ActorContext, orderId: string, input: PrintReprint) {
    const restaurantId = this.tenant(actor, "printing:operate");
    const result = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        const repository = new PrintingRepository(db);
        const sourceEvent = `REPRINT:${input.idempotency_key.toLowerCase()}`;
        const existing = await repository.findBySource(restaurantId, destination, orderId, sourceEvent);
        if (existing) {
          if (existing.reason !== input.reason || existing.requested_by !== actor.id)
            throw new ConflictError("Chave de segunda via já utilizada", "PRINT_REPRINT_KEY_CONFLICT");
          return { job: existing, replayed: true };
        }
        return {
          job: await this.createReprint(restaurantId, { db, now }, orderId, actor.id, sourceEvent, input.reason),
          replayed: false,
        };
      },
      { actor, capability: "printing:operate" },
    );
    if (!result.replayed && result.job.status === "PENDING") this.notifier.wakePrintStation(restaurantId);
    return { job: jobView(result.job), replayed: result.replayed };
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
