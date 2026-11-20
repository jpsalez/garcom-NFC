import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import type { IFiscalService } from "./fiscal.interfaces.ts";
import type {
  CancelNfceInput,
  FiscalSettingsInput,
  ProductTaxProfileInput,
  RetryNfceInput,
  TaxProfileInput,
  UpdateTaxProfileInput,
} from "./fiscal.schemas.ts";

const param = (req: Request, name: string) => String(req.params[name]);

@injectable()
export class FiscalController {
  constructor(@inject("FiscalService") private service: IFiscalService) {}

  settings = async (req: Request, res: Response) => res.json(await this.service.settings(actorOf(req)));

  saveSettings = async (req: Request, res: Response) =>
    res.json(await this.service.saveSettings(actorOf(req), req.body as FiscalSettingsInput));

  profiles = async (req: Request, res: Response) => res.json(await this.service.profiles(actorOf(req)));

  createProfile = async (req: Request, res: Response) =>
    res.status(201).json(await this.service.createProfile(actorOf(req), req.body as TaxProfileInput));

  updateProfile = async (req: Request, res: Response) =>
    res.json(
      await this.service.updateProfile(actorOf(req), param(req, "id"), req.body as UpdateTaxProfileInput),
    );

  assignProduct = async (req: Request, res: Response) =>
    res.json(
      await this.service.assignProduct(actorOf(req), param(req, "id"), req.body as ProductTaxProfileInput),
    );

  document = async (req: Request, res: Response) =>
    res.json(await this.service.document(actorOf(req), param(req, "id")));

  retry = async (req: Request, res: Response) =>
    res.json(await this.service.retry(actorOf(req), param(req, "id"), req.body as RetryNfceInput));

  cancel = async (req: Request, res: Response) =>
    res.json(await this.service.cancel(actorOf(req), param(req, "id"), req.body as CancelNfceInput));
}
