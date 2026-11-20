import { useEffect, useRef } from "react";
import type { DeviceOrderFeed } from "@/hooks/useDeviceOrders";
import { clearDevice } from "@/lib/device";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function DeviceOrderSummary({ feed, code }: { feed: DeviceOrderFeed; code: string }) {
  const totals = feed.orders.reduce((total, { progress }) => ({
    ready: total.ready + progress.ready,
    delivered: total.delivered + progress.delivered,
    preparing: total.preparing + progress.preparing,
    pending: total.pending + progress.pending,
    cancelled: total.cancelled + progress.cancelled,
  }), { ready: 0, delivered: 0, preparing: 0, pending: 0, cancelled: 0 });

  return (
    <>
      <div role="status" className="space-y-1 text-sm">
        {feed.error && <p className="text-red-700">{feed.error}</p>}
        {totals.ready > 0 && <p className="font-semibold text-emerald-700">
          {totals.ready === 1
            ? "1 item pronto. O garçom vai levá-lo à mesa."
            : `${totals.ready} itens prontos. O garçom vai levá-los à mesa.`}
        </p>}
        {totals.delivered > 0 && <p>{totals.delivered} {totals.delivered === 1 ? "item entregue" : "itens entregues"}</p>}
        {totals.preparing > 0 && <p>{totals.preparing} em preparo</p>}
        {totals.pending > 0 && <p>{totals.pending} aguardando preparo</p>}
        {totals.cancelled > 0 && <p>{totals.cancelled} {totals.cancelled === 1 ? "item cancelado" : "itens cancelados"}</p>}
      </div>
      {feed.expired && <button type="button" className="mt-2 rounded-lg border px-4 py-2 text-sm font-semibold"
        onClick={() => { clearDevice(code); window.location.reload(); }}>
        Reiniciar atendimento
      </button>}
    </>
  );
}

export function DeviceOrderHistory({ feed }: { feed: DeviceOrderFeed }) {
  if (feed.loading) return <p role="status" className="mt-4 text-sm">Carregando pedidos…</p>;
  return (
    <>
      {!feed.orders.length && !feed.error && <p className="mt-4 text-sm">Nenhum pedido encontrado neste aparelho.</p>}
      {feed.orders.map((order) => (
        <article key={order.id} className="mt-4 rounded-lg border p-4">
          <h4 className="font-bold">Pedido de {new Date(order.created_at).toLocaleString("pt-BR")}</h4>
          {order.items.map((item) => (
            <div key={item.id} className="mt-3 text-sm">
              <p className="font-semibold">{item.quantity}× {item.name} · {item.variant_name}</p>
              <p className="text-gray-500">
                {[
                  [item.pending_quantity, "Aguardando"], [item.preparing_quantity, "Em preparo"],
                  [item.ready_quantity, "Pronto"], [item.delivered_quantity, "Entregue"],
                  [item.cancelled_quantity, "Cancelado"],
                ].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(" · ")}
              </p>
            </div>
          ))}
          <p className="mt-3 font-bold">Total ativo {money.format(order.active_total_cents / 100)}</p>
        </article>
      ))}
    </>
  );
}

export function DeviceOrderDialog({ feed, code, onClose }: {
  feed: DeviceOrderFeed;
  code: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="device-order-title"
      className="m-auto max-h-[90dvh] w-11/12 max-w-xl overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-lg backdrop:bg-black/60">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id="device-order-title" className="text-xl font-bold">Meus pedidos</h2>
        <button type="button" onClick={onClose} aria-label="Fechar pedidos"
          className="w-auto rounded-lg border px-3 py-2">✕</button>
      </header>
      <DeviceOrderSummary feed={feed} code={code} />
      <DeviceOrderHistory feed={feed} />
    </dialog>
  );
}
