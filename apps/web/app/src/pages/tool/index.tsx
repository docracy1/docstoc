import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import { useT } from "../../lib/i18n";
import { matchesChaseView, parseChaseView, chaseViewTitleKey } from "./chaseViews";
import {
  CLOUD_IMPORT_STORAGE_KEY,
  PENDING_INVOICES_STORAGE_KEY,
  PENDING_TEMPLATE_STORAGE_KEY,
  createTrackedCopy,
  exportAgingToGoogleSheet,
  findGmailClientReply,
  generateEmail,
  generateReply,
  generateSequence,
  generateSms,
  generateThankYou,
  getEvidencePack,
  importCloudConnectorFile,
  importGoogleSheet,
  listCloudConnectorFiles,
  listCloudConnectors,
  listReminders,
  markAgingChase,
  markInvoicePaid,
  listAging,
  notifyWebhook,
  recordChaseEvent,
  generateDemandLetter,
  generateReplySmart,
  getInvoiceTimeline,
  rewriteEmail,
  scheduleFollowUpReminder,
  saveGmailDraft,
  snoozeReminder,
  syncAging,
  syncReminderToGoogleCalendar,
  trackingStats,
  updateReminderStatus,
  createSoxApproval,
  getSoxSettings,
  type Account,
  type ChaseReminder,
  type ChaseSequence,
  type CloudFile,
  type CloudProvider,
  type RewriteAction,
  ApiError,
} from "../../lib/api";
import { getUsedCount, incrementUsedCount, isAtLimit, FREE_LIMIT } from "../../lib/usage";
import { track } from "../../lib/analytics";
import { openMailtoClient } from "../../lib/mailto";
import { daysOverdue } from "../../lib/dates";
import { formatUsWeekday } from "../../lib/locale";
import { CLOUD_LABELS, PAYMENT_LINK_STORAGE_KEY } from "./constants";
import { parseCsvRows } from "./csvImport";
import { loadStoredInvoices, persistInvoices } from "./storage";
import type { Invoice, PendingCloudImport } from "./types";
import { WelcomeBlock } from "./components/WelcomeBlock";
import { UsageBar } from "./components/UsageBar";
import { AgingOverviewPanel } from "./components/AgingOverviewPanel";
import { CloudImportConfirm } from "./components/CloudImportConfirm";
import { InvoiceIntakePanel } from "./components/InvoiceIntakePanel";
import { PdfPickerPanel } from "./components/PdfPickerPanel";
import { InvoiceCard } from "./components/InvoiceCard";
import { DueTodayBanner } from "./components/DueTodayBanner";
import { googlePickerEnabled, openGoogleDrivePicker } from "../../lib/googlePicker";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(isoDate: string): number {
  const target = new Date(isoDate + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000) + 1);
}

function fillTemplate(
  text: string,
  row: { clientName: string; amount: number; dueDate: string }
): string {
  return text
    .replace(/\[Client name\]/gi, row.clientName)
    .replace(/\[Amount\]/gi, String(row.amount))
    .replace(/\[Due date\]/gi, row.dueDate)
    .replace(/\[Invoice #\]/gi, "")
    .replace(/\[Payment link(?: or bank details)?\]/gi, "")
    .replace(/\[Your name\]/gi, "")
    .replace(/\[Your company\]/gi, "")
    .replace(/\[New deadline date\]/gi, "")
    .replace(/\[Final internal deadline\]/gi, "");
}

export default function Tool({ account }: { account: Account | null }) {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadStoredInvoices());
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentLink, setPaymentLink] = useState(() => {
    try {
      return localStorage.getItem(PAYMENT_LINK_STORAGE_KEY) || account?.paymentLink || "";
    } catch {
      return account?.paymentLink || "";
    }
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiDraft, setMultiDraft] = useState<{ subject: string; body: string } | null>(null);
  const [multiBusy, setMultiBusy] = useState(false);
  const [multiError, setMultiError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(getUsedCount());
  const [pendingImport, setPendingImport] = useState<PendingCloudImport | null>(null);
  const [importClient, setImportClient] = useState("");
  const [importAmount, setImportAmount] = useState("");
  const [importDue, setImportDue] = useState("");
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [pdfProviders, setPdfProviders] = useState<CloudProvider[]>([]);
  const [pdfProvider, setPdfProvider] = useState<CloudProvider | null>(null);
  const [pdfFiles, setPdfFiles] = useState<CloudFile[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [dueTodayReminders, setDueTodayReminders] = useState<ChaseReminder[]>([]);
  const [openStatsMap, setOpenStatsMap] = useState<
    Record<string, { openCount: number; clickCount: number; lastOpenAt: string | null }>
  >({});
  const [sheetId, setSheetId] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetMsg, setSheetMsg] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [soxSodRequired, setSoxSodRequired] = useState(false);
  const generateAbortRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledGenerateRef = useRef<Set<string>>(new Set());
  const isPaid = account?.plan !== "free" && account?.plan != null;
  const isPro = account?.plan === "business";

  useEffect(() => {
    if (!isPro) {
      setSoxSodRequired(false);
      return;
    }
    getSoxSettings()
      .then((res) => setSoxSodRequired(!!res.settings.sodRequired))
      .catch(() => setSoxSodRequired(false));
  }, [isPro, account?.email]);

  async function refreshTimeline(invoiceId: string) {
    if (!isPaid) return;
    try {
      const { events } = await getInvoiceTimeline(invoiceId);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, timeline: events } : inv))
      );
    } catch {
      /* ignore */
    }
  }

  async function logChaseEvent(
    invoice: Invoice,
    eventType: "sent" | "copied" | "mailto" | "drafted",
    subject?: string,
    body?: string
  ) {
    if (!isPaid) return;
    try {
      await recordChaseEvent({
        agingInvoiceId: invoice.id,
        clientName: invoice.clientName,
        eventType,
        subject,
        body,
      });
      await refreshTimeline(invoice.id);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!isPaid) {
      setGoogleConnected(false);
      return;
    }
    listCloudConnectors()
      .then((res) => setGoogleConnected(res.connectors.some((c) => c.provider === "google" && c.connected)))
      .catch(() => setGoogleConnected(false));
  }, [isPaid]);

  // Pull aging rows created from outgoing invoices (Mark sent) into the chase board.
  useEffect(() => {
    if (!isPaid) return;
    let cancelled = false;
    listAging()
      .then((res) => {
        if (cancelled) return;
        setInvoices((prev) => {
          const byId = new Map(prev.map((inv) => [inv.id, inv]));
          for (const row of res.invoices) {
            const existing = byId.get(row.id);
            const status = row.status === "paid" ? "paid" : "open";
            if (existing) {
              byId.set(row.id, {
                ...existing,
                clientName: row.clientName,
                amount: row.amount,
                dueDate: row.dueDate,
                status,
                paidAt: row.paidAt ?? existing.paidAt ?? null,
                draft: existing.draft,
                generating: existing.generating,
                error: existing.error,
                lastChaseStatus: row.lastChaseStatus ?? existing.lastChaseStatus ?? null,
                lastChaseAt: row.lastChaseAt ?? existing.lastChaseAt ?? null,
              });
            } else {
              byId.set(row.id, {
                id: row.id,
                clientName: row.clientName,
                amount: row.amount,
                dueDate: row.dueDate,
                status,
                paidAt: row.paidAt ?? null,
                lastChaseStatus: row.lastChaseStatus,
                lastChaseAt: row.lastChaseAt,
                generating: false,
                rewriting: null,
              });
            }
          }
          return Array.from(byId.values());
        });
      })
      .catch(() => {
        /* offline / free fallback — local rows still work */
      });
    return () => {
      cancelled = true;
    };
  }, [isPaid, account?.email]);

  useEffect(() => {
    persistInvoices(invoices);
  }, [invoices]);

  // Never restore a stuck "Writing…" state from a prior tab/session.
  useEffect(() => {
    setInvoices((prev) => {
      if (!prev.some((inv) => inv.generating)) return prev;
      return prev.map((inv) => (inv.generating ? { ...inv, generating: false } : inv));
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PAYMENT_LINK_STORAGE_KEY, paymentLink);
    } catch {
      /* ignore */
    }
  }, [paymentLink]);

  useEffect(() => {
    if (account?.paymentLink && !paymentLink) {
      setPaymentLink(account.paymentLink);
    }
  }, [account?.paymentLink]);

  useEffect(() => {
    if (!isPaid) {
      setDueTodayReminders([]);
      setOpenStatsMap({});
      return;
    }
    const today = todayIso();
    listReminders({ from: today, to: today, status: "planned" })
      .then((res) => setDueTodayReminders(res.reminders))
      .catch(() => setDueTodayReminders([]));
  }, [isPaid, invoices.length]);

  useEffect(() => {
    if (!isPaid || invoices.length === 0) return;
    const ids = invoices.map((i) => i.id);
    trackingStats(ids)
      .then((res) => setOpenStatsMap(res.stats))
      .catch(() => setOpenStatsMap({}));
  }, [isPaid, invoices.length]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    const el = document.getElementById(`invoice-${focus}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams, invoices.length]);

  // Solo+: sync aging snapshot to D1 (also creates clients by name)
  const agingSnapshot = invoices
    .map(
      (inv) =>
        `${inv.id}|${inv.clientName}|${inv.amount}|${inv.dueDate}|${inv.lastChaseStatus ?? ""}|${inv.lastChaseAt ?? ""}`
    )
    .join(";");

  useEffect(() => {
    if (!isPaid || invoices.length === 0) return;
    const timer = window.setTimeout(() => {
      void syncAging(
        invoices.map((inv) => ({
          id: inv.id,
          clientName: inv.clientName,
          amount: inv.amount,
          dueDate: inv.dueDate,
          status: inv.status ?? "open",
          paidAt: inv.paidAt ?? null,
          lastChaseStatus: inv.lastChaseStatus ?? null,
          lastChaseAt: inv.lastChaseAt ?? null,
        })),
        true
      ).catch(() => {});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [isPaid, agingSnapshot]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CLOUD_IMPORT_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CLOUD_IMPORT_STORAGE_KEY);
      const parsed = JSON.parse(raw) as PendingCloudImport;
      if (!parsed?.file?.name || !parsed?.hints) return;
      setPendingImport(parsed);
      setImportClient(parsed.hints.clientName ?? "");
      setImportAmount(
        parsed.hints.amount != null && Number.isFinite(parsed.hints.amount)
          ? String(parsed.hints.amount)
          : ""
      );
      // Default due date to today when the PDF/filename didn't yield one — form requires a date
      setImportDue(parsed.hints.dueDate ?? new Date().toISOString().slice(0, 10));
      track("fields_added", { source: "cloud_pdf_pending" });
    } catch {
      sessionStorage.removeItem(CLOUD_IMPORT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const rawInvoices = sessionStorage.getItem(PENDING_INVOICES_STORAGE_KEY);
      const rawTemplate = sessionStorage.getItem(PENDING_TEMPLATE_STORAGE_KEY);
      sessionStorage.removeItem(PENDING_INVOICES_STORAGE_KEY);
      sessionStorage.removeItem(PENDING_TEMPLATE_STORAGE_KEY);
      if (!rawInvoices) return;
      const rows = JSON.parse(rawInvoices) as { clientName: string; amount: number; dueDate: string }[];
      if (!Array.isArray(rows) || rows.length === 0) return;
      let template: { subject: string; body: string } | null = null;
      if (rawTemplate) {
        try {
          const parsed = JSON.parse(rawTemplate) as { subject?: string; body?: string };
          if (parsed.subject && parsed.body) template = { subject: parsed.subject, body: parsed.body };
        } catch {
          /* ignore */
        }
      }
      setInvoices((prev) => [
        ...prev,
        ...rows
          .filter((r) => r.clientName && Number.isFinite(r.amount) && r.dueDate)
          .map((r) => {
            const draft = template
              ? {
                  subject: fillTemplate(template.subject, r),
                  body: fillTemplate(template.body, r),
                }
              : undefined;
            return {
              id: crypto.randomUUID(),
              clientName: r.clientName,
              amount: r.amount,
              dueDate: r.dueDate,
              generating: false,
              rewriting: null,
              draft,
            };
          }),
      ]);
    } catch {
      sessionStorage.removeItem(PENDING_INVOICES_STORAGE_KEY);
      sessionStorage.removeItem(PENDING_TEMPLATE_STORAGE_KEY);
    }
  }, []);

  function addInvoice(clientName: string, amount: number, dueDate: string) {
    setInvoices((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        clientName,
        amount,
        dueDate,
        generating: false,
        rewriting: null,
      },
    ]);
  }

  function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!clientName.trim() || !Number.isFinite(amt) || !dueDate) {
      track("field_error", { source: "manual" });
      return;
    }
    addInvoice(clientName.trim(), amt, dueDate);
    track("fields_added", { source: "manual" });
    setClientName("");
    setAmount("");
    setDueDate("");
  }

  function confirmCloudImport(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(importAmount);
    if (!importClient.trim() || !Number.isFinite(amt) || !importDue) {
      track("field_error", { source: "cloud_pdf" });
      return;
    }
    addInvoice(importClient.trim(), amt, importDue);
    track("fields_added", { source: "cloud_pdf" });
    setPendingImport(null);
    setImportClient("");
    setImportAmount("");
    setImportDue("");
  }

  function dismissCloudImport() {
    setPendingImport(null);
    setImportClient("");
    setImportAmount("");
    setImportDue("");
  }

  async function openPdfPicker() {
    if (!isPaid) return;
    setShowPdfPicker(true);
    setPdfBusy(true);
    setPdfError(null);
    setPdfFiles([]);
    setPdfProvider(null);
    try {
      const res = await listCloudConnectors();
      const connected = res.connectors.filter((c) => c.connected).map((c) => c.provider);
      setPdfProviders(connected);
      if (connected.length === 1) {
        await loadPdfFiles(connected[0]);
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : t("tool.connectorsLoadFailed"));
    } finally {
      setPdfBusy(false);
    }
  }

  async function loadPdfFiles(provider: CloudProvider) {
    setPdfBusy(true);
    setPdfError(null);
    setPdfProvider(provider);
    try {
      const res = await listCloudConnectorFiles(provider);
      setPdfFiles(res.files);
    } catch (err) {
      setPdfFiles([]);
      setPdfError(err instanceof Error ? err.message : t("tool.pdfsListFailed"));
    } finally {
      setPdfBusy(false);
    }
  }

  async function importPdfFromTool(file: CloudFile) {
    if (!pdfProvider || !isPaid) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const result = await importCloudConnectorFile(pdfProvider, {
        id: file.id,
        path: file.path,
      });
      setPendingImport({
        ...result,
        provider: pdfProvider,
        providerLabel: CLOUD_LABELS[pdfProvider],
      });
      setImportClient(result.hints.clientName ?? "");
      setImportAmount(
        result.hints.amount != null && Number.isFinite(result.hints.amount)
          ? String(result.hints.amount)
          : ""
      );
      setImportDue(result.hints.dueDate ?? new Date().toISOString().slice(0, 10));
      setShowPdfPicker(false);
      track("fields_added", { source: "cloud_pdf_pending" });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : t("tool.pdfImportFailed"));
    } finally {
      setPdfBusy(false);
    }
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    track("upload_started", { filename: file.name });
    Papa.parse<string[]>(file, {
      complete: (result) => {
        if (result.errors?.length) {
          track("upload_failed", { reason: "parse_error", errors: result.errors.length });
        }
        const rows = result.data.filter((r) => r.some((c) => String(c ?? "").trim()));
        if (rows.length === 0) {
          track("upload_failed", { reason: "no_valid_rows" });
          return;
        }

        const parsed = parseCsvRows(rows);
        if (parsed.length > 0) {
          for (const row of parsed) {
            addInvoice(row.clientName, row.amount, row.dueDate);
          }
          track("invoice_uploaded", { rows: parsed.length });
          track("fields_added", { source: "csv", rows: parsed.length });
        } else {
          track("upload_failed", { reason: "no_valid_rows" });
        }
      },
      error: () => {
        track("upload_failed", { reason: "file_error" });
      },
    });
    e.target.value = "";
  }

  async function handleGenerate(invoiceId: string) {
    if (!isPaid && isAtLimit()) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, generating: false, error: t("usage.wallTitle", { limit: FREE_LIMIT }) }
            : inv
        )
      );
      return;
    }

    setMultiDraft(null);
    setMultiError(null);

    const link = paymentLink.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      const message = t("tool.paymentLinkInvalid");
      setPaymentLinkError(message);
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, generating: false, error: message } : inv
        )
      );
      document.getElementById("payment-link")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("payment-link")?.focus();
      return;
    }
    setPaymentLinkError(null);

    let row: (typeof invoices)[number] | undefined;
    setInvoices((prev) => {
      row = prev.find((inv) => inv.id === invoiceId);
      if (!row) return prev;
      return prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, generating: true, error: undefined } : inv
      );
    });
    if (!row) return;

    const controller = new AbortController();
    generateAbortRef.current.get(invoiceId)?.abort();
    generateAbortRef.current.set(invoiceId, controller);

    try {
      const draft = await generateEmail(
        {
          client_name: row.clientName,
          invoice_amount: row.amount,
          days_overdue: daysOverdue(row.dueDate),
          payment_link: link || undefined,
          invoices: [
            {
              client_name: row.clientName,
              invoice_amount: row.amount,
              days_overdue: daysOverdue(row.dueDate),
              due_date: row.dueDate,
            },
          ],
        },
        { signal: controller.signal }
      );
      if (!isPaid) {
        if (typeof draft.remaining === "number") setUsedCount(5 - draft.remaining);
        else setUsedCount(incrementUsedCount());
      }
      const now = new Date().toISOString();
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                draft,
                generating: false,
                lastChaseStatus: "drafted",
                lastChaseAt: now,
              }
            : inv
        )
      );
      if (isPaid) void markAgingChase(invoiceId, "drafted").catch(() => {});
      track("chase_drafted", { source: "single" });
      if (parseChaseView(searchParams.get("view")) === "overdue") {
        setSearchParams({ view: "waiting", focus: invoiceId });
      }
    } catch (err) {
      track("send_failed", { source: "generate" });
      if (err instanceof Error && err.name === "AbortError" && cancelledGenerateRef.current.delete(invoiceId)) {
        return;
      }
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.name === "AbortError"
            ? t("tool.generateTimeout")
            : err instanceof Error && /failed to fetch|networkerror|blocked/i.test(err.message)
              ? t("tool.generateBlocked")
              : err instanceof Error
                ? err.message
                : t("common.error");
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                generating: false,
                error: message,
              }
            : inv
        )
      );
    } finally {
      if (generateAbortRef.current.get(invoiceId) === controller) {
        generateAbortRef.current.delete(invoiceId);
      }
    }
  }

  function cancelGenerate(invoiceId: string) {
    cancelledGenerateRef.current.add(invoiceId);
    generateAbortRef.current.get(invoiceId)?.abort();
    generateAbortRef.current.delete(invoiceId);
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, generating: false, error: undefined } : inv
      )
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOverdue() {
    setSelectedIds(new Set(invoices.map((inv) => inv.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setMultiDraft(null);
    setMultiError(null);
  }

  async function handleMultiDraft() {
    const selected = invoices.filter((inv) => selectedIds.has(inv.id));
    if (selected.length < 1) {
      setMultiError(t("tool.selectOne"));
      return;
    }

    // One invoice → same path as the card's "Generate follow-up" (draft on card below, not multi box).
    if (selected.length === 1) {
      setMultiDraft(null);
      setMultiError(null);
      await handleGenerate(selected[0].id);
      scrollToInvoice(selected[0].id);
      return;
    }

    if (!isPaid && isAtLimit()) {
      setMultiError(t("usage.wallTitle", { limit: FREE_LIMIT }));
      return;
    }

    for (const id of selectedIds) {
      generateAbortRef.current.get(id)?.abort();
      generateAbortRef.current.delete(id);
    }

    setMultiBusy(true);
    setMultiError(null);
    setMultiDraft(null);
    setInvoices((prev) =>
      prev.map((inv) =>
        selectedIds.has(inv.id) ? { ...inv, generating: true, error: undefined } : inv
      )
    );
    try {
      const names = [...new Set(selected.map((s) => s.clientName))];
      const clientLabel =
        names.length === 1 ? names[0] : names.length <= 3 ? names.join(" / ") : "your team";
      const draft = await generateEmail({
        client_name: clientLabel,
        invoice_amount: selected.reduce((s, i) => s + i.amount, 0),
        days_overdue: Math.max(...selected.map((i) => daysOverdue(i.dueDate))),
        payment_link: paymentLink.trim() || undefined,
        invoices: selected.map((i) => ({
          client_name: i.clientName,
          invoice_amount: i.amount,
          days_overdue: daysOverdue(i.dueDate),
          due_date: i.dueDate,
        })),
      });
      if (!isPaid) setUsedCount(incrementUsedCount());
      const now = new Date().toISOString();
      setMultiDraft(draft);
      setInvoices((prev) =>
        prev.map((inv) =>
          selectedIds.has(inv.id)
            ? {
                ...inv,
                draft,
                lastChaseStatus: "multi-drafted",
                lastChaseAt: now,
                generating: false,
              }
            : inv
        )
      );
      if (isPaid) {
        for (const id of selectedIds) {
          void markAgingChase(id, "multi-drafted").catch(() => {});
        }
      }
      track("chase_drafted", { source: "multi", count: selected.length });
    } catch (err) {
      track("send_failed", { source: "multi" });
      setMultiError(err instanceof Error ? err.message : t("common.error"));
      setInvoices((prev) =>
        prev.map((inv) =>
          selectedIds.has(inv.id) ? { ...inv, generating: false } : inv
        )
      );
    } finally {
      setMultiBusy(false);
    }
  }

  function scrollToInvoice(id: string) {
    const el = document.getElementById(`invoice-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRewrite(invoiceId: string, action: RewriteAction) {
    if (!isPaid) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice?.draft) return;

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: action, error: undefined } : inv
      )
    );

    try {
      const draft = await rewriteEmail({
        subject: invoice.draft.subject,
        body: invoice.draft.body,
        action,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, draft, rewriting: null } : inv
        )
      );
    } catch (err) {
      track("send_failed", { source: "rewrite", action });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleThankYou(invoiceId: string) {
    if (!isPaid) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "thankyou", error: undefined } : inv
      )
    );
    try {
      const draft = await generateThankYou({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, draft, rewriting: null } : inv
        )
      );
    } catch (err) {
      track("send_failed", { source: "thankyou" });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleReply(invoiceId: string) {
    if (!isPaid) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice?.clientReply?.trim()) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "reply", error: undefined } : inv
      )
    );
    try {
      const draft = await generateReply({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
        days_overdue: daysOverdue(invoice.dueDate),
        client_message: invoice.clientReply.trim(),
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, draft, rewriting: null } : inv
        )
      );
    } catch (err) {
      track("send_failed", { source: "reply" });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleReplySmart(invoiceId: string, fromGmail = false) {
    if (!isPro) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!fromGmail && !invoice?.clientReply?.trim()) return;
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "replySmart", error: undefined } : inv
      )
    );
    try {
      const result = await generateReplySmart({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
        days_overdue: daysOverdue(invoice.dueDate),
        client_message: fromGmail ? undefined : invoice.clientReply?.trim(),
        fetch_from_gmail: fromGmail || undefined,
        payment_link: paymentLink || account?.paymentLink || undefined,
        aging_invoice_id: invoice.id,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                draft: { subject: result.subject, body: result.body },
                replyInsight: {
                  classification: result.classification,
                  summary: result.summary,
                  suggestedAction: result.suggestedAction,
                  promisedPayDate: result.promisedPayDate,
                },
                rewriting: null,
              }
            : inv
        )
      );
      void refreshTimeline(invoiceId);
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleFetchGmailReply(invoiceId: string) {
    if (!isPro) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, rewriting: "reply", error: undefined } : inv))
    );
    try {
      const found = await findGmailClientReply({ clientName: invoice.clientName });
      if (!found.found || !found.snippet) {
        throw new Error(t("tool.noGmailReply"));
      }
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, clientReply: found.snippet ?? "", rewriting: null }
            : inv
        )
      );
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("tool.gmailLookupFailed"),
              }
            : inv
        )
      );
    }
  }

  async function handleSaveGmailDraft(invoice: Invoice) {
    if (!isPaid || !invoice.draft) return;
    try {
      let to = invoice.clientName.includes("@") ? invoice.clientName.trim() : "";
      if (!to) {
        const prompted = window.prompt(t("tool.gmailRecipientPrompt"), "");
        if (!prompted?.includes("@")) return;
        to = prompted.trim();
      }
      await saveGmailDraft({
        to,
        subject: invoice.draft.subject,
        body: invoice.draft.body,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? {
                ...inv,
                trackingNote: t("tool.gmailDraftSaved"),
                lastChaseStatus: "gmail_draft",
                lastChaseAt: new Date().toISOString(),
              }
            : inv
        )
      );
      void logChaseEvent(invoice, "drafted", invoice.draft.subject, invoice.draft.body);
      track("chase_sent", { method: "gmail_draft" });
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? { ...inv, error: err instanceof Error ? err.message : t("tool.gmailDraftFailed") }
            : inv
        )
      );
    }
  }

  async function handleSyncReminderCalendar(invoiceId: string, reminderId: string) {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    const reminder = invoice?.reminders?.find((r) => r.id === reminderId);
    if (!reminder) return;
    try {
      const result = await syncReminderToGoogleCalendar({
        date: reminder.plannedDate,
        summary: reminder.label || `Chase: ${invoice?.clientName ?? "client"}`,
        description: reminder.body || reminder.subject || undefined,
        clientName: invoice?.clientName,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                trackingNote: result.htmlLink
                  ? t("tool.calendarAddedWithLink", { link: result.htmlLink })
                  : t("tool.calendarAdded"),
              }
            : inv
        )
      );
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                error: err instanceof Error ? err.message : t("tool.calendarFailed"),
              }
            : inv
        )
      );
    }
  }

  async function handleOpenGooglePicker() {
    if (!isPaid) return;
    openGoogleDrivePicker(
      async (file) => {
        setPdfBusy(true);
        setPdfError(null);
        try {
          // Import via connected Google connector when available; otherwise ask to connect.
          const connectors = await listCloudConnectors();
          const google = connectors.connectors.find((c) => c.provider === "google" && c.connected);
          if (!google) {
            setPdfError(t("tool.connectGoogleFirst"));
            return;
          }
          const result = await importCloudConnectorFile("google", { id: file.id, path: null });
          setPendingImport({
            ...result,
            provider: "google",
            providerLabel: "Google Drive",
          });
          setImportClient(result.hints.clientName ?? "");
          setImportAmount(
            result.hints.amount != null ? String(result.hints.amount) : ""
          );
          setImportDue(result.hints.dueDate ?? "");
        } catch (err) {
          setPdfError(err instanceof Error ? err.message : t("tool.driveFailed"));
        } finally {
          setPdfBusy(false);
        }
      },
      (message) => setPdfError(message)
    );
  }

  async function handleSheetImport() {
    if (!isPaid || !sheetId.trim()) return;
    setSheetBusy(true);
    setSheetMsg(null);
    try {
      const result = await importGoogleSheet(sheetId.trim());
      const now = new Date().toISOString();
      const added: Invoice[] = result.rows.map((row) => ({
        id: crypto.randomUUID(),
        clientName: row.clientName,
        amount: row.amount,
        dueDate: row.dueDate,
        createdAt: now,
        generating: false,
        rewriting: null,
      }));
      setInvoices((prev) => [...added, ...prev]);
      setSheetMsg(`Imported ${added.length} row(s)${result.skipped ? `, skipped ${result.skipped}` : ""}.`);
    } catch (err) {
      setSheetMsg(err instanceof Error ? err.message : t("tool.sheetsFailed"));
    } finally {
      setSheetBusy(false);
    }
  }

  async function handleSheetExport() {
    if (!isPaid || invoices.length === 0) return;
    setSheetBusy(true);
    setSheetMsg(null);
    try {
      const result = await exportAgingToGoogleSheet({
        title: `docstoc aging ${todayIso()}`,
        rows: invoices
          .filter((inv) => inv.status !== "paid")
          .map((inv) => ({
            clientName: inv.clientName,
            amount: inv.amount,
            dueDate: inv.dueDate,
            status: inv.lastChaseStatus ?? "open",
          })),
      });
      setSheetMsg(`Exported: ${result.spreadsheetUrl}`);
    } catch (err) {
      setSheetMsg(err instanceof Error ? err.message : t("tool.sheetsFailed"));
    } finally {
      setSheetBusy(false);
    }
  }

  async function handleDemandLetter(invoiceId: string) {
    if (!isPro) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "demandLetter", error: undefined } : inv
      )
    );
    try {
      const result = await generateDemandLetter({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
        due_date: invoice.dueDate,
        days_overdue: daysOverdue(invoice.dueDate),
        payment_link: paymentLink || account?.paymentLink || undefined,
        sender_name: account?.workspaceName ?? undefined,
      });
      const blob = new Blob([result.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, rewriting: null } : inv))
      );
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleMarkSent(invoice: Invoice) {
    const prevStatus = invoice.lastChaseStatus;
    const prevAt = invoice.lastChaseAt;
    const now = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? { ...inv, lastChaseStatus: "sent", lastChaseAt: now, error: undefined }
          : inv
      )
    );
    if (isPaid) {
      try {
        await markAgingChase(invoice.id, "sent");
        await logChaseEvent(
          invoice,
          "sent",
          invoice.draft?.subject,
          invoice.draft?.body
        );
        void notifyWebhook("chase.sent", {
          method: "manual",
          client_name: invoice.clientName,
          invoice_amount: invoice.amount,
        });
      } catch (err) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoice.id
              ? {
                  ...inv,
                  lastChaseStatus: prevStatus,
                  lastChaseAt: prevAt,
                  error:
                    err instanceof ApiError
                      ? err.message
                      : err instanceof Error
                        ? err.message
                        : t("common.error"),
                }
              : inv
          )
        );
      }
    }
  }

  async function handleRequestSoxApproval(invoice: Invoice) {
    if (!isPro) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id ? { ...inv, error: undefined, trackingNote: undefined } : inv
      )
    );
    try {
      await createSoxApproval({
        agingInvoiceId: invoice.id,
        clientName: invoice.clientName,
        subject: invoice.draft?.subject ?? null,
        body: invoice.draft?.body ?? null,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? { ...inv, trackingNote: t("invoice.soxApprovalRequested") }
            : inv
        )
      );
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? {
                ...inv,
                error:
                  err instanceof Error ? err.message : t("invoice.soxApprovalFailed"),
              }
            : inv
        )
      );
    }
  }

  async function handleMarkPaid(invoice: Invoice) {
    const now = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? { ...inv, status: "paid", paidAt: now, lastChaseStatus: "paid", lastChaseAt: now }
          : inv
      )
    );
    if (isPaid) {
      await markInvoicePaid(invoice.id).catch(() => {});
      await refreshTimeline(invoice.id);
    }
  }

  async function handleSequence(invoiceId: string) {
    if (!isPaid) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "sequence", error: undefined } : inv
      )
    );
    try {
      const sequence = await generateSequence({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
        days_overdue: daysOverdue(invoice.dueDate),
        aging_invoice_id: invoice.id,
      });
      const first = sequence.steps[0];
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                sequence,
                reminders: (sequence as ChaseSequence & { reminders?: ChaseReminder[] }).reminders,
                draft: first ? { subject: first.subject, body: first.body } : inv.draft,
                rewriting: null,
              }
            : inv
        )
      );
    } catch (err) {
      track("send_failed", { source: "sequence" });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleSms(invoiceId: string) {
    if (!isPaid) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, rewriting: "sms", error: undefined } : inv
      )
    );
    try {
      const smsDraft = await generateSms({
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
        days_overdue: daysOverdue(invoice.dueDate),
      });
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, smsDraft, rewriting: null } : inv))
      );
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                rewriting: null,
                error: err instanceof Error ? err.message : t("common.error"),
              }
            : inv
        )
      );
    }
  }

  async function handleTrackedCopy(invoice: Invoice) {
    if (!isPaid || !invoice.draft) return;
    try {
      const tracked = await createTrackedCopy({
        subject: invoice.draft.subject,
        body: invoice.draft.body,
        clientName: invoice.clientName,
        agingInvoiceId: invoice.id,
      });
      await navigator.clipboard.writeText(tracked.html);
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? {
                ...inv,
                trackingNote: tracked.note,
                lastChaseStatus: "tracked_copy",
                lastChaseAt: new Date().toISOString(),
              }
            : inv
        )
      );
      void markAgingChase(invoice.id, "tracked_copy").catch(() => {});
      track("chase_sent", { method: "tracked_html" });
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id
            ? { ...inv, error: err instanceof Error ? err.message : t("tool.trackedFailed") }
            : inv
        )
      );
    }
  }

  async function markReminderDone(invoiceId: string, reminderId: string) {
    try {
      await updateReminderStatus(reminderId, "done");
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id !== invoiceId || !inv.reminders) return inv;
          return {
            ...inv,
            reminders: inv.reminders.map((r) =>
              r.id === reminderId ? { ...r, status: "done" as const } : r
            ),
          };
        })
      );
      setDueTodayReminders((prev) => prev.filter((r) => r.id !== reminderId));
    } catch {
      /* ignore */
    }
  }

  async function handleSnoozeReminder(invoiceId: string, reminderId: string, days: number) {
    try {
      const { reminder } = await snoozeReminder(reminderId, days);
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id !== invoiceId || !inv.reminders) return inv;
          return {
            ...inv,
            reminders: inv.reminders.map((r) => (r.id === reminderId ? reminder : r)),
          };
        })
      );
      setDueTodayReminders((prev) => prev.filter((r) => r.id !== reminderId));
    } catch {
      /* ignore */
    }
  }

  async function handleScheduleReplyFollowUp(invoiceId: string) {
    if (!isPro) return;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice?.draft) return;
    const promised = invoice.replyInsight?.promisedPayDate;
    const daysFromNow = promised ? daysFromToday(promised) : 4;
    try {
      const { reminder } = await scheduleFollowUpReminder({
        agingInvoiceId: invoice.id,
        clientName: invoice.clientName,
        daysFromNow,
        label: promised ? `If unpaid after ${promised}` : t("tool.followUpPromise"),
        subject: invoice.draft.subject,
        body: invoice.draft.body,
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, reminders: [...(inv.reminders ?? []), reminder] }
            : inv
        )
      );
    } catch {
      /* ignore */
    }
  }

  async function handleEvidencePack(invoiceId: string) {
    if (!isPro) return;
    try {
      const result = await getEvidencePack(invoiceId);
      const blob = new Blob([result.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                error: err instanceof Error ? err.message : t("tool.evidenceFailed"),
              }
            : inv
        )
      );
    }
  }

  function handleOpenDueReminder(reminder: ChaseReminder) {
    if (reminder.agingInvoiceId) {
      const el = document.getElementById(`invoice-${reminder.agingInvoiceId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (reminder.subject && reminder.body) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === reminder.agingInvoiceId
              ? { ...inv, draft: { subject: reminder.subject!, body: reminder.body! } }
              : inv
          )
        );
      }
    }
  }

  function copyNextReminder(invoice: Invoice) {
    const next = invoice.reminders?.find((r) => r.status === "planned");
    if (!next?.body) return;
    void navigator.clipboard.writeText(`Subject: ${next.subject ?? ""}\n\n${next.body}`);
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? { ...inv, draft: { subject: next.subject ?? "", body: next.body ?? "" } }
          : inv
      )
    );
  }

  function applySequenceStep(invoiceId: string, stepIndex: number) {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId || !inv.sequence?.steps[stepIndex]) return inv;
        const step = inv.sequence.steps[stepIndex];
        return { ...inv, draft: { subject: step.subject, body: step.body } };
      })
    );
  }

  function updateDraft(invoiceId: string, field: "subject" | "body", value: string) {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, draft: { ...inv.draft!, [field]: value } } : inv
      )
    );
  }

  function copyDraft(invoice: Invoice) {
    if (!invoice.draft) return;
    navigator.clipboard.writeText(`Subject: ${invoice.draft.subject}\n\n${invoice.draft.body}`);
    track("chase_sent", { method: "copy" });
    const now = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? { ...inv, lastChaseStatus: "copied", lastChaseAt: now }
          : inv
      )
    );
    if (isPaid) {
      void markAgingChase(invoice.id, "copied").catch(() => {});
      void logChaseEvent(invoice, "copied", invoice.draft.subject, invoice.draft.body);
      void notifyWebhook("chase.sent", {
        method: "copy",
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
      });
    }
  }

  function handleMailtoClick(invoice?: Invoice) {
    if (!invoice?.draft) return;
    track("chase_sent", { method: "mailto" });
    const { copiedBody } = openMailtoClient({
      subject: invoice.draft.subject,
      body: invoice.draft.body,
    });
    const now = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? {
              ...inv,
              lastChaseStatus: "mailto",
              lastChaseAt: now,
              error: copiedBody ? t("invoice.mailtoBodyCopied") : undefined,
            }
          : inv
      )
    );
    if (isPaid) void markAgingChase(invoice.id, "mailto").catch(() => {});
    void logChaseEvent(invoice, "mailto", invoice.draft.subject, invoice.draft.body);
    if (isPaid) {
      void notifyWebhook("chase.sent", {
        method: "mailto",
        client_name: invoice.clientName,
        invoice_amount: invoice.amount,
      });
    }
  }

  function handleMultiMailtoClick() {
    if (!multiDraft) return;
    track("chase_sent", { method: "mailto", source: "multi" });
    const { copiedBody } = openMailtoClient({
      subject: multiDraft.subject,
      body: multiDraft.body,
    });
    if (copiedBody) setMultiError(t("invoice.mailtoBodyCopied"));
  }

  function downloadCsv() {
    const rows = invoices
      .filter((inv) => inv.draft)
      .map((inv) => ({
        client: inv.clientName,
        amount: inv.amount,
        due_date: inv.dueDate,
        days_overdue: daysOverdue(inv.dueDate),
        subject: inv.draft!.subject,
        body: inv.draft!.body,
      }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "docstoc-drafts.csv";
    a.click();
    URL.revokeObjectURL(url);
    track("chase_downloaded", { rows: rows.length });
    if (isPaid) void notifyWebhook("chase.downloaded", { rows: rows.length });
  }

  function handleClearList() {
    setInvoices([]);
    setSelectedIds(new Set());
    setMultiDraft(null);
  }

  function handleClientReplyChange(invoiceId: string, value: string) {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, clientReply: value } : inv))
    );
  }

  const atLimit = !isPaid && isAtLimit();
  const selectedCount = selectedIds.size;
  const selectionKey = useMemo(
    () => [...selectedIds].sort().join(","),
    [selectedIds]
  );

  useEffect(() => {
    setMultiDraft(null);
    setMultiError(null);
  }, [selectionKey]);

  function sequenceSendDate(daysFromNow: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + daysFromNow);
    return formatUsWeekday(d);
  }

  const overdueCount = invoices.filter((inv) => daysOverdue(inv.dueDate) > 0).length;
  const chaseView = parseChaseView(searchParams.get("view"));
  const focusInvoiceId = searchParams.get("focus");
  const showChaseWorkspace = chaseView !== null || !!focusInvoiceId;
  const visibleInvoices = useMemo(
    () => invoices.filter((inv) => matchesChaseView(inv, chaseView)),
    [invoices, chaseView]
  );
  const agingInvoices = useMemo(
    () =>
      chaseView === "paid"
        ? visibleInvoices
        : visibleInvoices.filter((inv) => inv.status !== "paid"),
    [visibleInvoices, chaseView]
  );

  useEffect(() => {
    if (!showChaseWorkspace) return;
    const timer = window.setTimeout(() => {
      document.getElementById("aging-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [showChaseWorkspace, chaseView]);

  const firstName = account?.email?.split("@")[0]?.split(/[._-]/)[0] || null;
  const welcomeName = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : null;

  return (
    <div>
      {!showChaseWorkspace && (
        <WelcomeBlock
          welcomeName={welcomeName}
          overdueCount={overdueCount}
          chaseCount={invoices.length}
          isPaid={isPaid}
          account={account}
        />
      )}

      {showChaseWorkspace ? (
        <>
          <section id="aging-board" className="chase-view-header">
            <div className="chase-view-header-row">
              <div>
                <h1 className="chase-view-title">
                  {chaseView ? t(chaseViewTitleKey(chaseView)) : t("nav.chases")}
                </h1>
                <p className="page-sub">
                  {t("chaseView.count", { count: visibleInvoices.length })}
                </p>
              </div>
              <Link to="/" className="btn-secondary">
                {t("chaseView.clearFilter")}
              </Link>
            </div>
            {visibleInvoices.length === 0 && (
              <div className="panel chase-view-empty">
                <p>
                  {chaseView
                    ? t(`chaseView.empty.${chaseView}`)
                    : t("welcome.product.chases.empty")}
                </p>
                <Link to="/new" className="btn-primary">
                  {t("nav.newChase")}
                </Link>
              </div>
            )}
          </section>

          <UsageBar usedCount={usedCount} atLimit={atLimit} isPaid={isPaid} isSignedIn={!!account} />

          {agingInvoices.length > 0 && (
            <AgingOverviewPanel
              invoices={agingInvoices}
              isPaid={isPaid}
              selectedIds={selectedIds}
              selectedCount={selectedCount}
              multiBusy={multiBusy}
              atLimit={atLimit}
              multiError={multiError}
              multiDraft={multiDraft}
              onSelectAll={selectAllOverdue}
              onClearSelection={clearSelection}
              onMultiDraft={handleMultiDraft}
              onToggleSelect={toggleSelect}
              onScrollToInvoice={scrollToInvoice}
              onGenerate={handleGenerate}
              onMultiDraftChange={setMultiDraft}
              onOpenMultiMail={handleMultiMailtoClick}
              onDraftError={setMultiError}
            />
          )}

          {pendingImport && (
            <CloudImportConfirm
              pendingImport={pendingImport}
              importClient={importClient}
              importAmount={importAmount}
              importDue={importDue}
              onImportClientChange={setImportClient}
              onImportAmountChange={setImportAmount}
              onImportDueChange={setImportDue}
              onConfirm={confirmCloudImport}
              onDismiss={dismissCloudImport}
            />
          )}

          <InvoiceIntakePanel
            clientName={clientName}
            amount={amount}
            dueDate={dueDate}
            paymentLink={paymentLink}
            paymentLinkError={paymentLinkError}
            isPaid={isPaid}
            invoices={invoices}
            onClientNameChange={setClientName}
            onAmountChange={setAmount}
            onDueDateChange={setDueDate}
            onPaymentLinkChange={(value) => {
              setPaymentLink(value);
              setPaymentLinkError(null);
            }}
            onAddManual={handleAddManual}
            onCsvUpload={handleCsvUpload}
            onOpenPdfPicker={openPdfPicker}
            onOpenGooglePicker={handleOpenGooglePicker}
            onSheetImport={handleSheetImport}
            onSheetExport={handleSheetExport}
            sheetId={sheetId}
            onSheetIdChange={setSheetId}
            sheetBusy={sheetBusy}
            sheetMsg={sheetMsg}
            googleConnected={googleConnected}
            googlePickerEnabled={googlePickerEnabled()}
            onDownloadCsv={downloadCsv}
            onClearList={handleClearList}
          />

          {showPdfPicker && (
            <PdfPickerPanel
              pdfError={pdfError}
              pdfBusy={pdfBusy}
              pdfProviders={pdfProviders}
              pdfProvider={pdfProvider}
              pdfFiles={pdfFiles}
              onClose={() => setShowPdfPicker(false)}
              onLoadPdfFiles={loadPdfFiles}
              onImportPdf={importPdfFromTool}
            />
          )}

          {isPaid && (
            <DueTodayBanner reminders={dueTodayReminders} onOpenReminder={handleOpenDueReminder} />
          )}

          {(chaseView === "paid"
            ? visibleInvoices
            : visibleInvoices.filter((inv) => inv.status !== "paid")
          ).map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              isPaid={isPaid}
              isPro={isPro}
              atLimit={atLimit}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onGenerate={handleGenerate}
              onCancelGenerate={cancelGenerate}
              onUpdateDraft={updateDraft}
              onRewrite={handleRewrite}
              onThankYou={handleThankYou}
              onSequence={handleSequence}
              onSms={handleSms}
              onClientReplyChange={handleClientReplyChange}
              onReply={handleReply}
              onReplySmart={handleReplySmart}
              onReplySmartFromGmail={
                isPro && googleConnected ? (id) => void handleReplySmart(id, true) : undefined
              }
              onFetchGmailReply={isPro && googleConnected ? handleFetchGmailReply : undefined}
              onDemandLetter={handleDemandLetter}
              onMarkSent={handleMarkSent}
              onRequestSoxApproval={isPro ? handleRequestSoxApproval : undefined}
              soxSodRequired={soxSodRequired}
              onMarkPaid={handleMarkPaid}
              onApplySequenceStep={applySequenceStep}
              onCopyNextReminder={copyNextReminder}
              onMarkReminderDone={markReminderDone}
              onSnoozeReminder={handleSnoozeReminder}
              onSyncReminderCalendar={isPaid ? handleSyncReminderCalendar : undefined}
              onScheduleReplyFollowUp={handleScheduleReplyFollowUp}
              onEvidencePack={handleEvidencePack}
              openStats={openStatsMap[invoice.id]}
              onCopyDraft={copyDraft}
              onTrackedCopy={handleTrackedCopy}
              onSaveGmailDraft={isPaid && googleConnected ? handleSaveGmailDraft : undefined}
              googleConnected={googleConnected}
              onMailtoClick={handleMailtoClick}
              sequenceSendDate={sequenceSendDate}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
