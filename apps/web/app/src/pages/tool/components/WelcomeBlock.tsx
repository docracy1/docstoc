import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyTrustProfile,
  getSoxStatus,
  listCertificates,
  listCustomHostnames,
  listInvoices,
  type Account,
  type SslFeatures,
} from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { isBusinessPlan } from "../../../lib/plan";

interface WelcomeBlockProps {
  welcomeName: string | null;
  overdueCount: number;
  chaseCount: number;
  isPaid: boolean;
  account: Account | null;
}

type ProductStats = {
  sslUsed: number;
  sslLimit: number;
  sslFeatures: SslFeatures | null;
  certCount: number;
  hasBadge: boolean;
  invoiceCount: number;
  soxPending: number | null;
  soxReady: boolean;
};

export function WelcomeBlock({
  welcomeName,
  overdueCount,
  chaseCount,
  isPaid,
  account,
}: WelcomeBlockProps) {
  const t = useT();
  const [stats, setStats] = useState<ProductStats>({
    sslUsed: 0,
    sslLimit: 5,
    sslFeatures: null,
    certCount: 0,
    hasBadge: false,
    invoiceCount: 0,
    soxPending: null,
    soxReady: false,
  });
  const business = isBusinessPlan(account);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    Promise.all([
      listCustomHostnames().catch(() => null),
      listCertificates().catch(() => null),
      getMyTrustProfile().catch(() => null),
      listInvoices().catch(() => null),
      business ? getSoxStatus().catch(() => null) : Promise.resolve(null),
    ]).then(([ssl, certs, trust, invoices, sox]) => {
      if (cancelled) return;
      setStats({
        sslUsed: ssl?.certificates.length ?? 0,
        sslLimit: ssl?.limit ?? 5,
        sslFeatures: ssl?.features ?? null,
        certCount: certs?.certificates.length ?? 0,
        hasBadge: !!trust?.profile,
        invoiceCount: invoices?.invoices.length ?? 0,
        soxPending: sox?.overview?.pendingApprovals ?? null,
        soxReady: !!sox?.business && !!sox.overview,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [account?.email, business]);

  const multiSan = stats.sslFeatures?.multiSan ?? isPaid;
  const wildcard = stats.sslFeatures?.wildcard ?? account?.plan === "business";
  const acme = stats.sslFeatures?.acmeApi ?? isPaid;

  return (
    <section className="welcome-block">
      <div className="welcome-hero">
        <div>
          <h1>{welcomeName ? t("welcome.titleNamed", { name: welcomeName }) : t("welcome.title")}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {t("welcome.sub")}
          </p>
        </div>
        {account?.plan ? (
          <div className="welcome-plan-pill">
            <span>{t("welcome.plan")}</span>
            <strong>{account.plan}</strong>
          </div>
        ) : null}
      </div>

      <h2 className="welcome-section-title">{t("welcome.productsTitle")}</h2>
      <div className="welcome-products welcome-products-live">
        <Link className="welcome-product" to="/document-templates">
          <span className="welcome-product-kicker">{t("welcome.product.templates.kicker")}</span>
          <strong>{t("welcome.product.templates.title")}</strong>
          <span>{t("welcome.product.templates.body")}</span>
          <em>{t("welcome.product.templates.cta")}</em>
        </Link>

        <article className="welcome-product welcome-product-ssl">
          <Link className="welcome-product-main" to="/ssl-domains">
            <span className="welcome-product-kicker">{t("welcome.product.ssl.kicker")}</span>
            <strong>{t("welcome.product.ssl.title")}</strong>
            <span>
              {t("welcome.product.ssl.domains", { used: stats.sslUsed, limit: stats.sslLimit })}
            </span>
            <em>{t("welcome.product.ssl.cta")}</em>
          </Link>
          <div className="welcome-product-links">
            <Link to="/ssl-domains#domains">{t("welcome.product.ssl.managed")}</Link>
            <Link to="/ssl-domains#multi-san" className={multiSan ? undefined : "is-locked"}>
              {t("welcome.product.ssl.multiSan")}
              {!multiSan ? <span>{t("welcome.product.locked")}</span> : null}
            </Link>
            <Link to="/ssl-domains#wildcards" className={wildcard ? undefined : "is-locked"}>
              {t("welcome.product.ssl.wildcards")}
              {!wildcard ? <span>{t("welcome.product.locked")}</span> : null}
            </Link>
            <Link to="/ssl-domains#acme" className={acme ? undefined : "is-locked"}>
              {t("welcome.product.ssl.acme")}
              {!acme ? <span>{t("welcome.product.locked")}</span> : null}
            </Link>
          </div>
        </article>

        <Link className="welcome-product" to="/certificates">
          <span className="welcome-product-kicker">{t("welcome.product.certificates.kicker")}</span>
          <strong>{t("welcome.product.certificates.title")}</strong>
          <span>
            {stats.certCount === 0
              ? t("welcome.product.certificates.empty")
              : t("welcome.product.certificates.count", { count: stats.certCount })}
          </span>
          <em>{t("welcome.product.certificates.cta")}</em>
        </Link>

        <Link className="welcome-product" to={business ? "/sox-reporting" : "/account"}>
          <span className="welcome-product-kicker">{t("welcome.product.sox.kicker")}</span>
          <strong>{t("welcome.product.sox.title")}</strong>
          <span>
            {!business
              ? t("welcome.product.sox.upgrade")
              : stats.soxPending != null && stats.soxPending > 0
                ? t("welcome.product.sox.pending", { count: stats.soxPending })
                : stats.soxReady
                  ? t("welcome.product.sox.ready")
                  : t("welcome.product.sox.body")}
          </span>
          <em>{business ? t("welcome.product.sox.cta") : t("welcome.product.sox.ctaUpgrade")}</em>
        </Link>

        <Link className="welcome-product" to="/company-badge">
          <span className="welcome-product-kicker">{t("welcome.product.companyBadge.kicker")}</span>
          <strong>{t("welcome.product.companyBadge.title")}</strong>
          <span>
            {stats.hasBadge
              ? t("welcome.product.companyBadge.ready")
              : t("welcome.product.companyBadge.needSsl")}
          </span>
          <em>{t("welcome.product.companyBadge.cta")}</em>
        </Link>

        <Link className="welcome-product" to="/invoices">
          <span className="welcome-product-kicker">{t("welcome.product.invoices.kicker")}</span>
          <strong>{t("welcome.product.invoices.title")}</strong>
          <span>
            {stats.invoiceCount === 0
              ? t("welcome.product.invoices.empty")
              : t("welcome.product.invoices.count", { count: stats.invoiceCount })}
          </span>
          <em>{t("welcome.product.invoices.cta")}</em>
        </Link>

        <Link className="welcome-product" to="/?view=overdue">
          <span className="welcome-product-kicker">{t("welcome.product.chases.kicker")}</span>
          <strong>{t("welcome.product.chases.title")}</strong>
          <span>
            {overdueCount > 0
              ? t("welcome.product.chases.overdue", { count: overdueCount })
              : chaseCount > 0
                ? t("welcome.product.chases.active", { count: chaseCount })
                : t("welcome.product.chases.empty")}
          </span>
          <em>{t("welcome.product.chases.cta")}</em>
        </Link>
      </div>
    </section>
  );
}
