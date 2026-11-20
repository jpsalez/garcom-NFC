import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, ApiError } from "@/lib/api";
import { createOrderQueue, emptyOrderQueue, type OrderQueueState } from "@/lib/orderQueue";
import type { Order, OrderTransition } from "@/lib/orderTypes";
import { useSession, type User } from "@/lib/session";
import { getCurrentUser } from "@/services/auth";
import { listOpenOrders, transitionOrder } from "@/services/orders";

type Operation = OrderTransition["operations"][number];
type Conflict = { orderId: string; version: number; operation: Operation };

function isDenied(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function useOrderQueue(canAccess?: (user: User) => boolean) {
  const user = useSession()?.user;
  const userId = user?.id;
  const restaurantId = user?.restaurant_id;
  const scope = userId && restaurantId ? `${restaurantId}/${userId}` : null;
  const [data, setData] = useState<{ scope: string; state: OrderQueueState; connected: boolean }>();
  const [action, setAction] = useState<{ scope: string; busy?: boolean; error?: string; conflict?: Conflict }>();
  const connection = useRef<{
    scope: string;
    queue: ReturnType<typeof createOrderQueue>;
    checkAccess: () => Promise<void>;
    busy: boolean;
  } | null>(null);

  useEffect(() => {
    if (!scope) return;
    let state = emptyOrderQueue;
    // Painéis de pedido usam um socket próprio, inclusive após revogação da sala no servidor.
    const socket = io(new URL(API_URL).origin, { withCredentials: true, autoConnect: false, forceNew: true });
    const publish = () => setData({ scope, state, connected: socket.connected });

    async function checkAccess() {
      const current = await getCurrentUser();
      if (current.id !== userId || current.restaurant_id !== restaurantId || canAccess?.(current) === false) {
        throw new ApiError(403, "FORBIDDEN", "Você não tem permissão para consultar pedidos.");
      }
    }

    const queue = createOrderQueue(async () => {
      await checkAccess();
      const snapshot = await listOpenOrders();
      return { ...snapshot, loadedAt: performance.now() };
    }, (next) => {
      state = next;
      publish();
      if (next.snapshot && !next.waiting && !next.degraded && !socket.active) socket.connect();
    }, isDenied);

    connection.current = { scope, queue, checkAccess, busy: false };
    const visible = () => document.visibilityState === "visible";
    const refreshVisible = () => { if (visible()) queue.event(); };
    const onConnect = () => { publish(); queue.refresh(); };
    const onDisconnect = (reason: string) => {
      publish();
      if (reason === "io server disconnect") queue.requireRefresh();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", publish);
    socket.on("order:created", refreshVisible);
    socket.on("order:updated", refreshVisible);
    socket.connect();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const poll = setInterval(() => { if (visible()) queue.poll(); }, 15000);
    queue.refresh();

    return () => {
      connection.current = null;
      queue.stop();
      socket.removeAllListeners();
      socket.disconnect();
      clearInterval(poll);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [scope, userId, restaurantId, canAccess]);

  const current = data?.scope === scope ? data : undefined;
  const { snapshot, degraded, denied, waiting } = current?.state ?? emptyOrderQueue;
  const activeAction = action?.scope === scope ? action : undefined;

  async function change(order: Order, operation: Operation) {
    const active = connection.current;
    if (!active || active.scope !== scope || active.busy || !active.queue.canOperate()) return;
    active.busy = true;
    setAction({ scope, busy: true });
    try {
      await active.checkAccess();
      if (connection.current !== active || !active.queue.canOperate()) return;
      await transitionOrder(order.id, { expected_version: order.version, operations: [operation] });
    } catch (err) {
      if (connection.current !== active) return;
      if (isDenied(err)) active.queue.denyAccess();
      else if (err instanceof ApiError && err.code === "ORDER_VERSION_CONFLICT") {
        setAction({ scope, conflict: { orderId: order.id, version: order.version, operation } });
      } else {
        setAction({ scope, error: err instanceof ApiError ? err.message : "Não foi possível atualizar o pedido." });
      }
    } finally {
      active.busy = false;
      if (connection.current === active) {
        active.queue.requireRefresh();
        setAction((previous) => previous?.busy ? undefined : previous);
      }
    }
  }

  return {
    snapshot,
    denied,
    degraded: degraded || (!!current && !current.connected),
    disabled: !snapshot || waiting || denied || !!activeAction?.busy,
    waiting,
    change,
    conflict: denied ? undefined : activeAction?.conflict,
    dismissConflict: () => setAction(undefined),
    error: denied ? undefined : activeAction?.error,
  };
}

export type OrderQueue = ReturnType<typeof useOrderQueue>;
