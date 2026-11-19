import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.ts";

export type CreateRestaurantData = { name: string; slug: string };

// Uma escrita aninhada mantém restaurante, rascunho, configuração e auditoria
// atômicos nos dois fluxos de cadastro e no seed. Não publica nem ativa pedidos.
export function initialRestaurantData(input: CreateRestaurantData): Prisma.restaurantsCreateInput {
  const id = randomUUID();
  const displayName = Array.from(input.name.trim()).slice(0, 120).join("") || "Cardápio";
  return {
    id,
    name: input.name,
    slug: input.slug,
    menus: { create: { display_name: displayName } },
    order_settings: { create: {} },
    operation_events: {
      create: {
        entity_type: "ORDERING_SETTINGS",
        entity_id: id,
        action: "INITIALIZED",
        new_value: { customer_ordering_enabled: false },
        actor_type: "SYSTEM",
      },
    },
  };
}
