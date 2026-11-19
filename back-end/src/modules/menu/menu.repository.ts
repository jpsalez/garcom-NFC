import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import {
  draftInclude,
  type CatalogWrite,
  type CatalogRow,
  type IMenuRepository,
} from "./menu.repository.interface.ts";
import { snapshotSchema, type EntityKind } from "./menu.schemas.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { MenuSnapshot } from "./menu.schemas.ts";

@injectable()
export class MenuRepository implements IMenuRepository {
  constructor(@inject("DbClient") readonly db: DbClient) {}
  async draft(restaurantId: string) {
    const menu = await this.db.menus.findUnique({
      where: { restaurant_id: restaurantId },
      include: draftInclude,
    });
    if (!menu) throw new NotFoundError("Cardápio não encontrado");
    return menu;
  }
  async claimDraft(restaurantId: string, version: number) {
    const result = await this.db.menus.updateMany({
      where: { restaurant_id: restaurantId, draft_version: version },
      data: { draft_version: { increment: 1 } },
    });
    if (!result.count)
      throw new ConflictError("Rascunho foi alterado; atualize a página", "DRAFT_VERSION_CONFLICT");
  }
  async find(kind: EntityKind, restaurantId: string, id: string): Promise<CatalogRow> {
    const where = { restaurant_id: restaurantId, id };
    const row =
      kind === "categories"
        ? await this.db.menu_categories.findFirst({ where })
        : kind === "products"
          ? await this.db.menu_products.findFirst({ where })
          : kind === "variants"
            ? await this.db.menu_product_variants.findFirst({ where })
            : kind === "groups"
              ? await this.db.menu_option_groups.findFirst({ where })
              : await this.db.menu_options.findFirst({ where });
    if (!row) throw new NotFoundError("Recurso do cardápio não encontrado");
    return row;
  }
  async write(
    kind: EntityKind,
    restaurantId: string,
    menuId: string,
    parentId: string | undefined,
    data: CatalogWrite,
    id?: string,
  ) {
    const where = { id, restaurant_id: restaurantId };
    if (id) {
      await this.find(kind, restaurantId, id);
      switch (kind) {
        case "categories":
          return this.db.menu_categories.update({
            where: { ...where, id },
            data: data as Prisma.menu_categoriesUncheckedUpdateInput,
          });
        case "products":
          return this.db.menu_products.update({
            where: { ...where, id },
            data: data as Prisma.menu_productsUncheckedUpdateInput,
          });
        case "variants":
          return this.db.menu_product_variants.update({
            where: { ...where, id },
            data: data as Prisma.menu_product_variantsUncheckedUpdateInput,
          });
        case "groups":
          return this.db.menu_option_groups.update({
            where: { ...where, id },
            data: data as Prisma.menu_option_groupsUncheckedUpdateInput,
          });
        case "options":
          return this.db.menu_options.update({
            where: { ...where, id },
            data: data as Prisma.menu_optionsUncheckedUpdateInput,
          });
      }
    }
    if (!data.name) throw new Error("Nome obrigatório na criação");
    const common = { restaurant_id: restaurantId, position: data.position ?? 0, name: data.name };
    switch (kind) {
      case "categories":
        return this.db.menu_categories.create({
          data: { ...common, menu_id: menuId, description: data.description },
        });
      case "products": {
        if (!data.category_id) throw new NotFoundError("Categoria não encontrada");
        return this.db.menu_products.create({
          data: { ...common, menu_id: menuId, category_id: data.category_id, description: data.description },
        });
      }
      case "variants": {
        if (!parentId) throw new NotFoundError();
        return this.db.menu_product_variants.create({
          data: { ...common, product_id: parentId, price_cents: data.price_cents ?? 0 },
        });
      }
      case "groups": {
        if (!parentId) throw new NotFoundError();
        return this.db.menu_option_groups.create({
          data: {
            ...common,
            product_id: parentId,
            min_selections: data.min_selections,
            max_selections: data.max_selections,
          },
        });
      }
      case "options": {
        if (!parentId) throw new NotFoundError();
        const group = await this.db.menu_option_groups.findFirstOrThrow({
          where: { restaurant_id: restaurantId, id: parentId },
        });
        return this.db.menu_options.create({
          data: {
            ...common,
            group_id: parentId,
            product_id: group.product_id,
            price_delta_cents: data.price_delta_cents,
            max_quantity: data.max_quantity,
          },
        });
      }
    }
  }
  async availability(restaurantId: string) {
    const select = { id: true, is_available: true };
    const [products, variants, options] = await Promise.all([
      this.db.menu_products.findMany({ where: { restaurant_id: restaurantId }, select }),
      this.db.menu_product_variants.findMany({ where: { restaurant_id: restaurantId }, select }),
      this.db.menu_options.findMany({ where: { restaurant_id: restaurantId }, select }),
    ]);
    return new Map([...products, ...variants, ...options].map((row) => [row.id, row.is_available]));
  }
  async published(restaurantId: string) {
    const menu = await this.db.menus.findUnique({
      where: { restaurant_id: restaurantId },
      include: { published_revision: true },
    });
    const publication = menu?.published_revision;
    return publication ? { id: publication.id, content: snapshotSchema.parse(publication.content) } : null;
  }
  updateIdentity(
    restaurantId: string,
    data: Pick<
      Prisma.menusUncheckedUpdateManyInput,
      "display_name" | "description" | "logo_media_id" | "cover_media_id" | "presentation_config"
    >,
  ) {
    return this.db.menus.updateMany({ where: { restaurant_id: restaurantId }, data });
  }
  async readyMedia(restaurantId: string, ids: string[]) {
    const rows = await this.db.media_assets.findMany({
      where: { restaurant_id: restaurantId, id: { in: ids }, status: "READY" },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) throw new NotFoundError("Imagem pronta não encontrada");
  }
  async publicationBytes(content: MenuSnapshot) {
    const [row] = await this.db.$queryRaw<
      { bytes: number }[]
    >`SELECT octet_length(${JSON.stringify(content)}::jsonb::text) AS bytes`;
    if (!row) throw new Error("Tamanho da publicação indisponível");
    return row.bytes;
  }
  async replaceGroups(restaurantId: string, productId: string, variantId: string, ids: string[]) {
    await this.db.menu_variant_option_groups.deleteMany({
      where: { restaurant_id: restaurantId, variant_id: variantId },
    });
    if (ids.length)
      await this.db.menu_variant_option_groups.createMany({
        data: ids.map((group_id) => ({
          restaurant_id: restaurantId,
          product_id: productId,
          variant_id: variantId,
          group_id,
        })),
      });
  }
  async replaceImages(
    restaurantId: string,
    productId: string,
    items: { media_id: string; alt_text?: string | null }[],
  ) {
    await this.db.menu_product_images.deleteMany({
      where: { restaurant_id: restaurantId, product_id: productId },
    });
    if (items.length)
      await this.db.menu_product_images.createMany({
        data: items.map((item, position) => ({
          ...item,
          restaurant_id: restaurantId,
          product_id: productId,
          position,
        })),
      });
  }
  latestPublication(restaurantId: string, id: string) {
    return this.db.menu_publications.findFirst({ where: { restaurant_id: restaurantId, id } });
  }
  publicationForDraft(menuId: string, draftVersion: number) {
    return this.db.menu_publications.findUnique({
      where: { menu_id_draft_version: { menu_id: menuId, draft_version: draftVersion } },
    });
  }
  restorePublication(restaurantId: string, id: string) {
    return this.db.menus.updateMany({
      where: { restaurant_id: restaurantId },
      data: { published_revision_id: id },
    });
  }
  async publish(
    restaurantId: string,
    menuId: string,
    draftVersion: number,
    content: MenuSnapshot,
    actorId: string,
    mediaIds: string[],
  ) {
    const last = await this.db.menu_publications.aggregate({
      where: { restaurant_id: restaurantId, menu_id: menuId },
      _max: { revision_number: true },
    });
    const publication = await this.db.menu_publications.create({
      data: {
        restaurant_id: restaurantId,
        menu_id: menuId,
        revision_number: (last._max.revision_number ?? 0) + 1,
        draft_version: draftVersion,
        content,
        published_by: actorId,
      },
    });
    if (mediaIds.length)
      await this.db.menu_publication_media.createMany({
        data: mediaIds.map((media_id) => ({
          restaurant_id: restaurantId,
          publication_id: publication.id,
          media_id,
        })),
      });
    await this.db.menus.updateMany({
      where: { restaurant_id: restaurantId },
      data: { published_revision_id: publication.id },
    });
    return publication;
  }
  unpublish(restaurantId: string) {
    return this.db.menus.updateMany({
      where: { restaurant_id: restaurantId },
      data: { published_revision_id: null },
    });
  }
  async setAvailability(
    kind: "products" | "variants" | "options",
    restaurantId: string,
    id: string,
    version: number,
    enabled: boolean,
  ) {
    const where = { id, restaurant_id: restaurantId, availability_version: version };
    const data = { is_available: enabled, availability_version: { increment: 1 } };
    const result =
      kind === "products"
        ? await this.db.menu_products.updateMany({ where, data })
        : kind === "variants"
          ? await this.db.menu_product_variants.updateMany({ where, data })
          : await this.db.menu_options.updateMany({ where, data });
    if (!result.count)
      throw new ConflictError("Disponibilidade foi alterada", "AVAILABILITY_VERSION_CONFLICT");
    return { id, is_available: enabled, availability_version: version + 1 };
  }
  audit(
    actor: ActorContext,
    action: string,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue,
    after: Prisma.InputJsonValue,
  ) {
    if (!actor.restaurantId) throw new NotFoundError();
    return this.db.restaurant_operation_events.create({
      data: {
        restaurant_id: actor.restaurantId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        previous_value: before,
        new_value: after,
        actor_type: "USER",
        actor_user_id: actor.id,
        actor_role_snapshot: actor.role,
        actor_category_snapshot: actor.category,
        actor_label_snapshot: actor.id,
      },
    });
  }
}
