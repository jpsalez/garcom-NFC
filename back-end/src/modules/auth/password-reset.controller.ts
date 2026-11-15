import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import type { IPasswordResetService } from "./password-reset.interfaces.ts";
import type { forgotPasswordInput, resetPasswordInput } from "./password-reset.schema.ts";

@injectable()
export class PasswordResetController {
  private readonly passwordResetService: IPasswordResetService;

  constructor(@inject("PasswordResetService") passwordResetService: IPasswordResetService) {
    this.passwordResetService = passwordResetService;
  }

  forgot = async (req: Request, res: Response) => {
    await this.passwordResetService.request((req.body as forgotPasswordInput).email);
    return res.status(202).json({ message: "Se o e-mail estiver cadastrado, enviaremos o link de redefinição" });
  };

  reset = async (req: Request, res: Response) => {
    const { token, password } = req.body as resetPasswordInput;
    await this.passwordResetService.reset(token, password);
    return res.status(204).send();
  };
}
