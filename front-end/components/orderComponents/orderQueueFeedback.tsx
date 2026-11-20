import type { OrderQueue } from "@/hooks/useOrderQueue";

export const preparationStages = [
  { id: "PENDING", label: "Aguardando", key: "pending_quantity", next: "PREPARING", action: "Iniciar preparo" },
  { id: "PREPARING", label: "Em preparo", key: "preparing_quantity", next: "READY", action: "Marcar pronto" },
] as const;

export const orderStages = [
  ...preparationStages,
  { id: "READY", label: "Pronto", key: "ready_quantity", next: "DELIVERED", action: "Marcar entregue" },
] as const;

function ConflictConfirmation({ queue }: { queue: OrderQueue }) {
  const { conflict, snapshot, waiting, disabled, change, dismissConflict } = queue;
  if (!conflict) return null;
  const { operation } = conflict;
  const order = snapshot?.items.find(({ id }) => id === conflict.orderId);
  const item = order?.items.find(({ id }) => id === operation.item_id);
  const stage = orderStages.find(({ id }) => id === operation.from_stage);
  const available = item && stage ? item[stage.key] : 0;

  return (
    <section aria-label="Confirmação da alteração" className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
      <p role="alert">Este pedido mudou. Confira as quantidades atuais antes de confirmar a ação.</p>
      {waiting ? <p role="status">Atualizando quantidades…</p>
        : order && item && stage && order.version > conflict.version && available > 0 ? (
          <form key={order.version} className="flex flex-wrap items-center gap-3" onSubmit={(event) => {
            event.preventDefault();
            const quantity = Number(new FormData(event.currentTarget).get("quantity"));
            void change(order, { ...operation, quantity });
          }}>
            <p>{order.table_label} · {item.name} · {stage.label}: {available}</p>
            {operation.reason && <p>Motivo: {operation.reason}</p>}
            <label>
              Quantidade
              <input name="quantity" type="number" required min={1} max={available}
                defaultValue={Math.min(operation.quantity, available)} className="ml-2 w-16 rounded border bg-white p-1" />
            </label>
            <button disabled={disabled} className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50">
              {operation.to_stage === "CANCELLED" ? "Confirmar cancelamento" : `Confirmar: ${stage.action}`}
            </button>
          </form>
        ) : <p>A etapa já não tem unidades disponíveis para esta ação.</p>}
      <button type="button" onClick={dismissConflict} className="rounded-lg border border-amber-400 px-3 py-2">Descartar ação</button>
    </section>
  );
}

export default function OrderQueueFeedback({ queue }: { queue: OrderQueue }) {
  return (
    <>
      {queue.denied
        ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Você não tem permissão para consultar pedidos.</p>
        : queue.degraded && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Conexão degradada. A fila será sincronizada assim que possível.</p>}
      {queue.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{queue.error}</p>}
      <ConflictConfirmation queue={queue} />
    </>
  );
}
