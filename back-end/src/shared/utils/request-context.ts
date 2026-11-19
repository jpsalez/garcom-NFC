import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

const context = new AsyncLocalStorage<{ requestId: string }>();
export function logOperation(fields: Record<string, string | number | boolean | undefined>) {
  if (process.env.NODE_ENV !== "test")
    console.info(JSON.stringify({ request_id: context.getStore()?.requestId, ...fields }));
}
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID(),
    started = performance.now();
  res.setHeader("X-Request-Id", requestId);
  context.run({ requestId }, () => {
    res.once("finish", () =>
      logOperation({
        event: "http.request",
        method: req.method,
        route: typeof req.route?.path === "string" ? req.route.path : undefined,
        status_code: res.statusCode,
        error_code: typeof res.locals.error_code === "string" ? res.locals.error_code : undefined,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
        restaurant_id: req.user?.restaurantId ?? req.tableToken?.restaurantId,
        order_id: req.route?.path?.includes("orders/:id") ? String(req.params.id) : undefined,
      }),
    );
    next();
  });
}
