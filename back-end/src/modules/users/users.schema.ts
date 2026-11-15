import { z } from "zod";

const category = z.enum(["WAITER", "MANAGER", "CLEANING", "KITCHEN", "OTHER"]);

const newUser = {
  name: z.string().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
};

// OWNER cria sempre STAFF do próprio restaurante
export const createStaffSchema = z.object({ ...newUser, category: category.optional() });
export type createStaffInput = z.infer<typeof createStaffSchema>;

// SUPER_ADMIN escolhe o papel; categoria só faz sentido para STAFF
export const createRestaurantUserSchema = z
  .object({ ...newUser, role: z.enum(["OWNER", "STAFF"]), category: category.optional() })
  .refine((data) => !data.category || data.role === "STAFF", {
    message: "Categoria só vale para STAFF",
    path: ["category"],
  });
export type createRestaurantUserInput = z.infer<typeof createRestaurantUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: category.nullable().optional(),
  active: z.boolean().optional(),
});
export type updateUserInput = z.infer<typeof updateUserSchema>;
