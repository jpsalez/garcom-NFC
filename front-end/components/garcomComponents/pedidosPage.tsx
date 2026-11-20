'use client'

import { useState } from "react";
import OrderQueueFeedback, { orderStages } from "@/components/orderComponents/orderQueueFeedback";
import { useOrderQueue } from "@/hooks/useOrderQueue";
import type { Order, OrderTransition } from "@/lib/orderTypes";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Item = Order["items"][number];
type Operation = OrderTransition["operations"][number];

function OrderItem({ item, order, busy, onChange }: {
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
              <button disabled={busy} className="rounded-lg bg-[#1d2540] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => onChange(order, { ...operation, to_stage: stage.next })}>
                {stage.action}
              </button>
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

export default function PedidosPage() {
  const queue = useOrderQueue();
  const orders = queue.snapshot?.items;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#719047]">Atendimento</p>
        <h1 className="mt-2 text-3xl font-bold">Pedidos da mesa</h1>
        <p className="mt-2 text-sm text-slate-500">Acompanhe o preparo e a entrega dos itens.</p>
      </div>
      <OrderQueueFeedback queue={queue} />
      {queue.denied ? null : !orders ? (!queue.degraded && <p>Carregando pedidos...</p>)
        : orders.length === 0 ? <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">Não há pedidos em andamento.</p>
        : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{order.table_label}</h2>
                    <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <p className="font-semibold">{money.format(order.active_total_cents / 100)}</p>
                </div>
                {order.items.map((item) => (
                  <OrderItem key={item.id} item={item} order={order} busy={queue.disabled || !!queue.conflict} onChange={queue.change} />
                ))}
              </article>
            ))}
          </div>
        )}
    </main>
  );
}
