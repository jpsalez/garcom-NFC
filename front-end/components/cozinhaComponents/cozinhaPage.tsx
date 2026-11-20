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
      badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
      cardAccentClass: "border-t-sky-500",
    };
  }
  if (order.progress.pending > 0) {
    return {
      label: "Novo",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
      cardAccentClass: "border-t-amber-500",
    };
  }
  return {
    label: "Pronto",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cardAccentClass: "border-t-emerald-500",
  };
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
      className={`flex flex-col rounded-2xl border border-slate-200 border-t-4 ${status.cardAccentClass} bg-white p-5 shadow-sm`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">{order.table_label}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badgeClass}`}>
              {status.label}
            </span>
          </div>
          <p title={order.id} className="font-mono text-xs font-medium tracking-wider text-slate-500">
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
            <li key={item.id} className="border-t border-slate-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 text-lg font-extrabold text-amber-700 tabular-nums">
                  {activeQuantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-lg font-bold leading-snug text-slate-900">{item.name}</p>
                  {item.variant_name && (
                    <p className="break-words text-sm text-slate-600">{item.variant_name}</p>
                  )}
                  {item.selections?.map((selection) => (
                    <p key={selection.option_id} className="break-words text-sm text-slate-600">
                      + {selection.quantity}× {selection.name}
                    </p>
                  ))}
                  {showStageTag && (
                    <p className="mt-1.5 inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {stageParts.join(" · ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium whitespace-pre-wrap break-words text-amber-950">
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
        <footer className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {startOperations.length > 0 && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void queue.change(order, startOperations)}
              className="w-auto flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:scale-100 hover:bg-slate-100 hover:shadow-none active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Iniciar preparo
            </button>
          )}
          {readyOperations.length > 0 && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void queue.change(order, readyOperations)}
              className="w-auto flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:scale-100 hover:bg-emerald-100 hover:shadow-none active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
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
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cozinha</h1>
          {grouped && (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{totalOpen}</span> em aberto
              {" · "}
              <span className="font-semibold text-amber-700">{newCount}</span>{" "}
              {newCount === 1 ? "novo" : "novos"}
              {" · "}
              <span className="font-semibold text-sky-700">{preparingCount}</span> em preparo
              {" · "}
              <span className="font-semibold text-emerald-700">{readyCount}</span>{" "}
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
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : snapshot
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                queue.degraded
                  ? "bg-amber-500"
                  : snapshot
                    ? "bg-emerald-500"
                    : "bg-slate-400"
              }`}
            />
            {queue.degraded ? "Reconectando" : snapshot ? "Ao vivo" : "Conectando"}
          </div>
        )}
      </header>

      <OrderQueueFeedback queue={queue} />

      {queue.denied ? null
        : !sections ? (!queue.degraded && <p role="status" className="text-slate-600">Carregando pedidos...</p>)
        : sections.every(({ orders }) => orders.length === 0)
          ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">Não há pedidos em andamento.</p>
          : sections.map(({ title, orders }) => orders.length > 0 && (
            <section key={title} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold uppercase tracking-wider text-slate-700">{title}</h2>
                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 tabular-nums">
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
    </main>
  );
}
