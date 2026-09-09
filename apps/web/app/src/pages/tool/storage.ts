import { TOOL_STORAGE_KEY } from "./constants";
import type { Invoice, StoredInvoice } from "./types";

export function loadStoredInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(TOOL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredInvoice[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r?.clientName && Number.isFinite(r.amount) && r.dueDate)
      .map((r) => ({
        id: r.id || crypto.randomUUID(),
        clientName: r.clientName,
        amount: r.amount,
        dueDate: r.dueDate,
        status: r.status === "paid" ? "paid" : "open",
        paidAt: r.paidAt ?? null,
        draft: r.draft,
        lastChaseStatus: r.lastChaseStatus ?? null,
        lastChaseAt: r.lastChaseAt ?? null,
        paymentMethod: r.paymentMethod ?? null,
        paymentUrl: r.paymentUrl ?? null,
        generating: false,
        rewriting: null,
      }));
  } catch {
    return [];
  }
}

export function persistInvoices(invoices: Invoice[]) {
  const slim: StoredInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    clientName: inv.clientName,
    amount: inv.amount,
    dueDate: inv.dueDate,
    status: inv.status,
    paidAt: inv.paidAt ?? null,
    draft: inv.draft,
    lastChaseStatus: inv.lastChaseStatus ?? null,
    lastChaseAt: inv.lastChaseAt ?? null,
    paymentMethod: inv.paymentMethod ?? null,
    paymentUrl: inv.paymentUrl ?? null,
  }));
  localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(slim));
}

/** Upsert a chase-board row (e.g. after marking an outgoing invoice Sent). */
export function upsertStoredInvoice(row: StoredInvoice): void {
  const existing = loadStoredInvoices();
  const next: Invoice[] = [
    {
      id: row.id,
      clientName: row.clientName,
      amount: row.amount,
      dueDate: row.dueDate,
      status: row.status ?? "open",
      paidAt: row.paidAt ?? null,
      lastChaseStatus: row.lastChaseStatus ?? null,
      lastChaseAt: row.lastChaseAt ?? null,
      paymentMethod: row.paymentMethod ?? null,
      paymentUrl: row.paymentUrl ?? null,
      generating: false,
      rewriting: null,
    },
    ...existing.filter((inv) => inv.id !== row.id),
  ];
  persistInvoices(next);
}
