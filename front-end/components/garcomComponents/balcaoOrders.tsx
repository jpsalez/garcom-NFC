'use client'

import { useState } from "react";
import OrderQueueFeedback, { orderStages } from "@/components/orderComponents/orderQueueFeedback";
import type { OrderQueue } from "@/hooks/useOrderQueue";
import { elapsedSince } from "@/lib/orderAlerts";
import { formatDuration } from "@/lib/format";
import ReadyOrders, { OrderHeading } from "./readyOrders";
import type { Order, OrderTransition } from "@/lib/orderTypes";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Item = Order["items"][number];
type Operation = OrderTransition["operations"][number];

function CancelOrderItem({ item, order, busy, onChange }: {
  item: Item;
  order: Order;
  busy: boolean;
  onChange: (order: Order, operation: Operation) => void;
}) {
  const [quantity, setQuantity] = useState<Record<string, number>>({});
  const [cancel, setCancel] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3 border-t border-slate-100 py-4">
      <div className="flex justify-between gap-4">
        <div>
          <p className="font-semibold">{item.quantity}× {item.name}</p>
          <p className="text-sm text-slate-500">{item.variant_name}</p>
          {item.selections.map((selection) => (
            <p key={selection.option_id} className="text-sm text-slate-500">{selection.quantity}× {selection.name}</p>
          ))}
          {item.notes && <p className="mt-1 text-sm">Observação: {item.notes}</p>}
        </div>
        <span className="text-sm font-medium">{money.format(item.line_total_cents / 100)}</span>
      </div>
      {orderStages.map((stage) => {
        const count = item[stage.key];
        if (!count) return null;
        const selected = Math.min(Math.max(Math.floor(quantity[stage.id] || 1), 1), count);
        const operation = { item_id: item.id, from_stage: stage.id, quantity: selected };
        return (
          <div key={stage.id} className="rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm font-medium">{stage.label}: {count}</span>
              <label className="text-xs">
                Quantidade
                <input type="number" min={1} max={count} value={selected}
                  onChange={(event) => setQuantity({ ...quantity, [stage.id]: Number(event.target.value) })}
                  className="ml-1 w-16 rounded border bg-white p-1" />
              </label>
              <button disabled={busy} className="rounded-lg border px-3 py-2 text-xs" onClick={() => {
                setCancel(cancel === stage.id ? null : stage.id);
                setReason("");
              }}>
                Cancelar itens
              </button>
            </div>
            {cancel === stage.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="min-w-48 flex-1 text-xs">
                  Motivo do cancelamento
                  <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}
                    placeholder="Informe o motivo" className="mt-1 w-full rounded border bg-white p-2 text-sm" />
                </label>
                <button disabled={busy || reason.trim().length < 3}
                  className="self-end rounded-lg bg-red-700 px-3 py-2 text-xs text-white disabled:opacity-50" onClick={() => {
                    onChange(order, { ...operation, to_stage: "CANCELLED", reason: reason.trim() });
                    setCancel(null);
                  }}>
                  Confirmar cancelamento
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderDetails({ order, queue }: { order: Order; queue: OrderQueue }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">Detalhes e cancelamento</summary>
      {order.items.map((item) => (
        <CancelOrderItem key={item.id} item={item} order={order}
          busy={queue.disabled || !!queue.conflict} onChange={queue.change} />
      ))}
    </details>
  );
}

function RecentOrders({ orders }: { orders: Order[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Entregues recentes</h2>
      {orders.length === 0 && <p className="text-sm text-gray-500">Nenhum pedido encerrado.</p>}
      <div className="grid items-start gap-3 md:grid-cols-2">
        {orders.map((order) => (
          <article key={order.id} className="kpi-card space-y-1 rounded-lg border px-4 py-3 shadow-lg">
            <OrderHeading order={order} />
            <p className="text-sm">
              {order.progress.is_completed ? "Entregue" : "Cancelado"} · {new Date(order.updated_at).toLocaleString("pt-BR")}
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Ver itens</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}× {item.name} · {item.variant_name}
                    {item.delivered_quantity > 0 && ` · ${item.delivered_quantity} ${item.delivered_quantity === 1 ? "entregue" : "entregues"}`}
                    {item.cancelled_quantity > 0 && ` · ${item.cancelled_quantity} ${item.cancelled_quantity === 1 ? "cancelado" : "cancelados"}`}
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

function KitchenOrders({ orders, queue, now }: { orders: Order[]; queue: OrderQueue; now: number }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Na cozinha</h2>
      {orders.length === 0 && <p className="text-sm text-gray-500">Nenhum pedido aguardando preparo.</p>}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {orders.map((order) => (
          <article key={order.id} className="kpi-card space-y-2 rounded-lg border p-4 shadow-lg">
            <OrderHeading order={order} />
            <p className="text-sm text-gray-500">Enviado há {formatDuration(elapsedSince(order.created_at, now))}</p>
            <ul className="space-y-1 text-sm">
              {order.items.filter((item) => item.pending_quantity || item.preparing_quantity).map((item) => (
                <li key={item.id}>
                  <span className="font-semibold">{item.name}</span>
                  {item.pending_quantity > 0 && ` · ${item.pending_quantity} aguardando preparo`}
                  {item.preparing_quantity > 0 && ` · ${item.preparing_quantity} em preparo`}
                </li>
              ))}
            </ul>
            <OrderDetails order={order} queue={queue} />
          </article>
        ))}
      </div>
    </section>
  );
}

export default function BalcaoOrders({ queue, ready, now }: { queue: OrderQueue; ready: Order[]; now: number }) {
  const snapshot = queue.snapshot;
  const active = snapshot?.items.filter(({ progress }) => progress.pending > 0 || progress.preparing > 0).reverse() ?? [];
  const openIds = new Set(snapshot?.items.map(({ id }) => id));
  const closed = snapshot?.closed?.filter(({ id }) => !openIds.has(id)) ?? [];

  return (
    <div className="space-y-6 px-5 py-4 text-foreground">
      <OrderQueueFeedback queue={queue} />
      {!queue.denied && <ReadyOrders queue={queue} orders={ready} now={now}
        details={(order) => <OrderDetails order={order} queue={queue} />} />}
      {snapshot && <>
        <KitchenOrders orders={active} queue={queue} now={now} />
        <RecentOrders orders={closed} />
      </>}
    </div>
  );
}
