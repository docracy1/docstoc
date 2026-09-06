import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import {
  CLOUD_IMPORT_STORAGE_KEY,
  PENDING_INVOICES_STORAGE_KEY,
  PENDING_TEMPLATE_STORAGE_KEY,
  importLocalPdf,
  type Account,
} from "../lib/api";
import { track } from "../lib/analytics";
import { useT } from "../lib/i18n";
import { parseCsvRows } from "./tool/csvImport";
import ScanCapture from "../components/ScanCapture";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

type FreeTemplate = {
  slug: string;
  name: string;
  stage: string;
  subject: string;
  body: string;
};

/** Featured free templates shown on the New chase entry (Docracy-style “start from a template”). */
const FEATURED_SLUGS = [
  "gentle-overdue-invoice-reminder",
  "invoice-due-today-reminder",
  "overdue-invoice-reminder-7-days",
  "payment-reminder-before-due-date",
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function NewChase({ account }: { account: Account | null }) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPaid = account?.plan !== "free" && account?.plan != null;

  const [allTemplates, setAllTemplates] = useState<FreeTemplate[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // `capture="environment"` (used by the scan flow) only means anything on a touch/phone
  // device — on desktop it just opens a plain file picker, which looks broken since there's no
  // camera to open.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    setCanScan(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    fetch("/free-templates/templates.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: FreeTemplate[]) => {
        if (!Array.isArray(rows)) return;
        setAllTemplates(rows);
      })
      .catch(() => setAllTemplates([]));

    // Community-submitted email templates aren't in the static JSON above — merge them in so a
    // /new?template=<slug> link from the Templates page (which now shows community templates
    // too) actually resolves instead of silently doing nothing.
    fetch("/api/marketplace?type=email")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data: { templates?: FreeTemplate[] }) => {
        const rows = Array.isArray(data.templates) ? data.templates : [];
        if (rows.length) setAllTemplates((prev) => [...prev, ...rows]);
      })
      .catch(() => {});
  }, []);

  const featured = useMemo(() => {
    const bySlug = new Map(allTemplates.map((tpl) => [tpl.slug, tpl]));
    return FEATURED_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean) as FreeTemplate[];
  }, [allTemplates]);

  function useTemplate(tpl: FreeTemplate) {
    try {
      sessionStorage.setItem(
        PENDING_TEMPLATE_STORAGE_KEY,
        JSON.stringify({ slug: tpl.slug, subject: tpl.subject, body: tpl.body, name: tpl.name })
      );
    } catch {
      /* ignore quota */
    }
    track("template_started", { slug: tpl.slug });
    setSelectedTemplateName(tpl.name);
    setShowManual(true);
    setError(null);
  }

  // Templates page → /new?template=slug
  useEffect(() => {
    const slug = searchParams.get("template");
    if (!slug || allTemplates.length === 0) return;
    const tpl = allTemplates.find((row) => row.slug === slug);
    if (tpl) useTemplate(tpl);
  }, [allTemplates, searchParams]);

  async function acceptPdf(file: File, previewDataUrl?: string) {
    if (!isPaid) {
      setError(t("newChase.pdfSolo"));
      return;
    }
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("newChase.pdfOnly"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(t("newChase.maxSize"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await importLocalPdf(file.name, base64);
      sessionStorage.setItem(
        CLOUD_IMPORT_STORAGE_KEY,
        JSON.stringify({
          ...result,
          provider: "upload",
          providerLabel: t("newChase.uploadLabel"),
          // A scanned page has no extractable text, so without this the import screen shows
          // nothing recognizable as "the photo" — just empty client/amount fields.
          ...(previewDataUrl ? { previewDataUrl } : {}),
        })
      );
      try {
        sessionStorage.removeItem(PENDING_TEMPLATE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      track("fields_added", { source: "local_pdf_pending" });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("newChase.pdfFailed"));
    } finally {
      setBusy(false);
    }
  }

  function acceptCsv(file: File) {
    setBusy(true);
    setError(null);
    Papa.parse<string[]>(file, {
      complete: (res) => {
        try {
          const parsed = parseCsvRows(res.data);
          if (!parsed.length) {
            setError(t("newChase.csvEmpty"));
            setBusy(false);
            return;
          }
          sessionStorage.setItem(PENDING_INVOICES_STORAGE_KEY, JSON.stringify(parsed));
          track("fields_added", { source: "csv", rows: parsed.length });
          navigate("/");
        } catch (err) {
          setError(err instanceof Error ? err.message : t("newChase.csvFailed"));
          setBusy(false);
        }
      },
      error: () => {
        setError(t("newChase.csvFailed"));
        setBusy(false);
      },
    });
  }

  async function acceptFile(file: File | null | undefined) {
    if (!file || busy) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || file.type === "text/csv") {
      acceptCsv(file);
      return;
    }
    await acceptPdf(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    void acceptFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!clientName.trim() || !Number.isFinite(amt) || amt <= 0 || !dueDate) {
      setError(t("newChase.manualInvalid"));
      return;
    }
    sessionStorage.setItem(
      PENDING_INVOICES_STORAGE_KEY,
      JSON.stringify([{ clientName: clientName.trim(), amount: amt, dueDate }])
    );
    track("fields_added", { source: "new_chase_manual" });
    navigate("/");
  }

  return (
    <div className="new-chase">
      <h1 className="new-chase-title">{t("newChase.title")}</h1>

      <div className="panel new-chase-card">
        {featured.length > 0 && (
          <div className="new-chase-templates">
            <p className="new-chase-label">{t("newChase.startFromTemplate")}</p>
            {featured.map((tpl) => (
              <button
                key={tpl.slug}
                type="button"
                className="new-chase-template-link"
                onClick={() => useTemplate(tpl)}
              >
                {tpl.name}
                <span className="new-chase-template-meta"> ({tpl.stage})</span>
              </button>
            ))}
            <Link className="new-chase-more-templates" to="/templates">
              {t("newChase.browseTemplates")}
            </Link>
          </div>
        )}

        {selectedTemplateName && (
          <p className="new-chase-label">
            {t("newChase.usingTemplate", { name: selectedTemplateName })}
          </p>
        )}

        <p className="new-chase-upload-hint">{t("newChase.uploadHint")}</p>
        <div
          className={`new-chase-dropzone${isDragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <p className="new-chase-drop-copy">
            {isDragging ? t("newChase.dropHere") : t("newChase.dragOr")}
          </p>
          <input
            type="file"
            accept={isPaid ? "application/pdf,.pdf,.csv,text/csv" : ".csv,text/csv"}
            onChange={onFileChange}
            disabled={busy}
          />
        </div>
        <p className="new-chase-max">{t("newChase.maxSize")}</p>
        {!isPaid && <p className="new-chase-max">{t("newChase.csvFreeNote")}</p>}

        {isPaid && canScan && (
          <button type="button" className="new-chase-scan-btn" onClick={() => setScanning(true)}>
            {t("scan.scanDocument")}
          </button>
        )}

        {scanning && (
          <ScanCapture
            onDone={async (file, previewDataUrl) => {
              setScanning(false);
              await acceptPdf(file, previewDataUrl);
            }}
            onCancel={() => setScanning(false)}
          />
        )}

        {error && <p className="new-chase-error">{error}</p>}
        {busy && <p className="page-sub">{t("newChase.working")}</p>}

        <div className="new-chase-ai">
          {showManual ? (
            <form onSubmit={onManualSubmit} className="new-chase-manual">
              <p className="new-chase-label">
                {isPaid ? t("newChase.aiHint") : t("newChase.manualHint")}
              </p>
              <div className="field-row new-chase-fields">
                <input
                  type="text"
                  placeholder={t("intake.clientPlaceholder")}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                />
                <input
                  type="number"
                  placeholder={t("intake.amountPlaceholder")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  required
                />
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
              <div className="new-chase-manual-actions">
                <button type="submit" className="btn-primary" disabled={busy}>
                  {t("newChase.continue")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowManual(false);
                    setError(null);
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="btn-secondary new-chase-ai-btn"
              onClick={() => setShowManual(true)}
            >
              {isPaid ? t("newChase.generateWithAi") : t("newChase.enterManually")}
            </button>
          )}
        </div>

        {isPaid ? (
          <p className="new-chase-cloud">
            {t("newChase.orCloud")}{" "}
            <Link to="/connector">{t("newChase.connectors")}</Link>
          </p>
        ) : (
          <p className="new-chase-cloud">
            <Link to="/account">{t("newChase.upgradePdf")}</Link> {t("newChase.upgradePdfSub")}
          </p>
        )}
      </div>
    </div>
  );
}
