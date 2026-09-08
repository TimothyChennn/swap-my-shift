// Minimal iCalendar (RFC 5545) parser: enough for a Qgenda subscription
// feed, which lists each shift as its own VEVENT. Recurrence rules are not
// expanded; Qgenda emits concrete instances.

export type IcsEvent = {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
};

export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (CRLF followed by a space or tab).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcsEvent[] = [];
  let current: Record<string, { params: Record<string, string>; value: string }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const event = toEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const [name, ...paramParts] = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const eq = part.indexOf("=");
      if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
    }
    current[name.toUpperCase()] = { params, value: line.slice(colon + 1) };
  }
  return events;
}

function toEvent(
  props: Record<string, { params: Record<string, string>; value: string }>
): IcsEvent | null {
  const dtstart = props.DTSTART;
  if (!dtstart) return null;
  const start = parseDate(dtstart.value, dtstart.params);
  if (!start) return null;

  let end: Date | null = null;
  if (props.DTEND) end = parseDate(props.DTEND.value, props.DTEND.params);
  else if (props.DURATION) end = new Date(start.getTime() + parseDuration(props.DURATION.value));
  else if (dtstart.params.VALUE === "DATE") end = new Date(start.getTime() + 24 * 3600 * 1000);
  if (!end || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);

  const summary = unescapeText(props.SUMMARY?.value ?? "").trim();
  const uid = props.UID?.value.trim() || `${start.toISOString()}|${summary}`;
  return { uid, summary, start, end };
}

/** DATE (20240101), floating/local (20240101T070000), UTC (...Z), or TZID. */
function parseDate(value: string, params: Record<string, string>): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const;

  if (z || params.VALUE === "DATE") return new Date(Date.UTC(...parts));
  if (params.TZID) return zonedToUtc(parts, params.TZID);
  // Floating time with no zone: treat as UTC.
  return new Date(Date.UTC(...parts));
}

/** Wall-clock time in an IANA zone -> UTC instant. Unknown zone -> UTC. */
function zonedToUtc(
  [y, mo, d, h, mi, s]: readonly [number, number, number, number, number, number],
  timeZone: string
): Date {
  const asUtc = Date.UTC(y, mo, d, h, mi, s);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date(asUtc);
  }
  // Two passes handle the DST edge where the first guess lands on the
  // wrong side of a transition.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p: Record<string, string> = {};
    for (const part of formatter.formatToParts(new Date(guess))) p[part.type] = part.value;
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    guess = asUtc - (wall - guess);
  }
  return new Date(guess);
}

/** ISO 8601 duration like P1D, PT12H, PT8H30M -> milliseconds. */
function parseDuration(value: string): number {
  const m = value.match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w = "0", d = "0", h = "0", mi = "0", s = "0"] = m;
  const ms =
    (((Number(w) * 7 + Number(d)) * 24 + Number(h)) * 60 + Number(mi)) * 60 * 1000 +
    Number(s) * 1000;
  return sign ? -ms : ms;
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}
