import { inject, injectable } from "tsyringe";
import type { print_destination, print_job_status, Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { decodeCursor } from "../../shared/utils/cursor.ts";
import type { PrintingJobsQuery } from "./printing.schemas.ts";
import type { IPrintingRepository } from "./printing.repository.interface.ts";

@injectable()
export class PrintingRepository implements IPrintingRepository {
  constructor(@inject("DbClient") private db: DbClient) {}

  // Descobre o escopo pela prova opaca. O service a confere novamente sob o lock do restaurante.
  findByHash(credentialHash: string) {
    return this.db.print_destinations.findUnique({
      where: { credential_hash: credentialHash },
      select: { restaurant_id: true, destination: true },
    });
  }

  get(restaurantId: string, destination: print_destination) {
    return this.db.print_destinations.findUnique({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
    });
  }

  saveCredential(restaurantId: string, destination: print_destination, hash: string, now: Date) {
    const data = {
      credential_hash: hash,
      last_contact_at: null,
      enabled: false,
      interrupted_at: now,
      test_token: null,
      test_status: null,
      test_expires_at: null,
    };
    return this.db.print_destinations.upsert({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
      create: { restaurant_id: restaurantId, destination, ...data },
      update: data,
    });
  }

  interruptSending(restaurantId: string, destination: print_destination) {
    return this.db.print_jobs.updateMany({
      where: { restaurant_id: restaurantId, destination, status: "SENDING" },
      data: { status: "UNCERTAIN" },
    });
  }

  update(
    restaurantId: string,
    destination: print_destination,
    data: Prisma.print_destinationsUpdateManyMutationInput,
  ) {
    return this.db.print_destinations.update({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
      data,
    });
  }

  createOriginal(
    restaurantId: string,
    orderId: string,
    destination: print_destination,
    payload: Prisma.InputJsonObject,
  ) {
    return this.db.print_jobs.create({
      data: {
        restaurant_id: restaurantId,
        order_id: orderId,
        destination,
        source_event: "ORDER_CREATED",
        payload_version: 1,
        payload,
      },
    });
  }

  expire(restaurantId: string, destination: print_destination | undefined, now: Date) {
    return this.db.print_jobs.updateMany({
      where: {
        restaurant_id: restaurantId,
        destination,
        status: "SENDING",
        reservation_expires_at: { lte: now },
      },
      data: { status: "UNCERTAIN" },
    });
  }

  hold(restaurantId: string, destination: print_destination | undefined, offlineSince?: Date) {
    return this.db.print_jobs.updateMany({
      where: {
        restaurant_id: restaurantId,
        destination,
        status: "PENDING",
        print_destination: offlineSince
          ? { OR: [{ last_contact_at: null }, { last_contact_at: { lte: offlineSince } }] }
          : undefined,
      },
      data: { status: "REVIEW_REQUIRED" },
    });
  }

  review(
    restaurantId: string,
    destination: print_destination,
    ids: string[],
    status: Extract<print_job_status, "PENDING" | "SUPPRESSED">,
  ) {
    return this.db.print_jobs.updateMany({
      where: { restaurant_id: restaurantId, destination, id: { in: ids }, status: "REVIEW_REQUIRED" },
      data: { status, ...(status === "SUPPRESSED" ? { next_attempt_at: null } : {}) },
    });
  }

  suppressCancelled(restaurantId: string, destination: print_destination, now: Date) {
    return this.db.$executeRaw`
      UPDATE print_jobs AS job
      SET status = 'SUPPRESSED', order_version = order_row.version, next_attempt_at = NULL
      FROM orders AS order_row
      WHERE job.restaurant_id = ${restaurantId}
        AND job.destination = ${destination}::print_destination
        AND job.status = 'PENDING'
        AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= ${now})
        AND order_row.restaurant_id = job.restaurant_id AND order_row.id = job.order_id
        AND NOT EXISTS (
          SELECT 1 FROM order_items AS item
          WHERE item.restaurant_id = job.restaurant_id AND item.order_id = job.order_id
            AND item.quantity > item.cancelled_quantity
        )`;
  }

  sending(restaurantId: string, destination: print_destination) {
    return this.db.print_jobs.findFirst({
      where: { restaurant_id: restaurantId, destination, status: "SENDING" },
      select: { id: true },
    });
  }

  next(restaurantId: string, destination: print_destination, now: Date) {
    return this.db.print_jobs.findFirst({
      where: {
        restaurant_id: restaurantId,
        destination,
        status: "PENDING",
        OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  job(restaurantId: string, destination: print_destination, id: string) {
    return this.db.print_jobs.findUnique({
      where: { id, restaurant_id: restaurantId, destination },
    });
  }

  updateJob(
    restaurantId: string,
    destination: print_destination,
    id: string,
    data: Prisma.print_jobsUpdateManyMutationInput,
  ) {
    return this.db.print_jobs.update({
      where: { id, restaurant_id: restaurantId, destination },
      data,
    });
  }

  findBySource(restaurantId: string, destination: print_destination, orderId: string, sourceEvent: string) {
    return this.db.print_jobs.findUnique({
      where: {
        restaurant_id_order_id_destination_source_event: {
          restaurant_id: restaurantId,
          order_id: orderId,
          destination,
          source_event: sourceEvent,
        },
      },
    });
  }

  createReprint(
    restaurantId: string,
    destination: print_destination,
    data: Omit<Prisma.print_jobsUncheckedCreateInput, "restaurant_id" | "destination">,
  ) {
    return this.db.print_jobs.create({ data: { ...data, restaurant_id: restaurantId, destination } });
  }

  list(restaurantId: string, query: PrintingJobsQuery) {
    const cursor = decodeCursor(query.cursor);
    return this.db.print_jobs.findMany({
      where: {
        restaurant_id: restaurantId,
        destination: query.destination,
        order_id: query.order_id,
        status: query.status,
        OR: cursor && [
          { created_at: { lt: cursor.created_at } },
          { created_at: cursor.created_at, id: { lt: cursor.id } },
        ],
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
  }
}
