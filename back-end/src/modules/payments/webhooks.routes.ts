import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import type { PointPaymentsService } from "./point-payments.service.ts";

export function paymentWebhooksRoutes() {
  const router = Router();
  const service = container.resolve<PointPaymentsService>("PointPaymentsService");
  router.post("/webhooks/payments/mercado-pago", async (req, res) => {
    await service.handleWebhook(req.query["data.id"], req.get("x-request-id"), req.get("x-signature"));
    res.status(200).end();
  });
  return router;
}
