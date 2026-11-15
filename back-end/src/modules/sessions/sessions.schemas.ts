import { z } from "zod";

// Sem status, o balcão recebe só os atendimentos em andamento
// Paginação por limit/offset: o histórico de CLOSED cresce sem limite, então toda listagem tem teto
export const listSessionsQuery = z.object({
  status: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
