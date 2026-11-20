'use client'

import { useEffect, useState } from "react";
import OrderQueueFeedback from "@/components/orderComponents/orderQueueFeedback";
import { type OrderQueue, useOrderQueue } from "@/hooks/useOrderQueue";
import { formatDuration } from "@/lib/format";
import { canAccessKitchen, groupKitchenOrders } from "@/lib/kitchenQueue";
import type { Order, OrderTransition } from "@/lib/orderTypes";

type Operation = OrderTransition["operations"][number];

const TEN_MINUTES_MS = 10 * 60_000;
const TWENTY_MINUTES_MS = 20 * 60_000;

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
    } else if (item.pending_quantity > 0) {
      operations.push({
        item_id: item.id,
        from_stage: "PENDING",
        to_stage: "READY",
        quantity: item.pending_quantity,
      });
    }
  }
  return operations;
}

function getOrderStatus(order: Order) {
  if (order.progress.preparing > 0) {
    return {
      label: "Em preparo",
      badgeClass: "border-sky-500/30 bg-sky-500/15 text-sky-300",
      cardAccentClass: "border-t-sky-500/70",
    };
  }
  if (order.progress.pending > 0) {
    return {
      label: "Novo",
      badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      cardAccentClass: "border-t-amber-500/70",
    };
  }
  return {
    label: "Pronto",
    badgeClass: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    cardAccentClass: "border-t-emerald-500/70",
  };
}

function getWaitTone(elapsedMs: number) {
  if (elapsedMs >= TWENTY_MINUTES_MS) {
    return {
      level: "critical" as const,
      className: "border-red-500/40 bg-red-500/20 text-red-200",
    };
  }
  if (elapsedMs >= TEN_MINUTES_MS) {
    return {
      level: "warning" as const,
      className: "border-amber-500/40 bg-amber-500/20 text-amber-200",
    };
  }
  return {
    level: "normal" as const,
    className: "border-slate-700 bg-slate-800 text-slate-200",
  };
}

function KitchenOrderCard({ order, now, queue }: { order: Order; now: number; queue: OrderQueue }) {
  const parsedCreatedAt = Date.parse(order.created_at);
  const elapsedMs = Number.isFinite(parsedCreatedAt) && now > 0 ? Math.max(0, now - parsedCreatedAt) : 0;
  const waitTone = getWaitTone(elapsedMs);
  const status = getOrderStatus(order);
  const shortCode = `#${order.id.slice(0, 6).toUpperCase()}`;
  const activeItems = order.items.filter(
    (item) => item.pending_quantity || item.preparing_quantity || item.ready_quantity,
  );
  const isProductionOrder = order.progress.pending > 0 || order.progress.preparing > 0;
  const startOperations = buildStartPreparationOperations(order);
  const readyOperations = buildReadyOperations(order);
  const actionDisabled = queue.disabled || !!queue.conflict;

  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-800 border-t-4 ${status.cardAccentClass} bg-slate-900 p-5 shadow-lg`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight text-white">{order.table_label}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badgeClass}`}>
              {status.label}
            </span>
          </div>
          <p title={order.id} className="font-mono text-xs font-medium tracking-wider text-slate-400">
            {shortCode}
          </p>
        </div>
        <p
          data-wait-level={waitTone.level}
          className={`shrink-0 rounded-lg border px-3 py-1 text-sm font-bold tabular-nums ${waitTone.className}`}
        >
          Espera {formatDuration(elapsedMs)}
        </p>
      </header>

      <ul className="flex-1">
        {activeItems.map((item) => {
          const activeQuantity = item.pending_quantity + item.preparing_quantity + item.ready_quantity;
          const stageParts: string[] = [];
          if (item.pending_quantity > 0) {
            stageParts.push(`${item.pending_quantity} ${item.pending_quantity === 1 ? "novo" : "novos"}`);
          }
          if (item.preparing_quantity > 0) {
            stageParts.push(`${item.preparing_quantity} em preparo`);
          }
          if (item.ready_quantity > 0) {
            stageParts.push(`${item.ready_quantity} ${item.ready_quantity === 1 ? "pronto" : "prontos"}`);
          }
          const showStageTag =
            stageParts.length > 1 ||
            (isProductionOrder && item.ready_quantity > 0 && item.pending_quantity === 0 && item.preparing_quantity === 0);

          return (
            <li key={item.id} className="border-t border-slate-800 py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 text-lg font-extrabold text-amber-300 tabular-nums">
                  {activeQuantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-lg font-bold leading-snug text-white">{item.name}</p>
                  {item.variant_name && (
                    <p className="break-words text-sm text-slate-300">{item.variant_name}</p>
                  )}
                  {item.selections?.map((selection) => (
                    <p key={selection.option_id} className="break-words text-sm text-slate-300">
                      + {selection.quantity}× {selection.name}
                    </p>
                  ))}
                  {showStageTag && (
                    <p className="mt-1.5 inline-flex rounded-md border border-slate-700 bg-slate-800/90 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {stageParts.join(" · ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-sm font-medium whitespace-pre-wrap break-words text-amber-200">
                      Obs: {item.notes}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {(startOperations.length > 0 || readyOperations.length > 0) && (
        <footer className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
          {startOperations.length > 0 && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void queue.change(order, startOperations)}
              className="w-auto flex-1 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:scale-100 hover:bg-slate-700 hover:shadow-none active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Iniciar preparo
            </button>
          )}
          {readyOperations.length > 0 && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void queue.change(order, readyOperations)}
              className="w-auto flex-1 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:scale-100 hover:bg-emerald-500/25 hover:shadow-none active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pronto
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

export default function CozinhaPage() {
  const queue = useOrderQueue(canAccessKitchen);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const snapshot = queue.snapshot;
  const now = snapshot ? Date.parse(snapshot.server_time) + Math.max(0, tick - snapshot.loadedAt) : 0;
  const grouped = snapshot && groupKitchenOrders(snapshot.items);
  const sections = grouped && [
    { title: "Produção", orders: grouped.production },
    { title: "Retirada", orders: grouped.pickup },
  ];

  const productionOrders = grouped?.production ?? [];
  const pickupOrders = grouped?.pickup ?? [];
  const newCount = productionOrders.filter((order) => order.progress.preparing === 0).length;
  const preparingCount = productionOrders.filter((order) => order.progress.preparing > 0).length;
  const readyCount = pickupOrders.length;
  const totalOpen = productionOrders.length + pickupOrders.length;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] w-full bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white">Cozinha</h1>
            {grouped && (
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-slate-200">{totalOpen}</span> em aberto
                {" · "}
                <span className="font-semibold text-amber-300">{newCount}</span>{" "}
                {newCount === 1 ? "novo" : "novos"}
                {" · "}
                <span className="font-semibold text-sky-300">{preparingCount}</span> em preparo
                {" · "}
                <span className="font-semibold text-emerald-300">{readyCount}</span>{" "}
                {readyCount === 1 ? "pronto" : "prontos"} para retirada
              </p>
            )}
          </div>
          {!queue.denied && (
            <div
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                queue.degraded
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : snapshot
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  queue.degraded
                    ? "bg-amber-400"
                    : snapshot
                      ? "bg-emerald-400"
                      : "bg-slate-500"
                }`}
              />
              {queue.degraded ? "Reconectando" : snapshot ? "Ao vivo" : "Conectando"}
            </div>
          )}
        </header>

        <OrderQueueFeedback queue={queue} />

        {queue.denied ? null
          : !sections ? (!queue.degraded && <p role="status" className="text-slate-300">Carregando pedidos...</p>)
          : sections.every(({ orders }) => orders.length === 0)
            ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Não há pedidos em andamento.</p>
            : sections.map(({ title, orders }) => orders.length > 0 && (
              <section key={title} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold uppercase tracking-wider text-slate-300">{title}</h2>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 tabular-nums">
                    {orders.length}
                  </span>
                </div>
                <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {orders.map((order) => (
                    <KitchenOrderCard key={`${order.id}/${order.version}`} order={order} now={now} queue={queue} />
                  ))}
                </div>
              </section>
            ))}
      </div>
    </main>
  );
}
