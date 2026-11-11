import express from "express";
import type { Router, Request, Response } from "express";
import { container } from "./shared/container/container.ts";
import { validateSchema } from "./shared/middlewares/validator.middleware.ts";
import { AuthController } from "./modules/auth/auth.controller.ts";
import { createUserSchema, loginUserSchema } from "./modules/auth/auth.schema.ts";

export function SetupRoutes(){
    const router: Router = express.Router();

    // Resolvido aqui (depois do registerDependencies) para o container já ter o AuthService
    const authController = container.resolve(AuthController);

    router.get('/health', (req: Request, res: Response) => {
        res.send({ message: 'API Healthy' })
    })

    router.post('/auth/register', validateSchema(createUserSchema), authController.register);
    router.post('/auth/login', validateSchema(loginUserSchema), authController.login);

    return router;
}
