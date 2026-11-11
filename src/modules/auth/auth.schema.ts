import { z } from 'zod';

export const createUserSchema = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string()
});
export type createUserInput = z.infer<typeof createUserSchema>;




// Login só precisa de credenciais; role e restaurant_id vêm do banco e vão para o token
export const loginUserSchema = z.object({
    email: z.email(),
    password: z.string()
});
export type loginUserInput = z.infer<typeof loginUserSchema>;
