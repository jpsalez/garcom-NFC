import { type ReactNode } from "react";
import type { OrderQueue } from "@/hooks/useOrderQueue";
import { formatDuration } from "@/lib/format";
import { elapsedSince, isReadyOverdue } from "@/lib/orderAlerts";
import type { Order, OrderTransition } from "@/lib/orderTypes";

export function buildDeliveryOperations(order: Order): OrderTransition["operations"] {
  return order.items.filter((item) => item.ready_quantity > 0).map((item) => ({
    item_id: item.id,
    from_stage: "READY",
    to_stage: "DELIVERED",
    quantity: item.ready_quantity,
  }));
}

export function OrderHeading({ order }: { order: Order }) {
  return (
    <header>
      <h3 className="text-xl font-bold">{order.table_label}</h3>
      <p className="text-sm text-gray-500">
        #{order.id.slice(0, 6).toUpperCase()} · {new Date(order.created_at).toLocaleString("pt-BR")}
      </p>
    </header>
  );
}

export default function ReadyOrders({ queue, orders, now, details }: {
  queue: OrderQueue;
  orders: Order[];
  now: number;
  details?: (order: Order) => ReactNode;
}) {
  const busy = queue.disabled || !!queue.conflict;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Para servir</h2>
      <p role="status" className={orders.length ? "font-semibold text-emerald-700" : "text-gray-500"}>
        {!queue.snapshot ? "Carregando fila…" : orders.length === 0
          ? "Nenhum pedido aguardando entrega."
          : orders.length === 1 ? "1 pedido com itens prontos para servir." : `${orders.length} pedidos com itens prontos para servir.`}
      </p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {orders.map((order) => (
          <article key={order.id} className={`kpi-card space-y-3 rounded-lg border p-4 text-foreground shadow-lg ${isReadyOverdue(order, now) ? "border-red-500 bg-red-50" : ""}`}>
            <OrderHeading order={order} />
            {order.ready_since && <p className={`text-sm tabular-nums ${isReadyOverdue(order, now) ? "font-bold text-red-700" : "text-gray-500"}`}>
              {isReadyOverdue(order, now) && "Entrega atrasada · "}
              Pronto há {formatDuration(elapsedSince(order.ready_since, now))}
            </p>}
            <ul className="space-y-2">
              {order.items.filter((item) => item.ready_quantity > 0).map((item) => (
                <li key={item.id}>
                  <p className="font-semibold">{item.ready_quantity}× {item.name}</p>
                  <p className="text-sm text-gray-500">
                    {[item.variant_name, ...item.selections.map((selection) => `${selection.quantity}× ${selection.name}`)].filter(Boolean).join(" · ")}
                  </p>
                  {item.notes && <p className="text-sm">Obs. {item.notes}</p>}
                </li>
              ))}
            </ul>
            {(order.progress.pending > 0 || order.progress.preparing > 0) &&
              <p className="text-sm text-gray-500">Ainda há itens em preparo neste pedido.</p>}
            <button type="button" disabled={busy}
              className="btn-primary px-4 py-2 disabled:opacity-50"
              aria-label={`Entregue: ${order.table_label}, pedido ${order.id.slice(0, 6).toUpperCase()}`}
              onClick={() => void queue.change(order, buildDeliveryOperations(order))}>
              Entregue
            </button>
            {details?.(order)}
          </article>
        ))}
      </div>
    </section>
  );
}
