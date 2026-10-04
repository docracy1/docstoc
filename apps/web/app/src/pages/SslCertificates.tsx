import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  createCustomHostname,
  deleteCustomHostname,
  downloadCustomHostname,
  getMyTrustProfile,
  getSslHealth,
  listCustomHostnames,
  renewCustomHostname,
  verifyCustomHostname,
  type Account,
  type CustomerCertificate,
  type SslFeatures,
  type SslHealth,
  type TrustProfileRecord,
} from "../lib/api";
import { track } from "../lib/analytics";
import { markFirstWin } from "../lib/firstWin";
import { isBusinessPlan, isPaidPlan } from "../lib/plan";
import { useT } from "../lib/i18n";

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function challengeLines(cert: CustomerCertificate): Array<{ name: string; value: string }> {
  if (cert.dns01Challenges?.length) {
    return cert.dns01Challenges.map((c) => ({ name: c.recordName, value: c.txtValue }));
  }
  if (cert.dns01TxtValue) {
    const host = cert.domain.startsWith("*.") ? cert.domain.slice(2) : cert.domain;
    return [{ name: `_acme-challenge.${host}`, value: cert.dns01TxtValue }];
  }
  return [];
}

export default function SslCertificatesPage({ account }: { account: Account | null }) {
  const t = useT();
  const location = useLocation();
  const isPaid = isPaidPlan(account);
  const isBusiness = isBusinessPlan(account);
  const [certificates, setCertificates] = useState<CustomerCertificate[]>([]);
  const [limit, setLimit] = useState(5);
  const [features, setFeatures] = useState<SslFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [extraSans, setExtraSans] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<Record<string, string>>({});
  const [installHelpId, setInstallHelpId] = useState<string | null>(null);
  const [trustProfile, setTrustProfile] = useState<TrustProfileRecord | null>(null);
  const [sslHealth, setSslHealth] = useState<SslHealth | null>(null);
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";

  async function refresh() {
    setLoading(true);
    try {
      const [res, health] = await Promise.all([
        listCustomHostnames(),
        getSslHealth().catch((err): SslHealth => ({
          ok: false,
          relayConfigured: false,
          relayReachable: false,
          letsEncryptReachable: false,
          directory: "production",
          directoryUrl: "",
          error: err instanceof Error ? err.message : t("ssl.healthFailed"),
        })),
      ]);
      setCertificates(res.certificates);
      setLimit(res.limit);
      setFeatures(res.features);
      setSslHealth(health);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.loadFailed"));
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
    getMyTrustProfile()
      .then((res) => setTrustProfile(res.profile))
      .catch(() => {});
  }, [account?.email]);

  useEffect(() => {
    const id = location.hash.replace(/^#/, "") || "domains";
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, loading]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const primary = domain.trim();
      const extras = extraSans
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const hostnames = features?.multiSan && extras.length ? [primary, ...extras] : undefined;
      await createCustomHostname(primary, hostnames);
      setDomain("");
      setExtraSans("");
      markFirstWin("ssl");
      track("first_win_completed", { path: "ssl" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(id: string) {
    setBusy(true);
    setError(null);
    setPendingMessage((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await verifyCustomHostname(id);
      if (res.status === "pending") {
        setPendingMessage((prev) => ({ ...prev, [id]: t("ssl.stillPending") }));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.checkFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRenew(id: string) {
    setBusy(true);
    setError(null);
    setPendingMessage((prev) => ({ ...prev, [id]: "" }));
    try {
      await renewCustomHostname(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.renewFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(cert: CustomerCertificate) {
    setBusy(true);
    setError(null);
    try {
      const res = await downloadCustomHostname(cert.id);
      const safe = cert.domain.replace(/[^a-zA-Z0-9.*-]/g, "_");
      downloadTextFile(`${safe}.crt.pem`, res.certificatePem);
      downloadTextFile(`${safe}.key.pem`, res.privateKeyPem);
      setInstallHelpId(cert.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("ssl.removeConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCustomHostname(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ssl.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <div className="panel">
        <h1>{t("ssl.title")}</h1>
        <p className="page-sub">{t("ssl.signInSub")}</p>
        <a className="btn-primary" href="/app/login">
          {t("nav.signin")}
        </a>
      </div>
    );
  }

  const used = certificates.length;
  const atLimit = used >= limit;
  const multiSanOn = features?.multiSan ?? isPaid;
  const wildcardOn = features?.wildcard ?? isBusiness;
  const acmeOn = features?.acmeApi ?? isPaid;
  const maxSans = features?.maxSansPerCert ?? (isBusiness ? 100 : isPaid ? 10 : 1);
  const wildcardLimit = features?.wildcardLimit ?? (isBusiness ? 1 : 0);
  const wildcardCerts = certificates.filter((cert) =>
    (cert.hostnames?.length ? cert.hostnames : [cert.domain]).some((h) => h.startsWith("*.") )
  );
  const multiSanCerts = certificates.filter((cert) => (cert.hostnames?.length ?? 0) > 1);
  const wildcardUsed = wildcardCerts.length;

  function certKindLabels(cert: CustomerCertificate): string[] {
    const names = cert.hostnames?.length ? cert.hostnames : [cert.domain];
    const labels: string[] = [];
    if (names.some((h) => h.startsWith("*."))) labels.push(t("ssl.badgeWildcard"));
    if (names.length > 1) labels.push(t("ssl.badgeMultiSan"));
    return labels;
  }

  return (
    <div className="webhooks-page ssl-page">
      <section className="branding-card">
        <h1 className="webhooks-title">{t("ssl.title")}</h1>
        <p className="branding-help">{t("ssl.pageSub")}</p>
        <p className="branding-help" style={{ marginTop: 8 }}>
          {t("ssl.usage", { used, limit })}
        </p>
        <p className="branding-help" style={{ marginTop: 8 }}>
          <a href="/ssl/features/installation" target="_blank" rel="noopener noreferrer">
            {t("ssl.installGuideLink")}
          </a>
          {" · "}
          <a href="/ssl/features/wildcards" target="_blank" rel="noopener noreferrer">
            {t("ssl.wildcardGuideLink")}
          </a>
        </p>

        <div
          className={`ssl-health-banner${sslHealth?.ok ? " is-ok" : " is-bad"}`}
          role="status"
          aria-live="polite"
        >
          {sslHealth == null ? (
            <p>{t("ssl.healthChecking")}</p>
          ) : sslHealth.ok ? (
            <p>
              <strong>{t("ssl.healthOk")}</strong>{" "}
              {t("ssl.healthOkDetail", { directory: sslHealth.directory })}
            </p>
          ) : (
            <p>
              <strong>{t("ssl.healthBad")}</strong>{" "}
              {sslHealth.error || t("ssl.healthFailed")}
            </p>
          )}
        </div>

        <div className="ssl-feature-grid" aria-label={t("ssl.title")}>
          <a className="ssl-feature-card" href="#domains">
            <span className="ssl-feature-card-title">{t("ssl.featureCertificates")}</span>
            <span className="ssl-feature-card-meta">
              {t("ssl.featureSlots", { used, limit })}
              <br />
              {t("ssl.featureCertificatesBody")}
            </span>
            <span className="ssl-feature-pill is-on">{t("ssl.featureIncluded")}</span>
          </a>
          <a className={`ssl-feature-card${multiSanOn ? "" : " is-locked"}`} href="#multi-san">
            <span className="ssl-feature-card-title">{t("ssl.featureMultiSan")}</span>
            <span className="ssl-feature-card-meta">
              {multiSanOn
                ? t("ssl.featureMultiSanMeta", { count: multiSanCerts.length, max: maxSans })
                : t("ssl.featureMultiSanBody")}
            </span>
            <span className={`ssl-feature-pill${multiSanOn ? " is-on" : " is-off"}`}>
              {multiSanOn ? t("ssl.featureIncluded") : t("ssl.featureLocked")}
            </span>
          </a>
          <a className={`ssl-feature-card${wildcardOn ? "" : " is-locked"}`} href="#wildcards">
            <span className="ssl-feature-card-title">{t("ssl.featureWildcards")}</span>
            <span className="ssl-feature-card-meta">
              {wildcardOn
                ? t("ssl.featureWildcardsMeta", { used: wildcardUsed, limit: wildcardLimit })
                : t("ssl.featureWildcardsBody")}
            </span>
            <span className={`ssl-feature-pill${wildcardOn ? " is-on" : " is-off"}`}>
              {wildcardOn ? t("ssl.featureIncluded") : t("ssl.featureLocked")}
            </span>
          </a>
          <a className={`ssl-feature-card${acmeOn ? "" : " is-locked"}`} href="#acme">
            <span className="ssl-feature-card-title">{t("ssl.featureAcme")}</span>
            <span className="ssl-feature-card-meta">{t("ssl.featureAcmeBody")}</span>
            <span className={`ssl-feature-pill${acmeOn ? " is-on" : " is-off"}`}>
              {acmeOn ? t("ssl.featureIncluded") : t("ssl.featureLocked")}
            </span>
          </a>
        </div>
      </section>

      <section id="domains" className="branding-card ssl-section">
        <h2>{t("ssl.issueSectionTitle")}</h2>
        <form onSubmit={handleAdd} className="ssl-issue-form">
          <div className="ssl-issue-row">
            <input
              type="text"
              required
              placeholder={wildcardOn ? t("ssl.domainPlaceholderWildcard") : t("ssl.domainPlaceholder")}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={busy || atLimit}
            />
            <button type="submit" className="btn-primary" disabled={busy || atLimit}>
              {busy ? t("common.saving") : t("ssl.add")}
            </button>
          </div>
          <input
            type="text"
            placeholder={t("ssl.extraSansPlaceholder")}
            value={extraSans}
            onChange={(e) => setExtraSans(e.target.value)}
            disabled={busy || atLimit || !multiSanOn}
            aria-describedby="ssl-multi-san-help"
          />
          {!multiSanOn ? (
            <p id="ssl-multi-san-help" className="branding-help">
              {t("ssl.multiSanUpgrade")}{" "}
              <a href="/app/account">{t("ssl.upgradeLink")}</a>
            </p>
          ) : null}
          {atLimit ? (
            <p className="branding-help">
              {t("ssl.atLimit")}{" "}
              <a href="/app/account">{t("ssl.upgradeLink")}</a>
            </p>
          ) : null}
        </form>

        {error && <div className="error-msg">{error}</div>}

        {loading ? (
          <p className="page-sub">{t("common.loading")}</p>
        ) : certificates.length === 0 ? (
          <p className="webhooks-empty">{t("ssl.empty")}</p>
        ) : (
          <ul className="webhooks-list">
            {certificates.map((cert) => (
              <li key={cert.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <div className="ssl-cert-name-row">
                      <code>{cert.hostnames?.length ? cert.hostnames.join(", ") : cert.domain}</code>
                      {certKindLabels(cert).map((label) => (
                        <span key={label} className="ssl-cert-badge">
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="page-sub">
                      {cert.status === "issued"
                        ? t("ssl.statusActive")
                        : cert.status === "expiring"
                          ? t("ssl.statusExpiring")
                          : cert.status === "failed"
                            ? t("ssl.statusError")
                            : t("ssl.statusPending")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(cert.status === "issued" || cert.status === "expiring") && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => handleDownload(cert)}
                      >
                        {t("ssl.download")}
                      </button>
                    )}
                    {cert.status === "expiring" ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => handleRenew(cert.id)}
                      >
                        {t("ssl.renew")}
                      </button>
                    ) : cert.status !== "issued" ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => handleVerify(cert.id)}
                      >
                        {t("ssl.checkStatus")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => handleDelete(cert.id)}
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                </div>

                {(cert.lastError || pendingMessage[cert.id]) && (
                  <p className="error-msg">{pendingMessage[cert.id] || cert.lastError}</p>
                )}

                {cert.status !== "issued" &&
                  cert.status !== "expiring" &&
                  challengeLines(cert).length > 0 && (
                    <div className="branding-card" style={{ margin: 0 }}>
                      <p className="branding-help">{t("ssl.step1Txt")}</p>
                      {challengeLines(cert).map((line) => (
                        <code
                          key={`${line.name}-${line.value}`}
                          style={{ display: "block", marginBottom: 6 }}
                        >
                          {`TXT  ${line.name}  →  ${line.value}`}
                        </code>
                      ))}
                      <p className="branding-help" style={{ marginTop: 10 }}>
                        {t("ssl.step2Wait")}
                      </p>
                    </div>
                  )}

                {installHelpId === cert.id && (
                  <div className="branding-card" style={{ margin: 0 }}>
                    <p className="branding-help">{t("ssl.installHelp")}</p>
                    <ul className="branding-help" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      <li>{t("ssl.installNginx")}</li>
                      <li>{t("ssl.installApache")}</li>
                      <li>{t("ssl.installCaddy")}</li>
                    </ul>
                    <p className="branding-help" style={{ marginTop: 10 }}>
                      <a href="/ssl/features/installation" target="_blank" rel="noopener noreferrer">
                        {t("ssl.installGuideLink")}
                      </a>
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="multi-san" className="branding-card ssl-section">
        <h2>{t("ssl.multiSanSectionTitle")}</h2>
        <p className="branding-help">
          {multiSanOn
            ? t("ssl.multiSanSectionBody", { max: maxSans, maxBusiness: 100 })
            : t("ssl.multiSanUpgrade")}
        </p>
        {!multiSanOn ? (
          <p className="branding-help">
            <a href="/app/account">{t("ssl.upgradeLink")}</a>
          </p>
        ) : (
          <p className="branding-help">
            <a href="#domains">{t("ssl.issueSectionTitle")} →</a>
          </p>
        )}
      </section>

      <section id="wildcards" className="branding-card ssl-section">
        <h2>{t("ssl.wildcardSectionTitle")}</h2>
        <p className="branding-help">
          {wildcardOn
            ? t("ssl.wildcardSectionBody", { limit: wildcardLimit })
            : t("ssl.wildcardSectionLocked")}
        </p>
        {wildcardOn ? (
          <>
            <p className="branding-help">
              {t("ssl.featureWildcardsMeta", { used: wildcardUsed, limit: wildcardLimit })}
            </p>
            {wildcardCerts.length === 0 ? (
              <p className="webhooks-empty">{t("ssl.wildcardEmpty")}</p>
            ) : (
              <ul className="webhooks-list">
                {wildcardCerts.map((cert) => (
                  <li key={cert.id}>
                    <div>
                      <code>{cert.hostnames?.length ? cert.hostnames.join(", ") : cert.domain}</code>
                      <div className="page-sub">
                        {cert.status === "issued" ? t("ssl.statusActive") : t("ssl.statusPending")}
                      </div>
                    </div>
                    <a className="btn-secondary" href="#domains">
                      {t("ssl.viewInDomains")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="branding-help" style={{ marginTop: 12 }}>
              {t("ssl.wildcardHowTo")}{" "}
              <a href="#domains">{t("ssl.issueSectionTitle")} →</a>
              {" · "}
              <a href="/ssl/features/wildcards" target="_blank" rel="noopener noreferrer">
                {t("ssl.wildcardGuideLink")}
              </a>
            </p>
          </>
        ) : (
          <p className="branding-help">
            <a href="/app/account">{t("ssl.upgradeLink")}</a>
            {" · "}
            <a href="/ssl/features/wildcards" target="_blank" rel="noopener noreferrer">
              {t("ssl.wildcardGuideLink")}
            </a>
          </p>
        )}
      </section>

      <section id="acme" className="branding-card ssl-section">
        <h2>{t("ssl.acmeSectionTitle")}</h2>
        <p className="branding-help">{acmeOn ? t("ssl.acmeSectionBody") : t("ssl.acmeSectionLocked")}</p>
        <div className="ssl-acme-actions">
          {acmeOn ? (
            <Link className="btn-primary" to="/connector">
              {t("ssl.acmeOpenConnector")}
            </Link>
          ) : (
            <a className="btn-primary" href="/app/account">
              {t("ssl.upgradeLink")}
            </a>
          )}
          <a className="btn-secondary" href="/ssl/developer" target="_blank" rel="noopener noreferrer">
            {t("ssl.acmeOpenDocs")}
          </a>
        </div>
      </section>

      {trustProfile && (
        <section className="branding-card ssl-section">
          <h2>{t("ssl.trustProfileTitle")}</h2>
          <p className="branding-help">
            {trustProfile.otsStatus === "confirmed"
              ? t("ssl.trustProfileConfirmed")
              : t("ssl.trustProfilePending")}
          </p>
          <p style={{ marginTop: 8 }}>
            <a
              className="btn-secondary"
              href={`/trust/${trustProfile.accountId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("ssl.trustProfileView")}
            </a>
          </p>
          <p className="branding-help" style={{ marginTop: 12 }}>
            {t("ssl.trustProfileEmbed")}
          </p>
          <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {`<script src="${appOrigin}/api/trust/badge/${trustProfile.accountId}.js" async></script>`}
          </code>
        </section>
      )}
    </div>
  );
}
