import { Router, type Request, type Response } from "express";
import { container } from "../../shared/container/container.ts";
import {
  callLimiter,
  orderReadLimiter,
  tableSessionLimiter,
} from "../../shared/middlewares/rate-limit.middleware.ts";
import { deviceOf, ensureTableToken } from "../../shared/middlewares/table-token.middleware.ts";
import { validateSchema, validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { guestSchema, paymentRequestSchema, type PaymentRequestInput } from "./payment-requests.schemas.ts";
import type { IPaymentRequestsService } from "./payment-requests.service.ts";

export function paymentRequestsRoutes() {
  const router = Router();
  const service = container.resolve<IPaymentRequestsService>("PaymentRequestsService");
  router.patch(
    "/public/table-session/guest",
    ensureTableToken,
    tableSessionLimiter,
    validateSchema(guestSchema),
    async (req: Request, res: Response) => res.json(await service.guest(deviceOf(req), req.body.guest_label)),
  );
  router.get("/public/tab", ensureTableToken, orderReadLimiter, async (req: Request, res: Response) =>
    res.set("Cache-Control", "no-store").json(await service.getTab(deviceOf(req))),
  );
  router.post(
    "/public/tab/payment-requests",
    ensureTableToken,
    callLimiter,
    validateSchema(paymentRequestSchema),
    async (req: Request, res: Response) =>
      res.status(201).json(await service.create(deviceOf(req), req.body as PaymentRequestInput)),
  );
  router.delete(
    "/public/tab/payment-requests/:id",
    ensureTableToken,
    callLimiter,
    validateUuidParams("id"),
    async (req: Request, res: Response) => {
      await service.cancel(deviceOf(req), String(req.params.id));
      res.status(204).send();
    },
  );
  return router;
}
