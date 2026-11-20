import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IPrintingService } from "./printing.interfaces.ts";
import { printingJobsQuery } from "./printing.schemas.ts";

@injectable()
export class PrintingController {
  constructor(@inject("PrintingService") private service: IPrintingService) {}

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(actorOf(req)));
  };

  setEnabled = async (req: Request, res: Response) => {
    const actor = actorOf(req);
    const result = req.body.review
      ? await this.service.review(actor, req.body.review)
      : await this.service.setEnabled(actor, req.body.enabled);
    res.json(result);
  };

  provision = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.provision(actorOf(req)));
  };

  revoke = async (req: Request, res: Response) => {
    await this.service.revoke(actorOf(req));
    res.sendStatus(204);
  };

  test = async (req: Request, res: Response) => {
    res.json(await this.service.queueTest(actorOf(req)));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(actorOf(req), printingJobsQuery.parse(req.query)));
  };

  reprint = async (req: Request<{ id: string }>, res: Response) => {
    const { job, replayed } = await this.service.reprint(actorOf(req), req.params.id, req.body);
    res.status(replayed ? 200 : 201).json(job);
  };
}
