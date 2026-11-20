import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import {
  validateQuery,
  validateSchema,
  validateUuidParams,
} from "../../shared/middlewares/validator.middleware.ts";
import { cloudPrntRoutes } from "./cloudprnt.routes.ts";
import { browserPrintingRoutes } from "./browser-printing.routes.ts";
import { PrintingController } from "./printing.controller.ts";
import {
  printingJobsQuery,
  printingPatchSchema,
  reprintSchema,
} from "./printing.schemas.ts";

export function printingRoutes() {
  const router = Router();
  const controller = container.resolve(PrintingController);
  router.use(["/printing", "/print-jobs"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const managers = [ensureAuthenticated, ensureCapability("printing:configure")];
  router.get("/printing/kitchen", ...managers, controller.get);
  router.patch("/printing/kitchen", ...managers, validateSchema(printingPatchSchema), controller.setEnabled);
  router.post("/printing/kitchen/printer", ...managers, controller.provision);
  router.delete("/printing/kitchen/printer", ...managers, controller.revoke);
  router.post("/printing/kitchen/test", ...managers, controller.test);
  router.use("/printing/cloudprnt", cloudPrntRoutes());
  router.use("/printing/station", browserPrintingRoutes());
  const operators = [ensureAuthenticated, ensureCapability("printing:operate")];
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
