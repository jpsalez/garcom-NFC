'use client'

import { useEffect, useState } from "react";
import OrderQueueFeedback from "@/components/orderComponents/orderQueueFeedback";
import { type OrderQueue, useOrderQueue } from "@/hooks/useOrderQueue";
import { formatDuration } from "@/lib/format";
import { canAccessKitchen, groupKitchenOrders } from "@/lib/kitchenQueue";
import { elapsedSince, isReadyOverdue } from "@/lib/orderAlerts";
import type { Order, OrderTransition } from "@/lib/orderTypes";

type Operation = OrderTransition["operations"][number];
type OrderItem = Order["items"][number];
type StageQuantity = "pending_quantity" | "preparing_quantity" | "ready_quantity";
type TicketAction = { label: string; operations: Operation[] };

const TEN_MINUTES_MS = 10 * 60_000;
const TWENTY_MINUTES_MS = 20 * 60_000;

// Um único timer compartilhado entre todos os tickets montados; pausa com a aba oculta ou sem pedidos.
const clockListeners = new Set<(now: number) => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

function emitClock() {
  if (typeof document !== "undefined" && document.hidden) return;
  const now = performance.now();
  for (const listener of clockListeners) listener(now);
}

function subscribeClock(listener: (now: number) => void) {
  clockListeners.add(listener);
  if (!clockTimer) clockTimer = setInterval(emitClock, 1000);
  if (!visibilityBound && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", emitClock);
    visibilityBound = true;
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
      if (visibilityBound && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", emitClock);
        visibilityBound = false;
      }
    }
  };
}

/**
 * Monta lote para mover todas as unidades pendentes de cada item para EM PREPARO.
 */
export function buildStartPreparationOperations(order: Order): Operation[] {
  const operations: Operation[] = [];
  for (const item of order.items) {
    if (item.pending_quantity > 0) {
      operations.push({
        item_id: item.id,
        from_stage: "PENDING",
        to_stage: "PREPARING",
        quantity: item.pending_quantity,
      });
    }
  }
  return operations;
}

/**
 * Monta lote para mover itens para PRONTO respeitando no máximo 1 operação por item_id.
 */
export function buildReadyOperations(order: Order): Operation[] {
  const operations: Operation[] = [];
  for (const item of order.items) {
    if (item.preparing_quantity > 0) {
      operations.push({
        item_id: item.id,
        from_stage: "PREPARING",
        to_stage: "READY",
        quantity: item.preparing_quantity,
      });
    }
  }
  return operations;
}

function getWaitTone(elapsedMs: number) {
  if (elapsedMs >= TWENTY_MINUTES_MS) {
    return {
      level: "critical" as const,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (elapsedMs >= TEN_MINUTES_MS) {
    return {
      level: "warning" as const,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    level: "normal" as const,
    className: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

function KitchenItem({ item, quantity }: { item: OrderItem; quantity: number }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-extrabold tabular-nums">{quantity}×</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg font-bold leading-snug">{item.name}</p>
          {item.variant_name && <p className="break-words text-sm text-gray-500">{item.variant_name}</p>}
          {item.selections?.map((selection) => (
            <p key={selection.option_id} className="break-words text-sm text-gray-500">
              + {selection.quantity}× {selection.name}
            </p>
          ))}
          {item.notes && (
            <p className="mt-1 whitespace-pre-wrap break-words rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm font-medium text-amber-950">
              Obs: {item.notes}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function KitchenTicket({ order, serverTime, loadedAt, queue, stage, action }: {
  order: Order;
  serverTime: number;
  loadedAt: number;
  queue: OrderQueue;
  stage: StageQuantity;
  action?: TicketAction;
}) {
  const [tick, setTick] = useState(loadedAt);
  useEffect(() => subscribeClock(setTick), []);
  const now = serverTime + Math.max(0, tick - loadedAt);
  const awaitingWaiter = stage === "ready_quantity";
  const timestamp = awaitingWaiter ? order.ready_since : order.created_at;
  const elapsedMs = elapsedSince(timestamp, now);
  const overdue = awaitingWaiter && isReadyOverdue(order, now);
  const waitTone = awaitingWaiter
    ? overdue
      ? { level: "critical", className: "border-red-500 bg-red-50 text-red-700" }
      : getWaitTone(0)
    : getWaitTone(elapsedMs);
  const activeItems = order.items.filter(
    (item) => item[stage] > 0,
  );
  const actionDisabled = queue.disabled || !!queue.conflict;

  return (
    <article className={`kpi-card flex flex-col gap-2 rounded-lg border p-3 shadow-lg ${overdue ? "border-red-500 bg-red-50" : ""}`}>
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold">{order.table_label}</h3>
          <p title={order.id} className="font-mono text-xs text-gray-500">
            #{order.id.slice(0, 6).toUpperCase()}
          </p>
        </div>
        {timestamp && <p
          data-wait-level={waitTone.level}
          className={`shrink-0 rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums ${waitTone.className}`}
        >
          {awaitingWaiter ? "Pronto há" : "Espera"} {formatDuration(elapsedMs)}
        </p>}
      </header>

      <ul className="divide-y">
        {activeItems.map((item) => (
          <KitchenItem key={item.id} item={item} quantity={item[stage]} />
        ))}
      </ul>

      {action && (
        <button
          type="button"
          disabled={actionDisabled}
          aria-label={`${action.label}: ${order.table_label}`}
          onClick={() => void queue.change(order, action.operations)}
          className="btn-primary mt-1 p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action.label}
        </button>
      )}
    </article>
  );
}

function KitchenColumn({ title, count, emptyText, children }: {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums">{count}</span>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto pr-1 md:max-h-[calc(100vh-12rem)]">
        {count === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : children}
      </div>
    </section>
  );
}

export default function CozinhaPage() {
  const queue = useOrderQueue(canAccessKitchen);
  const snapshot = queue.snapshot;
  const serverTime = snapshot ? Date.parse(snapshot.server_time) : 0;
  const loadedAt = snapshot?.loadedAt ?? 0;
  const grouped = snapshot && groupKitchenOrders(snapshot.items);

  const newOrders = grouped?.incoming ?? [];
  const preparingOrders = grouped?.preparing ?? [];
  const pickupOrders = grouped?.pickup ?? [];

  return (
    <main className="w-full space-y-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Cozinha</h2>
          {grouped && <p className="text-sm text-gray-500">{snapshot?.items.length} em aberto</p>}
        </div>
        {!queue.denied && (
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              queue.degraded
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : snapshot
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                queue.degraded ? "bg-amber-500" : snapshot ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {queue.degraded ? "Reconectando" : snapshot ? "Ao vivo" : "Conectando"}
          </div>
        )}
      </header>

      <OrderQueueFeedback queue={queue} />

      {queue.denied ? null
        : !grouped ? (!queue.degraded && <p role="status" className="text-gray-500">Carregando pedidos...</p>)
        : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
            <KitchenColumn title="Novos" count={newOrders.length} emptyText="Nenhum pedido novo.">
              {newOrders.map((order) => (
                <KitchenTicket
                  key={`${order.id}/${order.version}`}
                  order={order}
                  serverTime={serverTime}
                  loadedAt={loadedAt}
                  queue={queue}
                  stage="pending_quantity"
                  action={{ label: "Iniciar preparo", operations: buildStartPreparationOperations(order) }}
                />
              ))}
            </KitchenColumn>

            <KitchenColumn title="Em preparo" count={preparingOrders.length} emptyText="Nenhum pedido em preparo.">
              {preparingOrders.map((order) => (
                <KitchenTicket
                  key={`${order.id}/${order.version}`}
                  order={order}
                  serverTime={serverTime}
                  loadedAt={loadedAt}
                  queue={queue}
                  stage="preparing_quantity"
                  action={{ label: "Pronto", operations: buildReadyOperations(order) }}
                />
              ))}
            </KitchenColumn>

            <KitchenColumn title="Aguardando garçom" count={pickupOrders.length} emptyText="Nenhum item aguardando o garçom.">
              {pickupOrders.map((order) => (
                <KitchenTicket key={`${order.id}/${order.version}`} order={order} serverTime={serverTime} loadedAt={loadedAt} queue={queue} stage="ready_quantity" />
              ))}
            </KitchenColumn>
          </div>
        )}
    </main>
  );
}
