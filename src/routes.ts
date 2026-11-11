import express from "express";
import type { Router, Request, Response } from "express";

export function SetupRoutes(){
    const router: Router = express.Router();

    router.get('/health', (req: Request, res: Response) => {
        res.send({ message: 'API Healthy' })
    })

    return router;
}