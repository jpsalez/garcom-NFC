import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { printPairingLimiter } from "../../shared/middlewares/rate-limit.middleware.ts";
import {
  validateQuery,
  validateSchema,
  validateUuidParams,
} from "../../shared/middlewares/validator.middleware.ts";
import { PrintingController } from "./printing.controller.ts";
import {
  printClaimSchema,
  printResultSchema,
  printingJobsQuery,
  printingPairSchema,
  printingPatchSchema,
  reprintSchema,
} from "./printing.schemas.ts";

export function printingRoutes() {
  const router = Router();
  const controller = container.resolve(PrintingController);
  router.use(["/printing", "/print-agent", "/print-jobs"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const managers = [ensureAuthenticated, ensureCapability("printing:configure")];
  router.get("/printing/kitchen", ...managers, controller.get);
  router.patch("/printing/kitchen", ...managers, validateSchema(printingPatchSchema), controller.setEnabled);
  router.post("/printing/kitchen/pairing", ...managers, controller.issueCode);
  router.delete("/printing/kitchen/pairing", ...managers, controller.revoke);
  router.post("/print-agent/pair", printPairingLimiter, validateSchema(printingPairSchema), controller.pair);
  router.post("/print-agent/contact", controller.contact);
  const operators = [ensureAuthenticated, ensureCapability("printing:operate")];
  router.post("/print-jobs/claim", validateSchema(printClaimSchema), controller.claim);
  router.post(
    "/print-jobs/:id/result",
    validateUuidParams("id"),
    validateSchema(printResultSchema),
    controller.result,
  );
  router.get("/print-jobs", ...operators, validateQuery(printingJobsQuery), controller.list);
  router.post(
    "/orders/:id/reprints",
    ...operators,
    validateUuidParams("id"),
    validateSchema(reprintSchema),
    controller.reprint,
  );
  return router;
}
