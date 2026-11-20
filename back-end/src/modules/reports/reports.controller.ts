import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IReportsService } from "./reports.interfaces.ts";
import {
  alertsQuery,
  forecastQuery,
  historyQuery,
  type RebuildInput,
  rangeQuery,
  summaryQuery,
} from "./reports.schemas.ts";

@injectable()
export class ReportsController {
  constructor(@inject("ReportsService") private service: IReportsService) {}

  summary = async (req: Request, res: Response) =>
    res.json(await this.service.summary(actorOf(req), summaryQuery.parse(req.query)));

  history = async (req: Request, res: Response) =>
    res.json(await this.service.history(actorOf(req), historyQuery.parse(req.query)));

  products = async (req: Request, res: Response) =>
    res.json(await this.service.products(actorOf(req), rangeQuery.parse(req.query)));

  basket = async (req: Request, res: Response) =>
    res.json(await this.service.basket(actorOf(req), rangeQuery.parse(req.query)));

  heatmap = async (req: Request, res: Response) =>
    res.json(await this.service.heatmap(actorOf(req), rangeQuery.parse(req.query)));

  prepTime = async (req: Request, res: Response) =>
    res.json(await this.service.prepTime(actorOf(req), rangeQuery.parse(req.query)));

  forecast = async (req: Request, res: Response) =>
    res.json(await this.service.forecast(actorOf(req), forecastQuery.parse(req.query)));

  alerts = async (req: Request, res: Response) =>
    res.json(await this.service.alerts(actorOf(req), alertsQuery.parse(req.query)));

  rebuild = async (req: Request, res: Response) =>
    res.json(await this.service.rebuild(actorOf(req), req.body as RebuildInput));
}
