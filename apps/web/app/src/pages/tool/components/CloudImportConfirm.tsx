import type { PendingCloudImport } from "../types";
import { useT } from "../../../lib/i18n";

interface CloudImportConfirmProps {
  pendingImport: PendingCloudImport;
  importClient: string;
  importAmount: string;
  importDue: string;
  onImportClientChange: (value: string) => void;
  onImportAmountChange: (value: string) => void;
  onImportDueChange: (value: string) => void;
  onConfirm: (e: React.FormEvent) => void;
  onDismiss: () => void;
}

export function CloudImportConfirm({
  pendingImport,
  importClient,
  importAmount,
  importDue,
  onImportClientChange,
  onImportAmountChange,
  onImportDueChange,
  onConfirm,
  onDismiss,
}: CloudImportConfirmProps) {
  const t = useT();
  return (
    <div className="panel cloud-import-panel">
      <h2 className="cloud-import-title">{t("cloudImport.title")}</h2>
      <p className="branding-help">
        {pendingImport.providerLabel}: <code>{pendingImport.file.name}</code>
        {pendingImport.hints.confidence !== "none"
          ? ` · ${pendingImport.hints.confidence}`
          : ` · ${t("cloudImport.noHints")}`}
      </p>
      {pendingImport.previewDataUrl && (
        <img className="cloud-import-preview-thumb" src={pendingImport.previewDataUrl} alt="" />
      )}
      <form onSubmit={onConfirm}>
        <div className="field-row">
          <input
            type="text"
            placeholder={t("intake.clientPlaceholder")}
            value={importClient}
            onChange={(e) => onImportClientChange(e.target.value)}
          />
          <input
            type="number"
            placeholder={t("intake.amountPlaceholder")}
            value={importAmount}
            onChange={(e) => onImportAmountChange(e.target.value)}
            step="0.01"
          />
          <input
            type="date"
            value={importDue}
            onChange={(e) => onImportDueChange(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            {t("cloudImport.add")}
          </button>
          <button type="button" className="btn-secondary" onClick={onDismiss}>
            {t("cloudImport.dismiss")}
          </button>
        </div>
      </form>
      {pendingImport.textPreview ? (
        <details className="cloud-import-preview">
          <summary>
            {t("cloudImport.preview")} ({pendingImport.extractedChars})
          </summary>
          <pre>{pendingImport.textPreview}</pre>
        </details>
      ) : (
        <p className="branding-help">{t("cloudImport.scanned")}</p>
      )}
    </div>
  );
}
