import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";

// Contadores em memória: valem para uma instância da API. Em testes o limite fica desligado.
function limiter(windowMinutes: number, max: number, message: string, key: (req: Request) => string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test" && !process.env.RATE_LIMIT_TEST,
    keyGenerator: key,
    handler: (_req, res) => {
      res.status(429).json({ error: "TooManyRequestsError", code: "TOO_MANY_REQUESTS", message });
    },
  });
}

const byIp = (req: Request) => ipKeyGenerator(req.ip ?? "");

// IP + e-mail: quem erra a senha de uma conta não bloqueia os outros funcionários na mesma rede do restaurante
const byIpAndEmail = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().slice(0, 254) : "";
  return `${byIp(req)}|${email}`;
};

// Só por IP: variar o e-mail não escapa do limite (cada tentativa custa um scrypt, mesmo com e-mail inexistente)
export const loginIpLimiter = limiter(
  15,
  30,
  "Muitas tentativas de login deste endereço. Tente novamente em alguns minutos.",
  byIp,
);
export const loginLimiter = limiter(
  15,
  10,
  "Muitas tentativas de login. Tente novamente em alguns minutos.",
  byIpAndEmail,
);
// Renovar o login é barato para quem tem o token, mas não deve virar força bruta de tokens
export const refreshLimiter = limiter(
  15,
  60,
  "Muitas renovações de login. Tente novamente em alguns minutos.",
  byIp,
);
// Pedir link: por IP+e-mail, para ninguém encher a caixa de entrada de uma pessoa; usar o link: por IP
export const forgotPasswordLimiter = limiter(
  60,
  5,
  "Muitos pedidos de redefinição. Tente novamente mais tarde.",
  byIpAndEmail,
);
export const resetPasswordLimiter = limiter(
  15,
  10,
  "Muitas tentativas de redefinição. Tente novamente em alguns minutos.",
  byIp,
);
// Trocar a senha pede a senha atual: o limite por usuário trava quem testa senhas com um token roubado (usar depois do ensureAuthenticated)
export const changePasswordLimiter = limiter(
  15,
  10,
  "Muitas tentativas de trocar a senha. Tente novamente em alguns minutos.",
  (req) => req.user?.id ?? byIp(req),
);
export const registerLimiter = limiter(
  60,
  5,
  "Muitos cadastros deste endereço. Tente novamente mais tarde.",
  byIp,
);

// IP + mesa: vários aparelhos na mesma rede do restaurante podem escanear mesas diferentes
const byIpAndCode = (req: Request) => `${byIp(req)}|${String(req.params.code).slice(0, 32)}`;
export const scanLimiter = limiter(
  15,
  30,
  "Muitos acessos a esta mesa. Tente novamente em alguns minutos.",
  byIpAndCode,
);

// Por aparelho (usar depois do ensureTableToken): um cliente não enche o balcão de chamados.
// Chave é o id do token já validado, então tokens inventados não ocupam memória do limiter.
const byDeviceToken = (req: Request) => req.tableToken?.tokenId ?? byIp(req);
export const callLimiter = limiter(
  5,
  10,
  "Muitos chamados em pouco tempo. Aguarde alguns minutos.",
  byDeviceToken,
);
const maxFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
export const orderSubmitLimiter = limiter(
  5,
  maxFromEnv("ORDER_SUBMIT_LIMIT", 20),
  "Muitos envios de pedido. Aguarde.",
  byDeviceToken,
);
export const orderReadLimiter = limiter(
  1,
  maxFromEnv("ORDER_READ_LIMIT", 120),
  "Muitas consultas. Aguarde.",
  byDeviceToken,
);
export const menuReadLimiter = limiter(
  1,
  maxFromEnv("MENU_READ_LIMIT", 600),
  "Muitas consultas de cardápio. Aguarde.",
  byIp,
);
export const publicationLimiter = limiter(
  1,
  maxFromEnv("MENU_PUBLISH_LIMIT", 10),
  "Muitas publicações. Aguarde.",
  (req) => req.user?.id ?? byIp(req),
);
export const mediaUploadLimiter = limiter(
  10,
  maxFromEnv("MEDIA_UPLOAD_LIMIT", 30),
  "Muitos uploads. Aguarde.",
  (req) => req.user?.id ?? byIp(req),
);

export const printPairingLimiter = limiter(
  10,
  20,
  "Muitas tentativas de pareamento. Aguarde alguns minutos.",
  byIp,
);
