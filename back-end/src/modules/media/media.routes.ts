import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { mediaUploadLimiter } from "../../shared/middlewares/rate-limit.middleware.ts";
import { validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { MediaController } from "./media.controller.ts";
export function mediaRoutes() {
  const router = Router(),
    controller = container.resolve(MediaController),
    manage = [ensureAuthenticated, ensureCapability("menu:manage")];
  router.post("/media", ...manage, mediaUploadLimiter, controller.upload);
  router.delete("/media/:id", ...manage, validateUuidParams("id"), controller.remove);
  router.get("/media/:id/:variant", ...manage, validateUuidParams("id"), controller.open(false));
  router.get("/public/media/:id/:variant", validateUuidParams("id"), controller.open(true));
  return router;
}
