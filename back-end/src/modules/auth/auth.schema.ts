import { z } from 'zod';

export const createUserSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.email().trim().toLowerCase(),
    password: z.string().min(8).max(128),
    restaurantName: z.string().min(1).max(100)
});
export type createUserInput = z.infer<typeof createUserSchema>;




// Login só precisa de credenciais; role e restaurant_id vêm do banco e vão para o token
export const loginUserSchema = z.object({
    email: z.email().trim().toLowerCase(),
    password: z.string()
});
export type loginUserInput = z.infer<typeof loginUserSchema>;

// Troca de senha com o usuário logado: exige a senha atual (quem pegou um token emprestado não consegue trocá-la)
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual",
  });
export type changePasswordInput = z.infer<typeof changePasswordSchema>;
