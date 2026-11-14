import { z } from "zod";

export const createCallSchema = z.object({ type: z.enum(["WAITER", "BILL"]) });
export type createCallInput = z.infer<typeof createCallSchema>;

// Sem status, o balcão recebe só os chamados abertos
export const listCallsQuery = z.object({ status: z.enum(["OPEN", "DONE", "CANCELLED"]).default("OPEN") });
