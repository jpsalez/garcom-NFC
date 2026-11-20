import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { validateUuidParams } from "../../shared/middlewares/validator.middleware.ts";
import { MenuController } from "./menu.controller.ts";
import { menuReadLimiter, publicationLimiter } from "../../shared/middlewares/rate-limit.middleware.ts";
export function menuRoutes() {
  const router = Router(),
    controller = container.resolve(MenuController);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const manage = [ensureAuthenticated, ensureCapability("menu:manage")];
  router.get("/menu/draft", ...manage, controller.draft);
  router.patch("/menu/draft", ...manage, controller.identity);
  router.get("/menu/preview", ...manage, controller.preview);
  router.post(
    "/menu/publications",
    ensureAuthenticated,
    ensureCapability("menu:publish"),
    publicationLimiter,
    controller.publish,
  );
  router.post("/menu/unpublish", ensureAuthenticated, ensureCapability("menu:publish"), controller.unpublish);
  router.put("/menu/order", ...manage, controller.reorder);
  router.patch(
    "/menu/availability",
    ensureAuthenticated,
    ensureCapability("availability:write"),
    controller.availability,
  );
  router.post("/menu/categories", ...manage, controller.create("categories"));
  router.patch("/menu/categories/:id", ...manage, validateUuidParams("id"), controller.update("categories"));
  router.post("/menu/products", ...manage, controller.create("products"));
  router.patch("/menu/products/:id", ...manage, validateUuidParams("id"), controller.update("products"));
  router.post(
    "/menu/products/:productId/variants",
    ...manage,
    validateUuidParams("productId"),
    controller.create("variants", "productId"),
  );
  router.patch("/menu/variants/:id", ...manage, validateUuidParams("id"), controller.update("variants"));
  router.post(
    "/menu/products/:productId/option-groups",
    ...manage,
    validateUuidParams("productId"),
    controller.create("groups", "productId"),
  );
  router.patch("/menu/option-groups/:id", ...manage, validateUuidParams("id"), controller.update("groups"));
  router.post(
    "/menu/option-groups/:groupId/options",
    ...manage,
    validateUuidParams("groupId"),
    controller.create("options", "groupId"),
  );
  router.patch("/menu/options/:id", ...manage, validateUuidParams("id"), controller.update("options"));
  router.put(
    "/menu/variants/:id/option-groups",
    ...manage,
    validateUuidParams("id"),
    controller.associate("groups"),
  );
  router.put(
    "/menu/products/:id/images",
    ...manage,
    validateUuidParams("id"),
    controller.associate("images"),
  );
  router.get("/public/restaurants/:slug/menu", menuReadLimiter, controller.publicMenu("slug"));
  router.get("/public/tables/:code/menu", menuReadLimiter, controller.publicMenu("table"));
  return router;
}
