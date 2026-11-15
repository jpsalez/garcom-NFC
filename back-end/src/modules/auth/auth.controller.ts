import type { Request , Response } from "express"
import { inject, injectable } from "tsyringe"
import type { IAuthService } from "./auth.interfaces.ts"
import type { changePasswordInput, createUserInput, loginUserInput, refreshInput } from '../auth/auth.schema.ts';
import { userOf } from "../../shared/middlewares/auth.middleware.ts";

// Sem try/catch: erros lançados pelo service vão para o errorHandler global
@injectable()
export class AuthController {
    private readonly authService : IAuthService;

    constructor(@inject("AuthService") authService : IAuthService){
        this.authService = authService
    }

    register = async (req : Request, res : Response) => {
        const data = req.body as createUserInput;

        const user = await this.authService.register(data);

        return res.status(201).json(user);
    }

    login = async (req : Request, res : Response) => {
        const credentials = req.body as loginUserInput;

        const result = await this.authService.login(credentials);

        return res.status(200).json(result);
    }

    refresh = async (req : Request, res : Response) => {
        const { refreshToken } = req.body as refreshInput;

        return res.status(200).json(await this.authService.refresh(refreshToken));
    }

    logout = async (req : Request, res : Response) => {
        const { refreshToken } = req.body as refreshInput;

        await this.authService.logout(refreshToken);
        return res.status(204).send();
    }

    changePassword = async (req : Request, res : Response) => {
        const result = await this.authService.changePassword(userOf(req), req.body as changePasswordInput)

        return res.status(200).json(result)
    }

    me = async (req : Request, res : Response) => {
        return res.status(200).json(await this.authService.me(userOf(req)));
    }
}
