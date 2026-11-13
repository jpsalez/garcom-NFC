import type { Request , Response } from "express"
import { inject, injectable } from "tsyringe"
import type { IAuthService } from "./auth.interfaces.ts"
import type { createUserInput, loginUserInput } from '../auth/auth.schema.ts';

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
}
