import type { Application } from 'express';
import express from 'express';
import { SetupRoutes } from './routes.ts';

const app: Application = express();

app.use(express.json());

app.use('/api', SetupRoutes());

app.listen(4000, () => {
    console.log('Express rodando na porta 4000');
});

export { app };