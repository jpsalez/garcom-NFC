import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { RestaurantSettingsPatch } from "./restaurant-settings.schema.ts";
import type { IRestaurantSettingsService } from "./restaurant-settings.service.ts";

@injectable()
export class RestaurantSettingsController {
  constructor(@inject("RestaurantSettingsService") private service: IRestaurantSettingsService) {}

  get = async (req: Request, res: Response) => {
    const settings = await this.service.get(actorOf(req));
    return res.set("Cache-Control", "no-store").json(settings);
  };

  update = async (req: Request, res: Response) => {
    const settings = await this.service.update(actorOf(req), req.body as RestaurantSettingsPatch);
    return res.set("Cache-Control", "no-store").json(settings);
  };
}
