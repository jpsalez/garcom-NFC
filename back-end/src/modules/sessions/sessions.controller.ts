import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { tenantOf, userOf } from "../../shared/middlewares/auth.middleware.ts";
import type { ISessionsService } from "./sessions.interfaces.ts";
import { listSessionsQuery } from "./sessions.schemas.ts";

// Balcão: restaurante e usuário vêm do token. Só o scan é público (o tenant vem da mesa).
@injectable()
export class SessionsController {
  private readonly sessionsService: ISessionsService;

  constructor(@inject("SessionsService") sessionsService: ISessionsService) {
    this.sessionsService = sessionsService;
  }

  scan = async (req: Request, res: Response) => {
    return res.status(201).json(await this.sessionsService.scan(String(req.params.code)));
  };

  open = async (req: Request, res: Response) => {
    return res.status(201).json(await this.sessionsService.open(tenantOf(req), String(req.params.id)));
  };

  close = async (req: Request, res: Response) => {
    return res.status(200).json(await this.sessionsService.close(tenantOf(req), String(req.params.id), userOf(req)));
  };

  extend = async (req: Request, res: Response) => {
    return res.status(200).json(await this.sessionsService.extend(tenantOf(req), String(req.params.id)));
  };

  list = async (req: Request, res: Response) => {
    const { status } = listSessionsQuery.parse(req.query);
    return res.status(200).json(await this.sessionsService.list(tenantOf(req), status));
  };
}
