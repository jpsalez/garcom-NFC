import { z } from "zod";

export const entityKind = z.enum(["categories", "products", "variants", "groups", "options"]);
export type EntityKind = z.infer<typeof entityKind>;
const name = z.string().trim().min(1).max(120);
const description = z.string().max(3000).nullable();
const money = z.number().int().min(0).max(1000000);
const version = z.number().int().positive().max(2147483647);
const base = { name, position: z.number().int().nonnegative().max(1000000).optional() };
const editBase = { name: name.optional(), position: base.position, archived: z.boolean().optional() };
export const initialVariant = z.strictObject({ name, price_cents: money });
export const createEntitySchemas = {
  categories: z.strictObject({
    ...base,
    description: description.optional(),
    expected_draft_version: version,
  }),
  products: z.strictObject({
    ...base,
    category_id: z.uuid(),
    description: description.optional(),
    initial_variant: initialVariant,
    expected_draft_version: version,
  }),
  variants: z.strictObject({ ...base, price_cents: money, expected_draft_version: version }),
  groups: z.strictObject({
    ...base,
    min_selections: z.number().int().min(0).max(50),
    max_selections: z.number().int().min(1).max(50),
    expected_draft_version: version,
  }),
  options: z.strictObject({
    ...base,
    price_delta_cents: money,
    max_quantity: z.number().int().min(1).max(50),
    expected_draft_version: version,
  }),
};
export const updateEntitySchemas = {
  categories: z.strictObject({
    ...editBase,
    description: description.optional(),
    visible: z.boolean().optional(),
    expected_draft_version: version,
  }),
  products: z.strictObject({
    ...editBase,
    description: description.optional(),
    category_id: z.uuid().optional(),
    visible: z.boolean().optional(),
    expected_draft_version: version,
  }),
  variants: z.strictObject({
    ...editBase,
    price_cents: money.optional(),
    visible: z.boolean().optional(),
    expected_draft_version: version,
  }),
  groups: z.strictObject({
    ...editBase,
    min_selections: z.number().int().min(0).max(50).optional(),
    max_selections: z.number().int().min(1).max(50).optional(),
    expected_draft_version: version,
  }),
  options: z.strictObject({
    ...editBase,
    price_delta_cents: money.optional(),
    max_quantity: z.number().int().min(1).max(50).optional(),
    visible: z.boolean().optional(),
    expected_draft_version: version,
  }),
};
export const presentationSchema = z.strictObject({
  palette: z.strictObject({
    primary: z.string().regex(/^#[\da-fA-F]{6}$/),
    background: z.string().regex(/^#[\da-fA-F]{6}$/),
    surface: z.string().regex(/^#[\da-fA-F]{6}$/),
    text: z.string().regex(/^#[\da-fA-F]{6}$/),
  }),
  typography: z.enum(["sans", "serif", "mono"]),
  layout: z.enum(["list", "grid"]),
  border_radius: z.enum(["none", "small", "medium", "large"]),
});
export const defaultPresentation = {
  palette: { primary: "#8DBF21", background: "#DBDBDB", surface: "#FFFFFF", text: "#1D2540" },
  typography: "sans",
  layout: "list",
  border_radius: "medium",
} as const;
export const identitySchema = z.strictObject({
  expected_draft_version: version,
  display_name: name.optional(),
  description: description.optional(),
  logo_media_id: z.uuid().nullable().optional(),
  cover_media_id: z.uuid().nullable().optional(),
  presentation_config: presentationSchema.optional(),
});
export const publishSchema = z.strictObject({ expected_draft_version: version });
export const unpublishSchema = z.strictObject({ expected_publication_id: z.uuid() });
export const variantGroupsSchema = z.strictObject({
  expected_draft_version: version,
  group_ids: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Grupos repetidos"),
});
export const imagesSchema = z.strictObject({
  expected_draft_version: version,
  items: z
    .array(z.strictObject({ media_id: z.uuid(), alt_text: z.string().max(250).nullable().optional() }))
    .max(8)
    .refine((items) => new Set(items.map((i) => i.media_id)).size === items.length, "Imagens repetidas"),
});
export const reorderSchema = z.strictObject({
  expected_draft_version: version,
  collection: entityKind,
  parent_id: z.uuid().optional(),
  ordered_ids: z
    .array(z.uuid())
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, "IDs repetidos"),
});
export const availabilitySchema = z.strictObject({
  kind: z.enum(["products", "variants", "options"]),
  id: z.uuid(),
  is_available: z.boolean(),
  expected_version: version,
});
const snapshotOption = z.strictObject({
  id: z.uuid(),
  name,
  price_delta_cents: money,
  max_quantity: z.number().int().min(1).max(50),
});
const snapshotGroup = z.strictObject({
  id: z.uuid(),
  name,
  min_selections: z.number().int().min(0).max(50),
  max_selections: z.number().int().min(1).max(50),
  options: z.array(snapshotOption).min(1).max(50),
});
export const snapshotProduct = z.strictObject({
  id: z.uuid(),
  name,
  description,
  variants: z
    .array(z.strictObject({ id: z.uuid(), name, price_cents: money, group_ids: z.array(z.uuid()).max(20) }))
    .min(1)
    .max(20),
  groups: z.array(snapshotGroup).max(20),
  images: z.array(z.strictObject({ media_id: z.uuid(), alt_text: z.string().max(250).nullable() })).max(8),
});
export const snapshotSchema = z.strictObject({
  schema_version: z.literal(1),
  menu_id: z.uuid(),
  display_name: name,
  description,
  logo_media_id: z.uuid().nullable(),
  cover_media_id: z.uuid().nullable(),
  presentation: presentationSchema,
  categories: z
    .array(z.strictObject({ id: z.uuid(), name, description, products: z.array(snapshotProduct).max(1000) }))
    .max(100),
});
export type MenuSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotProduct = z.infer<typeof snapshotProduct>;
