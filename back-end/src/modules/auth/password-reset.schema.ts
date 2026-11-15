import { z } from "zod";

export const forgotPasswordSchema = z.object({ email: z.email().trim().toLowerCase() });
export type forgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Mesma regra de tamanho da senha no cadastro
export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});
export type resetPasswordInput = z.infer<typeof resetPasswordSchema>;
