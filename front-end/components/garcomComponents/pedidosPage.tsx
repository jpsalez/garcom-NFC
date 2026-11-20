'use client'

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, ApiError } from "@/lib/api";
import type { Order, OrderStage } from "@/lib/orderTypes";
import { listOrders, transitionOrder } from "@/services/orders";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Item = Order["items"][number];
const stages = [{ id: "PENDING", label: "Aguardando", key: "pending_quantity", next: "PREPARING", action: "Iniciar preparo" }, { id: "PREPARING", label: "Em preparo", key: "preparing_quantity", next: "READY", action: "Marcar pronto" }, { id: "READY", label: "Pronto", key: "ready_quantity", next: "DELIVERED", action: "Marcar entregue" }] as const;

function OrderItem({ item, order, busy, onChange }: { item: Item; order: Order; busy: boolean; onChange: (order: Order, item: Item, from: OrderStage, to: OrderStage, quantity: number, reason?: string) => void }) {
  const [quantity, setQuantity] = useState<Record<string, number>>({});
  const [cancel, setCancel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return <div className="space-y-3 border-t border-slate-100 py-4"><div className="flex justify-between gap-4"><div><p className="font-semibold">{item.quantity}× {item.name}</p><p className="text-sm text-slate-500">{item.variant_name}</p>{item.selections.map((s) => <p key={s.option_id} className="text-sm text-slate-500">{s.quantity}× {s.name}</p>)}{item.notes && <p className="mt-1 text-sm">Observação: {item.notes}</p>}</div><span className="text-sm font-medium">{money.format(item.line_total_cents / 100)}</span></div>
    {stages.map((stage) => {
      const count = item[stage.key]; if (!count) return null;
      const selected = Math.min(Math.max(Math.floor(quantity[stage.id] || 1), 1), count);
      return <div key={stage.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm font-medium">{stage.label}: {count}</span><label className="text-xs">Quantidade <input type="number" min={1} max={count} value={selected} onChange={(e) => setQuantity({ ...quantity, [stage.id]: Number(e.target.value) })} className="ml-1 w-16 rounded border bg-white p-1" /></label><button disabled={busy} className="rounded-lg bg-[#1d2540] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => onChange(order, item, stage.id, stage.next, selected)}>{stage.action}</button><button disabled={busy} className="rounded-lg border px-3 py-2 text-xs" onClick={() => { setCancel(cancel === stage.id ? null : stage.id); setReason(""); }}>Cancelar itens</button></div>{cancel === stage.id && <div className="mt-3 flex flex-wrap gap-2"><label className="min-w-48 flex-1 text-xs">Motivo do cancelamento<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Informe o motivo" className="mt-1 w-full rounded border bg-white p-2 text-sm" /></label><button disabled={busy || reason.trim().length < 3} className="self-end rounded-lg bg-red-700 px-3 py-2 text-xs text-white disabled:opacity-50" onClick={() => { onChange(order, item, stage.id, "CANCELLED", selected, reason.trim()); setCancel(null); }}>Confirmar cancelamento</button></div>}</div>;
    })}
  </div>;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latestLoad = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestLoad.current;
    try {
      const all: Order[] = []; let cursor: string | undefined;
      do { const page = await listOrders({ limit: 100, cursor }); all.push(...page.items); cursor = page.next_cursor ?? undefined; } while (cursor);
      if (request === latestLoad.current) { setOrders(all); setError(""); }
    } catch (err) { if (request === latestLoad.current) setError(err instanceof ApiError && err.status === 403 ? "Você não tem permissão para consultar pedidos." : "Não foi possível atualizar os pedidos. Tente novamente."); }
    finally { if (request === latestLoad.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const loadRef = latestLoad;
    const socket = io(new URL(API_URL).origin, { withCredentials: true });
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    socket.on("connect", refresh); socket.on("order:created", refresh); socket.on("order:updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 15000);
    void Promise.resolve().then(load);
    return () => { loadRef.current++; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); socket.disconnect(); };
  }, [load]);
  async function change(order: Order, item: Item, from: OrderStage, to: OrderStage, quantity: number, reason?: string) {
    setBusy(true); setError("");
    try { await transitionOrder(order.id, { expected_version: order.version, operations: [{ item_id: item.id, from_stage: from, to_stage: to, quantity, ...(reason ? { reason } : {}) }] }); await load(); }
    catch (err) { if (err instanceof ApiError && err.code === "ORDER_VERSION_CONFLICT") { await load(); setError("Este pedido mudou. Confira os dados atualizados antes de tentar novamente."); } else setError(err instanceof ApiError ? err.message : "Não foi possível atualizar o pedido."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8"><div><p className="text-xs font-bold uppercase tracking-widest text-[#719047]">Atendimento</p><h1 className="mt-2 text-3xl font-bold">Pedidos da mesa</h1><p className="mt-2 text-sm text-slate-500">Acompanhe o preparo e a entrega dos itens.</p></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{loading ? <p>Carregando pedidos...</p> : orders.length === 0 ? <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">Não há pedidos em andamento.</p> : <div className="grid items-start gap-4 lg:grid-cols-2">{orders.map((order) => <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold">{order.table_label}</h2><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString("pt-BR")}</p></div><p className="font-semibold">{money.format(order.active_total_cents / 100)}</p></div>{order.items.map((item) => <OrderItem key={item.id} item={item} order={order} busy={busy} onChange={change} />)}</article>)}</div>}</main>;
}
