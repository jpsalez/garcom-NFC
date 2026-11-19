import cors from "cors";
import express from "express";
import helmet from "helmet";
import { blockForeignOrigin } from "./shared/middlewares/origin.middleware.ts";
import { requestContext } from "./shared/utils/request-context.ts";
import type { Application } from "express";

const app: Application = express();
app.use(requestContext);

// Cabeçalhos de segurança (já remove o x-powered-by). Sem CSP: a API só devolve JSON e o Swagger de /docs usa scripts inline
app.use(helmet({ contentSecurityPolicy: false }));
// Atrás de proxy reverso: quantos proxies ficam à frente da API (sem isso, o IP dos limites seria o do proxy)
const proxyHops = Number(process.env.TRUST_PROXY);
if (proxyHops > 0) app.set("trust proxy", proxyHops);

// FRONTEND_URL: endereço(s) do front, separados por vírgula. Sem ela, nenhuma origem de navegador é liberada.
export const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// credentials: o navegador envia os cookies de sessão; por isso a origem é sempre explícita, nunca "*"
app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ["X-Request-Id"] }));
app.use(blockForeignOrigin(allowedOrigins));
const defaultJson = express.json();
const menuJson = express.json({ limit: "256kb" });
app.use((req, res, next) =>
  /^\/api\/v1\/(menu|orders|ordering-settings|public\/orders)(\/|$)/.test(req.path)
    ? menuJson(req, res, next)
    : defaultJson(req, res, next),
);

export { app };
