import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateQuery, validateSchema } from "../../shared/middlewares/validator.middleware.ts";
import { ReportsController } from "./reports.controller.ts";
import {
  alertsQuery,
  forecastQuery,
  historyQuery,
  rangeQuery,
  rebuildSchema,
  summaryQuery,
} from "./reports.schemas.ts";

export function reportsRoutes() {
  const router = Router();
  const controller = container.resolve(ReportsController);
  const read = [ensureAuthenticated, ensureCapability("reports:read")];
  const range = validateQuery(rangeQuery);
  router.get("/reports/sales/summary", ...read, validateQuery(summaryQuery), controller.summary);
  router.get("/reports/sales/history", ...read, validateQuery(historyQuery), controller.history);
  router.get("/reports/products/abc", ...read, range, controller.products);
  router.get("/reports/products/basket", ...read, range, controller.basket);
  router.get("/reports/heatmap", ...read, range, controller.heatmap);
  router.get("/reports/kitchen/prep-time", ...read, range, controller.prepTime);
  router.get("/reports/forecasts/demand", ...read, validateQuery(forecastQuery), controller.forecast);
  router.get("/reports/forecasts/alerts", ...read, validateQuery(alertsQuery), controller.alerts);
  router.post("/reports/rebuild", ...read, validateSchema(rebuildSchema), controller.rebuild);
  return router;
}
