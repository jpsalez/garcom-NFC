// Precisa ser o primeiro import: os decorators leem o Reflect quando as classes são carregadas
import "reflect-metadata";
// Carrega o .env (JWT_SECRET etc.) antes de qualquer módulo que leia process.env
import "dotenv/config";
import { app } from "./server.ts";
import { SetupRoutes } from "./routes.ts";
import { registerDependencies } from "./shared/container/container.ts";
import { errorHandler } from "./shared/middlewares/error.middleware.ts";

function bootstrap() {
  registerDependencies();
  app.use(SetupRoutes());
  // Sempre por último: captura erros de todas as rotas acima
  app.use(errorHandler);

  // Só sobe depois que tudo está registrado
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`rodando na ${port}`));
}
bootstrap();
