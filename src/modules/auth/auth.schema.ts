import { z } from 'zod';

export const createUserSchema = z.object({
    name: z.string().min(1),
    email: z.email().trim().toLowerCase(),
    password: z.string().min(8),
    restaurantName: z.string().min(1)
});
export type createUserInput = z.infer<typeof createUserSchema>;




// Login só precisa de credenciais; role e restaurant_id vêm do banco e vão para o token
export const loginUserSchema = z.object({
    email: z.email().trim().toLowerCase(),
    password: z.string()
});
export type loginUserInput = z.infer<typeof loginUserSchema>;
