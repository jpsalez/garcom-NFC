'use client'

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { groupKitchenOrders } from "@/lib/kitchenQueue";
import type { Order } from "@/lib/orderTypes";
import { listOpenOrders } from "@/services/orders";

function KitchenOrderCard({ order, now }: { order: Order; now: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{order.table_label}</h3>
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
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function CozinhaPage() {
  const [queue, setQueue] = useState<ReturnType<typeof groupKitchenOrders> | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      if (!active) return;
      try {
        const { items, server_time } = await listOpenOrders();
        if (!active) return;
        const serverNow = Date.parse(server_time);
        const loadedAt = performance.now();
        setNow(serverNow);
        setQueue(groupKitchenOrders(items));
        if (items.length > 0) {
          timer = setInterval(() => setNow(serverNow + performance.now() - loadedAt), 1000);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError && err.status === 403
          ? "Você não tem permissão para consultar pedidos."
          : "Não foi possível carregar os pedidos.");
      }
    }

    void Promise.resolve().then(load);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const sections = queue && [
    { title: "Produção", orders: queue.production },
    { title: "Retirada", orders: queue.pickup },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <h1 className="text-3xl font-bold">Cozinha</h1>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        : !sections ? <p role="status">Carregando pedidos...</p>
        : sections.every(({ orders }) => orders.length === 0)
          ? <p className="rounded-2xl border bg-white p-8 text-center text-slate-600">Não há pedidos em andamento.</p>
          : sections.map(({ title, orders }) => orders.length > 0 && (
            <section key={title} className="space-y-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {orders.map((order) => <KitchenOrderCard key={order.id} order={order} now={now} />)}
              </div>
            </section>
          ))}
    </main>
  );
}
