import { z } from "zod";

export const createCallSchema = z.object({ type: z.enum(["WAITER", "BILL"]) });
export type createCallInput = z.infer<typeof createCallSchema>;

// Sem status, o balcão recebe só os chamados abertos
// since: só os chamados criados a partir dessa data (ex.: "concluídos hoje" no balcão)
export const listCallsQuery = z.object({
  status: z.enum(["OPEN", "DONE", "CANCELLED"]).default("OPEN"),
  since: z.coerce.date().optional(),
});
