import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { CashShiftsController } from "./cash-shifts.controller.ts";
import { cashMovementSchema, closeCashShiftSchema, openCashShiftSchema } from "./cash-shifts.schemas.ts";

export function cashShiftsRoutes() {
  const router = Router();
  const controller = container.resolve(CashShiftsController);
  const access = [ensureAuthenticated, ensureCapability("cash_shift:operate")];
  const id = validateUuidParams("id");
  router.get("/cash-shifts", ...access, controller.list);
  router.get("/cash-shifts/current", ...access, controller.current);
  router.get("/cash-shifts/:id", ...access, id, controller.get);
  router.post("/cash-shifts/open", ...access, validateSchema(openCashShiftSchema), controller.open);
  router.post(
    "/cash-shifts/:id/movements",
    ...access,
    id,
    validateSchema(cashMovementSchema),
    controller.movement,
  );
  router.post(
    "/cash-shifts/:id/close",
    ...access,
    id,
    validateSchema(closeCashShiftSchema),
    controller.close,
  );
  return router;
}
