import { track } from "../../../lib/analytics";
import { FREE_LIMIT } from "../../../lib/usage";
import { daysOverdue } from "../../../lib/dates";
import { useT } from "../../../lib/i18n";
import { toneClass, toneLabel } from "../chaseTone";
import type { Invoice } from "../types";

interface AgingOverviewPanelProps {
  invoices: Invoice[];
  isPaid: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  multiBusy: boolean;
  atLimit: boolean;
  multiError: string | null;
  multiDraft: { subject: string; body: string } | null;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMultiDraft: () => void;
  onToggleSelect: (id: string) => void;
  onScrollToInvoice: (id: string) => void;
  onGenerate: (id: string) => void;
  onMultiDraftChange: (draft: { subject: string; body: string }) => void;
  onOpenMultiMail: () => void;
  onDraftError: (message: string) => void;
  onDeleteRow: (id: string) => void;
  onAddToCalendar?: (id: string) => void;
  calendarBusyId?: string | null;
  calendarNote?: { id: string; message: string; error: boolean } | null;
}

export function AgingOverviewPanel({
  invoices,
  isPaid,
  selectedIds,
  selectedCount,
  multiBusy,
  atLimit,
  multiError,
  multiDraft,
  onSelectAll,
  onClearSelection,
  onMultiDraft,
  onToggleSelect,
  onScrollToInvoice,
  onGenerate,
  onMultiDraftChange,
  onOpenMultiMail,
  onDraftError,
  onDeleteRow,
  onAddToCalendar,
  calendarBusyId,
  calendarNote,
}: AgingOverviewPanelProps) {
  const t = useT();
  const anySelectedGenerating = invoices.some(
    (inv) => selectedIds.has(inv.id) && inv.generating
  );
  return (
    <section className="panel aging-panel">
      <div className="aging-head">
        <div>
          <h2 className="aging-title">{t("aging.title")}</h2>
          <p className="branding-help">{isPaid ? t("aging.helpPaid") : t("aging.helpFree")}</p>
          {selectedCount === 1 && (
            <p className="branding-help">{t("aging.singleSelectedHint")}</p>
          )}
          {selectedCount >= 2 && (
            <p className="branding-help">{t("aging.multiSelectedHint")}</p>
          )}
        </div>
        <div className="aging-actions">
          <button type="button" className="btn-secondary" onClick={onSelectAll}>
            {t("aging.selectAll")}
          </button>
          {selectedCount > 0 && (
            <button type="button" className="btn-secondary" onClick={onClearSelection}>
              {t("aging.clear", { count: selectedCount })}
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={
              selectedCount < 1 || multiBusy || atLimit || anySelectedGenerating
            }
            onClick={() => void onMultiDraft()}
          >
            {multiBusy || anySelectedGenerating
              ? t("common.writing")
              : selectedCount === 1
                ? t("aging.generateOne")
                : t("aging.draftSelected")}
          </button>
        </div>
      </div>
      <div className="aging-table-wrap">
        <table className="aging-table">
          <thead>
            <tr>
              <th className="aging-check" />
              <th>{t("aging.client")}</th>
              <th>{t("aging.amount")}</th>
              <th>{t("aging.days")}</th>
              <th>{t("aging.lastChase")}</th>
              <th />
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const days = daysOverdue(inv.dueDate);
              return (
                <tr key={inv.id} className={`aging-row ${toneClass(days)}`}>
                  <td className="aging-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => onToggleSelect(inv.id)}
                      aria-label={`Select ${inv.clientName}`}
                    />
                  </td>
                  <td>{inv.clientName}</td>
                  <td>${inv.amount.toFixed(2)}</td>
                  <td>
                    <span className={`days-badge ${toneClass(days)}`}>
                      {days}d · {toneLabel(days, t)}
                    </span>
                  </td>
                  <td className="aging-status">
                    {inv.lastChaseStatus ? (
                      <>
                        {inv.lastChaseStatus}
                        {inv.lastChaseAt && (
                          <span className="aging-status-time">
                            {new Date(inv.lastChaseAt).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={
                        inv.generating || multiBusy || (atLimit && !inv.draft)
                      }
                      onClick={() => {
                        if (inv.draft) {
                          onScrollToInvoice(inv.id);
                          return;
                        }
                        if (atLimit) {
                          onDraftError(t("usage.wallTitle", { limit: FREE_LIMIT }));
                          return;
                        }
                        void onGenerate(inv.id);
                        onScrollToInvoice(inv.id);
                      }}
                    >
                      {inv.generating
                        ? t("common.writing")
                        : inv.draft
                          ? t("aging.viewDraft")
                          : t("aging.generate")}
                    </button>
                  </td>
                  <td>
                    {onAddToCalendar && (
                      <button
                        type="button"
                        className="invoice-icon-btn"
                        title={t("aging.addToCalendar")}
                        aria-label={`Add ${inv.clientName} to Google Calendar`}
                        disabled={calendarBusyId === inv.id}
                        onClick={() => onAddToCalendar(inv.id)}
                      >
                        {calendarBusyId === inv.id ? "…" : "📅"}
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="invoice-icon-btn"
                      title={t("aging.deleteRow")}
                      aria-label={`Delete ${inv.clientName}`}
                      onClick={() => onDeleteRow(inv.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {multiError && <div className="error-msg">{multiError}</div>}
      {calendarNote && (
        <div className={calendarNote.error ? "error-msg" : "success-msg"}>
          {calendarNote.message}
        </div>
      )}
      {multiDraft && selectedCount >= 2 && (
        <div className="multi-draft-box">
          <div className="ai-tools-label">{t("aging.multiTitle", { count: selectedCount })}</div>
          <input
            type="text"
            className="draft-subject"
            value={multiDraft.subject}
            onChange={(e) => onMultiDraftChange({ ...multiDraft, subject: e.target.value })}
          />
          <textarea
            rows={8}
            value={multiDraft.body}
            onChange={(e) => onMultiDraftChange({ ...multiDraft, body: e.target.value })}
          />
          <div className="draft-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Subject: ${multiDraft.subject}\n\n${multiDraft.body}`
                );
                track("chase_sent", { method: "copy", source: "multi" });
              }}
            >
              {t("common.copy")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenMultiMail}
            >
              {t("aging.openMail")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
