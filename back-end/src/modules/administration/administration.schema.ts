import { z } from "zod";

export const createRestaurantSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífen"),
});
export type createRestaurantInput = z.infer<typeof createRestaurantSchema>;

export const setActiveSchema = z.object({ active: z.boolean() });
export type setActiveInput = z.infer<typeof setActiveSchema>;
