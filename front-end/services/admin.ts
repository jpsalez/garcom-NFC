import { api } from "@/lib/api";
import type { Restaurant, RestaurantUser, StaffCategory } from "@/lib/types";

// Plataforma (SUPER_ADMIN): restaurantes e os usuários de cada um
export const listRestaurants = () => api<Restaurant[]>("/admin/restaurants");
export const createRestaurant = (body: { name: string; slug: string }) =>
  api<Restaurant>("/admin/restaurants", { method: "POST", body });
export const setRestaurantActive = (id: string, active: boolean) =>
  api<Restaurant>(`/admin/restaurants/${id}`, { method: "PATCH", body: { active } });

export const listRestaurantUsers = (restaurantId: string) =>
  api<RestaurantUser[]>(`/admin/restaurants/${restaurantId}/users`);
export const createRestaurantUser = (
  restaurantId: string,
  body: { name: string; email: string; password: string; role: "OWNER" | "STAFF"; category?: StaffCategory },
) => api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users`, { method: "POST", body });
export const updateRestaurantUser = (restaurantId: string, id: string, body: { active?: boolean }) =>
  api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "PATCH", body });
export const removeRestaurantUser = (restaurantId: string, id: string) =>
  api<void>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "DELETE" });
