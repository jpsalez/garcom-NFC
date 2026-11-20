import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { ICashShiftsService } from "./cash-shifts.interfaces.ts";
import {
  cashShiftsQuery,
  type CashMovement,
  type CloseCashShift,
  type OpenCashShift,
} from "./cash-shifts.schemas.ts";

@injectable()
export class CashShiftsController {
  constructor(@inject("CashShiftsService") private service: ICashShiftsService) {}

  open = async (req: Request, res: Response) =>
    res.status(201).json(await this.service.open(actorOf(req), req.body as OpenCashShift));

  current = async (req: Request, res: Response) => res.json(await this.service.current(actorOf(req)));

  list = async (req: Request, res: Response) =>
    res.json(await this.service.list(actorOf(req), cashShiftsQuery.parse(req.query)));

  get = async (req: Request, res: Response) =>
    res.json(await this.service.get(actorOf(req), String(req.params.id)));

  movement = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await this.service.movement(actorOf(req), String(req.params.id), req.body as CashMovement));

  close = async (req: Request, res: Response) =>
    res.json(await this.service.close(actorOf(req), String(req.params.id), req.body as CloseCashShift));
}
