import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";

// Contadores em memória: valem para uma instância da API. Em testes o limite fica desligado.
function limiter(windowMinutes: number, max: number, message: string, key: (req: Request) => string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    keyGenerator: key,
    handler: (_req, res) => {
      res.status(429).json({ error: "TooManyRequestsError", message });
    },
  });
}

const byIp = (req: Request) => ipKeyGenerator(req.ip ?? "");

// IP + e-mail: quem erra a senha de uma conta não bloqueia os outros funcionários na mesma rede do restaurante
const byIpAndEmail = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().slice(0, 254) : "";
  return `${byIp(req)}|${email}`;
};

export const loginLimiter = limiter(15, 10, "Muitas tentativas de login. Tente novamente em alguns minutos.", byIpAndEmail);
export const registerLimiter = limiter(60, 5, "Muitos cadastros deste endereço. Tente novamente mais tarde.", byIp);
