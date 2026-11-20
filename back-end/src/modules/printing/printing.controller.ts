import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { UnauthorizedError } from "../../shared/errors/http-errors.ts";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IPrintingService } from "./printing.interfaces.ts";
import { printAgentCredentialSchema } from "./printing.schemas.ts";

@injectable()
export class PrintingController {
  constructor(@inject("PrintingService") private service: IPrintingService) {}

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(actorOf(req)));
  };

  setEnabled = async (req: Request, res: Response) => {
    res.json(await this.service.setEnabled(actorOf(req), req.body.enabled));
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
    const bearer = req.get("Authorization")?.match(/^Bearer (\S+)$/i);
    const credential = printAgentCredentialSchema.safeParse(bearer?.[1]);
    if (!credential.success) throw new UnauthorizedError("Pareamento de impressão inválido");
    await this.service.contact(credential.data);
    res.sendStatus(204);
  };
}
