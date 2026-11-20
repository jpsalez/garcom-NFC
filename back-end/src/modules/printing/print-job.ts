import type { print_jobs, print_job_outcome, Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";
import { PrintingRepository } from "./printing.repository.ts";

export const kitchenDestination = "KITCHEN";
export const agentOfflineMs = 5 * 60 * 1000;
export const reservationTtlMs = 30 * 1000;
const maxAttempts = 3;

export function printPayload(order: OrderRecord, reprint: boolean) {
  const items = order.items
    .filter((item) => item.quantity > item.cancelled_quantity)
    .map((item) => ({
      item_id: item.id,
      product_name: item.product_name_snapshot,
      variant_name: item.variant_name_snapshot,
      quantity: item.quantity - item.cancelled_quantity,
      notes: item.notes,
      selections: item.selections.map((selection) => ({
        group_name: selection.group_name_snapshot,
        option_name: selection.option_name_snapshot,
        quantity: selection.selected_quantity,
      })),
    }));

  return {
    order_id: order.id,
    created_at: order.created_at.toISOString(),
    table_label: order.table_label_snapshot,
    tab_number: order.tab_number_snapshot,
    items,
    ...(reprint ? { reprint: { label: "SEGUNDA VIA" } } : {}),
  };
}

export async function enqueueOriginal(db: DbClient, order: OrderRecord) {
  const restaurantId = order.restaurant_id;
  const repository = new PrintingRepository(db);
  if (!(await repository.get(restaurantId, kitchenDestination))?.enabled) return;
  await repository.createOriginal(restaurantId, order.id, kitchenDestination, printPayload(order, false));
}

export function jobView(job: print_jobs) {
  return {
    id: job.id,
    order_id: job.order_id,
    destination: job.destination,
    status: job.status,
    order_version: job.order_version,
    attempts: job.attempts,
    next_attempt_at: job.next_attempt_at,
    expires_at: job.status === "SENDING" ? job.reservation_expires_at : null,
    original_job_id: job.original_job_id,
    requested_by: job.requested_by,
    reason: job.reason,
    created_at: job.created_at,
  };
}

export function resultUpdate(
  job: print_jobs,
  outcome: print_job_outcome,
  now: Date,
  canRetry: boolean,
): Prisma.print_jobsUpdateManyMutationInput {
  if (outcome !== "FAILED_BEFORE_SEND") return { status: outcome, reported_outcome: outcome };
  if (job.attempts >= maxAttempts) return { status: "FAILED", reported_outcome: outcome };
  const delayMs = 5000 * 2 ** (job.attempts - 1);
  return {
    status: canRetry ? "PENDING" : "REVIEW_REQUIRED",
    reported_outcome: outcome,
    next_attempt_at: new Date(now.getTime() + delayMs),
  };
}
