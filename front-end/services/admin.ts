import { api } from "@/lib/api";
import type { Restaurant, RestaurantUser, StaffCategory } from "@/lib/types";

// Plataforma (SUPER_ADMIN): restaurantes e os usuários de cada um
export function listRestaurants() {
  return api<Restaurant[]>("/admin/restaurants");
}

export function createRestaurant(body: { name: string; slug: string }) {
  return api<Restaurant>("/admin/restaurants", { method: "POST", body });
}

export function setRestaurantActive(id: string, active: boolean) {
  return api<Restaurant>(`/admin/restaurants/${id}`, { method: "PATCH", body: { active } });
}

export function listRestaurantUsers(restaurantId: string) {
  return api<RestaurantUser[]>(`/admin/restaurants/${restaurantId}/users`);
}

export function createRestaurantUser(
  restaurantId: string,
  body: { name: string; email: string; password: string; role: "OWNER" | "STAFF"; category?: StaffCategory },
) {
  return api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users`, { method: "POST", body });
}

export function updateRestaurantUser(restaurantId: string, id: string, body: { active?: boolean }) {
  return api<RestaurantUser>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "PATCH", body });
}

export function removeRestaurantUser(restaurantId: string, id: string) {
  return api<void>(`/admin/restaurants/${restaurantId}/users/${id}`, { method: "DELETE" });
}
