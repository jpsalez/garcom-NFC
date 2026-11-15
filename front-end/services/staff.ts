import { api } from "@/lib/api";
import type { StaffCategory, StaffUser } from "@/lib/types";

// Equipe do próprio restaurante (OWNER)
export const listStaff = (token: string) => api<StaffUser[]>("/staff", { token });
export const createStaff = (token: string, body: { name: string; email: string; password: string; category?: StaffCategory }) =>
  api<StaffUser>("/staff", { method: "POST", body, token });
export const updateStaff = (token: string, id: string, body: { name?: string; category?: StaffCategory | null; active?: boolean }) =>
  api<StaffUser>(`/staff/${id}`, { method: "PATCH", body, token });
export const removeStaff = (token: string, id: string) => api<void>(`/staff/${id}`, { method: "DELETE", token });
