import { useEffect, useRef } from "react";
import type { OrderQueue } from "@/hooks/useOrderQueue";
import { isReadyOverdue, READY_REMINDER_INTERVAL_MS } from "@/lib/orderAlerts";
import { playAlert } from "@/lib/sound";

export function useOrderSounds(queue: OrderQueue, now: number, soundOn: boolean) {
  const { snapshot, alerts } = queue;
  const lastAlerts = useRef<typeof alerts>(undefined);
  const reminders = useRef<Map<string, number> | undefined>(undefined);

  useEffect(() => {
    if (!snapshot) {
      reminders.current = undefined;
      lastAlerts.current = undefined;
      return;
    }
    if (now <= 0) return;
    const first = !reminders.current;
    const previous = reminders.current ?? new Map<string, number>();
    const next = new Map<string, number>();
    const kinds = new Set<Parameters<typeof playAlert>[number]>();
    if (alerts !== lastAlerts.current) {
      lastAlerts.current = alerts;
      alerts?.entries.forEach(({ kind }) => kinds.add(kind));
    }

    for (const order of snapshot.items) {
      if (!isReadyOverdue(order, now)) continue;
      const last = previous.get(order.id);
      const due = last === undefined || now - last >= READY_REMINDER_INTERVAL_MS;
      next.set(order.id, due ? now : last);
      if (due && !first) kinds.add("order-overdue");
    }

    reminders.current = next;
    if (soundOn && kinds.size) playAlert(...Array.from(kinds));
  }, [snapshot, alerts, now, soundOn]);
}
