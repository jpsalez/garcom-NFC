import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { FiscalController } from "./fiscal.controller.ts";
import {
  cancelNfceSchema,
  fiscalSettingsSchema,
  productTaxProfileSchema,
  retryNfceSchema,
  taxProfileSchema,
  updateTaxProfileSchema,
} from "./fiscal.schemas.ts";

export function fiscalRoutes() {
  const router = Router();
  const controller = container.resolve(FiscalController);
  const configure = [ensureAuthenticated, ensureCapability("fiscal:configure")];
  const emit = [ensureAuthenticated, ensureCapability("fiscal:emit")];
  const id = validateUuidParams("id");
  router.get("/fiscal/settings", ...configure, controller.settings);
  router.put("/fiscal/settings", ...configure, validateSchema(fiscalSettingsSchema), controller.saveSettings);
  router.get("/fiscal/tax-profiles", ...configure, controller.profiles);
  router.post(
    "/fiscal/tax-profiles",
    ...configure,
    validateSchema(taxProfileSchema),
    controller.createProfile,
  );
  router.patch(
    "/fiscal/tax-profiles/:id",
    ...configure,
    id,
    validateSchema(updateTaxProfileSchema),
    controller.updateProfile,
  );
  router.put(
    "/fiscal/products/:id/tax-profile",
    ...configure,
    id,
    validateSchema(productTaxProfileSchema),
    controller.assignProduct,
  );
  router.get("/tabs/:id/nfce", ...emit, id, controller.document);
  router.post("/tabs/:id/nfce/retry", ...emit, id, validateSchema(retryNfceSchema), controller.retry);
  router.post("/tabs/:id/nfce/cancel", ...configure, id, validateSchema(cancelNfceSchema), controller.cancel);
  return router;
}
