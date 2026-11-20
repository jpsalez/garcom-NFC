export type PublicMenu = {
  publication_id: string;
  customer_ordering_enabled: boolean;
  availability: Record<string, boolean>;
  media_paths: Record<string, { main: string; thumb: string }>;
  content: {
    presentation?: MenuPresentation;
    logo_media_id?: string | null;
    cover_media_id?: string | null;
    display_name: string;
    description: string | null;
    categories: { id: string; name: string; description: string | null; products: {
      id: string; name: string; description: string | null;
      variants: { id: string; name: string; price_cents: number; group_ids: string[] }[];
      images: { media_id: string; alt_text: string | null }[];
      groups: { id: string; name: string; min_selections: number; max_selections: number; options: { id: string; name: string; price_delta_cents: number; max_quantity: number }[] }[];
    }[] }[];
  };
};

export type MenuPresentation = {
  palette: { primary: string; background: string; surface: string; text: string };
  typography: "sans" | "serif" | "mono";
  layout: "list" | "grid";
  border_radius: "none" | "small" | "medium" | "large";
};
type DraftEntity = { id: string; restaurant_id: string; name: string; position: number; archived_at: string | null; created_at: string; updated_at: string };
type Availability = { is_available: boolean; availability_version: number };
export type DraftOption = DraftEntity & Availability & { product_id: string; group_id: string; price_delta_cents: number; max_quantity: number; visible: boolean };
export type DraftGroup = DraftEntity & { product_id: string; min_selections: number; max_selections: number; options: DraftOption[] };
export type DraftVariant = DraftEntity & Availability & { product_id: string; price_cents: number; visible: boolean; option_group_links: { restaurant_id: string; product_id: string; variant_id: string; group_id: string }[] };
export type DraftProduct = DraftEntity & Availability & { menu_id: string; category_id: string; description: string | null; visible: boolean; variants: DraftVariant[]; option_groups: DraftGroup[]; images: { restaurant_id: string; product_id: string; media_id: string; position: number; alt_text: string | null }[] };
export type MenuDraft = { id: string; restaurant_id: string; published_revision_id: string | null; draft_version: number; display_name: string; description: string | null; logo_media_id: string | null; cover_media_id: string | null; presentation_schema_version: number; presentation_config: MenuPresentation | Record<string, never>; created_at: string; updated_at: string; categories: (DraftEntity & { menu_id: string; description: string | null; visible: boolean; products: DraftProduct[] })[] };
export type MenuSnapshot = PublicMenu["content"] & { schema_version: 1; menu_id: string; logo_media_id: string | null; cover_media_id: string | null; presentation: MenuPresentation; categories: (PublicMenu["content"]["categories"][number] & { products: (PublicMenu["content"]["categories"][number]["products"][number] & { groups: { id: string; name: string; min_selections: number; max_selections: number; options: { id: string; name: string; price_delta_cents: number; max_quantity: number }[] }[] })[] })[] };
export type DraftVersion = { expected_draft_version: number };
type NewNamed = DraftVersion & { name: string; position?: number };
type EditNamed = DraftVersion & { name?: string; position?: number; archived?: boolean };
export type CreateCategory = NewNamed & { description?: string | null };
export type UpdateCategory = EditNamed & { description?: string | null; visible?: boolean };
export type CreateProduct = NewNamed & { category_id: string; description?: string | null; initial_variant: { name: string; price_cents: number } };
export type UpdateProduct = UpdateCategory & { category_id?: string };
export type CreateVariant = NewNamed & { price_cents: number };
export type UpdateVariant = EditNamed & { price_cents?: number; visible?: boolean };
export type CreateOptionGroup = NewNamed & { min_selections: number; max_selections: number };
export type UpdateOptionGroup = EditNamed & { min_selections?: number; max_selections?: number };
export type CreateOption = NewNamed & { price_delta_cents: number; max_quantity: number };
export type UpdateOption = EditNamed & { price_delta_cents?: number; max_quantity?: number; visible?: boolean };
export type UpdateMenu = DraftVersion & { display_name?: string; description?: string | null; logo_media_id?: string | null; cover_media_id?: string | null; presentation_config?: MenuPresentation };
export type MenuCollection = "categories" | "products" | "variants" | "groups" | "options";
export type MediaView = { id: string; status: "READY"; width: number; height: number; byte_size: number; main_path: string; thumb_path: string };
