import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { TabsController } from "./tabs.controller.ts";
import { mergeTabSchema, openTabSchema, transferTabSchema, updateTabSchema } from "./tabs.schemas.ts";

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
  return router;
}
