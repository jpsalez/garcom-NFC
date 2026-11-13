import cors from "cors";
import express from "express";
import type { Application } from "express";

const app: Application = express();

// FRONTEND_URL: endereço(s) do front, separados por vírgula. Sem ela, nenhuma origem de navegador é liberada.
const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

export { app };
