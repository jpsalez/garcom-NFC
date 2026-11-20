import { type ErrorRequestHandler, type Request, Router } from "express";
import { container } from "../../shared/container/container.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import type { IPrintingService } from "./printing.interfaces.ts";
import {
  cloudGetSchema,
  cloudPollSchema,
  cloudResultSchema,
  printerCredentialSchema,
} from "./printing.schemas.ts";
import { renderTicket } from "./print-ticket.ts";

export const cloudPrintMediaType = "image/png";

function printerCredential(req: Request) {
  if (process.env.NODE_ENV === "production" && !req.secure) {
    throw new ForbiddenError("A impressão CloudPRNT exige HTTPS");
  }
  const encoded = req.get("Authorization")?.match(/^Basic ([A-Za-z0-9+/=]+)$/i)?.[1];
  const decoded = encoded && encoded.length <= 128 ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const credential = printerCredentialSchema.safeParse(decoded.match(/^psiu:(.+)$/)?.[1]);
  if (!credential.success) throw new UnauthorizedError("Credencial de impressão inválida");
  return credential.data;
}

const challenge: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof UnauthorizedError) res.set("WWW-Authenticate", 'Basic realm="Psiu CloudPRNT"');
  next(err);
};

export function cloudPrntRoutes() {
  const router = Router();
  const printing = container.resolve<IPrintingService>("PrintingService");

  router.post("/", async (req, res) => {
    const credential = printerCredential(req);
    const poll = cloudPollSchema.parse(req.body);
    const ready = /^20[01](?:$|\s|%20)/i.test(poll.statusCode) && !poll.printingInProgress;
    const token = await printing.poll(credential, ready);
    res.json(token
      ? { jobReady: true, jobToken: token, mediaTypes: [cloudPrintMediaType], deleteMethod: "DELETE" }
      : { jobReady: false });
  });

  router.head("/", (_req, res) => { res.sendStatus(405); });
  router.get("/", async (req, res) => {
    const credential = printerCredential(req);
    if (!("token" in req.query)) {
      await printing.poll(credential, false);
      res.json({ title: "star_cloudprnt_server_setting", version: "1.0.0", serverSupportProtocol: ["HTTP"] });
      return;
    }

    const { token, type } = cloudGetSchema.parse(req.query);
    if (type && type !== cloudPrintMediaType) throw new AppError("Formato de impressão incompatível", 415);
    const png = await renderTicket(await printing.download(credential, token));
    res.set({ "Content-Type": cloudPrintMediaType, "Content-Length": String(png.length), "X-Star-Cut": "partial; feed=true" });
    // A resposta precisa trazer o documento completo mesmo em uma nova requisição da impressora.
    res.end(png);
  });

  router.delete("/", async (req, res) => {
    const credential = printerCredential(req);
    const { token, code } = cloudResultSchema.parse(req.query);
    await printing.confirm(credential, token, /^(?:200(?:$|\s|%20)|OK$)/i.test(code));
    res.status(200).end();
  });

  router.use(challenge);
  return router;
}
