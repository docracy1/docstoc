import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  decideSoxApproval,
  createSoxApproval,
  createSoxAuditorPack,
  createSoxControlTest,
  getSoxOverview,
  listAuditAnchors,
  listSoxApprovals,
  listSoxAuditEvents,
  listSoxAuditorPacks,
  listSoxControls,
  purgeSoxRetention,
  soxAuditorPackHtmlUrl,
  soxAuditorPackOtsUrl,
  soxAuditorPackSha256Url,
  soxPeriodEvidenceUrl,
  updateSoxSettings,
  type Account,
  type AuditAnchorRecord,
  type SoxAuditorPack,
  type SoxAuditEvent,
  type SoxControl,
  type SoxOverview,
  type SoxSendApproval,
} from "../lib/api";
import { isBusinessPlan, isWorkspaceAdmin } from "../lib/plan";
import { useT } from "../lib/i18n";

type TabId = "overview" | "trail" | "sod" | "evidence" | "library" | "retention";

function statusClass(status: string): string {
  if (status === "ready") return "sox-pill sox-pill-ready";
  if (status === "partial") return "sox-pill sox-pill-partial";
  return "sox-pill sox-pill-missing";
}

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SoxReportingPage({ account }: { account: Account | null }) {
  const t = useT();
  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<SoxOverview | null>(null);
  const [events, setEvents] = useState<SoxAuditEvent[]>([]);
  const [anchors, setAnchors] = useState<AuditAnchorRecord[]>([]);
  const [approvals, setApprovals] = useState<SoxSendApproval[]>([]);
  const [packs, setPacks] = useState<SoxAuditorPack[]>([]);
  const [library, setLibrary] = useState<SoxControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [sodRequired, setSodRequired] = useState(false);
  const [retentionDays, setRetentionDays] = useState(2555);
  const [legalHold, setLegalHold] = useState(false);
  const [retentionEnforced, setRetentionEnforced] = useState(false);
  const [reqInvoiceId, setReqInvoiceId] = useState("");
  const [reqClientName, setReqClientName] = useState("");
  const [reqSubject, setReqSubject] = useState("");
  const [testControlId, setTestControlId] = useState("");
  const [testResult, setTestResult] = useState<"pass" | "fail" | "exception">("pass");
  const [testNotes, setTestNotes] = useState("");
  const [testEvidencePackId, setTestEvidencePackId] = useState("");
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

  const paid = isBusinessPlan(account);
  const admin = isWorkspaceAdmin(account);

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: t("sox.tabOverview") },
        { id: "trail" as const, label: t("sox.tabTrail") },
        { id: "sod" as const, label: t("sox.tabSod") },
        { id: "evidence" as const, label: t("sox.tabEvidence") },
        { id: "library" as const, label: t("sox.tabLibrary") },
        { id: "retention" as const, label: t("sox.tabRetention") },
      ] as const,
    [t]
  );

  async function load() {
    if (!account) return;
    setError(null);
    if (!paid) {
      setLoading(false);
      return;
    }
    try {
      const [ov, audit, anch, appr, packList, controls] = await Promise.all([
        getSoxOverview(),
        listSoxAuditEvents(100),
        listAuditAnchors(),
        listSoxApprovals(),
        listSoxAuditorPacks(),
        listSoxControls(),
      ]);
      setOverview(ov.overview);
      setEvents(audit.events);
      setAnchors(anch.anchors);
      setApprovals(appr.approvals);
      setPacks(packList.packs);
      setLibrary(controls.controls);
      setSodRequired(ov.overview.settings.sodRequired);
      setRetentionDays(ov.overview.settings.retentionDays);
      setLegalHold(!!ov.overview.settings.legalHold);
      setRetentionEnforced(!!ov.overview.settings.retentionEnforced);
      if (!testControlId && controls.controls[0]) setTestControlId(controls.controls[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }
    load().catch(() => {});
  }, [account?.email, paid]);

  async function saveSettings() {
    if (!admin) return;
    setBusy(true);
    setError(null);
    setPurgeMsg(null);
    try {
      const res = await updateSoxSettings({
        sodRequired,
        retentionDays,
        legalHold,
        retentionEnforced,
      });
      setOverview((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      setLegalHold(res.settings.legalHold);
      setRetentionEnforced(res.settings.retentionEnforced);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function recordControlTest() {
    if (!testControlId) return;
    setBusy(true);
    setError(null);
    try {
      await createSoxControlTest({
        controlId: testControlId,
        periodStart: fromDate,
        periodEnd: toDate,
        result: testResult,
        notes: testNotes.trim() || null,
        evidencePackId: testEvidencePackId.trim() || null,
      });
      setTestNotes("");
      setTestEvidencePackId("");
      await load();
      setTab("library");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.testFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function runPurge() {
    if (!admin) return;
    if (!window.confirm(t("sox.purgeConfirm"))) return;
    setBusy(true);
    setError(null);
    setPurgeMsg(null);
    try {
      const res = await purgeSoxRetention();
      setPurgeMsg(t("sox.purgeDone", { chase: res.deletedChase, audit: res.deletedAudit }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.purgeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    if (!reqInvoiceId.trim() || !reqClientName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createSoxApproval({
        agingInvoiceId: reqInvoiceId.trim(),
        clientName: reqClientName.trim(),
        subject: reqSubject.trim() || null,
      });
      setReqInvoiceId("");
      setReqClientName("");
      setReqSubject("");
      await load();
      setTab("sod");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function freezeAuditorPack() {
    setBusy(true);
    setError(null);
    try {
      await createSoxAuditorPack({ from: fromDate, to: toDate });
      await load();
      setTab("evidence");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.packFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await decideSoxApproval(id, { decision });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sox.decideFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <div className="panel">
        <h1>{t("sox.title")}</h1>
        <p className="page-sub">{t("sox.signInSub")}</p>
        <a className="btn-primary" href="/app/login">
          {t("nav.signin")}
        </a>
      </div>
    );
  }

  if (!paid) {
    return (
      <div className="webhooks-page sox-page">
        <section className="branding-card">
          <h1 className="webhooks-title">{t("sox.title")}</h1>
          <p className="branding-help">{t("sox.upgradeSub")}</p>
          <Link className="btn-primary" to="/account?plan=business">
            {t("sox.upgradeCta")}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="webhooks-page sox-page">
      <section className="branding-card">
        <h1 className="webhooks-title">{t("sox.title")}</h1>
        <p className="branding-help">{t("sox.pageSub")}</p>

        <div className="sox-tabs" role="tablist" aria-label={t("sox.title")}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`sox-tab${tab === item.id ? " is-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <div className="error-msg">{error}</div>}
        {loading ? <p className="page-sub">{t("common.loading")}</p> : null}

        {!loading && tab === "overview" && overview ? (
          <div className="sox-panel">
            <div className="sox-auditor-callout">
              <h2 className="sox-section-title" style={{ marginTop: 0 }}>
                {t("sox.auditorFileCalloutTitle")}
              </h2>
              <p className="branding-help">{t("sox.auditorFileCalloutBody")}</p>
              <button type="button" className="btn-primary" onClick={() => setTab("evidence")}>
                {t("sox.auditorFileCta")}
              </button>
              <p className="page-sub" style={{ marginTop: 10 }}>
                <a href="/use-cases/auditor-evidence-pack" target="_blank" rel="noopener noreferrer">
                  {t("sox.learnMore")}
                </a>
                {" · "}
                <a href="/use-cases/sox-reporting" target="_blank" rel="noopener noreferrer">
                  SOX reporting
                </a>
              </p>
            </div>

            <div className="sox-stats">
              <div className="sox-stat">
                <div className="sox-stat-value">{overview.pendingApprovals}</div>
                <div className="sox-stat-label">{t("sox.statPending")}</div>
              </div>
              <div className="sox-stat">
                <div className="sox-stat-value">{overview.recentAuditCount}</div>
                <div className="sox-stat-label">{t("sox.statAudit")}</div>
              </div>
              <div className="sox-stat">
                <div className="sox-stat-value">
                  {overview.confirmedAnchors}/{overview.anchorCount}
                </div>
                <div className="sox-stat-label">{t("sox.statAnchors")}</div>
              </div>
              <div className="sox-stat">
                <div className="sox-stat-value">{overview.certificateCount}</div>
                <div className="sox-stat-label">{t("sox.statCerts")}</div>
              </div>
            </div>

            <h2 className="sox-section-title">{t("sox.controlsTitle")}</h2>
            <p className="branding-help">{t("sox.controlsLegend")}</p>
            <ul className="sox-status-legend">
              <li>
                <span className="sox-pill sox-pill-ready">{t("sox.status.ready")}</span>
                <span>{t("sox.statusExplain.ready")}</span>
              </li>
              <li>
                <span className="sox-pill sox-pill-partial">{t("sox.status.partial")}</span>
                <span>{t("sox.statusExplain.partial")}</span>
              </li>
              <li>
                <span className="sox-pill sox-pill-missing">{t("sox.status.missing")}</span>
                <span>{t("sox.statusExplain.missing")}</span>
              </li>
            </ul>
            <ul className="sox-controls">
              {overview.controls.map((c) => {
                const explainKey = `sox.control.${c.id}.explain`;
                const howKey = `sox.control.${c.id}.how`;
                const explain = t(explainKey);
                const how = t(howKey);
                const hasExplain = explain !== explainKey;
                const hasHow = how !== howKey;
                const tabForControl =
                  c.id === "sod"
                    ? "sod"
                    : c.id === "period_export"
                      ? "evidence"
                      : c.id === "retention"
                        ? "retention"
                        : c.id === "control_library"
                          ? "library"
                          : c.id === "actor_log" || c.id === "hash_anchors" || c.id === "chase_trail"
                            ? "trail"
                            : null;
                const learnHref =
                  c.id === "period_export" || c.id === "hash_anchors"
                    ? "/use-cases/auditor-evidence-pack"
                    : c.id === "sod" || c.id === "actor_log" || c.id === "chase_trail"
                      ? "/use-cases/sox-reporting"
                      : c.id === "tamper_evidence"
                        ? "/certificate"
                        : "/use-cases/sox-reporting";
                return (
                  <li key={c.id}>
                    <div className="sox-control-head">
                      <strong>{c.title}</strong>
                      <span className={statusClass(c.status)}>{t(`sox.status.${c.status}`)}</span>
                    </div>
                    <p className="page-sub">{c.detail}</p>
                    {hasExplain ? <p className="sox-control-explain">{explain}</p> : null}
                    {hasHow ? (
                      <p className="page-sub">
                        <strong>{how}</strong>
                      </p>
                    ) : null}
                    <p className="page-sub sox-control-links">
                      {tabForControl ? (
                        <button type="button" className="sox-text-link" onClick={() => setTab(tabForControl)}>
                          {tabs.find((x) => x.id === tabForControl)?.label ?? tabForControl} →
                        </button>
                      ) : null}
                      {tabForControl ? " · " : null}
                      <a href={learnHref} target="_blank" rel="noopener noreferrer">
                        {t("sox.learnMore")}
                      </a>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!loading && tab === "trail" ? (
          <div className="sox-panel">
            <h2 className="sox-section-title">{t("sox.actorTrailTitle")}</h2>
            <p className="branding-help">{t("sox.actorTrailSub")}</p>
            {events.length === 0 ? (
              <p className="webhooks-empty">{t("sox.noAuditEvents")}</p>
            ) : (
              <ul className="webhooks-list sox-event-list">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <div>
                      <code>{ev.action}</code>
                      <div className="page-sub">
                        {ev.actorEmail}
                        {ev.actorRole ? ` · ${ev.actorRole}` : ""} ·{" "}
                        {new Date(ev.createdAt).toLocaleString()}
                      </div>
                      <div>{ev.summary}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="sox-section-title">{t("sox.anchorsTitle")}</h2>
            <p className="branding-help">{t("sox.anchorsSub")}</p>
            <p className="page-sub">
              <Link to="/audit-log">{t("sox.openAuditLog")}</Link>
            </p>
            {anchors.length === 0 ? (
              <p className="webhooks-empty">{t("auditLog.empty")}</p>
            ) : (
              <ul className="webhooks-list">
                {anchors.slice(0, 14).map((anchor) => (
                  <li key={anchor.id}>
                    <div>
                      <code>{anchor.periodDate}</code>
                      <div className="page-sub">
                        {t("auditLog.eventCount", { count: anchor.eventCount })} ·{" "}
                        {anchor.otsStatus === "confirmed"
                          ? t("auditLog.otsConfirmed")
                          : anchor.otsStatus === "pending"
                            ? t("auditLog.otsPending")
                            : t("auditLog.otsNone")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {!loading && tab === "sod" ? (
          <div className="sox-panel">
            <h2 className="sox-section-title">{t("sox.sodTitle")}</h2>
            <p className="branding-help">{t("sox.sodSub")}</p>
            {!overview?.settings.sodRequired ? (
              <p className="page-sub">{t("sox.sodDisabledHint")}</p>
            ) : null}
            <p className="page-sub">
              <Link to="/team">{t("sox.manageTeam")}</Link>
            </p>

            <h3 className="sox-section-title">{t("sox.requestApproval")}</h3>
            <p className="branding-help">{t("sox.requestApprovalSub")}</p>
            <div className="sox-period-form">
              <label>
                {t("sox.invoiceId")}
                <input
                  value={reqInvoiceId}
                  onChange={(e) => setReqInvoiceId(e.target.value)}
                  placeholder="aging invoice id"
                />
              </label>
              <label>
                {t("sox.clientName")}
                <input value={reqClientName} onChange={(e) => setReqClientName(e.target.value)} />
              </label>
              <label>
                {t("sox.subjectOptional")}
                <input value={reqSubject} onChange={(e) => setReqSubject(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !reqInvoiceId.trim() || !reqClientName.trim()}
                onClick={() => void requestApproval()}
              >
                {t("sox.submitRequest")}
              </button>
            </div>

            <h3 className="sox-section-title">{t("sox.pendingApprovals")}</h3>
            {approvals.filter((a) => a.status === "pending").length === 0 ? (
              <p className="webhooks-empty">{t("sox.noPending")}</p>
            ) : (
              <ul className="webhooks-list">
                {approvals
                  .filter((a) => a.status === "pending")
                  .map((a) => (
                    <li key={a.id}>
                      <div>
                        <strong>{a.clientName}</strong>
                        <div className="page-sub">
                          {t("sox.requestedBy", { email: a.requestedByEmail })} ·{" "}
                          {new Date(a.createdAt).toLocaleString()}
                        </div>
                        {a.subject ? <div>{a.subject}</div> : null}
                      </div>
                      {a.requestedByEmail !== account.email ? (
                        <div className="sox-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busy}
                            onClick={() => void decide(a.id, "approved")}
                          >
                            {t("sox.approve")}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => void decide(a.id, "rejected")}
                          >
                            {t("sox.reject")}
                          </button>
                        </div>
                      ) : (
                        <span className="page-sub">{t("sox.awaitingChecker")}</span>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            <h3 className="sox-section-title">{t("sox.recentApprovals")}</h3>
            <ul className="webhooks-list">
              {approvals
                .filter((a) => a.status !== "pending")
                .slice(0, 20)
                .map((a) => (
                  <li key={a.id}>
                    <div>
                      <strong>{a.clientName}</strong> · {a.status}
                      <div className="page-sub">
                        {a.requestedByEmail}
                        {a.decidedByEmail ? ` → ${a.decidedByEmail}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {!loading && tab === "evidence" ? (
          <div className="sox-panel">
            <div className="sox-auditor-callout">
              <h2 className="sox-section-title" style={{ marginTop: 0 }}>
                {t("sox.packSendTitle")}
              </h2>
              <p className="branding-help">{t("sox.packSendBody")}</p>
              <p className="page-sub">
                <a href="/use-cases/auditor-evidence-pack" target="_blank" rel="noopener noreferrer">
                  {t("sox.learnMore")}
                </a>
              </p>
            </div>

            <h2 className="sox-section-title">{t("sox.packTitle")}</h2>
            <p className="branding-help">{t("sox.packSub")}</p>
            <div className="sox-period-form">
              <label>
                {t("sox.from")}
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label>
                {t("sox.to")}
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !fromDate || !toDate}
                onClick={() => void freezeAuditorPack()}
              >
                {t("sox.freezePack")}
              </button>
              <a
                className="btn-secondary"
                href={soxPeriodEvidenceUrl(fromDate, toDate)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("sox.previewPeriod")}
              </a>
            </div>

            <h3 className="sox-section-title">{t("sox.frozenPacks")}</h3>
            {packs.length === 0 ? (
              <p className="webhooks-empty">{t("sox.noPacks")}</p>
            ) : (
              <ul className="webhooks-list">
                {packs.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>
                        {p.fromDate} → {p.toDate}
                      </strong>
                      <div className="page-sub">
                        {t("sox.packMeta", {
                          invoices: p.invoiceCount,
                          events: p.eventCount,
                        })}{" "}
                        ·{" "}
                        {p.otsStatus === "confirmed"
                          ? t("sox.otsConfirmed")
                          : p.otsStatus === "pending"
                            ? t("sox.otsPending")
                            : p.otsStatus === "failed"
                              ? t("sox.otsFailed")
                              : t("sox.otsNone")}
                      </div>
                      <div className="page-sub">
                        SHA-256: <code>{p.contentSha256.slice(0, 20)}…</code>
                      </div>
                    </div>
                    <div className="sox-actions">
                      <a className="btn-secondary" href={soxAuditorPackHtmlUrl(p.id)}>
                        {t("sox.downloadHtml")}
                      </a>
                      <a className="btn-secondary" href={soxAuditorPackSha256Url(p.id)}>
                        .sha256
                      </a>
                      {(p.otsStatus === "pending" || p.otsStatus === "confirmed") && (
                        <a className="btn-secondary" href={soxAuditorPackOtsUrl(p.id)}>
                          {t("sox.downloadOts")}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="page-sub">
              <Link to="/certificates">{t("sox.openCertificates")}</Link>
              {" · "}
              <Link to="/audit-log">{t("sox.openAuditLog")}</Link>
            </p>
          </div>
        ) : null}

        {!loading && tab === "library" ? (
          <div className="sox-panel">
            <h2 className="sox-section-title">{t("sox.libraryTitle")}</h2>
            <p className="branding-help">{t("sox.librarySub")}</p>
            {library.length === 0 ? (
              <p className="webhooks-empty">{t("sox.noControls")}</p>
            ) : (
              <ul className="webhooks-list">
                {library.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>
                        {c.controlKey} — {c.title}
                      </strong>
                      <div className="page-sub">{c.description}</div>
                      <div className="page-sub">
                        {c.lastTest
                          ? `${t("sox.lastTest")}: ${c.lastTest.result} · ${c.lastTest.periodStart} → ${c.lastTest.periodEnd} · ${c.lastTest.testedByEmail}`
                          : t("sox.noTestYet")}
                      </div>
                      {c.lastTest?.evidencePackId ? (
                        <p className="page-sub sox-control-links">
                          <a className="sox-text-link" href={soxAuditorPackHtmlUrl(c.lastTest.evidencePackId)}>
                            {t("sox.linkedEvidencePack")} →
                          </a>
                          {" · "}
                          <a className="sox-text-link" href={soxAuditorPackSha256Url(c.lastTest.evidencePackId)}>
                            .sha256
                          </a>
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="sox-section-title">{t("sox.recordTest")}</h3>
            <div className="sox-period-form">
              <label>
                Control
                <select value={testControlId} onChange={(e) => setTestControlId(e.target.value)}>
                  {library.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.controlKey}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("sox.from")}
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label>
                {t("sox.to")}
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <label>
                {t("sox.testResult")}
                <select
                  value={testResult}
                  onChange={(e) => setTestResult(e.target.value as "pass" | "fail" | "exception")}
                >
                  <option value="pass">{t("sox.testPass")}</option>
                  <option value="fail">{t("sox.testFail")}</option>
                  <option value="exception">{t("sox.testException")}</option>
                </select>
              </label>
              <label>
                {t("sox.testNotes")}
                <input value={testNotes} onChange={(e) => setTestNotes(e.target.value)} />
              </label>
              <label>
                {t("sox.linkEvidencePack")}
                <select
                  value={testEvidencePackId}
                  onChange={(e) => setTestEvidencePackId(e.target.value)}
                >
                  <option value="">{t("sox.noEvidencePack")}</option>
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fromDate} → {p.toDate} ({p.contentSha256.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !testControlId}
                onClick={() => void recordControlTest()}
              >
                {t("sox.recordTest")}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && tab === "retention" ? (
          <div className="sox-panel">
            <h2 className="sox-section-title">{t("sox.retentionTitle")}</h2>
            <p className="branding-help">{t("sox.retentionSub")}</p>
            <label className="sox-check">
              <input
                type="checkbox"
                checked={sodRequired}
                disabled={!admin || busy}
                onChange={(e) => setSodRequired(e.target.checked)}
              />
              <span>{t("sox.enableSod")}</span>
            </label>
            <label className="sox-check">
              <input
                type="checkbox"
                checked={legalHold}
                disabled={!admin || busy}
                onChange={(e) => setLegalHold(e.target.checked)}
              />
              <span>{t("sox.legalHold")}</span>
            </label>
            <label className="sox-check">
              <input
                type="checkbox"
                checked={retentionEnforced}
                disabled={!admin || busy}
                onChange={(e) => setRetentionEnforced(e.target.checked)}
              />
              <span>{t("sox.retentionEnforced")}</span>
            </label>
            <label className="sox-field">
              {t("sox.retentionDays")}
              <input
                type="number"
                min={90}
                max={3650}
                value={retentionDays}
                disabled={!admin || busy}
                onChange={(e) => setRetentionDays(Number(e.target.value) || 2555)}
              />
            </label>
            {admin ? (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveSettings()}>
                {t("sox.saveSettings")}
              </button>
            ) : (
              <p className="page-sub">{t("sox.adminOnly")}</p>
            )}

            <h3 className="sox-section-title">{t("sox.retentionStatus")}</h3>
            {overview?.retention ? (
              <p className="branding-help">
                {overview.retention.chaseEventsPastRetention + overview.retention.auditEventsPastRetention > 0
                  ? t("sox.retentionPast", {
                      chase: overview.retention.chaseEventsPastRetention,
                      audit: overview.retention.auditEventsPastRetention,
                    })
                  : t("sox.retentionClear")}
              </p>
            ) : null}
            {admin && retentionEnforced && !legalHold ? (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void runPurge()}>
                {t("sox.purgeNow")}
              </button>
            ) : null}
            {purgeMsg ? <p className="page-sub">{purgeMsg}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
