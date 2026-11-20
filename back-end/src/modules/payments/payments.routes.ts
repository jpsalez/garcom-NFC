import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { PaymentsController } from "./payments.controller.ts";
import { createPaymentSchema, refundPaymentSchema } from "./payments.schemas.ts";

export function paymentsRoutes() {
  const router = Router();
  const controller = container.resolve(PaymentsController);
  router.post(
    "/tabs/:id/payments",
    ensureAuthenticated,
    ensureCapability("payments:create"),
    validateUuidParams("id"),
    validateSchema(createPaymentSchema),
    controller.create,
  );
  router.post(
    "/tabs/:id/payments/:paymentId/refund",
    ensureAuthenticated,
    ensureCapability("payments:refund"),
    validateUuidParams("id", "paymentId"),
    validateSchema(refundPaymentSchema),
    controller.refund,
  );
  return router;
}
