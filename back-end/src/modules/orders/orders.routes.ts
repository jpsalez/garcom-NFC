import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { ensureTableToken } from "../../shared/middlewares/table-token.middleware.ts";
import { validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { orderSubmitLimiter, orderReadLimiter } from "../../shared/middlewares/rate-limit.middleware.ts";
import { OrdersController } from "./orders.controller.ts";
export function ordersRoutes() {
  const router = Router(),
    controller = container.resolve(OrdersController);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const staff = [ensureAuthenticated, ensureCapability("orders:read")];
  router.get("/orders", ...staff, controller.list);
  router.post("/orders", ensureAuthenticated, ensureCapability("orders:create"), controller.posSubmit);
  router.get("/orders/:id", ...staff, validateUuidParams("id"), controller.get);
  router.get("/orders/:id/events", ...staff, validateUuidParams("id"), controller.events);
  router.post("/orders/:id/transitions", ...staff, validateUuidParams("id"), controller.transition);
  router.get(
    "/ordering-settings",
    ensureAuthenticated,
    ensureCapability("ordering:configure"),
    controller.getSettings,
  );
  router.patch(
    "/ordering-settings",
    ensureAuthenticated,
    ensureCapability("ordering:configure"),
    controller.setSettings,
  );
  router.post("/public/orders", ensureTableToken, orderSubmitLimiter, controller.submit);
  router.get("/public/orders", ensureTableToken, orderReadLimiter, controller.deviceList);
  router.get(
    "/public/orders/:id",
    ensureTableToken,
    orderReadLimiter,
    validateUuidParams("id"),
    controller.deviceGet,
  );
  router.get("/public/table-context", ensureTableToken, orderReadLimiter, controller.context);
  return router;
}
