import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { tenantOf } from "../../shared/middlewares/auth.middleware.ts";
import type { ITablesService } from "./tables.interfaces.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

// O restaurante vem sempre do token (tenantOf), nunca do corpo ou da URL
@injectable()
export class TablesController {
  private readonly tablesService: ITablesService;

  constructor(@inject("TablesService") tablesService: ITablesService) {
    this.tablesService = tablesService;
  }

  list = async (req: Request, res: Response) => {
    return res.status(200).json(await this.tablesService.list(tenantOf(req)));
  };

  create = async (req: Request, res: Response) => {
    const table = await this.tablesService.create(tenantOf(req), req.body as createTableInput);
    return res.status(201).json(table);
  };

  update = async (req: Request, res: Response) => {
    const table = await this.tablesService.update(tenantOf(req), String(req.params.id), req.body as updateTableInput);
    return res.status(200).json(table);
  };

  qrCode = async (req: Request, res: Response) => {
    const svg = await this.tablesService.qrCode(tenantOf(req), String(req.params.id));
    return res.status(200).type("image/svg+xml").send(svg);
  };

  remove = async (req: Request, res: Response) => {
    await this.tablesService.remove(tenantOf(req), String(req.params.id));
    return res.status(204).send();
  };
}
