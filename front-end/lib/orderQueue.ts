import type { OrderPage } from "@/lib/orderTypes";

type Snapshot = Pick<OrderPage, "items" | "server_time"> & { loadedAt: number };
export type OrderQueueState = {
  snapshot: Snapshot | null;
  degraded: boolean;
  denied: boolean;
  waiting: boolean;
};

export const emptyOrderQueue: OrderQueueState = {
  snapshot: null, degraded: false, denied: false, waiting: false,
};

export function createOrderQueue(
  load: () => Promise<Snapshot>,
  publish: (state: OrderQueueState) => void,
  isDenied: (error: unknown) => boolean,
  eventDelay = 120,
) {
  let state = emptyOrderQueue;
  let revision = 0;
  let reading = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function update(next: OrderQueueState) {
    state = next;
    publish(next);
  }

  function denyAccess() {
    if (stopped) return;
    revision++;
    update({ ...emptyOrderQueue, denied: true });
  }

  async function read() {
    if (stopped || reading || timer !== undefined) return;
    reading = true;
    const requested = revision;
    try {
      const snapshot = await load();
      // A fila inteira é descartada se houve mudança durante a paginação.
      if (!stopped && requested === revision) update({ ...emptyOrderQueue, snapshot });
    } catch (error) {
      if (!stopped && isDenied(error)) update({ ...emptyOrderQueue, denied: true });
      else if (!stopped && requested === revision) update({ ...state, degraded: true });
    } finally {
      reading = false;
      if (requested !== revision) void read();
    }
  }

  function refresh() {
    revision++;
    clearTimeout(timer);
    timer = undefined;
    void read();
  }

  return {
    refresh,
    poll() {
      if (!reading && timer === undefined) refresh();
    },
    event() {
      if (stopped) return;
      revision++;
      timer ??= setTimeout(() => {
        timer = undefined;
        void read();
      }, eventDelay);
    },
    requireRefresh() {
      if (stopped) return;
      update({ ...state, waiting: true });
      refresh();
    },
    denyAccess,
    canOperate() {
      return !stopped && !!state.snapshot && !state.waiting && !state.denied;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
