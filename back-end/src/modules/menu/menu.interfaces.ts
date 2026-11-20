import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { MenuDraft } from "./menu.repository.interface.ts";
import type { EntityKind, MenuSnapshot } from "./menu.schemas.ts";
export type PublicMenu = {
  publication_id: string;
  content: MenuSnapshot;
  availability: Record<string, boolean>;
  customer_ordering_enabled: boolean;
  media_paths: Record<string, { main: string; thumb: string }>;
};
export interface IMenuService {
  draft(actor: ActorContext): Promise<MenuDraft>;
  identity(actor: ActorContext, input: unknown): Promise<MenuDraft>;
  save(
    actor: ActorContext,
    kind: EntityKind,
    input: unknown,
    parentId?: string,
    id?: string,
  ): Promise<MenuDraft>;
  associate(actor: ActorContext, kind: "groups" | "images", id: string, input: unknown): Promise<MenuDraft>;
  reorder(actor: ActorContext, input: unknown): Promise<MenuDraft>;
  preview(actor: ActorContext): Promise<{ mode: "draft"; content: MenuSnapshot }>;
  publish(
    actor: ActorContext,
    input: unknown,
  ): Promise<{ publication_id: string; revision_number: number; replayed: boolean }>;
  unpublish(actor: ActorContext, input: unknown): Promise<{ published_revision_id: null }>;
  publicMenu(by: "slug" | "table", value: string): Promise<PublicMenu>;
  availability(
    actor: ActorContext,
    input: unknown,
  ): Promise<{ id: string; is_available: boolean; availability_version: number }>;
}
