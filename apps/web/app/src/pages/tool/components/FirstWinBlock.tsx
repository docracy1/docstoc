import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { track } from "../../../lib/analytics";
import {
  buildDemoInvoice,
  DEMO_INVOICE_ID,
  markFirstWin,
  type FirstWinPath,
} from "../../../lib/firstWin";
import { openMailtoClient } from "../../../lib/mailto";
import { useT } from "../../../lib/i18n";
import type { Invoice } from "../types";

interface FirstWinBlockProps {
  welcomeName: string | null;
  path: FirstWinPath;
  invoices: Invoice[];
  onSeedDemo: (invoice: Invoice) => void;
  onChaseSent: (invoiceId: string, method: "mailto" | "copy") => void;
  onComplete: (path: FirstWinPath) => void;
}

export function FirstWinBlock({
  welcomeName,
  path,
  invoices,
  onSeedDemo,
  onChaseSent,
  onComplete,
}: FirstWinBlockProps) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    track("first_win_started", { path });
  }, [path]);

  const demo = useMemo(
    () => invoices.find((inv) => inv.id === DEMO_INVOICE_ID) ?? null,
    [invoices]
  );
  const draftReady = !!demo?.draft;
  const step: 1 | 2 | 3 = !demo ? 1 : !draftReady ? 2 : 3;

  if (path === "ssl") {
    return (
      <section className="welcome-block first-win-block">
        <div className="welcome-hero">
          <div>
            <h1>{welcomeName ? t("firstWin.titleNamed", { name: welcomeName }) : t("firstWin.title")}</h1>
            <p className="page-sub" style={{ marginBottom: 0 }}>
              {t("firstWin.ssl.sub")}
            </p>
          </div>
        </div>
        <div className="first-win-panel panel">
          <ol className="first-win-steps">
            <li className="is-current">
              <strong>{t("firstWin.ssl.step1")}</strong>
              <span>{t("firstWin.ssl.step1Body")}</span>
            </li>
          </ol>
          <Link className="btn-primary" to="/ssl-domains" onClick={() => track("first_win_cta", { path: "ssl" })}>
            {t("firstWin.ssl.cta")}
          </Link>
        </div>
      </section>
    );
  }

  if (path === "cert") {
    return (
      <section className="welcome-block first-win-block">
        <div className="welcome-hero">
          <div>
            <h1>{welcomeName ? t("firstWin.titleNamed", { name: welcomeName }) : t("firstWin.title")}</h1>
            <p className="page-sub" style={{ marginBottom: 0 }}>
              {t("firstWin.cert.sub")}
            </p>
          </div>
        </div>
        <div className="first-win-panel panel">
          <ol className="first-win-steps">
            <li className="is-current">
              <strong>{t("firstWin.cert.step1")}</strong>
              <span>{t("firstWin.cert.step1Body")}</span>
            </li>
          </ol>
          <Link
            className="btn-primary"
            to="/certificates"
            onClick={() => track("first_win_cta", { path: "cert" })}
          >
            {t("firstWin.cert.cta")}
          </Link>
        </div>
      </section>
    );
  }

  function seedDemo() {
    const invoice = buildDemoInvoice();
    onSeedDemo(invoice);
    track("fields_added", { source: "first_win_demo" });
    setNote(null);
  }

  function handleMailto() {
    if (!demo?.draft) return;
    const { copiedBody } = openMailtoClient({
      subject: demo.draft.subject,
      body: demo.draft.body,
    });
    onChaseSent(demo.id, "mailto");
    markFirstWin("chase");
    track("chase_sent", { method: "mailto", source: "first_win" });
    track("first_win_completed", { path: "chase", method: "mailto" });
    onComplete("chase");
    if (copiedBody) setNote(t("invoice.mailtoBodyCopied"));
  }

  function handleCopy() {
    if (!demo?.draft) return;
    void navigator.clipboard.writeText(`Subject: ${demo.draft.subject}\n\n${demo.draft.body}`);
    onChaseSent(demo.id, "copy");
    markFirstWin("chase");
    track("chase_sent", { method: "copy", source: "first_win" });
    track("first_win_completed", { path: "chase", method: "copy" });
    onComplete("chase");
    setNote(t("firstWin.chase.copied"));
  }

  return (
    <section className="welcome-block first-win-block">
      <div className="welcome-hero">
        <div>
          <h1>{welcomeName ? t("firstWin.titleNamed", { name: welcomeName }) : t("firstWin.title")}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {t("firstWin.chase.sub")}
          </p>
        </div>
      </div>

      <div className="first-win-panel panel">
        <ol className="first-win-steps">
          <li className={step === 1 ? "is-current" : step > 1 ? "is-done" : undefined}>
            <strong>{t("firstWin.chase.step1")}</strong>
            <span>{t("firstWin.chase.step1Body")}</span>
          </li>
          <li className={step === 2 ? "is-current" : step > 2 ? "is-done" : undefined}>
            <strong>{t("firstWin.chase.step2")}</strong>
            <span>{t("firstWin.chase.step2Body")}</span>
          </li>
          <li className={step === 3 ? "is-current" : undefined}>
            <strong>{t("firstWin.chase.step3")}</strong>
            <span>{t("firstWin.chase.step3Body")}</span>
          </li>
        </ol>

        {step === 1 && (
          <button type="button" className="btn-primary" onClick={seedDemo}>
            {t("firstWin.chase.loadDemo")}
          </button>
        )}

        {step >= 2 && demo?.draft && (
          <div className="first-win-draft">
            <div className="first-win-draft-label">{t("firstWin.chase.draftReady")}</div>
            <div className="first-win-draft-subject">{demo.draft.subject}</div>
            <pre className="first-win-draft-body">{demo.draft.body}</pre>
            <div className="first-win-actions">
              <button type="button" className="btn-primary" onClick={handleMailto}>
                {t("firstWin.chase.openMail")}
              </button>
              <button type="button" className="btn-secondary" onClick={handleCopy}>
                {t("firstWin.chase.copy")}
              </button>
            </div>
            <p className="branding-help">{t("firstWin.chase.mailNote")}</p>
          </div>
        )}

        {note ? <p className="first-win-note">{note}</p> : null}
      </div>
    </section>
  );
}
