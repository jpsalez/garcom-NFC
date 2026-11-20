import type { fiscal_document_status, Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

type SettingsData = Omit<Prisma.fiscal_settingsUncheckedCreateInput, "restaurant_id" | "updated_at">;
type ProfileData = Omit<
  Prisma.fiscal_tax_profilesUncheckedCreateInput,
  "id" | "restaurant_id" | "created_at" | "updated_at"
>;
type DocumentData = Omit<
  Prisma.fiscal_documentsUncheckedCreateInput,
  "id" | "restaurant_id" | "created_at" | "updated_at"
>;
export type DocumentUpdate = Prisma.fiscal_documentsUncheckedUpdateManyInput;
export type DocumentGuard = {
  status: fiscal_document_status[];
  attempt?: number;
  dispatched?: boolean;
  cancelRequested?: boolean;
};

export class FiscalRepository {
  constructor(private readonly db: DbClient) {}

  settings(restaurantId: string) {
    return this.db.fiscal_settings.findUnique({ where: { restaurant_id: restaurantId } });
  }

  saveSettings(restaurantId: string, data: SettingsData) {
    return this.db.fiscal_settings.upsert({
      where: { restaurant_id: restaurantId },
      create: { ...data, restaurant_id: restaurantId },
      update: data,
    });
  }

  profiles(restaurantId: string) {
    return this.db.fiscal_tax_profiles.findMany({
      where: { restaurant_id: restaurantId },
      orderBy: { name: "asc" },
    });
  }

  profile(restaurantId: string, id: string) {
    return this.db.fiscal_tax_profiles.findUnique({
      where: { restaurant_id_id: { restaurant_id: restaurantId, id } },
    });
  }

  createProfile(restaurantId: string, data: ProfileData) {
    return this.db.fiscal_tax_profiles.create({ data: { ...data, restaurant_id: restaurantId } });
  }

  updateProfile(restaurantId: string, id: string, data: Partial<ProfileData>) {
    return this.db.fiscal_tax_profiles.update({
      where: { restaurant_id_id: { restaurant_id: restaurantId, id } },
      data,
    });
  }

  async assignProduct(restaurantId: string, productId: string, profileId: string | null) {
    const { count } = await this.db.menu_products.updateMany({
      where: { restaurant_id: restaurantId, id: productId },
      data: { fiscal_tax_profile_id: profileId },
    });
    return count > 0;
  }

  productProfiles(restaurantId: string, productIds: string[]) {
    return this.db.menu_products.findMany({
      where: { restaurant_id: restaurantId, id: { in: productIds } },
      select: { id: true, fiscal_tax_profile: true },
    });
  }

  createDocument(restaurantId: string, data: DocumentData) {
    return this.db.fiscal_documents.create({ data: { ...data, restaurant_id: restaurantId } });
  }

  document(restaurantId: string, id: string) {
    return this.db.fiscal_documents.findUnique({
      where: { restaurant_id_id: { restaurant_id: restaurantId, id } },
    });
  }

  documentByTab(restaurantId: string, tabId: string) {
    return this.db.fiscal_documents.findUnique({
      where: { restaurant_id_tab_id: { restaurant_id: restaurantId, tab_id: tabId } },
    });
  }

  // Adia o documento no fim da fila do job sem mudar o estado.
  touch(restaurantId: string, id: string, now: Date) {
    return this.db.fiscal_documents.updateMany({
      where: { restaurant_id: restaurantId, id },
      data: { updated_at: now },
    });
  }

  // Atualização condicional: só aplica se o documento ainda está no estado e na tentativa esperados.
  async updateDocument(restaurantId: string, id: string, guard: DocumentGuard, data: DocumentUpdate) {
    const isSet = (flag: boolean) => (flag ? { not: null } : null);
    const [updated] = await this.db.fiscal_documents.updateManyAndReturn({
      where: {
        restaurant_id: restaurantId,
        id,
        status: { in: guard.status },
        attempt: guard.attempt,
        ...(guard.dispatched === undefined ? {} : { dispatched_at: isSet(guard.dispatched) }),
        ...(guard.cancelRequested === undefined ? {} : { cancel_requested_at: isSet(guard.cancelRequested) }),
      },
      data,
    });
    return updated ?? null;
  }
}
