/** Trim and cap user-controlled strings before DB or AI prompts. */
export function clampString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export function clampOptionalString(value: unknown, maxLen: number): string | undefined {
  const s = clampString(value, maxLen);
  return s || undefined;
}

export function clampNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Strip control chars that could break prompt structure. */
export function sanitizeForPrompt(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
}

export function wrapUserContent(label: string, content: string): string {
  return `[${label}]\n${sanitizeForPrompt(content)}\n[/${label}]`;
}

/** Reject private/link-local IP hostnames for outbound webhook URLs. */
export function isBlockedWebhookHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("metadata.")) return true;
  if (/^(0|10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true; // CGNAT
  // IPv6: loopback, unspecified, unique-local, link-local, IPv4-mapped.
  if (host === "::1" || host === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host) || host.startsWith("::ffff:")) return true;
  return false;
}
