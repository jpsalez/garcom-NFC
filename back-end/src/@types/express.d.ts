// Estende o Request do Express: handlers autenticados enxergam req.user
// Só é preenchido nas rotas que passam pelo ensureAuthenticated
import type { ActorContext } from "../shared/authorization/capabilities.ts";

declare global {
  namespace Express {
    interface Request {
      // Preenchido pelo ensureTableToken (aparelho do cliente)
      tableToken?: { tokenId: string; sessionId: string; restaurantId: string; tableLabel: string };
      user?: ActorContext;
    }
  }
}
