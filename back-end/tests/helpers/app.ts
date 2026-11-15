import request from "supertest";
import { app } from "../../src/server.ts";
import { SetupRoutes } from "../../src/routes.ts";
import { container, registerDependencies } from "../../src/shared/container/container.ts";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.ts";

// Monta o app como o main.ts faz, mas sem abrir porta (supertest chama o app direto)
let ready = false;

// E-mails "enviados" pela API nos testes (o service não espera o envio, então use vi.waitFor)
export const outbox: { to: string; subject: string; text: string }[] = [];

export function api() {
  if (!ready) {
    registerDependencies();
    container.register("Mailer", { useValue: { send: async (to: string, subject: string, text: string) => void outbox.push({ to, subject, text }) } });
    app.use("/api/v1", SetupRoutes());
    app.use(errorHandler);
    ready = true;
  }
  return request(app);
}
