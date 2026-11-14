import cors from "cors";
import express from "express";
import type { Application } from "express";

const app: Application = express();

app.disable("x-powered-by");
// Atrás de proxy reverso: quantos proxies ficam à frente da API (sem isso, o IP dos limites seria o do proxy)
const proxyHops = Number(process.env.TRUST_PROXY);
if (proxyHops > 0) app.set("trust proxy", proxyHops);

// FRONTEND_URL: endereço(s) do front, separados por vírgula. Sem ela, nenhuma origem de navegador é liberada.
export const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

export { app };
