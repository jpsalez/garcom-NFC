import type { reason } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { CallRepository } from "../calls/calls.repository.ts";
import { notifyPaymentRequestUpdated } from "../tabs/payment-request-events.ts";
import { PaymentRequestsRepository } from "../tabs/payment-requests.repository.ts";
import { SessionTokenRepository, TableSessionRepository } from "./sessions.repository.ts";

// A transação do restaurante fecha os recursos juntos. Os eventos são emitidos após o commit.
export async function closeSessionResources(
  db: DbClient,
  restaurantId: string,
  id: string,
  now: Date,
  closedReason: reason,
  closedBy?: string,
) {
  const sessions = new TableSessionRepository(db);
  const result = await sessions.closeIfActive(restaurantId, id, {
    closed_reason: closedReason,
    closed_by: closedBy,
  });
  if (!result.count) return null;
  await new SessionTokenRepository(db).revokeAllBySession(id, now);
  await new CallRepository(db).cancelOpenBySession(id);
  const requests = await new PaymentRequestsRepository(db).closeOpenForSession(
    restaurantId,
    id,
    closedReason === "TIMEOUT" ? "EXPIRED" : "CANCELLED",
  );
  const session = await sessions.findById(restaurantId, id);
  return session ? { session, requests } : null;
}

export type ClosedSession = NonNullable<Awaited<ReturnType<typeof closeSessionResources>>>;

export function notifySessionClosed(notifier: INotifier, { session, requests }: ClosedSession) {
  notifier.toRestaurant(session.restaurant_id, "session:closed", {
    id: session.id,
    reason: session.closed_reason,
  });
  for (const request of requests) notifyPaymentRequestUpdated(notifier, request);
}
