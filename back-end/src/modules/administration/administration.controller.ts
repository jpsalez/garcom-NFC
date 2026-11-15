import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { userOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IUsersService } from "../users/users.interfaces.ts";
import type { createRestaurantUserInput, updateUserInput } from "../users/users.schema.ts";
import type { IAdministrationService } from "./administration.interfaces.ts";
import type { createRestaurantInput, setActiveInput } from "./administration.schema.ts";

// Rotas do SUPER_ADMIN: o restaurante vem da URL (ele pode agir em qualquer um)
@injectable()
export class AdministrationController {
  private readonly administrationService: IAdministrationService;
  private readonly usersService: IUsersService;

  constructor(
    @inject("AdministrationService") administrationService: IAdministrationService,
    @inject("UsersService") usersService: IUsersService,
  ) {
    this.administrationService = administrationService;
    this.usersService = usersService;
  }

  createRestaurant = async (req: Request, res: Response) => {
    const restaurant = await this.administrationService.createRestaurant(req.body as createRestaurantInput);
    return res.status(201).json(restaurant);
  };

  listRestaurants = async (_req: Request, res: Response) => {
    return res.status(200).json(await this.administrationService.listRestaurants());
  };

  setRestaurantActive = async (req: Request, res: Response) => {
    const { active } = req.body as setActiveInput;
    const restaurant = await this.administrationService.setRestaurantActive(String(req.params.restaurantId), active, userOf(req));
    return res.status(200).json(restaurant);
  };

  listUsers = async (req: Request, res: Response) => {
    return res.status(200).json(await this.usersService.list(String(req.params.restaurantId), ["OWNER", "STAFF"]));
  };

  createUser = async (req: Request, res: Response) => {
    const user = await this.usersService.create(String(req.params.restaurantId), req.body as createRestaurantUserInput);
    return res.status(201).json(user);
  };

  updateUser = async (req: Request, res: Response) => {
    const user = await this.usersService.update(
      String(req.params.restaurantId),
      String(req.params.id),
      req.body as updateUserInput,
      ["OWNER", "STAFF"],
    );
    return res.status(200).json(user);
  };

  removeUser = async (req: Request, res: Response) => {
    await this.usersService.remove(String(req.params.restaurantId), String(req.params.id), ["OWNER", "STAFF"]);
    return res.status(204).send();
  };
}
