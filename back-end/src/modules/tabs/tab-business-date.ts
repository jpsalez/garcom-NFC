import type { restaurants } from "../../../generated/prisma/client.ts";

export type BusinessClock = Pick<restaurants, "timezone" | "business_day_cutoff_minutes">;

export function businessDate(
  now: Date,
  { timezone, business_day_cutoff_minutes }: Pick<restaurants, "timezone" | "business_day_cutoff_minutes">,
) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(({ type }) => type === name)?.value);
  const beforeCutoff = value("hour") * 60 + value("minute") < business_day_cutoff_minutes;
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day") - Number(beforeCutoff)));
}

export function localHour(at: Date, timezone: string) {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(at)
    .find(({ type }) => type === "hour")?.value;
  return Number(hour);
}

// Diferença em ms entre o relógio local do fuso e o UTC naquele instante (-03:00 → -3 h).
function zoneOffsetMs(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(({ type }) => type === name)?.value);
  const local = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

// Instante em que começa o dia operacional (business_date em UTC 00:00), inverso de businessDate.
export function businessDayStart(
  day: Date,
  { timezone, business_day_cutoff_minutes }: Pick<restaurants, "timezone" | "business_day_cutoff_minutes">,
) {
  const wall = day.getTime() + business_day_cutoff_minutes * 60_000;
  // Segunda passada corrige o caso em que o horário de verão muda entre a estimativa e o resultado.
  const estimate = wall - zoneOffsetMs(new Date(wall), timezone);
  return new Date(wall - zoneOffsetMs(new Date(estimate), timezone));
}
