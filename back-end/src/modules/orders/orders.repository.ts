import { randomUUID } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import { decodeCursor } from "../../shared/utils/cursor.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { orderInclude, type IOrdersRepository, type TableContext } from "./orders.repository.interface.ts";
import type { PricedLine } from "./order-pricing.ts";
import type { OrdersQuery, Transition } from "./orders.schemas.ts";

export type CreateOrderData = {
  restaurantId: string;
  source: "LOCAL_MENU" | "POS";
  sessionId: string;
  tabNumberSnapshot: number;
  tableLabelSnapshot: string;
  submittedByTokenId: string | null;
  submittedByUserId: string | null;
  publicationId: string;
  submissionKey: string;
  requestHash: string;
  totalCents: number;
  lines: PricedLine[];
  actor?: ActorContext;
};

@injectable()
export class OrdersRepository implements IOrdersRepository {
  constructor(@inject("DbClient") private db: DbClient) {}
  async get(restaurantId: string, id: string) {
    const order = await this.db.orders.findFirst({
      where: { restaurant_id: restaurantId, id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError("Pedido não encontrado");
    return order;
  }
  findSubmission(restaurantId: string, key: string) {
    return this.db.orders.findUnique({
      where: { restaurant_id_submission_key: { restaurant_id: restaurantId, submission_key: key } },
      include: { ...orderInclude, session: { select: { table_id: true } } },
    });
  }
  async device(context: TableContext, now: Date) {
    const token = await this.db.session_tokens.findFirst({
      where: {
        id: context.tokenId,
        session_id: context.sessionId,
        revoked_at: null,
        table_session: { restaurant_id: context.restaurantId },
      },
      include: { table_session: { include: { table: true } } },
    });
    const session = token?.table_session;
    if (
      !token ||
      !session ||
      session.status !== "ACTIVE" ||
      (!session.keep_open && session.expires_at <= now) ||
      !session.table.active
    )
      throw new UnauthorizedError("Token da mesa inválido ou expirado");
    return session;
  }
  list(restaurantId: string, query: OrdersQuery, tokenId?: string) {
    const cursor = decodeCursor(query.cursor);
    const open = {
      OR: [{ pending_quantity: { gt: 0 } }, { preparing_quantity: { gt: 0 } }, { ready_quantity: { gt: 0 } }],
    };
    const progress = query.progress ?? (tokenId ? undefined : "open");
    const where: Prisma.ordersWhereInput = {
      restaurant_id: restaurantId,
      session_id: query.session_id,
      submitted_by_token_id: tokenId,
      created_at:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    if (progress === "open") where.items = { some: open };
    if (progress === "ready") where.items = { some: { ready_quantity: { gt: 0 } } };
    if (progress === "completed") {
      where.AND = [{ items: { none: open } }, { items: { some: { delivered_quantity: { gt: 0 } } } }];
    }
    if (progress === "cancelled") {
      where.AND = [
        { items: { none: { OR: [...open.OR, { delivered_quantity: { gt: 0 } }] } } },
        { items: { some: { cancelled_quantity: { gt: 0 } } } },
      ];
    }
    if (cursor)
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { created_at: { lt: cursor.created_at } },
            { created_at: cursor.created_at, id: { lt: cursor.id } },
          ],
        },
      ];
    return this.db.orders.findMany({
      where,
      include: orderInclude,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
  }
  async hasPendingForSession(restaurantId: string, sessionId: string) {
    return (
      (await this.db.order_items.count({
        where: {
          restaurant_id: restaurantId,
          order: { session_id: sessionId },
          OR: [
            { pending_quantity: { gt: 0 } },
            { preparing_quantity: { gt: 0 } },
            { ready_quantity: { gt: 0 } },
          ],
        },
      })) > 0
    );
  }
  async create(input: CreateOrderData) {
    const id = randomUUID(),
      rest = input.restaurantId;
    await this.db.orders.create({
      data: {
        id,
        restaurant_id: rest,
        source: input.source,
        session_id: input.sessionId,
        tab_number_snapshot: input.tabNumberSnapshot,
        submitted_by_token_id: input.submittedByTokenId,
        submitted_by_user_id: input.submittedByUserId,
        publication_id: input.publicationId,
        table_label_snapshot: input.tableLabelSnapshot,
        submission_key: input.submissionKey,
        request_hash: input.requestHash,
        total_cents: input.totalCents,
      },
    });
    for (const [position, { selections, ...line }] of input.lines.entries()) {
      const itemId = randomUUID();
      await this.db.order_items.create({
        data: {
          ...line,
          id: itemId,
          restaurant_id: rest,
          order_id: id,
          position,
          pending_quantity: line.quantity,
        },
      });
      if (selections.length)
        await this.db.order_item_options.createMany({
          data: selections.map((selection) => ({
            ...selection,
            id: randomUUID(),
            restaurant_id: rest,
            product_id: line.product_id,
            order_item_id: itemId,
          })),
        });
    }
    await this.db.order_events.create({
      data: {
        restaurant_id: rest,
        order_id: id,
        sequence: 1,
        action: "CREATED",
        resulting_order_version: 1,
        ...(input.actor
          ? {
              actor_type: "USER",
              actor_user_id: input.actor.id,
              actor_role_snapshot: input.actor.role,
              actor_category_snapshot: input.actor.category,
              actor_label_snapshot: input.actor.id,
            }
          : { actor_type: "TABLE_DEVICE" }),
      },
    });
    return this.get(rest, id);
  }
  async claim(restaurantId: string, id: string, version: number, operationCount: number) {
    const result = await this.db.orders.updateMany({
      where: { restaurant_id: restaurantId, id, version },
      data: { version: { increment: 1 }, last_event_sequence: { increment: operationCount } },
    });
    if (!result.count)
      throw new ConflictError("Pedido foi alterado; atualize a página", "ORDER_VERSION_CONFLICT");
  }
  updateCounters(
    restaurantId: string,
    id: string,
    counters: {
      pending_quantity: number;
      preparing_quantity: number;
      ready_quantity: number;
      delivered_quantity: number;
      cancelled_quantity: number;
    },
  ) {
    return this.db.order_items.updateMany({ where: { restaurant_id: restaurantId, id }, data: counters });
  }
  event(
    restaurantId: string,
    orderId: string,
    op: Transition,
    sequence: number,
    version: number,
    actor: ActorContext,
  ) {
    return this.db.order_events.create({
      data: {
        restaurant_id: restaurantId,
        order_id: orderId,
        order_item_id: op.item_id,
        sequence,
        action: "TRANSITIONED",
        quantity: op.quantity,
        from_stage: op.from_stage,
        to_stage: op.to_stage,
        reason: op.reason,
        resulting_order_version: version,
        actor_type: "USER",
        actor_user_id: actor.id,
        actor_role_snapshot: actor.role,
        actor_category_snapshot: actor.category,
        actor_label_snapshot: actor.id,
      },
    });
  }
  events(restaurantId: string, orderId: string, after: number, limit: number) {
    return this.db.order_events.findMany({
      where: { restaurant_id: restaurantId, order_id: orderId, sequence: { gt: after } },
      orderBy: { sequence: "asc" },
      take: limit + 1,
    });
  }
}
