import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf, tenantOf } from "../../shared/middlewares/auth.middleware.ts";
import type { ISessionsService } from "./sessions.interfaces.ts";
import { listSessionsQuery } from "./sessions.schemas.ts";

function sessionView<T extends { tab_id: string | null }>({ tab_id, ...session }: T) {
  return session;
}

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
    const session = await this.sessionsService.open(tenantOf(req), String(req.params.id));
    return res.status(201).json(sessionView(session));
  };

  close = async (req: Request, res: Response) => {
    const session = await this.sessionsService.close(tenantOf(req), String(req.params.id), actorOf(req));
    return res.status(200).json(sessionView(session));
  };

  extend = async (req: Request, res: Response) => {
    const session = await this.sessionsService.extend(tenantOf(req), String(req.params.id));
    return res.status(200).json(sessionView(session));
  };

  list = async (req: Request, res: Response) => {
    const { status, ...page } = listSessionsQuery.parse(req.query);
    const sessions = await this.sessionsService.list(tenantOf(req), status, page);
    return res.status(200).json(sessions.map(sessionView));
  };
}
