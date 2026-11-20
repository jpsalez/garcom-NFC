'use client'

import { useEffect, useState } from "react";
import PrintJobsPanel from "@/components/cozinhaComponents/printJobsPanel";
import OrderQueueFeedback, { preparationStages } from "@/components/orderComponents/orderQueueFeedback";
import { type OrderQueue, useOrderQueue } from "@/hooks/useOrderQueue";
import { formatDuration } from "@/lib/format";
import { canAccessKitchen, groupKitchenOrders } from "@/lib/kitchenQueue";
import { formatTableTab, type Order } from "@/lib/orderTypes";

function KitchenOrderCard({ order, now, queue }: { order: Order; now: number; queue: OrderQueue }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{formatTableTab(order.table_label, order.tab_number)}</h3>
            {order.source === "POS" && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">PDV</span>
            )}
          </div>
          <p className="break-all text-xs text-slate-600">Pedido {order.id}</p>
        </div>
        <p className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold tabular-nums">
          Espera {formatDuration(now - Date.parse(order.created_at))}
        </p>
      </header>
      <ul>
        {order.items.filter((item) => item.pending_quantity || item.preparing_quantity || item.ready_quantity).map((item) => (
          <li key={item.id} className="border-t border-slate-200 py-3 last:pb-0">
            <p className="break-words font-semibold">{item.name}</p>
            <p className="break-words text-sm text-slate-600">{item.variant_name}</p>
            {item.selections.map((selection) => (
              <p key={selection.option_id} className="break-words text-sm text-slate-600">
                {selection.quantity}× {selection.name}
              </p>
            ))}
            {item.notes && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">Observação: {item.notes}</p>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-1 text-center text-xs sm:gap-2">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-950">
                <dt>Novas</dt><dd className="text-lg font-bold tabular-nums">{item.pending_quantity}</dd>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-950">
                <dt>Em preparo</dt><dd className="text-lg font-bold tabular-nums">{item.preparing_quantity}</dd>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-950">
                <dt>Prontas</dt><dd className="text-lg font-bold tabular-nums">{item.ready_quantity}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-3 empty:hidden">
              {preparationStages.map((stage) => {
                const available = item[stage.key];
                if (!available) return null;
                return (
                  <form key={stage.id} className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
                    void queue.change(order, { item_id: item.id, from_stage: stage.id, to_stage: stage.next, quantity });
                  }}>
                    <label className="text-xs">
                      Quantidade
                      <input aria-label={`Quantidade para ${stage.action.toLowerCase()} · ${item.name}`}
                        name="quantity" type="number" required min={1} max={available} defaultValue={1}
                        disabled={queue.disabled || !!queue.conflict} className="ml-1 w-16 rounded border bg-white p-1" />
                    </label>
                    <button disabled={queue.disabled || !!queue.conflict}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      {stage.action}
                    </button>
                  </form>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <h1 className="text-3xl font-bold">Cozinha</h1>
      <OrderQueueFeedback queue={queue} />
      {queue.denied ? null
        : !sections ? (!queue.degraded && <p role="status">Carregando pedidos...</p>)
        : sections.every(({ orders }) => orders.length === 0)
          ? <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Não há pedidos em andamento.</p>
          : sections.map(({ title, orders }) => orders.length > 0 && (
            <section key={title} className="space-y-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {orders.map((order) => <KitchenOrderCard key={`${order.id}/${order.version}`} order={order} now={now} queue={queue} />)}
              </div>
            </section>
          ))}
      <PrintJobsPanel enabled={!queue.denied} orders={snapshot?.items} />
    </main>
  );
}
