import type { INotifier } from "./notifier.ts";

export function notifyPos(notifier: INotifier, restaurantId: string, event: string, payload: object) {
  try {
    notifier.toPos(restaurantId, event, payload);
  } catch {
    console.error("Falha ao emitir evento de PDV", { restaurant_id: restaurantId, event });
  }
}
