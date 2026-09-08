// Dates are stored as YYYY-MM-DD strings. These helpers build and read them in
// local time, because Date#toISOString() would shift days near midnight.

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateKey(
  key: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  }
): string {
  return fromDateKey(key).toLocaleDateString(undefined, options);
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Cells for a month grid: leading nulls so day 1 lands on its weekday. */
export function monthCells(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toDateKey(new Date(year, month, i + 1))
    ),
  ];
}

/** "7:00 AM – 7:00 PM", or "All day" for a midnight-to-midnight event. */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const isAllDay =
    end.getTime() - start.getTime() === 24 * 3600 * 1000 && start.getUTCHours() === 0;
  if (isAllDay) return "All day";
  const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, fmt)} – ${end.toLocaleTimeString(undefined, fmt)}`;
}
