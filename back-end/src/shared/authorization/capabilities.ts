import type { role, staff_category } from "../../../generated/prisma/enums.ts";
import { ForbiddenError } from "../errors/http-errors.ts";

export type Capability =
  | "menu:manage"
  | "menu:publish"
  | "ordering:configure"
  | "printing:configure"
  | "printing:operate"
  | "availability:write"
  | "orders:read"
  | "orders:prepare"
  | "orders:deliver"
  | "orders:cancel";
export type ActorContext = {
  id: string;
  restaurantId: string | null;
  role: role;
  category: staff_category | null;
};
const operational: readonly Capability[] = [
  "availability:write",
  "orders:read",
  "orders:prepare",
  "orders:deliver",
  "orders:cancel",
];
export function hasCapability(actor: ActorContext, capability: Capability) {
  if (!actor.restaurantId) return false;
  if (actor.role === "OWNER") return true;
  if (actor.role !== "STAFF") return false;
  if (actor.category === "MANAGER") return true;
  if (capability === "printing:operate") return actor.category === "KITCHEN";
  return (actor.category === "WAITER" || actor.category === "KITCHEN") && operational.includes(capability);
}
export function requireCapability(actor: ActorContext, capability: Capability) {
  if (!hasCapability(actor, capability)) throw new ForbiddenError("Sem permissão para esta ação");
}
