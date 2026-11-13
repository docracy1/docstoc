import { useEffect, useState } from "react";
import { adminVisits, type VisitsResponse } from "../../lib/adminApi";
import { useT } from "../../lib/i18n";
import { duration, flag, percent } from "../../lib/visitsFormat";

/** Cookieless visitor count (worker lib/visits.ts): per kind of page, countries and kind of network.
 *  Self-contained: it only follows the page's day filter. */
export default function VisitsCard({ days }: { days: number }) {
  const t = useT();
  const [data, setData] = useState<VisitsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    adminVisits(days)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Failed to load"));
    return () => {
      alive = false;
    };
  }, [days]);

  return (
    <section className="dash-card">
      <h2 className="dash-card-title">{t("admin.visitsTitle")}</h2>
      <p className="dash-note">{t("admin.visitsSub")}</p>
      {error && <p className="dash-muted">{error}</p>}
      {!data && !error && <p className="dash-muted">{t("admin.visitsLoading")}</p>}
      {data && !data.ok && <p className="dash-muted">{t("admin.visitsMigrationMissing")}</p>}
      {data && data.ok && !data.configured && <p className="dash-muted">{t("admin.visitsNoSalt")}</p>}
      {data && data.ok && (
        <>
          <div className="dash-stat-row dash-stat-row-4">
            <div className="dash-stat">
              <span className="dash-stat-label">{t("admin.visitsVisitors")}</span>
              <strong>{data.totals.visitors}</strong>
              <em>{t("admin.visitsLive", { n: data.live.visitors, minutes: data.live.minutes })}</em>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">{t("admin.visitsPageviews")}</span>
              <strong>{data.totals.pageviews}</strong>
              <em>{t("admin.visitsVisits", { n: data.totals.visits })}</em>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">{t("admin.visitsDuration")}</span>
              <strong>{duration(data.totals.averageSeconds)}</strong>
              <em>{t("admin.visitsMeasured", { n: data.totals.measured, short: percent(data.totals.short, data.totals.measured) })}</em>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">{t("admin.visitsBounce")}</span>
              <strong>{percent(data.totals.bounces, data.totals.visits)}</strong>
              <em>{t("admin.visitsSecond", { pct: percent(data.totals.visits - data.totals.bounces, data.totals.visits) })}</em>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.visitsKind")}</th>
                  <th>{t("admin.visitsVisitors")}</th>
                  <th>{t("admin.visitsPageviews")}</th>
                  <th>{t("admin.visitsEntries")}</th>
                  <th>{t("admin.visitsBounce")}</th>
                  <th>{t("admin.visitsSecondPage")}</th>
                  <th>{t("admin.visitsDuration")}</th>
                  <th>{t("admin.visitsShort")}</th>
                </tr>
              </thead>
              <tbody>
                {data.kinds.map((k) => (
                  <tr key={k.kind}>
                    <td>{t(`admin.visitsKind_${k.kind}`)}</td>
                    <td>{k.visitors}</td>
                    <td>{k.pageviews}</td>
                    <td>{k.visits}</td>
                    <td>{percent(k.bounces, k.visits)}</td>
                    <td>{percent(k.visits - k.bounces, k.visits)}</td>
                    <td>{duration(k.averageSeconds)}</td>
                    <td>{percent(k.short, k.measured)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dash-note">{t("admin.visitsKindNote")}</p>

          <h3 className="dash-card-title" style={{ fontSize: 14 }}>{t("admin.visitsCountries")}</h3>
          <p className="dash-note">
            {t("admin.visitsNetTotal", { dc: data.net.dc, isp: data.net.isp, unknown: data.net.unknown })}
          </p>
          {data.countries.length === 0 ? (
            <p className="dash-muted">{t("admin.visitsNone")}</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("admin.visitsCountry")}</th>
                    <th>{t("admin.visitsVisitors")}</th>
                    <th>{t("admin.visitsPageviews")}</th>
                    <th>{t("admin.visitsNetDc")}</th>
                    <th>{t("admin.visitsNetIsp")}</th>
                    <th>{t("admin.visitsNetUnknown")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((c) => (
                    <tr key={c.country || "unknown"}>
                      <td>
                        {flag(c.country)} {c.country || t("admin.visitsCountryUnknown")}
                      </td>
                      <td>{c.visitors}</td>
                      <td>{c.pageviews}</td>
                      <td>
                        {c.dcVisitors} <span className="dash-muted">({percent(c.dcVisitors, c.visitors)})</span>
                      </td>
                      <td>{c.ispVisitors}</td>
                      <td>{c.unknownVisitors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="dash-note">{t("admin.visitsNetNote")}</p>
        </>
      )}
    </section>
  );
}
