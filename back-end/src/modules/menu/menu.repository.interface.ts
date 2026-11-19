import type { Prisma } from "../../../generated/prisma/client.ts";
import type { EntityKind, MenuSnapshot } from "./menu.schemas.ts";

const orderBy = [{ position: "asc" as const }, { id: "asc" as const }];
export const draftInclude = {
  categories: {
    orderBy,
    include: {
      products: {
        orderBy,
        include: {
          variants: { orderBy, include: { option_group_links: true } },
          option_groups: { orderBy, include: { options: { orderBy } } },
          images: { orderBy: { position: "asc" as const } },
        },
      },
    },
  },
} satisfies Prisma.menusInclude;
export type MenuDraft = Prisma.menusGetPayload<{ include: typeof draftInclude }>;
export type CatalogWrite = {
  name?: string;
  description?: string | null;
  position?: number;
  visible?: boolean;
  archived_at?: Date | null;
  category_id?: string;
  price_cents?: number;
  min_selections?: number;
  max_selections?: number;
  price_delta_cents?: number;
  max_quantity?: number;
};
export type CatalogRow = {
  id: string;
  restaurant_id: string;
  name: string;
  position: number;
  archived_at: Date | null;
  product_id?: string;
  group_id?: string;
  availability_version?: number;
  category_id?: string;
  min_selections?: number;
  max_selections?: number;
};
export interface IMenuRepository {
  draft(restaurantId: string): Promise<MenuDraft>;
  claimDraft(restaurantId: string, version: number): Promise<void>;
  find(kind: EntityKind, restaurantId: string, id: string): Promise<CatalogRow>;
  write(
    kind: EntityKind,
    restaurantId: string,
    menuId: string,
    parentId: string | undefined,
    data: CatalogWrite,
    id?: string,
  ): Promise<CatalogRow>;
  availability(restaurantId: string): Promise<Map<string, boolean>>;
  published(restaurantId: string): Promise<{ id: string; content: MenuSnapshot } | null>;
}
