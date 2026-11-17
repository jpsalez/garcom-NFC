import { z } from "zod";

export const createCallSchema = z.object({ type: z.enum(["WAITER", "BILL"]) });
export type createCallInput = z.infer<typeof createCallSchema>;

// Sem status, o balcão recebe só os chamados abertos
// since: só os chamados criados a partir dessa data (ex.: "concluídos hoje" no balcão)
// Toda listagem tem teto; o padrão é folgado porque o balcão não pagina
export const listCallsQuery = z.object({
  status: z.enum(["OPEN", "DONE", "CANCELLED"]).default("OPEN"),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});
