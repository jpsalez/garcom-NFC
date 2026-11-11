import { app } from './server.ts';
import { SetupRoutes } from './routes.ts';



function bootstrap() {
    app.use(SetupRoutes());
}
bootstrap();