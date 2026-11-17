import type { Request , Response } from "express"
import { inject, injectable } from "tsyringe"
import type { IAuthService } from "./auth.interfaces.ts"
import type { changePasswordInput, createUserInput, loginUserInput } from '../auth/auth.schema.ts';
import { userOf } from "../../shared/middlewares/auth.middleware.ts";
import { REFRESH_COOKIE, clearAuthCookies, readCookie, setAuthCookies } from "../../shared/utils/cookies.ts";

const refreshTokenOf = (req : Request) => readCookie(req.headers.cookie, REFRESH_COOKIE) ?? "";

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

        return this.sendSession(res, await this.authService.login(credentials));
    }

    refresh = async (req : Request, res : Response) => {
        return this.sendSession(res, await this.authService.refresh(refreshTokenOf(req)));
    }

    logout = async (req : Request, res : Response) => {
        await this.authService.logout(refreshTokenOf(req));
        clearAuthCookies(res);
        return res.status(204).send();
    }

    changePassword = async (req : Request, res : Response) => {
        return this.sendSession(res, await this.authService.changePassword(userOf(req), req.body as changePasswordInput))
    }

    // Os tokens vão só nos cookies httpOnly; o corpo traz apenas o usuário
    private sendSession(res : Response, { user, ...tokens } : { user: unknown; token: string; refreshToken: string }) {
        setAuthCookies(res, tokens);
        return res.status(200).json({ user });
    }

    me = async (req : Request, res : Response) => {
        return res.status(200).json(await this.authService.me(userOf(req)));
    }
}
