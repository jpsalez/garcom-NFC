import { z } from "zod";

const dayMs = 24 * 60 * 60 * 1000;
const date = z.iso.date();
const spanDays = ({ from, to }: { from: string; to: string }) =>
  (Date.parse(to) - Date.parse(from)) / dayMs + 1;

function range(maxDays: number) {
  return {
    shape: { from: date, to: date },
    check: (input: { from: string; to: string }) => input.from <= input.to && spanDays(input) <= maxDays,
    message: `Período inválido: from ≤ to e no máximo ${maxDays} dias`,
  };
}

const history = range(366);
const rebuild = range(92);

export const rangeQuery = z.strictObject(history.shape).refine(history.check, history.message);
export const summaryQuery = z
  .strictObject({ ...history.shape, compare: z.enum(["previous_period"]).optional() })
  .refine(history.check, history.message);
export const historyQuery = z
  .strictObject({ ...history.shape, granularity: z.enum(["day", "week", "month"]).default("day") })
  .refine(history.check, history.message);
export const forecastQuery = z.strictObject({
  target_date: date,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const alertsQuery = z.strictObject({ date: date.optional() });
export const rebuildSchema = z.strictObject(rebuild.shape).refine(rebuild.check, rebuild.message);

export type RangeQuery = z.infer<typeof rangeQuery>;
export type SummaryQuery = z.infer<typeof summaryQuery>;
export type HistoryQuery = z.infer<typeof historyQuery>;
export type ForecastQuery = z.infer<typeof forecastQuery>;
export type AlertsQuery = z.infer<typeof alertsQuery>;
export type RebuildInput = z.infer<typeof rebuildSchema>;
