import { useEffect, useMemo, useRef, useState } from "react";
import {
  listClients,
  requestCryptoInvoice,
  setAgingPaymentLink,
  syncAging,
  type Account,
  type ClientRecord,
} from "../lib/api";
import { openMailtoClient } from "../lib/mailto";
import { useT } from "../lib/i18n";

type DocumentTemplate = { slug: string; name: string; category: string };

type PaymentMethod = "crypto" | "own_link";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GetPaid({ account }: { account: Account | null }) {
  const t = useT();
  const isPaid = account?.plan !== "free" && account?.plan != null;

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templateSlug, setTemplateSlug] = useState("");

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientSuggestOpen, setClientSuggestOpen] = useState(false);
  const [clientHighlight, setClientHighlight] = useState(0);
  const clientSuggestRef = useRef<HTMLDivElement>(null);

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("crypto");
  const [ownLink, setOwnLink] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/document-templates/templates.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DocumentTemplate[]) => setTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setTemplates([]));
  }, []);

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

  const clientSuggestions = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false))
      .slice(0, 8);
  }, [clients, clientName]);

  function pickClient(client: ClientRecord) {
    setClientName(client.name);
    setClientEmail(client.email ?? "");
    setClientSuggestOpen(false);
  }

  const selectedTemplate = templates.find((tpl) => tpl.slug === templateSlug) ?? null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!isPaid) return;
    const amountNumber = Number(amount);
    if (!clientName.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError(t("getPaid.formInvalid"));
      return;
    }
    if (paymentMethod === "own_link" && !/^https?:\/\//i.test(ownLink.trim())) {
      setError(t("getPaid.ownLinkInvalid"));
      return;
    }

    setError(null);
    setSending(true);
    setPayUrl(null);
    try {
      const id = crypto.randomUUID();
      await syncAging([
        {
          id,
          clientName: clientName.trim(),
          amount: amountNumber,
          dueDate: todayIso(),
          templateSlug: templateSlug || null,
        },
      ]);
      if (paymentMethod === "crypto") {
        await requestCryptoInvoice(id);
      } else {
        await setAgingPaymentLink(id, ownLink.trim());
      }
      // Share the docstoc pay page, not the raw checkout/own-link URL directly — it shows the
      // attached template (if any) and renders correctly for either payment method.
      setPayUrl(`${window.location.origin}/pay/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("getPaid.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function handleCopy() {
    if (!payUrl) return;
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  function handleMail() {
    if (!payUrl) return;
    openMailtoClient({
      to: clientEmail || undefined,
      subject: t("getPaid.mailSubject"),
      body: t("getPaid.mailBody", { link: payUrl }),
    });
  }

  if (!isPaid) {
    return (
      <div className="wrap">
        <h1 className="page-title">{t("getPaid.title")}</h1>
        <p className="page-sub">{t("getPaid.paidOnly")}</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1 className="page-title">{t("getPaid.title")}</h1>
      <p className="page-sub">{t("getPaid.lede")}</p>

      <form className="panel" onSubmit={handleSend}>
        <div className="field-row">
          <label htmlFor="getpaid-template">{t("getPaid.templateLabel")}</label>
          <select
            id="getpaid-template"
            value={templateSlug}
            onChange={(e) => setTemplateSlug(e.target.value)}
          >
            <option value="">{t("getPaid.templateNone")}</option>
            {templates.map((tpl) => (
              <option key={tpl.slug} value={tpl.slug}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>

        <div className="invoice-client-suggest" ref={clientSuggestRef} style={{ marginTop: 12 }}>
          <input
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
            placeholder={t("getPaid.clientNamePlaceholder")}
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
                    className={i === clientHighlight ? "invoice-client-suggest-item is-active" : "invoice-client-suggest-item"}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setClientHighlight(i)}
                    onClick={() => pickClient(c)}
                  >
                    <span className="invoice-client-suggest-name">{c.name}</span>
                    {c.email ? <span className="invoice-client-suggest-email">{c.email}</span> : null}
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
          placeholder={t("getPaid.clientEmailPlaceholder")}
          style={{ marginTop: 8 }}
        />

        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("getPaid.amountPlaceholder")}
          style={{ marginTop: 12 }}
          required
        />

        <p className="branding-help" style={{ marginTop: 16, marginBottom: 8 }}>
          {t("getPaid.paymentMethodLabel")}
        </p>
        <div className="getpaid-method-grid">
          <button
            type="button"
            className={paymentMethod === "own_link" ? "getpaid-method-card is-active" : "getpaid-method-card"}
            onClick={() => setPaymentMethod("own_link")}
          >
            <strong>{t("getPaid.ownLinkTitle")}</strong>
            <span>{t("getPaid.ownLinkHint")}</span>
          </button>
          <button
            type="button"
            className={paymentMethod === "crypto" ? "getpaid-method-card is-active" : "getpaid-method-card"}
            onClick={() => setPaymentMethod("crypto")}
          >
            <strong>{t("getPaid.cryptoTitle")}</strong>
            <span>{t("getPaid.cryptoHint")}</span>
          </button>
        </div>

        {paymentMethod === "own_link" && (
          <input
            type="url"
            value={ownLink}
            onChange={(e) => setOwnLink(e.target.value)}
            placeholder={t("getPaid.ownLinkPlaceholder")}
            style={{ marginTop: 12 }}
          />
        )}
        {paymentMethod === "crypto" && (
          <p className="branding-help" style={{ marginTop: 8 }}>
            {t("getPaid.poweredByNowpayments")}
          </p>
        )}

        {error && <div className="error-msg">{error}</div>}

        <button type="submit" className="btn-primary" disabled={sending} style={{ marginTop: 16 }}>
          {sending ? t("common.loading") : t("getPaid.send")}
        </button>
      </form>

      {payUrl && (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="page-sub" style={{ marginBottom: 8 }}>
            {selectedTemplate ? t("getPaid.doneWithTemplate", { name: selectedTemplate.name }) : t("getPaid.done")}
          </p>
          <code style={{ display: "block", marginBottom: 12, wordBreak: "break-all" }}>{payUrl}</code>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
              {copied ? t("invoices.copied") : t("getPaid.copyLink")}
            </button>
            <button type="button" className="btn-secondary" onClick={handleMail}>
              {t("getPaid.openMail")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
