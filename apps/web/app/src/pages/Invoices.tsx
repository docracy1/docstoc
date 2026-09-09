import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createInvoice,
  deleteInvoice,
  getBranding,
  listClients,
  listInvoices,
  requestCryptoInvoice,
  setInvoiceStatus,
  type Account,
  type Branding,
  type ClientRecord,
  type InvoiceLineItem,
  type InvoiceRecord,
} from "../lib/api";
import { formatUsDateTime } from "../lib/locale";
import { useT } from "../lib/i18n";

const EMPTY_ITEM: InvoiceLineItem = { description: "", quantity: 1, unitPrice: 0 };

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "MXN", "BRL"] as const;

type DuePreset = "receipt" | "net15" | "net30" | "custom";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function dueFromPreset(preset: DuePreset, issue: string): string {
  if (preset === "receipt") return issue;
  if (preset === "net15") return addDaysIso(issue, 15);
  if (preset === "net30") return addDaysIso(issue, 30);
  return addDaysIso(issue, 14);
}

export default function InvoicesPage({ account }: { account: Account | null }) {
  const t = useT();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ publicId: string } | null>(null);
  const [cryptoBusyId, setCryptoBusyId] = useState<string | null>(null);
  const [cryptoCopiedId, setCryptoCopiedId] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientState, setClientState] = useState("");
  const [clientPostal, setClientPostal] = useState("");
  const [clientCountry, setClientCountry] = useState("");
  const [clientVat, setClientVat] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [issuerAddress, setIssuerAddress] = useState("");
  const [issuerState, setIssuerState] = useState("");
  const [issuerPostal, setIssuerPostal] = useState("");
  const [issuerCountry, setIssuerCountry] = useState("");
  const [issuerVat, setIssuerVat] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientSuggestOpen, setClientSuggestOpen] = useState(false);
  const [clientHighlight, setClientHighlight] = useState(0);
  const clientSuggestRef = useRef<HTMLDivElement>(null);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 14));
  const [duePreset, setDuePreset] = useState<DuePreset>("net15");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ ...EMPTY_ITEM }]);

  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const isPaid = account?.plan !== "free" && account?.plan != null;

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = subtotal * (taxRate / 100);
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [lineItems, taxRate]);

  const clientSuggestions = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false))
      .slice(0, 8);
  }, [clients, clientName]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listInvoices();
      setInvoices(res.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoices.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }
    refresh();
    getBranding()
      .then((b) => {
        setBranding(b);
        setIssuerName(b.workspaceName?.trim() || account?.workspaceName?.trim() || account?.email || "");
        setIssuerAddress(b.businessAddress ?? "");
        setIssuerState(b.businessState ?? "");
        setIssuerPostal(b.businessPostal ?? "");
        setIssuerCountry(b.businessCountry ?? "");
        setIssuerVat(b.businessVat ?? "");
      })
      .catch(() =>
        setBranding({
          workspaceName: null,
          logoDataUrl: null,
          paymentLink: null,
          lateFeeEnabled: false,
          lateFeeHint: null,
          businessAddress: null,
          businessState: null,
          businessPostal: null,
          businessCountry: null,
          businessVat: null,
          paid: false,
        })
      );
  }, [account?.email]);

  useEffect(() => {
    if (!account || !isPaid) {
      setClients([]);
      return;
    }
    listClients()
      .then((res) => setClients(res.clients))
      .catch(() => setClients([]));
  }, [account?.email, isPaid]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!clientSuggestRef.current?.contains(e.target as Node)) {
        setClientSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function pickClient(client: ClientRecord) {
    setClientName(client.name);
    setClientEmail(client.email ?? "");
    setClientAddress(client.address ?? "");
    setClientState(client.state ?? "");
    setClientPostal(client.postal ?? "");
    setClientCountry(client.country ?? "");
    setClientVat(client.vat ?? "");
    setClientSuggestOpen(false);
  }

  function updateItem(index: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setLineItems((items) => (items.length > 1 ? items.filter((_, i) => i !== index) : items));
  }

  function duplicateItem(index: number) {
    setLineItems((items) => {
      const copy = { ...items[index]! };
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
    });
  }

  function applyDuePreset(preset: DuePreset, issue = issueDate) {
    setDuePreset(preset);
    if (preset !== "custom") setDueDate(dueFromPreset(preset, issue));
  }

  function onIssueDateChange(next: string) {
    setIssueDate(next);
    if (duePreset !== "custom") setDueDate(dueFromPreset(duePreset, next));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastCreated(null);
    const items = lineItems.filter((item) => item.description.trim().length > 0);
    if (!clientName.trim() || items.length === 0) {
      setError(t("invoices.validationFailed"));
      return;
    }
    setCreating(true);
    try {
      const res = await createInvoice({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        clientState: clientState.trim() || undefined,
        clientPostal: clientPostal.trim() || undefined,
        clientCountry: clientCountry.trim() || undefined,
        clientVat: clientVat.trim() || undefined,
        issuerName: issuerName.trim() || undefined,
        issuerAddress: issuerAddress.trim() || undefined,
        issuerState: issuerState.trim() || undefined,
        issuerPostal: issuerPostal.trim() || undefined,
        issuerCountry: issuerCountry.trim() || undefined,
        issuerVat: issuerVat.trim() || undefined,
        issueDate,
        dueDate,
        currency,
        lineItems: items,
        taxRate,
        notes: notes.trim() || undefined,
      });
      setLastCreated({ publicId: res.invoice.publicId });
      setClientName("");
      setClientEmail("");
      setClientAddress("");
      setClientState("");
      setClientPostal("");
      setClientCountry("");
      setClientVat("");
      setNotes("");
      setLineItems([{ ...EMPTY_ITEM }]);
      setTaxRate(0);
      if (isPaid) {
        listClients()
          .then((r) => setClients(r.clients))
          .catch(() => undefined);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoices.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(publicId: string) {
    try {
      await navigator.clipboard.writeText(`${appOrigin}/invoice/${publicId}`);
      setCopiedId(publicId);
      setTimeout(() => setCopiedId((id) => (id === publicId ? null : id)), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function handleGetCryptoLink(inv: InvoiceRecord) {
    if (!isPaid || !inv.agingInvoiceId) return;
    setError(null);
    setCryptoBusyId(inv.id);
    try {
      const { url } = await requestCryptoInvoice(inv.agingInvoiceId);
      await navigator.clipboard.writeText(url);
      setCryptoCopiedId(inv.id);
      setTimeout(() => setCryptoCopiedId((id) => (id === inv.id ? null : id)), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoice.cryptoLinkFailed"));
    } finally {
      setCryptoBusyId(null);
    }
  }

  async function handleStatus(id: string, status: "draft" | "sent" | "paid") {
    setError(null);
    try {
      await setInvoiceStatus(id, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoices.updateFailed"));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("invoices.deleteConfirm"))) return;
    setError(null);
    try {
      await deleteInvoice(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invoices.deleteFailed"));
    }
  }

  if (!account) {
    return (
      <div className="panel">
        <h1>{t("invoices.title")}</h1>
        <p className="page-sub">{t("invoices.signInSub")}</p>
        <a className="btn-primary" href="/app/login">
          {t("nav.signin")}
        </a>
      </div>
    );
  }

  const fromName = issuerName.trim() || branding?.workspaceName?.trim() || account.workspaceName?.trim() || account.email;
  const logo = branding?.logoDataUrl || account.logoDataUrl || null;

  return (
    <div className="invoice-gen-page">
      <form className="invoice-editor" onSubmit={handleCreate}>
        <div className="invoice-editor-bar">
          <div className="invoice-editor-bar-spacer" />
          <h1 className="invoice-editor-heading">{t("invoices.newTitle")}</h1>
          <button type="submit" className="invoice-editor-save" disabled={creating}>
            {creating ? t("invoices.creating") : t("invoices.save")}
          </button>
        </div>

        <div className="invoice-sheet">
          <div className="invoice-sheet-top">
            <div className="invoice-sheet-intro">
              <div className="invoice-sheet-title-row">
                <span className="invoice-draft-badge">{t("invoices.statusDraft")}</span>
                <span className="invoice-doc-label">{t("invoices.docTitle")}</span>
              </div>
              <p className="invoice-sheet-hint">{t("invoices.pageSubShort")}</p>
            </div>
            <div className="invoice-logo" aria-hidden={logo ? undefined : true}>
              {logo ? (
                <img src={logo} alt="" />
              ) : (
                <span>{t("invoices.logoPlaceholder")}</span>
              )}
            </div>
          </div>

          <div className="invoice-meta-row">
            <label className="invoice-field">
              <span>{t("invoices.invoiceNo")}</span>
              <div className="invoice-number-wrap">
                <span className="invoice-hash">#</span>
                <input value={t("invoices.numberPreview")} readOnly tabIndex={-1} />
              </div>
            </label>
            <label className="invoice-field">
              <span>{t("invoices.currency")}</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="invoice-parties">
            <div className="invoice-party">
              <div className="invoice-party-label">{t("invoices.from")}</div>
              <div className="invoice-party-body invoice-party-fields">
                <input
                  value={issuerName}
                  onChange={(e) => setIssuerName(e.target.value)}
                  placeholder={fromName || t("invoices.businessNamePlaceholder")}
                  autoComplete="organization"
                />
                <input
                  value={issuerAddress}
                  onChange={(e) => setIssuerAddress(e.target.value)}
                  placeholder={t("invoices.addressPlaceholder")}
                  autoComplete="street-address"
                />
                <div className="invoice-party-row">
                  <input
                    value={issuerPostal}
                    onChange={(e) => setIssuerPostal(e.target.value)}
                    placeholder={t("invoices.postalPlaceholder")}
                    autoComplete="postal-code"
                  />
                  <input
                    value={issuerState}
                    onChange={(e) => setIssuerState(e.target.value)}
                    placeholder={t("invoices.statePlaceholder")}
                    autoComplete="address-level1"
                  />
                </div>
                <input
                  value={issuerCountry}
                  onChange={(e) => setIssuerCountry(e.target.value)}
                  placeholder={t("invoices.countryPlaceholder")}
                  autoComplete="country-name"
                />
                <input
                  value={issuerVat}
                  onChange={(e) => setIssuerVat(e.target.value)}
                  placeholder={t("invoices.vatPlaceholder")}
                />
                {branding?.paymentLink ? (
                  <div className="invoice-party-muted">{branding.paymentLink}</div>
                ) : null}
                <Link className="invoice-party-link" to="/branding">
                  {t("invoices.editBusinessProfile")}
                </Link>
              </div>

              <div className="invoice-party-label" style={{ marginTop: 22 }}>
                {t("invoices.to")}
              </div>
              <div className="invoice-party-body invoice-party-fields">
                <div className="invoice-client-suggest" ref={clientSuggestRef}>
                  <input
                    className="invoice-client-name"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setClientSuggestOpen(true);
                      setClientHighlight(0);
                    }}
                    onFocus={() => setClientSuggestOpen(true)}
                    onKeyDown={(e) => {
                      if (!clientSuggestOpen || clientSuggestions.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setClientHighlight((i) => Math.min(i + 1, clientSuggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setClientHighlight((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter" && clientSuggestions[clientHighlight]) {
                        e.preventDefault();
                        pickClient(clientSuggestions[clientHighlight]!);
                      } else if (e.key === "Escape") {
                        setClientSuggestOpen(false);
                      }
                    }}
                    placeholder={t("invoices.clientNamePlaceholder")}
                    required
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={clientSuggestOpen && clientSuggestions.length > 0}
                  />
                  {clientSuggestOpen && clientSuggestions.length > 0 ? (
                    <ul className="invoice-client-suggest-list" role="listbox">
                      {clientSuggestions.map((c, i) => (
                        <li key={c.id} role="option" aria-selected={i === clientHighlight}>
                          <button
                            type="button"
                            className={
                              i === clientHighlight
                                ? "invoice-client-suggest-item is-active"
                                : "invoice-client-suggest-item"
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setClientHighlight(i)}
                            onClick={() => pickClient(c)}
                          >
                            <span className="invoice-client-suggest-name">{c.name}</span>
                            {c.email ? (
                              <span className="invoice-client-suggest-email">{c.email}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder={t("invoices.clientEmail")}
                />
                <input
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder={t("invoices.addressPlaceholder")}
                  autoComplete="off"
                />
                <div className="invoice-party-row">
                  <input
                    value={clientPostal}
                    onChange={(e) => setClientPostal(e.target.value)}
                    placeholder={t("invoices.postalPlaceholder")}
                    autoComplete="off"
                  />
                  <input
                    value={clientState}
                    onChange={(e) => setClientState(e.target.value)}
                    placeholder={t("invoices.statePlaceholder")}
                    autoComplete="off"
                  />
                </div>
                <input
                  value={clientCountry}
                  onChange={(e) => setClientCountry(e.target.value)}
                  placeholder={t("invoices.countryPlaceholder")}
                  autoComplete="off"
                />
                <input
                  value={clientVat}
                  onChange={(e) => setClientVat(e.target.value)}
                  placeholder={t("invoices.vatPlaceholder")}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="invoice-dates">
              <label className="invoice-field">
                <span>{t("invoices.issueDate")}</span>
                <input type="date" value={issueDate} onChange={(e) => onIssueDateChange(e.target.value)} required />
              </label>
              <label className="invoice-field">
                <span>{t("invoices.dueDate")}</span>
                <select
                  value={duePreset}
                  onChange={(e) => applyDuePreset(e.target.value as DuePreset)}
                >
                  <option value="receipt">{t("invoices.dueReceipt")}</option>
                  <option value="net15">{t("invoices.dueNet15")}</option>
                  <option value="net30">{t("invoices.dueNet30")}</option>
                  <option value="custom">{t("invoices.dueCustom")}</option>
                </select>
              </label>
              {duePreset === "custom" || duePreset !== "receipt" ? (
                <label className="invoice-field">
                  <span>{t("invoices.dueDateExact")}</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDuePreset("custom");
                      setDueDate(e.target.value);
                    }}
                    required
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="invoice-items">
            <div className="invoice-items-head">
              <span className="invoice-col-desc">{t("invoices.itemDescription")}</span>
              <span className="invoice-col-qty">{t("invoices.itemQty")}</span>
              <span className="invoice-col-rate">{t("invoices.itemPrice")}</span>
              <span className="invoice-col-amt">{t("invoices.itemAmount")}</span>
              <span className="invoice-col-actions" />
            </div>

            {lineItems.map((item, i) => {
              const amount = item.quantity * item.unitPrice;
              return (
                <div key={i} className="invoice-item-row">
                  <span className="invoice-drag" aria-hidden="true">
                    ⠿
                  </span>
                  <div className="invoice-col-desc">
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                      placeholder={t("invoices.itemDescriptionPlaceholder")}
                    />
                    <div className="invoice-item-tools">
                      <button
                        type="button"
                        className="invoice-icon-btn"
                        title={t("invoices.duplicateItem")}
                        onClick={() => duplicateItem(i)}
                      >
                        ⎘
                      </button>
                    </div>
                  </div>
                  <div className="invoice-col-qty">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="invoice-col-rate">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div className="invoice-col-amt">
                    <span className="invoice-amount-readout">{formatMoney(amount, currency)}</span>
                  </div>
                  <div className="invoice-col-actions">
                    <button
                      type="button"
                      className="invoice-icon-btn"
                      title={t("invoices.removeItem")}
                      onClick={() => removeItem(i)}
                      disabled={lineItems.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="invoice-new-line"
              onClick={() => setLineItems((items) => [...items, { ...EMPTY_ITEM }])}
            >
              {t("invoices.newLine")} ▾
            </button>
          </div>

          <div className="invoice-summary">
            <div className="invoice-summary-row">
              <span>{t("invoices.subtotal")}</span>
              <span>{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="invoice-summary-row invoice-tax-row">
              <span className="invoice-tax-label">
                {t("invoices.tax")}
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  aria-label={t("invoices.taxRate")}
                />
                <span className="invoice-tax-pct">%</span>
              </span>
              <span>{formatMoney(totals.taxAmount, currency)}</span>
            </div>
            <div className="invoice-summary-row invoice-total-row">
              <span>{t("invoices.totalLabel", { currency })}</span>
              <span>{formatMoney(totals.total, currency)}</span>
            </div>
            <div className="invoice-balance">
              <span className="invoice-balance-label">{t("invoices.balance")}</span>
              <span className="invoice-balance-value">
                {currency} {totals.total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="invoice-note-block">
            <div className="invoice-note-label">{t("invoices.invoiceNote")}</div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("invoices.notesPlaceholder")}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="invoice-sheet-footer">
            <button type="submit" className="invoice-new-line" disabled={creating}>
              {creating ? t("invoices.creating") : t("invoices.create")}
            </button>
          </div>
        </div>
      </form>

      {lastCreated && (
        <div className="invoice-created-banner">
          <h2>{t("invoices.created")}</h2>
          <p>{t("invoices.shareLink")}</p>
          <code>{`${appOrigin}/invoice/${lastCreated.publicId}`}</code>
          <div className="invoice-created-actions">
            <button type="button" className="btn-secondary" onClick={() => handleCopy(lastCreated.publicId)}>
              {copiedId === lastCreated.publicId ? t("invoices.copied") : t("invoices.copyLink")}
            </button>
            <a className="btn-secondary" href={`/invoice/${lastCreated.publicId}`} target="_blank" rel="noopener noreferrer">
              {t("invoices.viewInvoice")}
            </a>
            <a
              className="btn-primary"
              href={`/invoice/${lastCreated.publicId}?download=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("invoices.downloadPdf")}
            </a>
          </div>
        </div>
      )}

      <section className="invoice-list-section">
        <h2 className="invoice-list-title">{t("invoices.listTitle")}</h2>
        {loading ? (
          <p className="page-sub">{t("common.loading")}</p>
        ) : invoices.length === 0 ? (
          <p className="webhooks-empty">{t("invoices.empty")}</p>
        ) : (
          <ul className="webhooks-list">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <div>
                  <code>{inv.invoiceNumber}</code> — {inv.clientName}
                  <div className="page-sub">
                    {formatUsDateTime(inv.createdAt)} · {inv.currency} {inv.total.toFixed(2)} ·{" "}
                    {inv.status === "paid"
                      ? t("invoices.statusPaid")
                      : inv.status === "sent"
                        ? t("invoices.statusSent")
                        : t("invoices.statusDraft")}
                    {inv.certificatePublicId && <> · {t("invoices.certified")}</>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-secondary" onClick={() => handleCopy(inv.publicId)}>
                    {copiedId === inv.publicId ? t("invoices.copied") : t("invoices.copyLink")}
                  </button>
                  <a
                    className="btn-secondary"
                    href={`/invoice/${inv.publicId}?download=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("invoices.downloadPdf")}
                  </a>
                  {inv.certificatePublicId && (
                    <a
                      className="btn-secondary"
                      href={`/verify/${inv.certificatePublicId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("invoices.viewCertificate")}
                    </a>
                  )}
                  {inv.status === "draft" && (
                    <button type="button" className="btn-secondary" onClick={() => handleStatus(inv.id, "sent")}>
                      {t("invoices.markSent")}
                    </button>
                  )}
                  {inv.status === "sent" && (
                    <button type="button" className="btn-secondary" onClick={() => handleStatus(inv.id, "paid")}>
                      {t("invoices.markPaid")}
                    </button>
                  )}
                  {isPaid && inv.status === "sent" && inv.agingInvoiceId && (
                    <button
                      type="button"
                      className="btn-secondary"
                      title={t("invoice.cryptoLinkHint")}
                      disabled={cryptoBusyId === inv.id}
                      onClick={() => void handleGetCryptoLink(inv)}
                    >
                      {cryptoBusyId === inv.id
                        ? t("common.loading")
                        : cryptoCopiedId === inv.id
                          ? t("invoices.copied")
                          : t("invoice.getCryptoLink")}
                    </button>
                  )}
                  {inv.agingInvoiceId && (inv.status === "sent" || inv.status === "paid") && (
                    <Link className="btn-secondary" to={`/?focus=${encodeURIComponent(inv.agingInvoiceId)}`}>
                      {t("invoices.openInChases")}
                    </Link>
                  )}
                  {!inv.certificatePublicId && (
                    <button type="button" className="btn-secondary" onClick={() => handleDelete(inv.id)}>
                      {t("invoices.delete")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
