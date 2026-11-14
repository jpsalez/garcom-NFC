import { z } from "zod";

// Sem status, o balcão recebe só os atendimentos em andamento
export const listSessionsQuery = z.object({ status: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE") });
