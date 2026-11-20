import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import type { Order } from "@/lib/orderTypes";
import { listDeviceOrders } from "@/services/orders";

type DeviceOrders = { token: string; orders: Order[]; error?: string; expired?: boolean };

export function useDeviceOrders(token?: string) {
  const [data, setData] = useState<DeviceOrders>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token) return;
    const deviceToken = token;
    let active = true;
    let reading = false;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      if (!active || document.hidden || reading || expired) return;
      clearTimeout(timer);
      reading = true;
      let poll = true;
      try {
        const { items } = await listDeviceOrders(deviceToken);
        if (!active) return;
        setData({ token: deviceToken, orders: items });
        poll = items.some(({ progress }) => !progress.is_completed && !progress.is_cancelled);
      } catch (err) {
        if (!active) return;
        expired = err instanceof ApiError && err.status === 401;
        const error = expired
          ? "A sessão da mesa encerrou. Reinicie o atendimento para continuar."
          : "Não foi possível atualizar seus pedidos. Tentaremos novamente.";
        setData((current) => ({
          token: deviceToken,
          orders: !expired && current?.token === deviceToken ? current.orders : [],
          expired,
          error,
        }));
      } finally {
        reading = false;
        if (active && poll && !expired && !document.hidden) timer = setTimeout(load, 10000);
      }
    }

    function onVisibility() {
      clearTimeout(timer);
      if (!document.hidden) void load();
    }

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, revision]);

  const current = data?.token === token ? data : undefined;

  return {
    orders: current?.orders ?? [],
    loading: !!token && !current,
    error: current?.error,
    expired: current?.expired,
    refresh: () => setRevision((value) => value + 1),
  };
}

export type DeviceOrderFeed = ReturnType<typeof useDeviceOrders>;
