import { ValidationError } from "../../shared/errors/http-errors.ts";
import type { MenuDraft } from "./menu.repository.interface.ts";
import {
  defaultPresentation,
  presentationSchema,
  snapshotSchema,
  type MenuSnapshot,
} from "./menu.schemas.ts";

export function buildSnapshot(menu: MenuDraft): MenuSnapshot {
  const active = <T extends { archived_at: Date | null; visible?: boolean }>(rows: T[]) =>
    rows.filter((row) => !row.archived_at && row.visible !== false);
  return snapshotSchema.parse({
    schema_version: 1,
    menu_id: menu.id,
    display_name: menu.display_name,
    description: menu.description,
    logo_media_id: menu.logo_media_id,
    cover_media_id: menu.cover_media_id,
    presentation: presentationSchema.parse(
      Object.keys(menu.presentation_config as object).length ? menu.presentation_config : defaultPresentation,
    ),
    categories: active(menu.categories)
      .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        products: active(category.products).map((product) => {
          const groups = active(product.option_groups);
          const groupIds = new Set(groups.map((group) => group.id));
          return {
            id: product.id,
            name: product.name,
            description: product.description,
            variants: active(product.variants).map((variant) => ({
              id: variant.id,
              name: variant.name,
              price_cents: variant.price_cents,
              group_ids: variant.option_group_links
                .filter((link) => groupIds.has(link.group_id))
                .map((link) => link.group_id)
                .sort(),
            })),
            groups: groups.map((group) => ({
              id: group.id,
              name: group.name,
              min_selections: group.min_selections,
              max_selections: group.max_selections,
              options: active(group.options).map((option) => ({
                id: option.id,
                name: option.name,
                price_delta_cents: option.price_delta_cents,
                max_quantity: option.max_quantity,
              })),
            })),
            images: product.images.map((image) => ({ media_id: image.media_id, alt_text: image.alt_text })),
          };
        }),
      }))
      .filter((category) => category.products.length),
  });
}
export function validatePublication(snapshot: MenuSnapshot) {
  if (!snapshot.categories.length) throw new ValidationError(undefined, "Inclua ao menos um produto visível");
  for (const product of snapshot.categories.flatMap((category) => category.products)) {
    for (const group of product.groups) {
      if (
        group.min_selections > group.max_selections ||
        group.options.reduce((sum, option) => sum + option.max_quantity, 0) < group.min_selections
      )
        throw new ValidationError(undefined, "Limites do grupo de escolhas são inconsistentes");
    }
  }
}
export function snapshotMedia(snapshot: MenuSnapshot) {
  return [
    ...new Set(
      [
        snapshot.logo_media_id,
        snapshot.cover_media_id,
        ...snapshot.categories.flatMap((category) =>
          category.products.flatMap((product) => product.images.map((image) => image.media_id)),
        ),
      ].filter((id): id is string => id !== null),
    ),
  ];
}
