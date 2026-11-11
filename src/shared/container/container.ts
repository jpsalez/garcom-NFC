import "reflect-metadata";
import { container } from "tsyringe";
import { RestaurantRepository, UserRepository } from "../../modules/auth/auth.repository.ts";
import { AuthService } from "../../modules/auth/auth.service.ts";

// O Node não executa decorators (@injectable/@inject), então as dependências
// são registradas aqui. Classes cujo constructor não exige argumentos
// (os repositories usam o prisma como padrão) podem usar useClass direto;
// as que recebem dependências usam useFactory e resolvem cada uma.

container.registerSingleton(RestaurantRepository);
container.registerSingleton(UserRepository);

container.register(AuthService, {
  useFactory: (c) => new AuthService(
    c.resolve(RestaurantRepository),
    c.resolve(UserRepository),
  ),
});

export { container };
