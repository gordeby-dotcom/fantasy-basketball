// Display helpers. Dates are YYYY-MM-DD strings in US Eastern time.

export function dayShort(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function dayNum(date: string): string {
  return String(Number(date.slice(8, 10)));
}

export function monthDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function pts(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function signed(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("en-US")}`;
}

export function ago(ms: number, now = Date.now()): string {
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export function injuryBadge(status: string): { label: string; tone: "bad" | "warn" } | null {
  if (status === "OUT") return { label: "OUT", tone: "bad" };
  if (status === "DAY_TO_DAY") return { label: "DTD", tone: "warn" };
  if (status === "SUSPENSION") return { label: "SUSP", tone: "bad" };
  return null;
}
