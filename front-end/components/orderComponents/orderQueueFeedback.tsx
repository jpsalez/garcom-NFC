import type { OrderQueue } from "@/hooks/useOrderQueue";
import type { Order } from "@/lib/orderTypes";

export const orderStages = [
  { id: "PENDING", label: "Aguardando", key: "pending_quantity", next: "PREPARING", action: "Iniciar preparo" },
  { id: "PREPARING", label: "Em preparo", key: "preparing_quantity", next: "READY", action: "Marcar pronto" },
  { id: "READY", label: "Pronto", key: "ready_quantity", next: "DELIVERED", action: "Entregue" },
] as const;

type Conflict = NonNullable<OrderQueue["conflict"]>;
type SingleOperation = NonNullable<Conflict["operation"]>;
type BatchOperations = NonNullable<Conflict["operations"]>;

function SingleConflictForm({
  conflict,
  order,
  disabled,
  change,
}: {
  conflict: { version: number; operation: SingleOperation };
  order: Order | undefined;
  disabled: boolean;
  change: OrderQueue["change"];
}) {
  const { operation } = conflict;
  const item = order?.items.find(({ id }) => id === operation.item_id);
  const stage = orderStages.find(({ id }) => id === operation.from_stage);
  const available = item && stage ? item[stage.key] : 0;

  if (!order || !item || !stage || order.version <= conflict.version || available <= 0) {
    return <p>A etapa já não tem unidades disponíveis para esta ação.</p>;
  }

  return (
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
      <button disabled={disabled} className="w-auto rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50">
        {operation.to_stage === "CANCELLED" ? "Confirmar cancelamento" : `Confirmar: ${stage.action}`}
      </button>
    </form>
  );
}

function BatchConflictForm({
  conflict,
  order,
  disabled,
  change,
}: {
  conflict: { version: number; operations: BatchOperations };
  order: Order | undefined;
  disabled: boolean;
  change: OrderQueue["change"];
}) {
  if (!order || order.version <= conflict.version) {
    return <p>A etapa já não tem unidades disponíveis para esta ação.</p>;
  }

  const nextOperations = conflict.operations.flatMap((operation) => {
    const item = order.items.find(({ id }) => id === operation.item_id);
    const stage = orderStages.find(({ id }) => id === operation.from_stage);
    const available = item && stage ? item[stage.key] : 0;
    if (!item || !stage || available <= 0) return [];
    return [{ ...operation, quantity: Math.min(operation.quantity, available) }];
  });

  if (nextOperations.length === 0) {
    return <p>A etapa já não tem unidades disponíveis para esta ação.</p>;
  }

  const targetLabel = orderStages.find(({ next }) => next === nextOperations[0].to_stage)?.action
    ?? "Confirmar alteração";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>
        {order.table_label}
      </p>
      <ul>
        {nextOperations.map((operation) => (
          <li key={operation.item_id}>
            {operation.quantity}× {order.items.find(({ id }) => id === operation.item_id)?.name}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void change(order, nextOperations)}
        className="w-auto rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
      >
        Confirmar: {targetLabel}
      </button>
    </div>
  );
}

function ConflictConfirmation({ queue }: { queue: OrderQueue }) {
  const { conflict, snapshot, waiting, disabled, change, dismissConflict } = queue;
  if (!conflict) return null;
  const order = snapshot?.items.find(({ id }) => id === conflict.orderId);

  return (
    <section aria-label="Confirmação da alteração" className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
      <p role="alert">Este pedido mudou. Confira as quantidades atuais antes de confirmar a ação.</p>
      {waiting ? <p role="status">Atualizando quantidades…</p>
        : conflict.operation ? (
          <SingleConflictForm
            conflict={{ version: conflict.version, operation: conflict.operation }}
            order={order}
            disabled={disabled}
            change={change}
          />
        ) : conflict.operations ? (
          <BatchConflictForm
            conflict={{ version: conflict.version, operations: conflict.operations }}
            order={order}
            disabled={disabled}
            change={change}
          />
        ) : <p>A etapa já não tem unidades disponíveis para esta ação.</p>}
      <button type="button" onClick={dismissConflict} className="w-auto rounded-lg border border-amber-400 px-3 py-2">Descartar ação</button>
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
