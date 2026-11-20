import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { printPairingLimiter } from "../../shared/middlewares/rate-limit.middleware.ts";
import { validateSchema } from "../../shared/middlewares/validator.middleware.ts";
import { PrintingController } from "./printing.controller.ts";
import { printingPairSchema, printingSettingsSchema } from "./printing.schemas.ts";

export function printingRoutes() {
  const router = Router();
  const controller = container.resolve(PrintingController);
  router.use(["/printing", "/print-agent"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const managers = [ensureAuthenticated, ensureCapability("printing:configure")];
  router.get("/printing/kitchen", ...managers, controller.get);
  router.patch(
    "/printing/kitchen",
    ...managers,
    validateSchema(printingSettingsSchema),
    controller.setEnabled,
  );
  router.post("/printing/kitchen/pairing", ...managers, controller.issueCode);
  router.delete("/printing/kitchen/pairing", ...managers, controller.revoke);
  router.post("/print-agent/pair", printPairingLimiter, validateSchema(printingPairSchema), controller.pair);
  router.post("/print-agent/contact", controller.contact);
  return router;
}
