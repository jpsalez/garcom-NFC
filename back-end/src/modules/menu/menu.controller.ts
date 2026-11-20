import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IMenuService } from "./menu.interfaces.ts";
import type { EntityKind } from "./menu.schemas.ts";
@injectable()
export class MenuController {
  constructor(@inject("MenuService") private service: IMenuService) {}
  draft = async (req: Request, res: Response) => res.json(await this.service.draft(actorOf(req)));
  identity = async (req: Request, res: Response) =>
    res.json(await this.service.identity(actorOf(req), req.body));
  preview = async (req: Request, res: Response) => res.json(await this.service.preview(actorOf(req)));
  publish = async (req: Request, res: Response) => {
    const result = await this.service.publish(actorOf(req), req.body);
    return res.status(result.replayed ? 200 : 201).json(result);
  };
  unpublish = async (req: Request, res: Response) =>
    res.json(await this.service.unpublish(actorOf(req), req.body));
  reorder = async (req: Request, res: Response) =>
    res.json(await this.service.reorder(actorOf(req), req.body));
  availability = async (req: Request, res: Response) =>
    res.json(await this.service.availability(actorOf(req), req.body));
  create = (kind: EntityKind, parent?: string) => async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.save(
          actorOf(req),
          kind,
          req.body,
          parent ? String(req.params[parent]) : undefined,
        ),
      );
  update = (kind: EntityKind) => async (req: Request, res: Response) =>
    res.json(await this.service.save(actorOf(req), kind, req.body, undefined, String(req.params.id)));
  associate = (kind: "groups" | "images") => async (req: Request, res: Response) =>
    res.json(await this.service.associate(actorOf(req), kind, String(req.params.id), req.body));
  published = async (req: Request, res: Response) => res.json(await this.service.published(actorOf(req)));
  publicMenu = (by: "slug" | "table") => async (req: Request, res: Response) =>
    res.json(await this.service.publicMenu(by, String(req.params[by === "slug" ? "slug" : "code"])));
}
