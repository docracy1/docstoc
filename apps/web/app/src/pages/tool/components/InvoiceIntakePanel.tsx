import { Link } from "react-router-dom";
import { track } from "../../../lib/analytics";
import { useT } from "../../../lib/i18n";
import type { Invoice } from "../types";

interface InvoiceIntakePanelProps {
  clientName: string;
  amount: string;
  dueDate: string;
  paymentLink: string;
  paymentLinkError?: string | null;
  isPaid: boolean;
  invoices: Invoice[];
  onClientNameChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onPaymentLinkChange: (value: string) => void;
  onAddManual: (e: React.FormEvent) => void;
  onCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenPdfPicker: () => void;
  onOpenGooglePicker?: () => void;
  driveBusy?: boolean;
  driveError?: string | null;
  onSheetImport?: () => void;
  onSheetExport?: () => void;
  sheetId?: string;
  onSheetIdChange?: (value: string) => void;
  sheetBusy?: boolean;
  sheetMsg?: string | null;
  googleConnected?: boolean;
  googlePickerEnabled?: boolean;
  onDownloadCsv: () => void;
  onClearList: () => void;
}

export function InvoiceIntakePanel({
  clientName,
  amount,
  dueDate,
  paymentLink,
  paymentLinkError = null,
  isPaid,
  invoices,
  onClientNameChange,
  onAmountChange,
  onDueDateChange,
  onPaymentLinkChange,
  onAddManual,
  onCsvUpload,
  onOpenPdfPicker,
  onOpenGooglePicker,
  driveBusy = false,
  driveError = null,
  onSheetImport,
  onSheetExport,
  sheetId = "",
  onSheetIdChange,
  sheetBusy = false,
  sheetMsg = null,
  googleConnected = false,
  googlePickerEnabled = false,
  onDownloadCsv,
  onClearList,
}: InvoiceIntakePanelProps) {
  const t = useT();

  return (
    <div className="panel">
      <form onSubmit={onAddManual}>
        <div className="field-row">
          <input
            type="text"
            placeholder={t("intake.clientPlaceholder")}
            value={clientName}
            onChange={(e) => onClientNameChange(e.target.value)}
          />
          <input
            type="number"
            placeholder={t("intake.amountPlaceholder")}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            step="0.01"
          />
          <input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} />
          <button type="submit" className="btn-primary">
            {t("intake.add")}
          </button>
        </div>
      </form>
      <div className="payment-link-row">
        <label htmlFor="payment-link">
          {t("intake.paymentLink")}{" "}
          <span className="optional-tag">{t("common.optional")}</span>
        </label>
        <input
          id="payment-link"
          type="url"
          placeholder={t("intake.paymentPlaceholderFull")}
          value={paymentLink}
          onChange={(e) => onPaymentLinkChange(e.target.value)}
          aria-invalid={paymentLinkError ? true : undefined}
        />
        {paymentLinkError && <div className="error-msg">{paymentLinkError}</div>}
        {isPaid ? (
          <Link className="branding-help" to="/branding">
            {t("intake.setDefault")}
          </Link>
        ) : (
          <span className="branding-help">{t("intake.browserOnly")}</span>
        )}
      </div>
      <label className="btn-secondary" style={{ cursor: "pointer" }}>
        {t("intake.uploadCsv")}
        <input type="file" accept=".csv" onChange={onCsvUpload} style={{ display: "none" }} />
      </label>
      {isPaid ? (
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: 8 }}
          onClick={() => void onOpenPdfPicker()}
        >
          {t("intake.importPdf")}
        </button>
      ) : (
        <Link className="btn-secondary" style={{ marginLeft: 8 }} to="/account">
          {t("intake.pdfSolo")}
        </Link>
      )}
      {isPaid && googlePickerEnabled && onOpenGooglePicker && (
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: 8 }}
          disabled={driveBusy}
          onClick={() => void onOpenGooglePicker()}
        >
          {driveBusy ? t("common.loading") : t("intake.openDrive")}
        </button>
      )}
      {driveError && <div className="error-msg">{driveError}</div>}
      {isPaid && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder={t("intake.sheetId")}
              value={sheetId}
              onChange={(e) => onSheetIdChange?.(e.target.value)}
              style={{ minWidth: 220 }}
              disabled={!googleConnected || sheetBusy}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={!googleConnected || sheetBusy || !sheetId.trim()}
              onClick={() => void onSheetImport?.()}
            >
              {sheetBusy ? t("intake.working") : t("intake.importSheet")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!googleConnected || sheetBusy || invoices.length === 0}
              onClick={() => void onSheetExport?.()}
            >
              {t("intake.exportAging")}
            </button>
            {!googleConnected && (
              <Link className="branding-help" to="/connector">
                {t("intake.connectGoogle")}
              </Link>
            )}
            {sheetMsg && <span className="branding-help">{sheetMsg}</span>}
          </div>
          <p className="branding-help" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("intake.sheetFormat")}
          </p>
        </div>
      )}
      {isPaid && invoices.some((inv) => inv.draft) && (
        <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={onDownloadCsv}>
          {t("intake.downloadCsv")}
        </button>
      )}
      {invoices.length > 0 && (
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: 8 }}
          onClick={() => {
            if (confirm(t("intake.clearConfirm"))) {
              onClearList();
              track("aging_cleared");
            }
          }}
        >
          {t("intake.clearList")}
        </button>
      )}
    </div>
  );
}
