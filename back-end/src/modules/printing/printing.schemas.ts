import { z } from "zod";

export const printingSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const pairingCodeSchema = z.string().regex(/^[a-f0-9]{20}$/);
export const printingPairSchema = z.object({ code: pairingCodeSchema }).strict();
export const printAgentCredentialSchema = z.string().regex(/^print_[A-Za-z0-9_-]{43}$/);
