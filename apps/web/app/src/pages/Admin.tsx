import {
  adminAeParity,
  adminBlogCreate,
  adminBlogDelete,
  adminBlogList,
  adminBlogPublishNext,
  adminBlogUpdate,
  adminBroadcast,
  adminDeleteAccount,
  adminFunnels,
  adminGrantBusiness,
  adminMarketplaceApprove,
  adminMarketplacePending,
  adminMarketplaceReject,
  adminMe,
  adminOutreach,
  adminRoadmapCreate,
  adminRoadmapDelete,
  adminRoadmapList,
  adminSetNoTrack,
  adminSignups,
  adminTraffic,
  adminTrafficCloudflare,
  adminTrafficSources,
  type BlogPost,
  type BroadcastResult,
  type CfTrafficStats,
  type FunnelStats,
  type AeParityResponse,
  type MarketplaceSubmission,
  type OutreachStats,
  type RoadmapFeature,
  type SignupLists,
  type TrafficSourceRow,
  type TrafficSourcesStats,
  type TrafficStats,
} from "../lib/adminApi";
import { useT } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";

type NavId =
  | "dashboard"
  | "activation"
  | "growth"
  | "completion"
  | "template"
  | "traffic"
  | "email"
  | "errors"
  | "blog"
  | "signups"
  | "analytics"
  | "marketplace"
  | "roadmap";

function FunnelTable({
  title,
  note,
  steps,
  kpi,
  t,
}: {
  title: string;
  note?: string;
  steps: { name: string; count: number }[];
  kpi?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <section className="dash-card">
      <h2 className="dash-card-title">
        {title}
        {kpi ? (
          <span className="dash-kpi-tag">
            {t("admin.kpi")} · {kpi}
          </span>
        ) : null}
      </h2>
      {note ? <p className="dash-muted" style={{ marginTop: -4, marginBottom: 12 }}>{note}</p> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.colEvent")}</th>
            <th>{t("admin.colCount")}</th>
            <th>{t("admin.colOfPrevious")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => {
            const prev = i === 0 ? null : steps[i - 1].count;
            const ofPrev =
              prev == null || prev <= 0 ? null : Math.round((step.count / prev) * 100);
            return (
              <tr key={step.name} className={kpi && step.name === kpi ? "is-kpi" : undefined}>
                <td>
                  <code>{step.name}</code>
                </td>
                <td>{step.count}</td>
                <td className="admin-of-prev">{ofPrev == null ? "—" : t("admin.ofPrevious", { pct: ofPrev })}</td>
                <td className="admin-bar-cell">
                  <div className="admin-bar" style={{ width: `${(step.count / max) * 100}%` }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function DayChart({
  rows,
  selectedDay,
  onSelectDay,
  t,
}: {
  rows: { day: string; human: number; bot: number }[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.human + r.bot));
  return (
    <div className="dash-chart">
      <div className="dash-chart-bars">
        {rows.map((r) => {
          const selected = selectedDay === r.day;
          return (
            <button
              key={r.day}
              type="button"
              className={`dash-chart-col${selected ? " is-selected" : ""}`}
              title={t("admin.chartTitle", { day: fmtDate(r.day), human: r.human, bot: r.bot })}
              onClick={() => onSelectDay(selected ? null : r.day)}
            >
              <div className="dash-chart-stack">
                <div className="dash-bar-human" style={{ height: `${(r.human / max) * 120}px` }} />
                <div className="dash-bar-bot" style={{ height: `${(r.bot / max) * 120}px` }} />
              </div>
              <span>{r.day.slice(5)}</span>
            </button>
          );
        })}
      </div>
      <div className="dash-chart-legend">
        <span>
          <i className="lg-human" /> {t("admin.legendHuman")}
        </span>
        <span>
          <i className="lg-bot" /> {t("admin.legendBot")}
        </span>
        <span className="dash-chart-hint">{t("admin.chartClickDay")}</span>
      </div>
    </div>
  );
}

const SELF_HOST_RE = /docstoc|chasa/i;

const HOST_LABELS: Record<string, string> = {
  "t.co": "Twitter/X",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "google.com": "Google",
  "www.google.com": "Google",
  google: "Google",
  "bing.com": "Bing",
  "www.bing.com": "Bing",
  bing: "Bing",
  "linkedin.com": "LinkedIn",
  "www.linkedin.com": "LinkedIn",
  linkedin: "LinkedIn",
  "reddit.com": "Reddit",
  "www.reddit.com": "Reddit",
  "producthunt.com": "Product Hunt",
  "www.producthunt.com": "Product Hunt",
  "news.ycombinator.com": "Hacker News",
  "indiehackers.com": "IndieHackers",
  "www.indiehackers.com": "IndieHackers",
};

function hostLabel(host: string): string {
  const bare = host.replace(/^www\./, "");
  return HOST_LABELS[host] ?? HOST_LABELS[bare] ?? bare;
}

function TrafficSourcesTable({
  rows,
  windowDays,
  t,
}: {
  rows: TrafficSourceRow[];
  windowDays: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const days = useMemo(() => lastNDays(windowDays), [windowDays]);
  const [selectedDay, setSelectedDay] = useState("all");

  const { referrers, campaigns, selfReferralCount } = useMemo(() => {
    const referrerMap = new Map<string, number>();
    const campaignMap = new Map<string, number>();
    let selfCount = 0;
    for (const r of rows) {
      if (selectedDay !== "all" && r.day !== selectedDay) continue;
      if (r.event === "referral_source_detected" && r.source) {
        if (SELF_HOST_RE.test(r.source)) {
          selfCount += r.count;
          continue;
        }
        const label = hostLabel(r.source);
        referrerMap.set(label, (referrerMap.get(label) ?? 0) + r.count);
      } else if (r.event === "campaign_click" && r.attribution) {
        campaignMap.set(r.attribution, (campaignMap.get(r.attribution) ?? 0) + r.count);
      }
    }
    return {
      referrers: [...referrerMap.entries()].sort(([, a], [, b]) => b - a),
      campaigns: [...campaignMap.entries()].sort(([, a], [, b]) => b - a),
      selfReferralCount: selfCount,
    };
  }, [rows, selectedDay]);

  const nothingYet = referrers.length === 0 && campaigns.length === 0;

  return (
    <div className="admin-traffic-sources">
      <div className="admin-traffic-sources-toolbar">
        <label className="admin-day-filter">
          <span className="sr-only">{t("admin.filterByDay")}</span>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            aria-label={t("admin.filterByDay")}
          >
            <option value="all">{t("admin.allDays")}</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {fmtDate(d)}
              </option>
            ))}
          </select>
        </label>
        <p className="dash-note">
          {t("admin.selfReferralNote", { count: selfReferralCount })}
        </p>
      </div>
      {nothingYet ? (
        <p className="dash-muted">{t("admin.noExternalTraffic")}</p>
      ) : (
        <div className="admin-traffic-sources-grid">
          <div className="admin-traffic-sources-panel">
            <h3>{t("admin.externalSites")}</h3>
            {referrers.length === 0 ? (
              <p className="dash-muted">{t("admin.noneYet")}</p>
            ) : (
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>{t("admin.colSite")}</th>
                    <th>{t("admin.colVisits")}</th>
                  </tr>
                </thead>
                <tbody>
                  {referrers.map(([label, count]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="admin-traffic-sources-panel">
            <h3>{t("admin.taggedCampaigns")}</h3>
            <p className="dash-note" style={{ marginTop: 0, marginBottom: 8 }}>
              {t("admin.taggedCampaignsNote")}
            </p>
            {campaigns.length === 0 ? (
              <p className="dash-muted">{t("admin.noneYet")}</p>
            ) : (
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>{t("admin.colCampaign")}</th>
                    <th>{t("admin.colClicks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(([label, count]) => (
                    <tr key={label}>
                      <td>
                        <code>{label}</code>
                      </td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US");
  } catch {
    return iso.slice(0, 10);
  }
}

/** Diagnostic-only: compares D1's existing counts against what's landed in Analytics Engine so
 *  far via the dual-write in trackEventAE. Nothing on the dashboard reads from Analytics Engine
 *  yet — this exists purely to build confidence before that cutover happens. */
function AeParityCard() {
  const [data, setData] = useState<AeParityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminAeParity(7)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <section className="dash-card">
      <h2 className="dash-card-title">Analytics Engine parity check</h2>
      <p className="dash-note">
        Compares D1's existing counts against what's arrived in Analytics Engine so far via the
        dual-write. Diagnostic only — nothing on this dashboard reads from Analytics Engine yet.
        Small differences are expected (Analytics Engine can lag a few minutes); large or growing
        gaps mean something's wrong with the dual-write before relying on it.
      </p>
      {error && <p className="dash-muted">{error}</p>}
      {!data && !error && <p className="dash-muted">Loading…</p>}
      {data && !data.configured && (
        <p className="dash-muted">
          Not configured yet — set <code>CF_ACCOUNT_ID</code> and{" "}
          <code>CF_ANALYTICS_ENGINE_TOKEN</code> via <code>wrangler secret put</code> to enable this
          check. D1 is still recording {data.d1Counts.length} day/event rows in the meantime.
        </p>
      )}
      {data && data.configured && data.rows.length === 0 && (
        <p className="dash-muted">No data on either side yet for this window.</p>
      )}
      {data && data.configured && data.rows.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Event</th>
              <th>D1</th>
              <th>AE (human)</th>
              <th>AE (bot)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 100).map((row) => (
              <tr key={`${row.day}:${row.event}`}>
                <td>{row.day}</td>
                <td>{row.event}</td>
                <td>{row.d1Count}</td>
                <td>{row.aeHumanCount}</td>
                <td>{row.aeBotCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const EMPTY_ROADMAP_FORM = { title: "", description: "" };

/** Admin CRUD for the public /roadmap voting page (Docracy parity) — self-contained since it
 *  has no dependency on the days/humansOnly filters the rest of the admin analytics page uses. */
function RoadmapCard({ t }: { t: (key: string, vars?: Record<string, string | number>) => string }) {
  const [features, setFeatures] = useState<RoadmapFeature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ROADMAP_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminRoadmapList()
      .then((res) => setFeatures(res.features))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the roadmap"));
  }, []);

  async function remove(id: string) {
    try {
      await adminRoadmapDelete(id);
      setFeatures((prev) => (prev ? prev.filter((f) => f.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function add() {
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      await adminRoadmapCreate({ title: form.title, description: form.description });
      setForm(EMPTY_ROADMAP_FORM);
      const res = await adminRoadmapList();
      setFeatures(res.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-card">
      <h2 className="dash-card-title">{t("admin.roadmapTitle")}</h2>
      <p className="dash-note">{t("admin.roadmapSub")}</p>
      {error && <p className="dash-muted">{error}</p>}
      {features === null && !error && <p className="dash-muted">{t("admin.loading")}</p>}
      {features && features.length === 0 && <p className="dash-muted">{t("admin.roadmapEmpty")}</p>}
      {features && features.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.roadmapColTitle")}</th>
              <th>{t("admin.roadmapColYes")}</th>
              <th>{t("admin.roadmapColNo")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.title}</strong>
                  <div className="dash-note" style={{ marginTop: 2 }}>
                    {f.description}
                  </div>
                </td>
                <td>{f.yesVotes}</td>
                <td>{f.noVotes}</td>
                <td>
                  <button type="button" className="btn-secondary" onClick={() => void remove(f.id)}>
                    {t("admin.roadmapDelete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 480 }}>
        <input
          type="text"
          placeholder={t("admin.roadmapTitlePlaceholder")}
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        />
        <textarea
          placeholder={t("admin.roadmapDescPlaceholder")}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void add()}>
          {saving ? t("admin.roadmapSaving") : t("admin.roadmapAdd")}
        </button>
      </div>
    </section>
  );
}

/** Every calendar day in the window, today first — not just the days that happen to already
 *  have a row. A day with zero events should still be pickable and show 0, not disappear. */
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function Admin() {
  const t = useT();
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [cfTraffic, setCfTraffic] = useState<CfTrafficStats | null>(null);
  const [trafficSources, setTrafficSources] = useState<TrafficSourcesStats | null>(null);
  const [outreach, setOutreach] = useState<OutreachStats | null>(null);
  const [signups, setSignups] = useState<SignupLists | null>(null);
  const [marketplacePending, setMarketplacePending] = useState<MarketplaceSubmission[]>([]);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketplaceFeatureChoice, setMarketplaceFeatureChoice] = useState<Record<string, boolean>>({});
  const [marketplaceExpertChoice, setMarketplaceExpertChoice] = useState<Record<string, boolean>>({});
  const [marketplaceCredentialChoice, setMarketplaceCredentialChoice] = useState<Record<string, string>>({});
  const [publishNextResult, setPublishNextResult] = useState<string | null>(null);
  const [publishNextError, setPublishNextError] = useState<string | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState<NavId>("analytics");
  const [days, setDays] = useState(30);
  const [trafficDay, setTrafficDay] = useState<string | null>(null);
  // On by default: crawler hits belong in the page_views bot tiles, not in a funnel where the
  // click half can only ever come from a real browser.
  const [humansOnly, setHumansOnly] = useState(true);
  const [showAllFree, setShowAllFree] = useState(false);
  const [entEmail, setEntEmail] = useState("");
  const [blogForm, setBlogForm] = useState({
    title: "",
    slug: "",
    description: "",
    body: "",
    published: false,
  });
  const [broadcastForm, setBroadcastForm] = useState({ subject: "", bodyHtml: "" });
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  async function loadAll(d = days, h = humansOnly, day = trafficDay) {
    const [f, tr, cf, sources, o, s, b] = await Promise.all([
      adminFunnels(d, h),
      adminTraffic(d, day),
      adminTrafficCloudflare(d, day),
      adminTrafficSources(d, h),
      adminOutreach(d),
      adminSignups(),
      adminBlogList(),
    ]);
    setStats(f);
    setTraffic(tr);
    setCfTraffic(cf);
    setTrafficSources(sources);
    setOutreach(o);
    setSignups(s);
    setPosts(b.posts);
  }

  useEffect(() => {
    adminSetNoTrack().catch(() => {});
  }, []);

  useEffect(() => {
    adminMe()
      .then(async (me) => {
        setAuthedEmail(me.email);
        await loadAll(30);
      })
      .catch(() => setAuthedEmail(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (nav !== "marketplace" || !authedEmail) return;
    adminMarketplacePending()
      .then((res) => {
        setMarketplacePending(res.templates);
        setMarketplaceError(null);
      })
      .catch((err) => setMarketplaceError(err instanceof Error ? err.message : "Failed to load"));
  }, [nav, authedEmail]);

  async function approveMarketplace(id: string, featured: boolean) {
    setBusy(true);
    try {
      await adminMarketplaceApprove(id, {
        featured,
        verifiedExpert: !!marketplaceExpertChoice[id],
        expertCredential: marketplaceCredentialChoice[id],
      });
      setMarketplacePending((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setMarketplaceError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  }

  async function rejectMarketplace(id: string) {
    const reason = window.prompt("Rejection reason (optional):") ?? undefined;
    setBusy(true);
    try {
      await adminMarketplaceReject(id, reason);
      setMarketplacePending((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setMarketplaceError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading || authedEmail) return;
    window.location.href = "/app/login";
  }, [loading, authedEmail]);

  async function changeDays(d: number) {
    setDays(d);
    setTrafficDay(null);
    setBusy(true);
    try {
      const [f, tr, cf, sources, o] = await Promise.all([
        adminFunnels(d, humansOnly),
        adminTraffic(d, null),
        adminTrafficCloudflare(d, null),
        adminTrafficSources(d, humansOnly),
        adminOutreach(d),
      ]);
      setStats(f);
      setTraffic(tr);
      setCfTraffic(cf);
      setTrafficSources(sources);
      setOutreach(o);
    } finally {
      setBusy(false);
    }
  }

  async function changeTrafficDay(day: string | null) {
    setTrafficDay(day);
    setBusy(true);
    try {
      const [tr, cf] = await Promise.all([adminTraffic(days, day), adminTrafficCloudflare(days, day)]);
      setTraffic(tr);
      setCfTraffic(cf);
    } finally {
      setBusy(false);
    }
  }

  // Funnels + traffic sources respect humansOnly; page_views keep their own bot split.
  async function changeHumansOnly(on: boolean) {
    setHumansOnly(on);
    setBusy(true);
    try {
      const [f, sources] = await Promise.all([adminFunnels(days, on), adminTrafficSources(days, on)]);
      setStats(f);
      setTrafficSources(sources);
    } finally {
      setBusy(false);
    }
  }

  async function createBlog(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminBlogCreate({
        title: blogForm.title,
        slug: blogForm.slug || undefined,
        description: blogForm.description,
        body: blogForm.body,
        published: blogForm.published,
      });
      setBlogForm({ title: "", slug: "", description: "", body: "", published: false });
      const b = await adminBlogList();
      setPosts(b.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.createPostFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(post: BlogPost) {
    await adminBlogUpdate(post.id, { published: !post.published });
    const b = await adminBlogList();
    setPosts(b.posts);
  }

  async function removePost(id: string) {
    if (!confirm(t("admin.deletePostConfirm"))) return;
    await adminBlogDelete(id);
    const b = await adminBlogList();
    setPosts(b.posts);
  }

  async function publishNextPost() {
    setBusy(true);
    setPublishNextError(null);
    setPublishNextResult(null);
    try {
      const { post } = await adminBlogPublishNext();
      setPublishNextResult(post.title);
      const b = await adminBlogList();
      setPosts(b.posts);
    } catch (err) {
      setPublishNextError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  async function previewBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBroadcastBusy(true);
    setError(null);
    try {
      const result = await adminBroadcast({ ...broadcastForm, dryRun: true });
      setBroadcastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.broadcastFailed"));
    } finally {
      setBroadcastBusy(false);
    }
  }

  async function sendBroadcast() {
    const count = broadcastResult?.recipientCount ?? 0;
    if (!confirm(t("admin.broadcastConfirm", { count }))) return;
    setBroadcastBusy(true);
    setError(null);
    try {
      const result = await adminBroadcast({ ...broadcastForm });
      setBroadcastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.broadcastFailed"));
    } finally {
      setBroadcastBusy(false);
    }
  }

  async function grantBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminGrantBusiness(entEmail);
      setEntEmail("");
      setSignups(await adminSignups());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.grantFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(email: string) {
    const typed = window.prompt(t("admin.deleteAccountConfirm", { email }));
    if (typed === null) return; // cancelled
    if (typed.trim().toLowerCase() !== email.trim().toLowerCase()) {
      if (typed.trim() !== "") window.alert(t("admin.deleteAccountMismatch"));
      return;
    }
    setBusy(true);
    try {
      await adminDeleteAccount(email);
      setSignups(await adminSignups());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.deleteAccountFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !authedEmail) {
    return (
      <div className="dash-shell admin-analytics-page">
        <div className="dash-loading">{t("common.loading")}</div>
      </div>
    );
  }

  const freeShown = showAllFree ? signups?.free ?? [] : (signups?.free ?? []).slice(0, 5);
  const analyticsNav = (
    [
      ["analytics", "admin.nav.analytics"],
      ["growth", "admin.nav.growth"],
      ["blog", "admin.nav.blog"],
      ["marketplace", "admin.nav.marketplace"],
      ["signups", "admin.nav.signups"],
      ["activation", "admin.nav.activation"],
      ["completion", "admin.nav.completion"],
      ["template", "admin.nav.template"],
      ["traffic", "admin.nav.traffic"],
      ["email", "admin.nav.email"],
      ["errors", "admin.nav.errors"],
      ["roadmap", "admin.nav.roadmap"],
    ] as const
  );
  const showAnalyticsFilters =
    nav === "analytics" ||
    nav === "growth" ||
    nav === "activation" ||
    nav === "completion" ||
    nav === "template" ||
    nav === "traffic" ||
    nav === "email" ||
    nav === "errors";

  return (
    <div className="dash-shell admin-analytics-page">
      <div className="admin-analytics-container">
        <div className="admin-analytics-header">
          <a href="/app/" className="admin-analytics-back">
            {t("admin.backToApp")}
          </a>
          <h1>{t("admin.nav.analytics")}</h1>
          <p className="dash-sub">{t("admin.analyticsSub")}</p>
        </div>

        <div className="dash-body admin-analytics-shell">
          <aside className="dash-sidebar admin-analytics-nav" aria-label={t("admin.sectionsAria")}>
            <nav className="dash-side-nav">
              {analyticsNav.map(([id, labelKey]) => (
                <button
                  key={id}
                  type="button"
                  className={nav === id ? "is-active" : ""}
                  onClick={() => setNav(id)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </nav>
          </aside>

          <main className="dash-main">
          {error && <div className="error-msg">{error}</div>}

          {showAnalyticsFilters && (
            <>
              <div className="dash-range">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={days === d ? "is-on" : ""}
                    onClick={() => changeDays(d)}
                  >
                    {t("admin.lastDays", { days: d })}
                  </button>
                ))}
              </div>
              <label className="dash-exclude dash-exclude-tight">
                <input
                  type="checkbox"
                  checked={humansOnly}
                  onChange={(e) => changeHumansOnly(e.target.checked)}
                />
                {t("admin.humansOnly")}
              </label>
              <p className="dash-note dash-note-filter">
                {humansOnly ? t("admin.humansOnlyNote") : t("admin.allTrafficNote")}
              </p>
              {nav === "analytics" && traffic && (
                <label className="admin-day-filter admin-day-filter-top">
                  <span className="sr-only">{t("admin.filterByDay")}</span>
                  <select
                    value={trafficDay ?? "all"}
                    onChange={(e) => void changeTrafficDay(e.target.value === "all" ? null : e.target.value)}
                    aria-label={t("admin.filterByDay")}
                  >
                    <option value="all">{t("admin.allDays")}</option>
                    {lastNDays(days)
                      .map((d) => (
                        <option key={d} value={d}>
                          {fmtDate(d)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </>
          )}

          {nav === "analytics" && traffic && (
            <>
              <section className="dash-card admin-search-callout">
                <h2 className="dash-card-title">{t("admin.searchCalloutTitle")}</h2>
                <p className="dash-note">{t("admin.searchCalloutBody")}</p>
              </section>

              <div className="dash-stat-row dash-stat-row-4">
                <div className="dash-stat">
                  <span className="dash-stat-label">{t("admin.beaconPageViews")}</span>
                  <strong>{humansOnly ? traffic.humanPageViews : traffic.pageViews}</strong>
                  <em>
                    {humansOnly
                      ? t("admin.botExcluded", { pct: traffic.botPct })
                      : t("admin.beaconPageViewsSub")}
                  </em>
                </div>
                <div className="dash-stat">
                  <span className="dash-stat-label">{t("admin.crawlerPageViews")}</span>
                  <strong>{traffic.crawlerPageViews}</strong>
                  <em>{t("admin.crawlerPageViewsSub")}</em>
                </div>
                <div className="dash-stat">
                  <span className="dash-stat-label">{t("admin.chasesSent")}</span>
                  <strong>{traffic.chasesSent}</strong>
                  <em>{t("admin.chasesSentSub")}</em>
                </div>
                <div className="dash-stat">
                  <span className="dash-stat-label">{t("admin.chasesCompleted")}</span>
                  <strong>{traffic.chasesCompleted}</strong>
                  <em>{t("admin.chasesCompletedSub")}</em>
                </div>
              </div>

              <div className="dash-stat-row dash-stat-row-2">
                <div className="dash-stat">
                  <span className="dash-stat-label">{t("admin.sentToCompleted")}</span>
                  <strong>{traffic.conversion}</strong>
                </div>
              </div>

              <section className="dash-card">
                <h2 className="dash-card-title">{t("admin.cfTrafficTitle")}</h2>
                <p className="dash-note">
                  {cfTraffic && cfTraffic.configured && cfTraffic.ok
                    ? t("admin.cfTrafficSub", { zones: cfTraffic.zones.join(", ") })
                    : t("admin.cfTrafficSub", { zones: "docstoc.io, chasa.io" })}
                </p>
                {!cfTraffic || !cfTraffic.configured ? (
                  <p className="dash-muted">{t("admin.cfNotConfigured")}</p>
                ) : !cfTraffic.ok ? (
                  <p className="dash-muted">{t("admin.cfError", { error: cfTraffic.error })}</p>
                ) : (
                  <>
                    <div className="dash-stat-row dash-stat-row-4">
                      <div className="dash-stat">
                        <span className="dash-stat-label">{t("admin.cfRequests")}</span>
                        <strong>{cfTraffic.eyeballRequests}</strong>
                        <em>{t("admin.cfBotPct", { pct: cfTraffic.botPct })}</em>
                      </div>
                      <div className="dash-stat">
                        <span className="dash-stat-label">{t("admin.cfHuman")}</span>
                        <strong>{cfTraffic.humanCount}</strong>
                      </div>
                      <div className="dash-stat">
                        <span className="dash-stat-label">{t("admin.cfBots")}</span>
                        <strong>{cfTraffic.botCount}</strong>
                      </div>
                      <div className="dash-stat">
                        <span className="dash-stat-label">{t("admin.cfPageViews")}</span>
                        <strong>{cfTraffic.totals.pageViews}</strong>
                        <em>{t("admin.lastDays", { days: cfTraffic.days })}</em>
                      </div>
                    </div>
                    <p className="dash-note" style={{ marginTop: 4 }}>
                      {t("admin.cfBreakdownDay", { day: fmtDate(cfTraffic.day) })}
                    </p>
                    <div className="dash-grid-3" style={{ marginTop: 12 }}>
                      <div>
                        <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                          {t("admin.byBot")}
                        </h3>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>{t("admin.colBotName")}</th>
                              <th>{t("admin.colViews")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cfTraffic.byBot.length === 0 ? (
                              <tr>
                                <td colSpan={2}>{t("admin.noBotsYet")}</td>
                              </tr>
                            ) : (
                              cfTraffic.byBot.map((r) => (
                                <tr key={r.bot}>
                                  <td>{r.bot}</td>
                                  <td>{r.count}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                          {t("admin.byRoute")}
                        </h3>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>{t("admin.colRoute")}</th>
                              <th>{t("admin.colViews")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cfTraffic.byRoute.length === 0 ? (
                              <tr>
                                <td colSpan={2}>{t("admin.noTrafficDay")}</td>
                              </tr>
                            ) : (
                              cfTraffic.byRoute.map((r) => (
                                <tr key={r.path}>
                                  <td>
                                    <code>{r.path}</code>
                                  </td>
                                  <td>{r.count}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                          {t("admin.byCountry")}
                        </h3>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>{t("admin.colCountry")}</th>
                              <th>{t("admin.colViews")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cfTraffic.byCountry.length === 0 ? (
                              <tr>
                                <td colSpan={2}>{t("admin.noTrafficDay")}</td>
                              </tr>
                            ) : (
                              cfTraffic.byCountry.map((r) => (
                                <tr key={r.country}>
                                  <td>{r.country}</td>
                                  <td>{r.count}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {trafficSources && (
                <section className="dash-card admin-traffic-sources-card">
                  <h2 className="dash-card-title">{t("admin.externalTrafficTitle")}</h2>
                  <p className="dash-note">{t("admin.externalTrafficSub")}</p>
                  <TrafficSourcesTable rows={trafficSources.rows} windowDays={days} t={t} />
                </section>
              )}

              <section className="dash-card">
                <h2 className="dash-card-title">
                  {t("admin.pageViewsByDay")}
                  {trafficDay ? (
                    <button type="button" className="btn-secondary" onClick={() => void changeTrafficDay(null)}>
                      {t("admin.clearDayFilter", { day: fmtDate(trafficDay) })}
                    </button>
                  ) : null}
                </h2>
                <DayChart
                  rows={traffic.byDay}
                  selectedDay={trafficDay}
                  onSelectDay={(day) => void changeTrafficDay(day)}
                  t={t}
                />
              </section>

              {outreach && (
                <section className="dash-card">
                  <h2 className="dash-card-title">{t("admin.outreachTitle")}</h2>
                  <p className="dash-note">{t("admin.outreachSub")}</p>
                  <div className="dash-stat-row dash-stat-row-4" style={{ marginBottom: 16 }}>
                    <div className="dash-stat">
                      <span className="dash-stat-label">{t("admin.outreachOpens")}</span>
                      <strong>{outreach.humanOpens}</strong>
                      <em>
                        {outreach.botOpens > 0
                          ? t("admin.outreachBots", { count: outreach.botOpens })
                          : t("admin.outreachLinkHint")}
                      </em>
                    </div>
                  </div>
                  <div className="dash-grid-3">
                    <div>
                      <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                        {t("admin.outreachByCampaign")}
                      </h3>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>{t("admin.colCampaign")}</th>
                            <th>{t("admin.colOpens")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outreach.byCampaign.length === 0 ? (
                            <tr>
                              <td colSpan={2}>{t("admin.outreachEmpty")}</td>
                            </tr>
                          ) : (
                            outreach.byCampaign.map((r) => (
                              <tr key={r.label}>
                                <td>
                                  <code>{r.label}</code>
                                </td>
                                <td>{r.count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                        {t("admin.outreachByWho")}
                      </h3>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>{t("admin.colWho")}</th>
                            <th>{t("admin.colOpens")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outreach.byWho.length === 0 ? (
                            <tr>
                              <td colSpan={2}>{t("admin.outreachNoWho")}</td>
                            </tr>
                          ) : (
                            outreach.byWho.map((r) => (
                              <tr key={r.who}>
                                <td>
                                  <code>{r.who}</code>
                                </td>
                                <td>{r.count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                        {t("admin.outreachRecent")}
                      </h3>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>{t("admin.colWhen")}</th>
                            <th>{t("admin.colLabel")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outreach.recent.filter((r) => !r.isBot).length === 0 ? (
                            <tr>
                              <td colSpan={2}>{t("admin.outreachEmpty")}</td>
                            </tr>
                          ) : (
                            outreach.recent
                              .filter((r) => !r.isBot)
                              .slice(0, 15)
                              .map((r) => (
                                <tr key={`${r.at}-${r.label}`}>
                                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                    {r.at.slice(0, 16).replace("T", " ")}
                                  </td>
                                  <td>
                                    <code style={{ fontSize: 12 }}>{r.label}</code>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                      <p className="dash-note" style={{ marginTop: 12 }}>
                        {t("admin.outreachLinks")}:{" "}
                        {outreach.links.map((l) => (
                          <span key={l.path}>
                            <code>https://docstoc.io{l.path}</code>{" "}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <div className="dash-grid-3">
                <section className="dash-card">
                  <h2 className="dash-card-title">
                    {t("admin.byRoute")}
                    {trafficDay ? <span className="dash-kpi-tag">{fmtDate(trafficDay)}</span> : null}
                  </h2>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("admin.colRoute")}</th>
                        <th>{t("admin.colTotal")}</th>
                        <th>{t("admin.colHuman")}</th>
                        <th>{t("admin.colBot")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traffic.byRoute.length === 0 ? (
                        <tr>
                          <td colSpan={4}>{t("admin.noTrafficDay")}</td>
                        </tr>
                      ) : (
                        traffic.byRoute.map((r) => (
                          <tr key={r.path}>
                            <td>
                              <code>{r.path}</code>
                            </td>
                            <td>{r.total}</td>
                            <td>{r.human}</td>
                            <td>{r.bot}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
                <section className="dash-card">
                  <h2 className="dash-card-title">
                    {t("admin.byBot")}
                    {trafficDay ? <span className="dash-kpi-tag">{fmtDate(trafficDay)}</span> : null}
                  </h2>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("admin.colBotName")}</th>
                        <th>{t("admin.colViews")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traffic.byBot.length === 0 ? (
                        <tr>
                          <td colSpan={2}>{t("admin.noBotsYet")}</td>
                        </tr>
                      ) : (
                        traffic.byBot.map((r) => (
                          <tr key={r.bot}>
                            <td>{r.bot}</td>
                            <td>{r.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
                <section className="dash-card">
                  <h2 className="dash-card-title">
                    {t("admin.byCountry")}
                    {trafficDay ? <span className="dash-kpi-tag">{fmtDate(trafficDay)}</span> : null}
                  </h2>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("admin.colCountry")}</th>
                        <th>{t("admin.colViews")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traffic.byCountry.length === 0 ? (
                        <tr>
                          <td colSpan={2}>{t("admin.noTrafficDay")}</td>
                        </tr>
                      ) : (
                        traffic.byCountry.map((r) => (
                          <tr key={r.country}>
                            <td>{r.country}</td>
                            <td>{r.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
              </div>
              <p className="dash-note">{traffic.note}</p>
            </>
          )}

          {nav === "analytics" && <AeParityCard />}

          {nav === "blog" && (
            <section className="dash-card">
              <h2 className="dash-card-title">{t("admin.blogPosts")}</h2>
              <p className="dash-muted">{t("admin.blogMuted")}</p>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void publishNextPost()}>
                {t("admin.publishNextPost")}
              </button>
              <p className="dash-note">{t("admin.publishNextPostHint")}</p>
              {publishNextResult && <p className="dash-note">{t("admin.publishNextPostDone", { title: publishNextResult })}</p>}
              {publishNextError && <p className="dash-muted">{publishNextError}</p>}
              {posts.length === 0 ? (
                <p className="dash-muted">{t("admin.noPosts")}</p>
              ) : (
                <ul className="dash-post-list">
                  {posts.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.title}</strong>
                        <span>
                          /{p.slug} · {p.published ? t("admin.published") : t("admin.draft")}
                        </span>
                      </div>
                      <div className="dash-post-actions">
                        <button type="button" className="btn-secondary" onClick={() => togglePublish(p)}>
                          {p.published ? t("admin.unpublish") : t("admin.publish")}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => removePost(p.id)}>
                          {t("admin.deletePost")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="dash-card-title" style={{ marginTop: 20 }}>
                {t("admin.newPost")}
              </h3>
              <form className="dash-blog-form" onSubmit={createBlog}>
                <input
                  placeholder={t("admin.postTitle")}
                  value={blogForm.title}
                  onChange={(e) => setBlogForm({ ...blogForm, title: e.target.value })}
                  required
                />
                <input
                  placeholder={t("admin.postSlug")}
                  value={blogForm.slug}
                  onChange={(e) => setBlogForm({ ...blogForm, slug: e.target.value })}
                />
                <input
                  placeholder={t("admin.postDesc")}
                  value={blogForm.description}
                  onChange={(e) => setBlogForm({ ...blogForm, description: e.target.value })}
                />
                <textarea
                  rows={8}
                  placeholder={t("admin.postBody")}
                  value={blogForm.body}
                  onChange={(e) => setBlogForm({ ...blogForm, body: e.target.value })}
                  required
                />
                <label className="dash-exclude">
                  <input
                    type="checkbox"
                    checked={blogForm.published}
                    onChange={(e) => setBlogForm({ ...blogForm, published: e.target.checked })}
                  />
                  {t("admin.publishedVisible")}
                </label>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {t("admin.createPost")}
                </button>
              </form>
            </section>
          )}

          {nav === "marketplace" && (
            <section className="dash-card">
              <h2 className="dash-card-title">{t("admin.marketplaceTitle")}</h2>
              <p className="dash-muted">{t("admin.marketplaceSub")}</p>
              {marketplaceError && <p className="dash-muted">{marketplaceError}</p>}
              {marketplacePending.length === 0 ? (
                <p className="dash-muted">{t("admin.marketplaceEmpty")}</p>
              ) : (
                <div className="dash-grid-3">
                  {marketplacePending.map((row) => (
                    <div key={row.id} className="dash-card" style={{ margin: 0 }}>
                      <h3 className="dash-card-title" style={{ fontSize: 14 }}>
                        {row.name}
                      </h3>
                      <p className="dash-note" style={{ marginTop: -4 }}>
                        {[row.category, row.stage, row.tone].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {row.description && <p className="dash-note">{row.description}</p>}
                      {row.tags.length > 0 && (
                        <div className="tpl-tags" style={{ marginTop: 6 }}>
                          {row.tags.map((tag) => (
                            <span key={tag} className="tpl-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {row.submitterName && (
                        <p className="tpl-author">
                          {t("admin.marketplaceBy")}{" "}
                          {row.submitterUrl ? (
                            <a href={row.submitterUrl} target="_blank" rel="noopener noreferrer">
                              {row.submitterName}
                            </a>
                          ) : (
                            row.submitterName
                          )}
                        </p>
                      )}
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#888", marginTop: 8 }}>
                        {row.templateType === "document" ? "Document template" : "Email template"}
                      </p>
                      {row.templateType === "document" ? null : (
                        <p style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{row.subject}</p>
                      )}
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          fontSize: 12,
                          background: "var(--dash-bg-soft, #f6f7fb)",
                          padding: 8,
                          borderRadius: 6,
                          maxHeight: 200,
                          overflow: "auto",
                        }}
                      >
                        {row.templateType === "document" ? row.bodyMarkdown : row.body}
                      </pre>
                      {row.submitterEmail && (
                        <p className="dash-note" style={{ fontSize: 11 }}>
                          {t("admin.marketplaceSubmitter", { email: row.submitterEmail })}
                        </p>
                      )}
                      <label className="dash-exclude" style={{ marginTop: 8 }}>
                        <input
                          type="checkbox"
                          checked={!!marketplaceFeatureChoice[row.id]}
                          onChange={(e) =>
                            setMarketplaceFeatureChoice((prev) => ({ ...prev, [row.id]: e.target.checked }))
                          }
                        />
                        {t("admin.marketplaceFeature")}
                      </label>
                      <label className="dash-exclude" style={{ marginTop: 4 }}>
                        <input
                          type="checkbox"
                          checked={!!marketplaceExpertChoice[row.id]}
                          onChange={(e) =>
                            setMarketplaceExpertChoice((prev) => ({ ...prev, [row.id]: e.target.checked }))
                          }
                        />
                        {t("admin.marketplaceVerifiedExpert")}
                      </label>
                      {marketplaceExpertChoice[row.id] && (
                        <input
                          type="text"
                          placeholder={t("admin.marketplaceCredentialPlaceholder")}
                          value={marketplaceCredentialChoice[row.id] || ""}
                          onChange={(e) =>
                            setMarketplaceCredentialChoice((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          style={{ marginTop: 4, width: "100%", fontSize: 12, padding: 4 }}
                        />
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busy}
                          onClick={() => void approveMarketplace(row.id, !!marketplaceFeatureChoice[row.id])}
                        >
                          {t("admin.marketplaceApprove")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void rejectMarketplace(row.id)}
                        >
                          {t("admin.marketplaceReject")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {nav === "roadmap" && <RoadmapCard t={t} />}

          {nav === "signups" && signups && (
            <>
              <section className="dash-card">
                <h2 className="dash-card-title">{t("admin.allSignups", { total: signups.total })}</h2>
                <p className="dash-muted">{t("admin.signupsMuted")}</p>
                <button type="button" className="btn-secondary" onClick={() => setShowAllFree((v) => !v)}>
                  {showAllFree ? t("admin.showLess") : t("admin.showAll")}
                </button>
                <div className="dash-signup-cols">
                  <div>
                    <h3>{t("admin.free", { count: signups.free.length })}</h3>
                    <ul>
                      {freeShown.map((a) => (
                        <li key={a.email}>
                          <span>{a.email}</span>
                          <span>{fmtDate(a.createdAt)}</span>
                          <button
                            type="button"
                            className="btn-secondary dash-signup-delete"
                            disabled={busy}
                            onClick={() => removeAccount(a.email)}
                          >
                            {t("admin.deleteAccount")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>{t("admin.paid", { count: signups.paid.length })}</h3>
                    <ul>
                      {signups.paid.map((a) => (
                        <li key={a.email}>
                          <span>
                            {a.email} · {a.plan}
                          </span>
                          <span>{fmtDate(a.createdAt)}</span>
                          <button
                            type="button"
                            className="btn-secondary dash-signup-delete"
                            disabled={busy}
                            onClick={() => removeAccount(a.email)}
                          >
                            {t("admin.deleteAccount")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
              <section className="dash-card">
                <h2 className="dash-card-title">{t("admin.businessAccounts")}</h2>
                <p className="dash-muted">{t("admin.businessMuted")}</p>
                <form className="dash-ent-form" onSubmit={grantBusiness}>
                  <input
                    type="email"
                    placeholder={t("admin.entEmailPlaceholder")}
                    value={entEmail}
                    onChange={(e) => setEntEmail(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {t("admin.grantBusiness")}
                  </button>
                </form>
                {signups.business.length === 0 ? (
                  <p className="dash-muted">{t("admin.noBusiness")}</p>
                ) : (
                  <ul className="dash-post-list">
                    {signups.business.map((a) => (
                      <li key={a.email}>
                        <strong>{a.email}</strong>
                        <span>{fmtDate(a.createdAt)}</span>
                        <button
                          type="button"
                          className="btn-secondary dash-signup-delete"
                          disabled={busy}
                          onClick={() => removeAccount(a.email)}
                        >
                          {t("admin.deleteAccount")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="dash-card">
                <h2 className="dash-card-title">{t("admin.broadcastTitle")}</h2>
                <p className="dash-muted">{t("admin.broadcastMuted")}</p>
                <form className="dash-blog-form" onSubmit={previewBroadcast}>
                  <input
                    placeholder={t("admin.broadcastSubject")}
                    value={broadcastForm.subject}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                    required
                  />
                  <textarea
                    rows={10}
                    placeholder={t("admin.broadcastBody")}
                    value={broadcastForm.bodyHtml}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, bodyHtml: e.target.value })}
                    required
                  />
                  <button type="submit" className="btn-secondary" disabled={broadcastBusy}>
                    {broadcastBusy ? t("common.loading") : t("admin.broadcastPreview")}
                  </button>
                </form>
                {broadcastResult && (
                  <div className="dash-note" style={{ marginTop: 16 }}>
                    {broadcastResult.sent != null ? (
                      <p>
                        {t("admin.broadcastSent", {
                          sent: broadcastResult.sent,
                          failed: broadcastResult.failed ?? 0,
                        })}
                      </p>
                    ) : (
                      <>
                        <p>{t("admin.broadcastRecipients", { count: broadcastResult.recipientCount })}</p>
                        {broadcastResult.recipientCount > 0 && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={sendBroadcast}
                            disabled={broadcastBusy}
                          >
                            {broadcastBusy ? t("common.loading") : t("admin.broadcastSend")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {stats && nav === "growth" && (
            <FunnelTable
              title={t("admin.growthFunnel")}
              note={t("admin.growthNote")}
              steps={stats.growth ?? []}
              kpi="checkout_completed"
              t={t}
            />
          )}
          {stats && nav === "activation" && (
            <FunnelTable
              title={t("admin.activationFunnel")}
              steps={stats.activation}
              kpi="chase_sent"
              t={t}
            />
          )}
          {stats && nav === "completion" && (
            <FunnelTable
              title={t("admin.completionFunnel")}
              steps={stats.completion}
              kpi="chase_completed"
              t={t}
            />
          )}
          {stats && nav === "template" && (
            <FunnelTable
              title={t("admin.templateFunnel")}
              steps={stats.template}
              kpi="template_completed"
              t={t}
            />
          )}
          {stats && nav === "traffic" && (
            <FunnelTable
              title={t("admin.trafficEvents")}
              steps={stats.traffic}
              kpi="landingpage_cta_clicked"
              t={t}
            />
          )}
          {stats && nav === "email" && (
            <FunnelTable title={t("admin.emailFunnel")} steps={stats.email} kpi="email_clicked" t={t} />
          )}
          {stats && nav === "errors" && (
            <FunnelTable title={t("admin.errorEvents")} steps={stats.errors} t={t} />
          )}
        </main>
        </div>
      </div>
    </div>
  );
}
