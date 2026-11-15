import { api } from "@/lib/api";
import type { StaffCategory, StaffUser } from "@/lib/types";

// Equipe do próprio restaurante (OWNER)
export const listStaff = () => api<StaffUser[]>("/staff");
export const createStaff = (body: { name: string; email: string; password: string; category?: StaffCategory }) =>
  api<StaffUser>("/staff", { method: "POST", body });
export const updateStaff = (id: string, body: { name?: string; category?: StaffCategory | null; active?: boolean }) =>
  api<StaffUser>(`/staff/${id}`, { method: "PATCH", body });
export const removeStaff = (id: string) => api<void>(`/staff/${id}`, { method: "DELETE" });
