import { api } from "@/lib/api";
import type { CreateCategory, CreateOption, CreateOptionGroup, CreateProduct, CreateVariant, DraftVersion, MediaView, MenuCollection, MenuDraft, MenuSnapshot, PublicMenu, UpdateCategory, UpdateMenu, UpdateOption, UpdateOptionGroup, UpdateProduct, UpdateVariant } from "@/lib/menuTypes";

// As mutações devolvem o rascunho completo com a versão para a próxima edição.
export function getMenuDraft() { return api<MenuDraft>("/menu/draft"); }
export function updateMenu(body: UpdateMenu) { return api<MenuDraft>("/menu/draft", { method: "PATCH", body }); }
export function previewMenu() { return api<{ mode: "draft"; content: MenuSnapshot }>("/menu/preview"); }
export function publishMenu(body: DraftVersion) { return api<{ publication_id: string; revision_number: number; replayed: boolean }>("/menu/publications", { method: "POST", body }); }
export function unpublishMenu(expected_publication_id: string) { return api<{ published_revision_id: null }>("/menu/unpublish", { method: "POST", body: { expected_publication_id } }); }
export function createMenuCategory(body: CreateCategory) { return api<MenuDraft>("/menu/categories", { method: "POST", body }); }
export function updateMenuCategory(id: string, body: UpdateCategory) { return api<MenuDraft>(`/menu/categories/${encodeURIComponent(id)}`, { method: "PATCH", body }); }
export function createMenuProduct(body: CreateProduct) { return api<MenuDraft>("/menu/products", { method: "POST", body }); }
export function updateMenuProduct(id: string, body: UpdateProduct) { return api<MenuDraft>(`/menu/products/${encodeURIComponent(id)}`, { method: "PATCH", body }); }
export function createMenuVariant(productId: string, body: CreateVariant) { return api<MenuDraft>(`/menu/products/${encodeURIComponent(productId)}/variants`, { method: "POST", body }); }
export function updateMenuVariant(id: string, body: UpdateVariant) { return api<MenuDraft>(`/menu/variants/${encodeURIComponent(id)}`, { method: "PATCH", body }); }
export function createMenuOptionGroup(productId: string, body: CreateOptionGroup) { return api<MenuDraft>(`/menu/products/${encodeURIComponent(productId)}/option-groups`, { method: "POST", body }); }
export function updateMenuOptionGroup(id: string, body: UpdateOptionGroup) { return api<MenuDraft>(`/menu/option-groups/${encodeURIComponent(id)}`, { method: "PATCH", body }); }
export function createMenuOption(groupId: string, body: CreateOption) { return api<MenuDraft>(`/menu/option-groups/${encodeURIComponent(groupId)}/options`, { method: "POST", body }); }
export function updateMenuOption(id: string, body: UpdateOption) { return api<MenuDraft>(`/menu/options/${encodeURIComponent(id)}`, { method: "PATCH", body }); }
export function setVariantGroups(id: string, body: DraftVersion & { group_ids: string[] }) { return api<MenuDraft>(`/menu/variants/${encodeURIComponent(id)}/option-groups`, { method: "PUT", body }); }
export function setProductImages(id: string, body: DraftVersion & { items: { media_id: string; alt_text?: string | null }[] }) { return api<MenuDraft>(`/menu/products/${encodeURIComponent(id)}/images`, { method: "PUT", body }); }
export function reorderMenu(body: DraftVersion & { collection: MenuCollection; parent_id?: string; ordered_ids: string[] }) { return api<MenuDraft>("/menu/order", { method: "PUT", body }); }
export function setMenuAvailability(body: { kind: "products" | "variants" | "options"; id: string; is_available: boolean; expected_version: number }) { return api<{ id: string; is_available: boolean; availability_version: number }>("/menu/availability", { method: "PATCH", body }); }
export function getTableMenu(code: string) { return api<PublicMenu>(`/public/tables/${encodeURIComponent(code)}/menu`, { renew: false }); }
export function getRestaurantMenu(slug: string) { return api<PublicMenu>(`/public/restaurants/${encodeURIComponent(slug)}/menu`, { renew: false }); }

// O navegador define o Content-Type e o boundary do multipart.
export function uploadMenuMedia(file: File) { const body = new FormData(); body.append("file", file); return api<MediaView>("/media", { method: "POST", body }); }
export function getPrivateMenuMedia(id: string, variant: "main" | "thumb") { return api<Blob>(`/media/${encodeURIComponent(id)}/${variant}`, { blob: true }); }
export function removeMenuMedia(id: string) { return api<void>(`/media/${encodeURIComponent(id)}`, { method: "DELETE" }); }
