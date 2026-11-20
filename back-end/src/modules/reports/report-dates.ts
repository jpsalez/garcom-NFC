const dayMs = 24 * 60 * 60 * 1000;

export const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const formatDay = (value: Date) => value.toISOString().slice(0, 10);
export const addDays = (value: Date, days: number) => new Date(value.getTime() + days * dayMs);
export const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
