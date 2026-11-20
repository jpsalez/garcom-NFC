import { z } from "zod";

function isIanaTimezone(timeZone: string) {
  if (/^[+-]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const restaurantSettingsSchema = z.strictObject({
  timezone: z.string().trim().min(1).max(64).refine(isIanaTimezone, "Informe um fuso horário IANA válido"),
  business_day_cutoff_minutes: z.number().int().min(0).max(719),
  service_fee_bps: z.number().int().min(0).max(3000),
});
export type RestaurantSettings = z.infer<typeof restaurantSettingsSchema>;

export const restaurantSettingsPatchSchema = restaurantSettingsSchema
  .partial()
  .refine((settings) => Object.keys(settings).length > 0, "Informe ao menos um campo");
export type RestaurantSettingsPatch = z.infer<typeof restaurantSettingsPatchSchema>;
