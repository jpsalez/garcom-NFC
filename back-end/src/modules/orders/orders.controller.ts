import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import { deviceOf } from "../../shared/middlewares/table-token.middleware.ts";
import type { IOrdersService } from "./orders.interfaces.ts";
import type { IOrderSettingsService } from "./order-settings.service.ts";
import { deviceOrdersQuery, eventsQuery, ordersQuery } from "./orders.schemas.ts";
@injectable()
export class OrdersController {
  constructor(
    @inject("OrdersService") private service: IOrdersService,
    @inject("OrderSettingsService") private settings: IOrderSettingsService,
  ) {}
  submit = async (req: Request, res: Response) => {
    const result = await this.service.submit(deviceOf(req), req.body);
    return res.status(result.replayed ? 200 : 201).json(result);
  };
  posSubmit = async (req: Request, res: Response) => {
    const result = await this.service.posSubmit(actorOf(req), req.body);
    return res.status(result.replayed ? 200 : 201).json(result);
  };

  list = async (req: Request, res: Response) =>
    res.json(await this.service.list(actorOf(req), ordersQuery.parse(req.query)));
  get = async (req: Request, res: Response) =>
    res.json(await this.service.get(actorOf(req), String(req.params.id)));
  deviceList = async (req: Request, res: Response) =>
    res.json(await this.service.deviceList(deviceOf(req), deviceOrdersQuery.parse(req.query)));
  deviceGet = async (req: Request, res: Response) =>
    res.json(await this.service.deviceGet(deviceOf(req), String(req.params.id)));
  transition = async (req: Request, res: Response) =>
    res.json(await this.service.transition(actorOf(req), String(req.params.id), req.body));
  events = async (req: Request, res: Response) => {
    const query = eventsQuery.parse(req.query);
    return res.json(
      await this.service.events(actorOf(req), String(req.params.id), query.after_sequence, query.limit),
    );
  };
  context = async (req: Request, res: Response) => res.json(await this.service.context(deviceOf(req)));
  getSettings = async (req: Request, res: Response) => res.json(await this.settings.get(actorOf(req)));
  setSettings = async (req: Request, res: Response) =>
    res.json(await this.settings.set(actorOf(req), req.body));
}
