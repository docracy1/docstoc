import { useEffect, useState } from "react";
import {
  createCertificate,
  listCertificates,
  revokeCertificate,
  type Account,
  type CertificateRecord,
} from "../lib/api";
import { track } from "../lib/analytics";
import { markFirstWin } from "../lib/firstWin";
import { isBusinessPlan } from "../lib/plan";
import { formatUsDateTime } from "../lib/locale";
import { useT } from "../lib/i18n";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function CertificatesPage({ account }: { account: Account | null }) {
  const t = useT();
  const [certs, setCerts] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [includeFilename, setIncludeFilename] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ publicId: string } | null>(null);

  const isBusiness = isBusinessPlan(account);
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";

  async function refresh() {
    setLoading(true);
    try {
      const res = await listCertificates();
      setCerts(res.certificates);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("certificates.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (account) refresh();
    else setLoading(false);
  }, [account?.email]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setLastCreated(null);
    setHashing(true);
    try {
      const hash = await sha256Hex(file);
      setHashing(false);
      setCreating(true);
      const res = await createCertificate({
        sha256Hash: hash,
        originalFilename: includeFilename ? file.name : undefined,
        fileSizeBytes: file.size,
      });
      setLastCreated({ publicId: res.publicId });
      markFirstWin("cert");
      track("first_win_completed", { path: "cert" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("certificates.createFailed"));
    } finally {
      setHashing(false);
      setCreating(false);
    }
  }

  async function handleCopy(publicId: string) {
    try {
      await navigator.clipboard.writeText(`${appOrigin}/verify/${publicId}`);
      setCopiedId(publicId);
      setTimeout(() => setCopiedId((id) => (id === publicId ? null : id)), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm(t("certificates.revokeConfirm"))) return;
    setError(null);
    try {
      await revokeCertificate(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("certificates.revokeFailed"));
    }
  }

  if (!account) {
    return (
      <div className="panel">
        <h1>{t("certificates.title")}</h1>
        <p className="page-sub">{t("certificates.signInSub")}</p>
        <a className="btn-primary" href="/app/login">
          {t("nav.signin")}
        </a>
      </div>
    );
  }

  const busy = hashing || creating;

  return (
    <div className="webhooks-page">
      <section className="branding-card">
        <h1 className="webhooks-title">{t("certificates.title")}</h1>
        <p className="branding-help">{t("certificates.pageSub")}</p>

        {!isBusiness && (
          <div className="upgrade-nudge">
            {t("certificates.brandingHint")} <a href="/app/account">{t("certificates.upgradeLink")}</a>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <input
            type="checkbox"
            checked={includeFilename}
            onChange={(e) => setIncludeFilename(e.target.checked)}
            disabled={busy}
          />
          {t("certificates.includeFilename")}
        </label>

        <div style={{ marginTop: 12 }}>
          <label className="btn-primary" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {hashing ? t("certificates.hashing") : creating ? t("certificates.creating") : t("certificates.chooseFile")}
            <input type="file" onChange={handleFileChange} disabled={busy} style={{ display: "none" }} />
          </label>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {lastCreated && (
          <div className="branding-card" style={{ marginTop: 16 }}>
            <h2>{t("certificates.created")}</h2>
            <p>{t("certificates.shareLink")}</p>
            <code>{`${appOrigin}/verify/${lastCreated.publicId}`}</code>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-secondary" onClick={() => handleCopy(lastCreated.publicId)}>
                {copiedId === lastCreated.publicId ? t("certificates.copied") : t("certificates.copyLink")}
              </button>
              <a className="btn-secondary" href={`/verify/${lastCreated.publicId}`} target="_blank" rel="noopener noreferrer">
                {t("certificates.viewCertificate")}
              </a>
            </div>
            <p className="branding-help" style={{ marginTop: 12 }}>{t("certificates.embedBadge")}</p>
            <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {`<script src="${appOrigin}/api/verify/badge/${lastCreated.publicId}.js" async></script>`}
            </code>
          </div>
        )}

        {loading ? (
          <p className="page-sub">{t("common.loading")}</p>
        ) : certs.length === 0 ? (
          <p className="webhooks-empty">{t("certificates.empty")}</p>
        ) : (
          <ul className="webhooks-list">
            {certs.map((cert) => (
              <li key={cert.id}>
                <div>
                  <code>{cert.publicId}</code>
                  {cert.originalFilename ? ` — ${cert.originalFilename}` : ""}
                  <div className="page-sub">
                    {formatUsDateTime(cert.createdAt)} ·{" "}
                    {cert.status === "active" ? t("certificates.statusActive") : t("certificates.statusRevoked")}
                    {cert.otsStatus === "confirmed" && <> · {t("certificates.otsConfirmed")}</>}
                    {cert.otsStatus === "pending" && <> · {t("certificates.otsPending")}</>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => handleCopy(cert.publicId)}>
                    {copiedId === cert.publicId ? t("certificates.copied") : t("certificates.copyLink")}
                  </button>
                  {cert.status === "active" && (
                    <button type="button" className="btn-secondary" onClick={() => handleRevoke(cert.id)}>
                      {t("certificates.revoke")}
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
