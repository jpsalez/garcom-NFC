import type { restaurants } from "../../../generated/prisma/client.ts";

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
