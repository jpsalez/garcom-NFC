import type { DbClient } from "../../shared/providers/prisma.ts";

// Busca só as chaves; o serviço revalida tudo no tenant antes de agir.
export function findDocumentsToSync(db: DbClient, staleBefore: Date, limit: number) {
  return db.fiscal_documents.findMany({
    where: {
      updated_at: { lt: staleBefore },
      OR: [
        { status: "PENDING", dispatched_at: null },
        { status: "PENDING", external_id: { not: null } },
        { status: "PROCESSING" },
        { status: "AUTHORIZED", cancel_requested_at: { not: null } },
      ],
    },
    select: { id: true, restaurant_id: true },
    orderBy: [{ updated_at: "asc" }, { id: "asc" }],
    take: limit,
  });
}
