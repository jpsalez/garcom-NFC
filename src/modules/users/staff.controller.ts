import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { tenantOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IUsersService } from "./users.interfaces.ts";
import type { createStaffInput, updateUserInput } from "./users.schema.ts";

// Rotas do OWNER: o restaurante vem do token e só STAFF é gerenciado
@injectable()
export class StaffController {
  private readonly usersService: IUsersService;

  constructor(@inject("UsersService") usersService: IUsersService) {
    this.usersService = usersService;
  }

  list = async (req: Request, res: Response) => {
    return res.status(200).json(await this.usersService.list(tenantOf(req), ["STAFF"]));
  };

  create = async (req: Request, res: Response) => {
    const data = req.body as createStaffInput;
    const user = await this.usersService.create(tenantOf(req), { ...data, role: "STAFF" });
    return res.status(201).json(user);
  };

  update = async (req: Request, res: Response) => {
    const data = req.body as updateUserInput;
    const user = await this.usersService.update(tenantOf(req), String(req.params.id), data, ["STAFF"]);
    return res.status(200).json(user);
  };

  remove = async (req: Request, res: Response) => {
    await this.usersService.remove(tenantOf(req), String(req.params.id), ["STAFF"]);
    return res.status(204).send();
  };
}
