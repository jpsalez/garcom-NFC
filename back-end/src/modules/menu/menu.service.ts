import { inject, injectable } from "tsyringe";
import { ZodError } from "zod";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { requireCapability } from "../../shared/authorization/capabilities.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/http-errors.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { ITableRepository } from "../tables/tables.repository.interface.ts";
import { MenuRepository } from "./menu.repository.ts";
import type { CatalogWrite, MenuDraft, IMenuRepository } from "./menu.repository.interface.ts";
import type { IMenuService } from "./menu.interfaces.ts";
import {
  availabilitySchema,
  createEntitySchemas,
  identitySchema,
  imagesSchema,
  publishSchema,
  reorderSchema,
  unpublishSchema,
  updateEntitySchemas,
  variantGroupsSchema,
  type EntityKind,
  type MenuSnapshot,
} from "./menu.schemas.ts";
import { buildSnapshot, snapshotMedia, validatePublication } from "./published-offer.ts";
import type { IOrderSettingsRepository } from "../orders/order-settings.repository.interface.ts";

export function catalogRows(menu: MenuDraft, kind: EntityKind, parentId?: string) {
  const products = menu.categories.flatMap((category) => category.products);
  if (kind === "categories") return menu.categories;
  if (kind === "products") return products.filter((product) => product.category_id === parentId);
  if (kind === "variants")
    return products.flatMap((product) => product.variants).filter((row) => row.product_id === parentId);
  if (kind === "groups")
    return products.flatMap((product) => product.option_groups).filter((row) => row.product_id === parentId);
  return products
    .flatMap((product) => product.option_groups.flatMap((group) => group.options))
    .filter((row) => row.group_id === parentId);
}
@injectable()
export class MenuService implements IMenuService {
  constructor(
    @inject("MenuRepository") private repository: IMenuRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("RestaurantRepository") private restaurants: IRestaurantRepository,
    @inject("TableRepository") private tables: ITableRepository,
    @inject("OrderSettingsRepository") private settings: IOrderSettingsRepository,
  ) {}
  async draft(actor: ActorContext) {
    requireCapability(actor, "menu:manage");
    return this.repository.draft(this.tenant(actor));
  }
  private tenant(actor: ActorContext) {
    if (!actor.restaurantId) throw new NotFoundError();
    return actor.restaurantId;
  }
  async identity(actor: ActorContext, input: unknown) {
    const { expected_draft_version, ...data } = identitySchema.parse(input);
    if (!Object.keys(data).length) throw new ValidationError(undefined, "Informe ao menos uma alteração");
    return this.unit.run(
      this.tenant(actor),
      async ({ db }) => {
        const repo = new MenuRepository(db);
        await repo.claimDraft(this.tenant(actor), expected_draft_version);
        await repo.readyMedia(
          this.tenant(actor),
          [data.logo_media_id, data.cover_media_id].filter((id): id is string => typeof id === "string"),
        );
        await repo.updateIdentity(this.tenant(actor), data);
        return repo.draft(this.tenant(actor));
      },
      { actor, capability: "menu:manage" },
    );
  }
  async save(actor: ActorContext, kind: EntityKind, input: unknown, parentId?: string, id?: string) {
    const parsed = (id ? updateEntitySchemas[kind] : createEntitySchemas[kind]).parse(input);
    const { expected_draft_version, ...fields } = parsed;
    if (!Object.keys(fields).length) throw new ValidationError(undefined, "Informe ao menos uma alteração");
    return this.unit.run(
      this.tenant(actor),
      async ({ db, now }) => {
        const rest = this.tenant(actor),
          repo = new MenuRepository(db),
          draft = await repo.draft(rest);
        await repo.claimDraft(rest, expected_draft_version);
        const { archived, initial_variant, ...data } = fields as CatalogWrite & {
          archived?: boolean;
          initial_variant?: { name: string; price_cents: number };
        };
        if (archived !== undefined) data.archived_at = archived ? now : null;
        const previous = id ? await repo.find(kind, rest, id) : undefined;
        if (
          kind === "groups" &&
          (data.min_selections ?? previous?.min_selections ?? 0) >
            (data.max_selections ?? previous?.max_selections ?? 1)
        )
          throw new ValidationError(undefined, "Mínimo de escolhas não pode exceder o máximo");
        if (data.category_id) await repo.find("categories", rest, data.category_id);
        if (parentId) await repo.find(kind === "options" ? "groups" : "products", rest, parentId);
        const siblingsParent =
          kind === "products"
            ? (data.category_id ?? previous?.category_id)
            : (parentId ?? (kind === "options" ? previous?.group_id : previous?.product_id));
        if (!id || (previous?.archived_at && archived === false)) {
          const siblings = catalogRows(draft, kind, siblingsParent).filter((row) => !row.archived_at);
          const total =
            kind === "products"
              ? draft.categories.flatMap((c) => c.products).filter((p) => !p.archived_at).length
              : siblings.length;
          const maximum = { categories: 100, products: 1000, variants: 20, groups: 20, options: 50 }[kind];
          if (total >= maximum)
            throw new ValidationError(undefined, "Limite de registros do cardápio atingido");
          if (!id) data.position ??= Math.max(-1, ...siblings.map((row) => row.position)) + 1;
        }
        const row = await repo.write(kind, rest, draft.id, parentId, data, id);
        if (initial_variant) await repo.write("variants", rest, draft.id, row.id, initial_variant);
        return repo.draft(rest);
      },
      { actor, capability: "menu:manage" },
    );
  }
  async associate(actor: ActorContext, kind: "groups" | "images", id: string, input: unknown) {
    const parsed = (kind === "groups" ? variantGroupsSchema : imagesSchema).parse(input);
    return this.unit.run(
      this.tenant(actor),
      async ({ db }) => {
        const repo = new MenuRepository(db),
          rest = this.tenant(actor);
        await repo.claimDraft(rest, parsed.expected_draft_version);
        if ("group_ids" in parsed) {
          const variant = await repo.find("variants", rest, id);
          for (const groupId of parsed.group_ids) {
            const group = await repo.find("groups", rest, groupId);
            if (group.product_id !== variant.product_id || group.archived_at)
              throw new NotFoundError("Grupo não encontrado para esta variante");
          }
          if (!variant.product_id) throw new NotFoundError();
          await repo.replaceGroups(rest, variant.product_id, id, parsed.group_ids);
        } else {
          await repo.find("products", rest, id);
          await repo.readyMedia(
            rest,
            parsed.items.map((item) => item.media_id),
          );
          await repo.replaceImages(rest, id, parsed.items);
        }
        return repo.draft(rest);
      },
      { actor, capability: "menu:manage" },
    );
  }
  async reorder(actor: ActorContext, input: unknown) {
    const parsed = reorderSchema.parse(input);
    return this.unit.run(
      this.tenant(actor),
      async ({ db }) => {
        const repo = new MenuRepository(db),
          rest = this.tenant(actor),
          draft = await repo.draft(rest);
        await repo.claimDraft(rest, parsed.expected_draft_version);
        if (parsed.collection !== "categories" && !parsed.parent_id)
          throw new ValidationError(undefined, "Informe o pai da coleção");
        const rows = catalogRows(draft, parsed.collection, parsed.parent_id).filter(
          (row) => !row.archived_at,
        );
        if (
          rows.length !== parsed.ordered_ids.length ||
          rows.some((row) => !parsed.ordered_ids.includes(row.id))
        )
          throw new ValidationError(undefined, "Informe todos os registros ativos do mesmo pai");
        for (const [position, id] of parsed.ordered_ids.entries())
          await repo.write(parsed.collection, rest, draft.id, parsed.parent_id, { position }, id);
        return repo.draft(rest);
      },
      { actor, capability: "menu:manage" },
    );
  }
  async preview(actor: ActorContext) {
    return { mode: "draft" as const, content: buildSnapshot(await this.draft(actor)) };
  }
  async publish(actor: ActorContext, input: unknown) {
    const parsed = publishSchema.parse(input);
    return this.unit.run(
      this.tenant(actor),
      async ({ db, actor: current }) => {
        const repo = new MenuRepository(db),
          rest = this.tenant(actor),
          draft = await repo.draft(rest);
        if (draft.draft_version !== parsed.expected_draft_version)
          throw new ConflictError("Rascunho alterado", "DRAFT_VERSION_CONFLICT");
        if (draft.published_revision_id) {
          const prior = await repo.latestPublication(rest, draft.published_revision_id);
          if (prior?.draft_version === draft.draft_version)
            return { publication_id: prior.id, revision_number: prior.revision_number, replayed: true };
        }
        const sameDraft = await repo.publicationForDraft(draft.id, draft.draft_version);
        if (sameDraft) {
          await repo.restorePublication(rest, sameDraft.id);
          await repo.audit(
            current ?? actor,
            "REPUBLISHED",
            "MENU_PUBLICATION",
            sameDraft.id,
            {},
            { published: true },
          );
          return { publication_id: sameDraft.id, revision_number: sameDraft.revision_number, replayed: true };
        }
        let snapshot: MenuSnapshot;
        try {
          snapshot = buildSnapshot(draft);
          validatePublication(snapshot);
        } catch (error) {
          if (error instanceof ZodError || error instanceof ValidationError)
            throw new ConflictError("Corrija o catálogo antes de publicar", "INVALID_CATALOG_CONFIGURATION");
          throw error;
        }
        if (
          Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 2000000 ||
          (await repo.publicationBytes(snapshot)) > 2097152
        )
          throw new AppError("Cardápio excede o limite de publicação", 413, undefined, "CATALOG_TOO_LARGE");
        const ids = snapshotMedia(snapshot);
        await repo.readyMedia(rest, ids);
        const publication = await repo.publish(rest, draft.id, draft.draft_version, snapshot, actor.id, ids);
        await repo.audit(
          current ?? actor,
          "PUBLISHED",
          "MENU_PUBLICATION",
          publication.id,
          {},
          { revision: publication.revision_number },
        );
        return {
          publication_id: publication.id,
          revision_number: publication.revision_number,
          replayed: false,
        };
      },
      { actor, capability: "menu:publish" },
    );
  }
  async unpublish(actor: ActorContext, input: unknown) {
    const { expected_publication_id } = unpublishSchema.parse(input);
    return this.unit.run(
      this.tenant(actor),
      async ({ db, actor: current }) => {
        const repo = new MenuRepository(db),
          rest = this.tenant(actor),
          draft = await repo.draft(rest);
        if (draft.published_revision_id !== expected_publication_id)
          throw new ConflictError("Publicação já foi alterada", "MENU_PUBLICATION_CONFLICT");
        await repo.unpublish(rest);
        await repo.audit(
          current ?? actor,
          "UNPUBLISHED",
          "MENU_PUBLICATION",
          expected_publication_id,
          { published: true },
          { published: false },
        );
        return { published_revision_id: null };
      },
      { actor, capability: "menu:publish" },
    );
  }
  async publicMenu(by: "slug" | "table", value: string) {
    const table = by === "table" ? await this.tables.findByPublicCode(value) : null;
    const restaurant = by === "table" ? table?.restaurant : await this.restaurants.findBySlug(value);
    if (!restaurant?.active || (by === "table" && !table?.active))
      throw new NotFoundError("Restaurante ou mesa não encontrado");
    const published = await this.repository.published(restaurant.id);
    if (!published) throw new AppError("Cardápio não publicado", 404, undefined, "MENU_NOT_PUBLISHED");
    const available = await this.repository.availability(restaurant.id);
    const publishedIds = published.content.categories.flatMap((c) =>
      c.products.flatMap((p) => [
        p.id,
        ...p.variants.map((v) => v.id),
        ...p.groups.flatMap((g) => g.options.map((o) => o.id)),
      ]),
    );
    return {
      publication_id: published.id,
      content: published.content,
      availability: Object.fromEntries(publishedIds.map((id) => [id, available.get(id) === true])),
      customer_ordering_enabled: (await this.settings.get(restaurant.id)).customer_ordering_enabled,
      media_paths: Object.fromEntries(
        snapshotMedia(published.content).map((id) => [
          id,
          { main: `/api/v1/public/media/${id}/main`, thumb: `/api/v1/public/media/${id}/thumb` },
        ]),
      ),
    };
  }
  async availability(actor: ActorContext, input: unknown) {
    const parsed = availabilitySchema.parse(input);
    return this.unit.run(
      this.tenant(actor),
      async ({ db, actor: current }) => {
        const repo = new MenuRepository(db),
          rest = this.tenant(actor);
        await repo.find(parsed.kind, rest, parsed.id);
        const result = await repo.setAvailability(
          parsed.kind,
          rest,
          parsed.id,
          parsed.expected_version,
          parsed.is_available,
        );
        await repo.audit(
          current ?? actor,
          "AVAILABILITY_CHANGED",
          parsed.kind.toUpperCase(),
          parsed.id,
          {},
          { is_available: parsed.is_available },
        );
        return result;
      },
      { actor, capability: "availability:write" },
    );
  }
}
