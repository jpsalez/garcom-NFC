import { type Request, Router } from "express";
import { container } from "../../shared/container/container.ts";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import { actorOf, ensureAuthenticated, ensureCapability } from "../../shared/middlewares/auth.middleware.ts";
import { readCookie } from "../../shared/utils/cookies.ts";
import type { IPrintingService } from "./printing.interfaces.ts";
import {
  browserStationCredentialSchema,
  browserStationResultSchema,
  browserStationSetupSchema,
  browserTestConfirmSchema,
} from "./printing.schemas.ts";

const cookieName = "kitchen_print_station";
const cookiePath = "/api/v1/printing/station";

function requireHttps(req: Request) {
  if (process.env.NODE_ENV === "production" && !req.secure) {
    throw new ForbiddenError("A estação de impressão exige HTTPS");
  }
}

function stationCredential(req: Request) {
  requireHttps(req);
  const cookie = browserStationCredentialSchema.safeParse(readCookie(req.headers.cookie, cookieName));
  if (!cookie.success) throw new UnauthorizedError("Vincule este navegador nas configurações de impressão");
  return cookie.data;
}

export function browserPrintingRoutes() {
  const router = Router();
  const printing = container.resolve<IPrintingService>("PrintingService");
  const managers = [ensureAuthenticated, ensureCapability("printing:configure")];

  router.post("/connect", ...managers, async (req, res) => {
    requireHttps(req);
    const { paper_width } = browserStationSetupSchema.parse(req.body);
    const credential = await printing.provisionBrowser(actorOf(req), paper_width);
    res.cookie(cookieName, credential, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: cookiePath,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    res.sendStatus(204);
  });

  router.post("/verify-test", ...managers, async (req, res) => {
    const { token } = browserTestConfirmSchema.parse(req.body);
    res.json(await printing.verifyBrowserTest(actorOf(req), token));
  });

  router.post("/socket-ticket", async (req, res) => {
    const ticket = await printing.issueStationSocketTicket(stationCredential(req));
    res.json({ ticket });
  });

  router.post("/next", async (req, res) => {
    const job = await printing.claimBrowser(stationCredential(req));
    if (job) res.json(job);
    else res.sendStatus(204);
  });

  router.post("/result", async (req, res) => {
    const credential = stationCredential(req);
    const { token, submitted } = browserStationResultSchema.parse(req.body);
    await printing.reportBrowser(credential, token, submitted);
    res.sendStatus(204);
  });

  return router;
}
