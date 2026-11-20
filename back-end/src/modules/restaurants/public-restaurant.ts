import type { restaurants } from "../../../generated/prisma/client.ts";

export type PublicRestaurant = Pick<restaurants, "id" | "name" | "slug" | "active" | "created_at">;

export function toPublicRestaurant({ id, name, slug, active, created_at }: restaurants): PublicRestaurant {
  return { id, name, slug, active, created_at };
}
