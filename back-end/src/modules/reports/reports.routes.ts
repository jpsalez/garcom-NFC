import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema } from "../../shared/middlewares/validator.middleware.ts";
import { ReportsController } from "./reports.controller.ts";
import { rebuildSchema } from "./reports.schemas.ts";

export function reportsRoutes() {
  const router = Router();
  const controller = container.resolve(ReportsController);
  const read = [ensureAuthenticated, ensureCapability("reports:read")];
  // As queries são validadas uma vez, no controller, que também aplica os defaults.
  router.get("/reports/sales/summary", ...read, controller.summary);
  router.get("/reports/sales/history", ...read, controller.history);
  router.get("/reports/products/abc", ...read, controller.products);
  router.get("/reports/products/basket", ...read, controller.basket);
  router.get("/reports/heatmap", ...read, controller.heatmap);
  router.get("/reports/kitchen/prep-time", ...read, controller.prepTime);
  router.get("/reports/forecasts/demand", ...read, controller.forecast);
  router.get("/reports/forecasts/alerts", ...read, controller.alerts);
  router.post("/reports/rebuild", ...read, validateSchema(rebuildSchema), controller.rebuild);
  return router;
}
