import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { TabsController } from "./tabs.controller.ts";
import {
  cancelTabSchema,
  closeTabSchema,
  mergeTabSchema,
  openTabSchema,
  tabAdjustmentSchema,
  transferTabSchema,
  updateTabSchema,
  waiveFeeSchema,
} from "./tabs.schemas.ts";

export function tabsRoutes() {
  const router = Router();
  const controller = container.resolve(TabsController);
  const read = [ensureAuthenticated, ensureCapability("tabs:read")];
  const manage = [ensureAuthenticated, ensureCapability("tabs:manage")];
  const id = validateUuidParams("id");

  router.get("/tabs", ...read, controller.list);
  router.get("/tabs/:id", ...read, id, controller.get);
  router.post("/tabs", ...manage, validateSchema(openTabSchema), controller.open);
  router.patch("/tabs/:id", ...manage, id, validateSchema(updateTabSchema), controller.update);
  router.post(
    "/tabs/:id/transfer-table",
    ...manage,
    id,
    validateSchema(transferTabSchema),
    controller.transfer,
  );
  router.post("/tabs/:id/merge", ...manage, id, validateSchema(mergeTabSchema), controller.merge);
  router.post("/tabs/:id/pre-bill", ...read, id, controller.preBill);
  router.post(
    "/tabs/:id/close",
    ensureAuthenticated,
    ensureCapability("tabs:close"),
    id,
    validateSchema(closeTabSchema),
    controller.close,
  );
  router.post(
    "/tabs/:id/cancel",
    ensureAuthenticated,
    ensureCapability("tabs:cancel"),
    id,
    validateSchema(cancelTabSchema),
    controller.cancel,
  );
  router.post(
    "/tabs/:id/adjustments",
    ...manage,
    id,
    validateSchema(tabAdjustmentSchema),
    controller.addAdjustment,
  );
  router.post(
    "/tabs/:id/service-fee/waive",
    ensureAuthenticated,
    ensureCapability("tabs:service_fee_waive"),
    id,
    validateSchema(waiveFeeSchema),
    controller.waiveFee,
  );
  return router;
}
