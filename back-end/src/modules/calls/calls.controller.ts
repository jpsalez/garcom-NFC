import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { tenantOf, userOf } from "../../shared/middlewares/auth.middleware.ts";
import { deviceOf } from "../../shared/middlewares/table-token.middleware.ts";
import type { ICallsService } from "./calls.interfaces.ts";
import { listCallsQuery, type createCallInput } from "./calls.schemas.ts";

// Cliente (token do aparelho em req.tableToken) cria; balcão (token do usuário) lista e finaliza
@injectable()
export class CallsController {
  private readonly callsService: ICallsService;

  constructor(@inject("CallsService") callsService: ICallsService) {
    this.callsService = callsService;
  }

  create = async (req: Request, res: Response) => {
    const { call, created } = await this.callsService.create(deviceOf(req), (req.body as createCallInput).type);
    return res.status(created ? 201 : 200).json(call);
  };

  list = async (req: Request, res: Response) => {
    const { status, since } = listCallsQuery.parse(req.query);
    return res.status(200).json(await this.callsService.list(tenantOf(req), status, since));
  };

  done = async (req: Request, res: Response) => {
    return res.status(200).json(await this.callsService.done(tenantOf(req), String(req.params.id), userOf(req)));
  };
}
