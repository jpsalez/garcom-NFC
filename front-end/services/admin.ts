import { api } from "@/lib/api";
import type { Restaurant, RestaurantUser, StaffCategory } from "@/lib/types";

// Plataforma (SUPER_ADMIN): restaurantes e os usuários de cada um
export const listRestaurants = (token: string) => api<Restaurant[]>("/admin/restaurants", { token });
export const createRestaurant = (token: string, body: { name: string; slug: string }) =>
  api<Restaurant>("/admin/restaurants", { method: "POST", body, token });
export const setRestaurantActive = (token: string, id: string, active: boolean) =>
  api<Restaurant>(`/admin/restaurants/${id}`, { method: "PATCH", body: { active }, token });

export const listRestaurantUsers = (token: string, restaurantId: string) =>
  api<RestaurantUser[]>(`/admin/restaurants/${restaurantId}/users`, { token });
export const createRestaurantUser = (
  token: string,
  restaurantId: string,
  body: { name: string; email: string; password: string; role: "OWNER" | "STAFF"; category?: StaffCategory },
) => api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users`, { method: "POST", body, token });
export const updateRestaurantUser = (token: string, restaurantId: string, id: string, body: { active?: boolean }) =>
  api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "PATCH", body, token });
export const removeRestaurantUser = (token: string, restaurantId: string, id: string) =>
  api<void>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "DELETE", token });
