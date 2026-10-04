import { getAttribution } from "./analytics";
import type { Invoice } from "../pages/tool/types";

export type FirstWinPath = "chase" | "ssl" | "cert";

const FIRST_WIN_KEY = "docstoc_first_win";
export const DEMO_INVOICE_ID = "docstoc-demo-invoice";

/** Stable demo row so free users can finish a chase without CSV/real data. */
export function buildDemoInvoice(): Invoice {
  const due = new Date();
  due.setDate(due.getDate() - 14);
  const dueDate = due.toISOString().slice(0, 10);
  return {
    id: DEMO_INVOICE_ID,
    clientName: "Acme Corp",
    amount: 1250,
    dueDate,
    status: "open",
    generating: false,
    rewriting: null,
    draft: buildDemoDraft(dueDate),
  };
}

export function buildDemoDraft(dueDate: string): { subject: string; body: string } {
  return {
    subject: "Friendly reminder: invoice #1042 is past due",
    body: [
      "Hi Jordan,",
      "",
      `Just a quick note that invoice #1042 for $1,250.00 was due on ${dueDate} and still shows as unpaid on our side.`,
      "",
      "If you've already sent payment, thank you — please ignore this note. Otherwise, you can pay using the details on the original invoice, or reply here if anything looks off.",
      "",
      "Thanks,",
      "Alex",
    ].join("\n"),
  };
}

/** Map first-touch attribution / landing intent to a single activation path. */
export function resolveFirstWinPath(attribution = getAttribution()): FirstWinPath {
  const a = (attribution || "").toLowerCase();
  if (/(^|\/|_|-)(ssl|tls|https|acme|custom-?hostname|managed-?ssl)/.test(a) || a.includes("ssl")) {
    return "ssl";
  }
  if (
    /(document.?cert|certif|sha-?256|verify|company.?badge)/.test(a) ||
    a.includes("certificate")
  ) {
    // SSL landings often contain "certificate" — prefer SSL when both match.
    if (a.includes("ssl") || a.includes("tls")) return "ssl";
    return "cert";
  }
  return "chase";
}

export function hasLocalFirstWin(): boolean {
  try {
    return !!localStorage.getItem(FIRST_WIN_KEY);
  } catch {
    return false;
  }
}

export function getLocalFirstWin(): FirstWinPath | null {
  try {
    const v = localStorage.getItem(FIRST_WIN_KEY);
    if (v === "chase" || v === "ssl" || v === "cert") return v;
    return null;
  } catch {
    return null;
  }
}

export function markFirstWin(path: FirstWinPath): void {
  try {
    if (localStorage.getItem(FIRST_WIN_KEY)) return;
    localStorage.setItem(FIRST_WIN_KEY, path);
  } catch {
    /* ignore */
  }
}

/** Local chase board already recorded a real send/copy. */
export function hasLocalChaseWin(invoices: Invoice[]): boolean {
  return invoices.some((inv) => {
    const status = (inv.lastChaseStatus || "").toLowerCase();
    return (
      status === "mailto" ||
      status === "copied" ||
      status === "gmail_draft" ||
      status === "tracked_html" ||
      status === "sent"
    );
  });
}
