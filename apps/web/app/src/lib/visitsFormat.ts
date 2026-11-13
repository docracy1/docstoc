/** Formatting for the cookieless visitor card on /admin/analytics (components/admin/VisitsCard.tsx). */

/** Share as a whole percent, "–" when there is nothing to divide by. */
export function percent(part: number, whole: number): string {
  if (!whole) return "–";
  return `${Math.round((part / whole) * 100)}%`;
}

/** Seconds as "45 s", "2 min 05 s" or "1 h 03 min"; "–" when not measurable. */
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/** Flag emoji for a two-letter country code, "" for anything else. */
export function flag(country: string): string {
  if (!/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
