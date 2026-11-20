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
  | "orders:cancel"
  | "restaurant:configure"
  | "sessions:close"
  | "calls:done"
  | "orders:create"
  | "tabs:read"
  | "tabs:manage"
  | "tabs:close"
  | "tabs:service_fee_waive"
  | "tabs:discount"
  | "tabs:cancel"
  | "payments:create"
  | "payments:refund"
  | "cash_shift:operate"
  | "terminals:configure"
  | "fiscal:configure"
  | "fiscal:emit"
  | "reports:read";
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

const waiterPdv: readonly Capability[] = [
  "orders:create",
  "tabs:read",
  "tabs:manage",
  "tabs:close",
  "payments:create",
  "fiscal:emit",
];
const cashierPdv: readonly Capability[] = [...waiterPdv, "tabs:service_fee_waive", "cash_shift:operate"];

export function hasCapability(actor: ActorContext, capability: Capability) {
  if (!actor.restaurantId) return false;
  if (actor.role === "OWNER") return true;
  if (actor.role !== "STAFF") return false;
  if (actor.category === "MANAGER") return true;
  if (capability === "sessions:close" || capability === "calls:done")
    return actor.category !== "CLEANING" && actor.category !== "OTHER";
  if (actor.category === "CASHIER") return cashierPdv.includes(capability);
  if (actor.category === "WAITER") return operational.includes(capability) || waiterPdv.includes(capability);
  return (
    actor.category === "KITCHEN" && (capability === "printing:operate" || operational.includes(capability))
  );
}
export function requireCapability(actor: ActorContext, capability: Capability) {
  if (!hasCapability(actor, capability)) throw new ForbiddenError("Sem permissão para esta ação");
}
