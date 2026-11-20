import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IPaymentsService } from "./payments.interfaces.ts";
import type { CreatePayment, RefundPayment } from "./payments.schemas.ts";

@injectable()
export class PaymentsController {
  constructor(@inject("PaymentsService") private service: IPaymentsService) {}

  create = async (req: Request, res: Response) => {
    const result = await this.service.create(actorOf(req), String(req.params.id), req.body as CreatePayment);
    return res.status(result.replayed ? 200 : 201).json(result);
  };

  refund = async (req: Request, res: Response) =>
    res.json(
      await this.service.refund(
        actorOf(req),
        String(req.params.id),
        String(req.params.paymentId),
        req.body as RefundPayment,
      ),
    );
}
