// Estende o Request do Express: handlers autenticados enxergam req.user
// Só é preenchido nas rotas que passam pelo ensureAuthenticated
import type { role } from "../../generated/prisma/enums.ts";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; restaurantId: string | null; role: role };
    }
  }
}
