import type { Application } from 'express';
import express from 'express';

const app: Application = express();

app.use(express.json());

app.listen(3000, () => console.log('rodando na 3000'));

export { app };       