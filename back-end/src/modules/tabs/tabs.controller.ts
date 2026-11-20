import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { ITabAdjustmentsService } from "./tab-adjustments.service.ts";
import type { ITabsService } from "./tabs.interfaces.ts";
import {
  listTabsQuery,
  preBillQuery,
  type CancelTab,
  type CloseTab,
  type TabAdjustment,
  type WaiveFee,
  type MergeTab,
  type OpenTab,
  type TransferTab,
  type UpdateTab,
} from "./tabs.schemas.ts";

@injectable()
export class TabsController {
  constructor(
    @inject("TabsService") private service: ITabsService,
    @inject("TabAdjustmentsService") private adjustments: ITabAdjustmentsService,
  ) {}

  open = async (req: Request, res: Response) =>
    res.status(201).json(await this.service.open(actorOf(req), req.body as OpenTab));

  list = async (req: Request, res: Response) =>
    res.json(await this.service.list(actorOf(req), listTabsQuery.parse(req.query)));

  get = async (req: Request, res: Response) =>
    res.json(await this.service.getDetail(actorOf(req), String(req.params.id)));

  update = async (req: Request, res: Response) =>
    res.json(await this.service.update(actorOf(req), String(req.params.id), req.body as UpdateTab));

  transfer = async (req: Request, res: Response) =>
    res.json(await this.service.transferTable(actorOf(req), String(req.params.id), req.body as TransferTab));

  merge = async (req: Request, res: Response) =>
    res.json(await this.service.merge(actorOf(req), String(req.params.id), req.body as MergeTab));

  preBill = async (req: Request, res: Response) =>
    res.json(
      await this.service.preBill(actorOf(req), String(req.params.id), preBillQuery.parse(req.query).split_by),
    );

  close = async (req: Request, res: Response) =>
    res.json(await this.service.close(actorOf(req), String(req.params.id), req.body as CloseTab));

  cancel = async (req: Request, res: Response) =>
    res.json(await this.service.cancel(actorOf(req), String(req.params.id), req.body as CancelTab));

  addAdjustment = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await this.adjustments.add(actorOf(req), String(req.params.id), req.body as TabAdjustment));

  waiveFee = async (req: Request, res: Response) =>
    res.json(await this.adjustments.waive(actorOf(req), String(req.params.id), req.body as WaiveFee));
}
