// Precisa ser o primeiro import: os decorators leem o Reflect quando as classes são carregadas
import "reflect-metadata";
// Carrega o .env (JWT_SECRET etc.) antes de qualquer módulo que leia process.env
import "dotenv/config";
import swaggerUi from "swagger-ui-express";
import { app } from "./server.ts";
import { openApiSpec } from "./docs/openapi.ts";
import { SetupRoutes } from "./routes.ts";
import { registerDependencies } from "./shared/container/container.ts";
import { errorHandler } from "./shared/middlewares/error.middleware.ts";

function bootstrap() {
  // Sem o domínio os QR Codes sairiam apontando para o lugar errado
  if (!process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL não definido no .env");
  registerDependencies();
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use(SetupRoutes());
  // Sempre por último: captura erros de todas as rotas acima
  app.use(errorHandler);

  // Só sobe depois que tudo está registrado
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`rodando na ${port}`));
}
bootstrap();
