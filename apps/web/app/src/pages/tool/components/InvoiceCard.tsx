import type { RewriteAction } from "../../../lib/api";
import { daysOverdue } from "../../../lib/dates";
import { useT } from "../../../lib/i18n";
import { chaseTip, toneClass, toneLabel } from "../chaseTone";
import type { Invoice } from "../types";
import { ChaseTimeline } from "./ChaseTimeline";
import { Link } from "react-router-dom";

interface InvoiceCardProps {
  invoice: Invoice;
  isPaid: boolean;
  isPro: boolean;
  atLimit: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  onCancelGenerate?: (id: string) => void;
  onUpdateDraft: (invoiceId: string, field: "subject" | "body", value: string) => void;
  onRewrite: (invoiceId: string, action: RewriteAction) => void;
  onThankYou: (invoiceId: string) => void;
  onSequence: (invoiceId: string) => void;
  onSms: (invoiceId: string) => void;
  onClientReplyChange: (invoiceId: string, value: string) => void;
  onReply: (invoiceId: string) => void;
  onReplySmart: (invoiceId: string) => void;
  onDemandLetter: (invoiceId: string) => void;
  onMarkSent: (invoice: Invoice) => void;
  onRequestSoxApproval?: (invoice: Invoice) => void;
  soxSodRequired?: boolean;
  onMarkPaid: (invoice: Invoice) => void;
  onApplySequenceStep: (invoiceId: string, stepIndex: number) => void;
  onCopyNextReminder: (invoice: Invoice) => void;
  onMarkReminderDone: (invoiceId: string, reminderId: string) => void;
  onSnoozeReminder: (invoiceId: string, reminderId: string, days: number) => void;
  onScheduleReplyFollowUp: (invoiceId: string) => void;
  onEvidencePack: (invoiceId: string) => void;
  openStats?: { openCount: number; clickCount: number; lastOpenAt: string | null };
  onCopyDraft: (invoice: Invoice) => void;
  onTrackedCopy: (invoice: Invoice) => void;
  onSaveGmailDraft?: (invoice: Invoice) => void;
  googleConnected?: boolean;
  onSyncReminderCalendar?: (invoiceId: string, reminderId: string) => void;
  onFetchGmailReply?: (invoiceId: string) => void;
  onReplySmartFromGmail?: (invoiceId: string) => void;
  onMailtoClick: (invoice: Invoice) => void;
  sequenceSendDate: (daysFromNow: number) => string;
}

export function InvoiceCard({
  invoice,
  isPaid,
  isPro,
  atLimit,
  selectedIds,
  onToggleSelect,
  onGenerate,
  onCancelGenerate,
  onUpdateDraft,
  onRewrite,
  onThankYou,
  onSequence,
  onSms,
  onClientReplyChange,
  onReply,
  onReplySmart,
  onDemandLetter,
  onMarkSent,
  onRequestSoxApproval,
  soxSodRequired = false,
  onMarkPaid,
  onApplySequenceStep,
  onCopyNextReminder,
  onMarkReminderDone,
  onSnoozeReminder,
  onScheduleReplyFollowUp,
  onEvidencePack,
  openStats,
  onCopyDraft,
  onTrackedCopy,
  onSaveGmailDraft,
  googleConnected = false,
  onSyncReminderCalendar,
  onFetchGmailReply,
  onReplySmartFromGmail,
  onMailtoClick,
  sequenceSendDate,
}: InvoiceCardProps) {
  const days = daysOverdue(invoice.dueDate);
  const tone = toneClass(days);
  const busy = invoice.generating || invoice.rewriting !== null;
  const isPaidInvoice = invoice.status === "paid";
  const t = useT();

  return (
    <div id={`invoice-${invoice.id}`} className={`invoice-card ${tone} ${isPaidInvoice ? "invoice-paid" : ""}`}>
      <div className="invoice-top">
        <div className="invoice-top-left">
          <label className="invoice-select">
            <input
              type="checkbox"
              checked={selectedIds.has(invoice.id)}
              onChange={() => onToggleSelect(invoice.id)}
            />
            <span className="invoice-client">{invoice.clientName}</span>
          </label>
          <div className="invoice-meta">
            ${invoice.amount.toFixed(2)} · {t("invoice.dueLabel")} {invoice.dueDate}
            {isPaidInvoice ? ` ${t("invoice.paid")}` : ""}
            {invoice.lastChaseStatus ? ` ${t("invoice.lastChase")} ${invoice.lastChaseStatus}` : ""}
          </div>
        </div>
        <span className="days-badge">
          {toneLabel(days, t)} ·{" "}
          {days === 1 ? t("invoice.dayLate", { days }) : t("invoice.daysLate", { days })}
        </span>
      </div>

      <div className="chase-tip">{chaseTip(days, t)}</div>

      {!invoice.draft && (
        <button
          className="btn-primary"
          disabled={busy || atLimit}
          onClick={() => void onGenerate(invoice.id)}
        >
          {invoice.generating ? t("common.writing") : t("invoice.generate")}
        </button>
      )}
      {invoice.generating && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <p className="branding-help" style={{ margin: 0 }}>
            {t("tool.generateSlow")}
          </p>
          {onCancelGenerate && (
            <button type="button" className="btn-secondary" onClick={() => onCancelGenerate(invoice.id)}>
              {t("tool.generateCancel")}
            </button>
          )}
        </div>
      )}
      {invoice.error && <div className="error-msg">{invoice.error}</div>}

      {invoice.draft && (
        <>
          <input
            type="text"
            className="draft-subject"
            value={invoice.draft.subject}
            onChange={(e) => onUpdateDraft(invoice.id, "subject", e.target.value)}
          />
          <textarea
            rows={6}
            value={invoice.draft.body}
            onChange={(e) => onUpdateDraft(invoice.id, "body", e.target.value)}
          />

          <div className={`ai-tools-inline ${isPaid ? "" : "ai-tools-locked"}`}>
            <div className="ai-tools-label">
              {t("invoice.aiTools")} {isPaid ? null : <span className="paid-pill">{t("invoice.paidBadge")}</span>}
            </div>
            {isPaid ? (
              <>
                <button
                  type="button"
                  className="ai-tool-btn"
                  disabled={busy}
                  onClick={() => onRewrite(invoice.id, "softer")}
                >
                  <span className="ai-tool-icon" aria-hidden="true">
                    ↓
                  </span>
                  <span>
                    <strong>{invoice.rewriting === "softer" ? t("invoice.softening") : t("invoice.soften")}</strong>
                    <span>{t("invoice.softenSub")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-tool-btn"
                  disabled={busy}
                  onClick={() => onRewrite(invoice.id, "firmer")}
                >
                  <span className="ai-tool-icon" aria-hidden="true">
                    ↑
                  </span>
                  <span>
                    <strong>{invoice.rewriting === "firmer" ? t("invoice.firming") : t("invoice.firm")}</strong>
                    <span>{t("invoice.firmSub")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-tool-btn"
                  disabled={busy}
                  onClick={() => onRewrite(invoice.id, "shorter")}
                >
                  <span className="ai-tool-icon" aria-hidden="true">
                    ✂
                  </span>
                  <span>
                    <strong>
                      {invoice.rewriting === "shorter" ? t("invoice.shortening") : t("invoice.makeShorter")}
                    </strong>
                    <span>{t("invoice.shorterSub")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-tool-btn"
                  disabled={busy}
                  onClick={() => onThankYou(invoice.id)}
                >
                  <span className="ai-tool-icon" aria-hidden="true">
                    ✓
                  </span>
                  <span>
                    <strong>
                      {invoice.rewriting === "thankyou" ? t("common.writing") : t("invoice.thankYouEmail")}
                    </strong>
                    <span>{t("invoice.thankYouSub")}</span>
                  </span>
                </button>
                {isPaid ? (
                  <button
                    type="button"
                    className="ai-tool-btn"
                    disabled={busy}
                    onClick={() => onSequence(invoice.id)}
                  >
                    <span className="ai-tool-icon" aria-hidden="true">
                      ⏱
                    </span>
                    <span>
                      <strong>
                        {invoice.rewriting === "sequence" ? t("invoice.planning") : t("invoice.sequencePlan")}
                      </strong>
                      <span>{t("invoice.sequenceSub")}</span>
                    </span>
                  </button>
                ) : (
                  <a className="ai-unlock-link" href="/app/account">
                    {t("invoice.unlockSoloPlans")}
                  </a>
                )}
                {isPaid && (
                  <button
                    type="button"
                    className="ai-tool-btn"
                    disabled={busy}
                    onClick={() => onSms(invoice.id)}
                  >
                    <span className="ai-tool-icon" aria-hidden="true">
                      ✉
                    </span>
                    <span>
                      <strong>
                        {invoice.rewriting === "sms" ? t("common.writing") : t("invoice.sms")}
                      </strong>
                      <span>{t("invoice.smsSub")}</span>
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="ai-tool-btn ai-tool-teaser" aria-disabled="true">
                  <span className="ai-tool-icon" aria-hidden="true">
                    ↓
                  </span>
                  <span>
                    <strong>{t("invoice.soften")}</strong>
                    <span>{t("invoice.softenSub")}</span>
                  </span>
                </div>
                <div className="ai-tool-btn ai-tool-teaser" aria-disabled="true">
                  <span className="ai-tool-icon" aria-hidden="true">
                    ↑
                  </span>
                  <span>
                    <strong>{t("invoice.firm")}</strong>
                    <span>{t("invoice.firmSub")}</span>
                  </span>
                </div>
                <div className="ai-tool-btn ai-tool-teaser" aria-disabled="true">
                  <span className="ai-tool-icon" aria-hidden="true">
                    ✂
                  </span>
                  <span>
                    <strong>{t("invoice.makeShorter")}</strong>
                    <span>{t("invoice.shorterSub")}</span>
                  </span>
                </div>
                <a className="ai-unlock-link" href="/app/account">
                  {t("invoice.unlockAiTools")}
                </a>
              </>
            )}
          </div>

          {isPaid && (
            <div className="reply-box">
              <label className="ai-tools-label">{t("invoice.replyLabel")}</label>
              <textarea
                rows={3}
                placeholder={t("invoice.replyPlaceholder")}
                value={invoice.clientReply ?? ""}
                onChange={(e) => onClientReplyChange(invoice.id, e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !invoice.clientReply?.trim()}
                onClick={() => onReply(invoice.id)}
              >
                {invoice.rewriting === "reply" ? t("invoice.writingReply") : t("invoice.draftReply")}
              </button>
              {isPro ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || !invoice.clientReply?.trim()}
                    onClick={() => onReplySmart(invoice.id)}
                  >
                    {invoice.rewriting === "replySmart" ? t("invoice.analyzing") : t("invoice.smartReply")}
                  </button>
                  {onReplySmartFromGmail && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => onReplySmartFromGmail(invoice.id)}
                    >
                      {invoice.rewriting === "replySmart" ? t("invoice.checkingGmail") : t("invoice.smartReplyGmail")}
                    </button>
                  )}
                  {onFetchGmailReply && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => onFetchGmailReply(invoice.id)}
                    >
                      {t("invoice.findGmail")}
                    </button>
                  )}
                </>
              ) : (
                <a className="ai-unlock-link" href="/app/account">
                  {t("invoice.unlockProReply")}
                </a>
              )}
              {invoice.replyInsight && (
                <div className="reply-insight">
                  <strong>{invoice.replyInsight.classification.replace(/_/g, " ")}</strong>
                  <p>{invoice.replyInsight.summary}</p>
                  <p className="chase-tip">{invoice.replyInsight.suggestedAction}</p>
                  {invoice.replyInsight.promisedPayDate && (
                    <p className="chase-tip">
                      {t("invoice.promisedDate")} {invoice.replyInsight.promisedPayDate}
                    </p>
                  )}
                  {isPro &&
                    invoice.replyInsight.classification === "payment_promise" && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginTop: 8 }}
                        onClick={() => onScheduleReplyFollowUp(invoice.id)}
                      >
                        {t("invoice.scheduleFollowUp")}
                      </button>
                    )}
                </div>
              )}
            </div>
          )}

          {invoice.sequence && (
            <div className="sequence-box">
              <div className="ai-tools-label">{t("invoice.calendar")}</div>
              <p className="chase-tip">{invoice.sequence.tip}</p>
              <div className="sequence-steps">
                {invoice.sequence.steps.map((step, idx) => (
                  <button
                    key={step.step}
                    type="button"
                    className="sequence-step"
                    onClick={() => onApplySequenceStep(invoice.id, idx)}
                  >
                    <strong>
                      {t("dueToday.step", { n: step.step })}
                      {step.daysFromNow === 0
                        ? t("invoice.sendToday")
                        : ` · ${sequenceSendDate(step.daysFromNow)}`}
                    </strong>
                    <span>{step.label}</span>
                    <span className="sequence-step-date">
                      {step.daysFromNow === 0
                        ? t("invoice.today")
                        : step.daysFromNow === 1
                          ? t("invoice.inDaysOne", { days: step.daysFromNow })
                          : t("invoice.inDaysMany", { days: step.daysFromNow })}
                    </span>
                  </button>
                ))}
              </div>
              {invoice.reminders && invoice.reminders.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onCopyNextReminder(invoice)}
                  >
                    {t("invoice.copyNext")}
                  </button>
                  {invoice.reminders
                    .filter((r) => r.status === "planned")
                    .slice(0, 1)
                    .map((r) => (
                      <span key={r.id} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onMarkReminderDone(invoice.id, r.id)}
                        >
                          {t("invoice.markDone")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onSnoozeReminder(invoice.id, r.id, 7)}
                        >
                          {t("invoice.snooze")}
                        </button>
                        {onSyncReminderCalendar && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => onSyncReminderCalendar(invoice.id, r.id)}
                          >
                            {t("invoice.addCalendar")}
                          </button>
                        )}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {invoice.smsDraft && (
            <div className="sequence-box">
              <div className="ai-tools-label">{t("invoice.smsWhatsApp")}</div>
              <p className="chase-tip">{invoice.smsDraft.sms}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigator.clipboard.writeText(invoice.smsDraft!.sms)}
                >
                  {t("invoice.copySms")}
                </button>
                <a className="btn-secondary" href={invoice.smsDraft.smsUri}>
                  {t("invoice.openSms")}
                </a>
              </div>
              <p className="chase-tip">{invoice.smsDraft.whatsapp}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigator.clipboard.writeText(invoice.smsDraft!.whatsapp)}
                >
                  {t("invoice.copyWa")}
                </button>
                <a
                  className="btn-secondary"
                  href={invoice.smsDraft.whatsappUri}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("invoice.openWa")}
                </a>
              </div>
            </div>
          )}

          <div className="draft-actions">
            <button className="btn-secondary" onClick={() => onCopyDraft(invoice)}>
              {t("common.copy")}
            </button>
            {isPaid && (
              <button className="btn-secondary" onClick={() => onTrackedCopy(invoice)}>
                {t("invoice.copyTracked")}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onMailtoClick(invoice)}
            >
              {t("invoice.openMail")}
            </button>
            {isPaid && onSaveGmailDraft && (
              <button
                type="button"
                className="btn-secondary"
                title={t("invoice.saveGmailTitle")}
                onClick={() => onSaveGmailDraft(invoice)}
              >
                {t("invoice.saveGmail")}
              </button>
            )}
            {isPaid && !googleConnected && !onSaveGmailDraft && (
              <Link className="btn-secondary" to="/connector">
                {t("invoice.connectGoogle")}
              </Link>
            )}
            {isPaid && !isPaidInvoice && (
              <button type="button" className="btn-secondary" onClick={() => onMarkSent(invoice)}>
                {t("invoice.markSent")}
              </button>
            )}
            {isPro && soxSodRequired && !isPaidInvoice && onRequestSoxApproval && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onRequestSoxApproval(invoice)}
                title={t("invoice.requestSoxApprovalTitle")}
              >
                {t("invoice.requestSoxApproval")}
              </button>
            )}
            {isPaid && !isPaidInvoice && (
              <button type="button" className="btn-secondary" onClick={() => onMarkPaid(invoice)}>
                {t("invoice.markPaid")}
              </button>
            )}
            {isPro && !isPaidInvoice && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => onDemandLetter(invoice.id)}
              >
                {invoice.rewriting === "demandLetter"
                  ? t("invoice.generating")
                  : t("invoice.demandLetter")}
              </button>
            )}
            {isPaid && !isPro && !isPaidInvoice && (
              <Link className="btn-secondary" to="/account">
                {t("invoice.unlockDemandLetter")}
              </Link>
            )}
            <button
              className="btn-secondary"
              disabled={busy || atLimit}
              onClick={() => void onGenerate(invoice.id)}
            >
              {invoice.generating ? t("common.writing") : t("invoice.regenerate")}
            </button>
          </div>
          {openStats && (openStats.openCount > 0 || openStats.clickCount > 0) && (
            <p className="chase-tip" style={{ marginTop: 8 }}>
              {t("invoice.trackedOpens", {
                opens: openStats.openCount,
                openLabel:
                  openStats.openCount === 1 ? t("invoice.openOne") : t("invoice.openMany"),
                clicks:
                  openStats.clickCount > 0
                    ? ` · ${openStats.clickCount} ${
                        openStats.clickCount === 1
                          ? t("invoice.clickOne")
                          : t("invoice.clickMany")
                      }`
                    : "",
                lastOpened: openStats.lastOpenAt
                  ? t("invoice.lastOpened", {
                      date: new Date(openStats.lastOpenAt).toLocaleDateString(),
                    })
                  : "",
              })}
            </p>
          )}
          {isPro && !isPaidInvoice && (
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => onEvidencePack(invoice.id)}
            >
              {t("invoice.evidence")}
            </button>
          )}
          {isPaid && !isPro && !isPaidInvoice && (
            <Link className="ai-unlock-link" to="/account" style={{ display: "inline-block", marginTop: 8 }}>
              {t("invoice.unlockEvidence")}
            </Link>
          )}
          {isPaid && invoice.timeline && <ChaseTimeline events={invoice.timeline} />}
          {invoice.trackingNote && (
            <p className="chase-tip" style={{ marginTop: 8 }}>
              {invoice.trackingNote}
            </p>
          )}
        </>
      )}
    </div>
  );
}
