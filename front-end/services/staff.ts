import { api } from "@/lib/api";
import type { StaffCategory, StaffUser } from "@/lib/types";

// Equipe do próprio restaurante (OWNER)
export function listStaff() {
  return api<StaffUser[]>("/staff");
}

export function createStaff(body: { name: string; email: string; password: string; category?: StaffCategory }) {
  return api<StaffUser>("/staff", { method: "POST", body });
}

export function updateStaff(id: string, body: { name?: string; category?: StaffCategory | null; active?: boolean }) {
  return api<StaffUser>(`/staff/${id}`, { method: "PATCH", body });
}

export function removeStaff(id: string) {
  return api<void>(`/staff/${id}`, { method: "DELETE" });
}
