// Precisa ser o primeiro import: os decorators leem o Reflect quando as classes são carregadas
import "reflect-metadata";
// Carrega o .env (JWT_SECRET etc.) antes de qualquer módulo que leia process.env
import "dotenv/config";
import { createServer } from "node:http";
import swaggerUi from "swagger-ui-express";
import type { ISessionsService } from "./modules/sessions/sessions.interfaces.ts";
import { startSessionExpiryJob } from "./shared/jobs/session-expiry.job.ts";
import { allowedOrigins, app } from "./server.ts";
import { authenticateToken } from "./shared/middlewares/auth.middleware.ts";
import { openApiSpec } from "./docs/openapi.ts";
import { SetupRoutes } from "./routes.ts";
import { container, registerDependencies } from "./shared/container/container.ts";
import type { SocketNotifier } from "./shared/realtime/socket-notifier.ts";
import { errorHandler } from "./shared/middlewares/error.middleware.ts";

function bootstrap() {
  // Sem o domínio os QR Codes sairiam apontando para o lugar errado
  if (!process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL não definido no .env");
  // Em produção, um segredo curto ou o padrão do compose deixaria os tokens forjáveis
  const secret = process.env.JWT_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && (secret.length < 32 || secret.includes("desenvolvimento"))) {
    throw new Error("JWT_SECRET fraco ou padrão de desenvolvimento: defina um segredo próprio com 32+ caracteres");
  }
  registerDependencies();
  // A documentação só fica pública fora de produção
  if (process.env.NODE_ENV !== "production") app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use("/api/v1", SetupRoutes());
  // Sempre por último: captura erros de todas as rotas acima
  app.use(errorHandler);

  // Só sobe depois que tudo está registrado
  const port = Number(process.env.PORT) || 4000;
  // Servidor HTTP próprio: o Socket.IO divide a mesma porta com a API
  const httpServer = createServer(app);
  container.resolve<SocketNotifier>("Notifier").attach(httpServer, authenticateToken, allowedOrigins);
  httpServer.listen(port, () => console.log(`rodando na ${port}`));
  startSessionExpiryJob(container.resolve<ISessionsService>("SessionsService"));
}
bootstrap();
