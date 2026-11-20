import { Router } from "express";
import { container } from "../../shared/container/container.ts";
import { actorOf, ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import {
  validateQuery,
  validateSchema,
  validateUuidParams,
} from "../../shared/middlewares/validator.middleware.ts";
import {
  type CreateTerminal,
  createTerminalSchema,
  pointCallbackQuery,
  pointEnvironmentQuery,
  type UpdateTerminal,
  updateTerminalSchema,
} from "./terminals.schemas.ts";
import type { TerminalsService } from "./terminals.service.ts";

export function terminalsRoutes() {
  const router = Router();
  const service = container.resolve<TerminalsService>("TerminalsService");
  const configure = [ensureAuthenticated, ensureCapability("terminals:configure")];
  const read = [ensureAuthenticated, ensureCapability("payments:create")];

  router.get(
    "/payment-providers/mercado-pago/oauth/url",
    ...configure,
    validateQuery(pointEnvironmentQuery),
    (req, res) => {
      const { environment } = pointEnvironmentQuery.parse(req.query);
      res.set("Cache-Control", "no-store").json(service.authorizationUrl(actorOf(req), environment));
    },
  );
  router.get(
    "/payment-providers/mercado-pago/oauth/callback",
    ...configure,
    validateQuery(pointCallbackQuery),
    async (req, res) => {
      const { code, state } = pointCallbackQuery.parse(req.query);
      res.set("Cache-Control", "no-store").json(await service.connect(actorOf(req), code, state));
    },
  );
  router.post(
    "/payment-terminals/sync",
    ...configure,
    validateQuery(pointEnvironmentQuery),
    async (req, res) => {
      const { environment } = pointEnvironmentQuery.parse(req.query);
      res.json(await service.sync(actorOf(req), environment));
    },
  );
  router.post("/payment-terminals", ...configure, validateSchema(createTerminalSchema), async (req, res) => {
    res.status(201).json(await service.create(actorOf(req), req.body as CreateTerminal));
  });
  router.get("/payment-terminals", ...read, async (req, res) => {
    res.json(await service.list(actorOf(req)));
  });
  router.get("/payment-terminals/:id", ...read, validateUuidParams("id"), async (req, res) => {
    res.json(await service.get(actorOf(req), String(req.params.id)));
  });
  router.patch(
    "/payment-terminals/:id",
    ...configure,
    validateUuidParams("id"),
    validateSchema(updateTerminalSchema),
    async (req, res) => {
      res.json(await service.update(actorOf(req), String(req.params.id), req.body as UpdateTerminal));
    },
  );
  router.delete("/payment-terminals/:id", ...configure, validateUuidParams("id"), async (req, res) => {
    await service.update(actorOf(req), String(req.params.id), { active: false });
    res.status(204).end();
  });
  return router;
}
