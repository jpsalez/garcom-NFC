import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { UnauthorizedError } from "../../shared/errors/http-errors.ts";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IPrintingService } from "./printing.interfaces.ts";
import { printAgentCredentialSchema, printingJobsQuery } from "./printing.schemas.ts";

function agentCredential(req: Request) {
  const bearer = req.get("Authorization")?.match(/^Bearer (\S+)$/i);
  const credential = printAgentCredentialSchema.safeParse(bearer?.[1]);
  if (!credential.success) throw new UnauthorizedError("Pareamento de impressão inválido");
  return credential.data;
}

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

  issueCode = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.issueCode(actorOf(req)));
  };

  revoke = async (req: Request, res: Response) => {
    await this.service.revoke(actorOf(req));
    res.sendStatus(204);
  };

  pair = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.pair(req.body.code));
  };

  contact = async (req: Request, res: Response) => {
    await this.service.contact(agentCredential(req));
    res.sendStatus(204);
  };

  claim = async (req: Request, res: Response) => {
    const job = await this.service.claim(agentCredential(req));
    if (job) res.json(job);
    else res.sendStatus(204);
  };

  result = async (req: Request<{ id: string }>, res: Response) => {
    await this.service.result(agentCredential(req), req.params.id, req.body);
    res.sendStatus(204);
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(actorOf(req), printingJobsQuery.parse(req.query)));
  };

  reprint = async (req: Request<{ id: string }>, res: Response) => {
    const { job, replayed } = await this.service.reprint(actorOf(req), req.params.id, req.body);
    res.status(replayed ? 200 : 201).json(job);
  };
}
