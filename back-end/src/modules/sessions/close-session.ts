import type { reason } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { CallRepository } from "../calls/calls.repository.ts";
import { SessionTokenRepository, TableSessionRepository } from "./sessions.repository.ts";

// Usar dentro da transação já bloqueada do restaurante; não abre outra transação
// e não emite eventos antes do commit. Pedidos permanecem no histórico/fila.
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
  return sessions.findById(restaurantId, id);
}
