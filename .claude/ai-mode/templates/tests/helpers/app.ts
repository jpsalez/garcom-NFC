import request from "supertest";
import { app } from "../../src/server.ts";
import { SetupRoutes } from "../../src/routes.ts";
import { registerDependencies } from "../../src/shared/container/container.ts";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.ts";

// Monta o app como o main.ts faz, mas sem abrir porta (supertest chama o app direto)
let ready = false;

export function api() {
  if (!ready) {
    registerDependencies();
    app.use(SetupRoutes());
    app.use(errorHandler);
    ready = true;
  }
  return request(app);
}
