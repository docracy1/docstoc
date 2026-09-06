import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout, type Account } from "../lib/api";
import { isWorkspaceAdmin } from "../lib/plan";
import { useT } from "../lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import UserChip from "./UserChip";

type NavIconName =
  | "dashboard"
  | "clients"
  | "tools"
  | "templates"
  | "chases"
  | "connector"
  | "team"
  | "branding"
  | "webhooks"
  | "account"
  | "more"
  | "support"
  | "certificates"
  | "docTemplates"
  | "ssl"
  | "auditLog"
  | "sox"
  | "invoices"
  | "companyBadge";

function NavIcon({ name, size = 20 }: { name: NavIconName; size?: number }) {
  const common = {
    className: "nav-icon",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "clients":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
          <circle cx="17" cy="9" r="2.25" />
          <path d="M15.5 14.2c2.3.4 4 2.4 4 5.3" />
        </svg>
      );
    case "templates":
      return (
        <svg {...common}>
          <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
        </svg>
      );
    case "chases":
      return (
        <svg {...common}>
          <path d="M4 6h12l4 6-4 6H4l4-6-4-6z" />
          <path d="M8 12h6" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" />
        </svg>
      );
    case "connector":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
          <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.75" />
          <circle cx="16" cy="8" r="2.75" />
          <path d="M3.5 19c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
          <path d="M11.5 19c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
        </svg>
      );
    case "branding":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.25" />
          <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
        </svg>
      );
    case "webhooks":
      return (
        <svg {...common}>
          <path d="M8 7h11l-2.5 3L19 13H8a3 3 0 1 1 0-6z" />
          <path d="M8 17a3 3 0 1 0 0-6" />
        </svg>
      );
    case "certificates":
      return (
        <svg {...common}>
          <path d="M8 3h8a2 2 0 0 1 2 2v9.5l-3-1.7-3 1.7-3-1.7-3 1.7V5a2 2 0 0 1 2-2z" />
          <path d="M9.5 8h5M9.5 11h5" />
        </svg>
      );
    case "docTemplates":
      return (
        <svg {...common}>
          <path d="M7 3.5h7.5L18 7v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
          <path d="M14 3.5V7h4" />
          <path d="M8.5 11.5h7M8.5 14.5h7M8.5 17h4" />
        </svg>
      );
    case "ssl":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "auditLog":
      return (
        <svg {...common}>
          <path d="M9 7a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1" />
          <path d="M15 17a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1" />
          <path d="M9.5 12h5" />
        </svg>
      );
    case "sox":
      return (
        <svg {...common}>
          <path d="M4 5.5h16v13H4z" />
          <path d="M8 9h8M8 12.5h8M8 16h5" />
          <path d="M17 7.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6L17 13.8l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L17 7.5z" />
        </svg>
      );
    case "invoices":
      return (
        <svg {...common}>
          <path d="M7 3.5h8.5L19 7v13.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
          <path d="M9 9h6M9 12.5h6M9 16h3.5" />
          <circle cx="17" cy="17.5" r="3.25" fill="none" />
          <path d="M17 16.2v2.6M15.9 17.5h2.2" />
        </svg>
      );
    case "companyBadge":
      return (
        <svg {...common}>
          <path d="M12 3.5l7 2.2v5.4c0 4.3-2.9 7.4-7 9.4-4.1-2-7-5.1-7-9.4V5.7L12 3.5z" />
          <path d="M9.2 12.1l1.8 1.8 3.8-3.8" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 19.5c0-3.4 3.1-6 7-6s7 2.6 7 6" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.25" />
          <path d="M9.4 9.4a2.7 2.7 0 0 1 5.2.9c0 1.6-2.6 2.2-2.6 3.7" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
  }
}

export default function AppShell({
  account,
  loading,
  refresh,
  onLogout,
  children,
}: {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
  onLogout?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [chasesExpanded, setChasesExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(false);
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [sslExpanded, setSslExpanded] = useState(false);
  const [certificatesExpanded, setCertificatesExpanded] = useState(false);
  const logoSrc = account?.logoDataUrl || "/brand/docstoc-icon.png";
  const wordmark = account?.workspaceName || "docstoc";
  const workspaceAdmin = isWorkspaceAdmin(account);

  const view = new URLSearchParams(location.search).get("view");
  const onDashboard = location.pathname === "/" || location.pathname === "";

  // Product order: Marketplace → SSL → Certificates → Company badge → Invoices + Chases (linked).
  const chasesNav = [
    { pathname: "/", search: "?view=overdue", view: "overdue" as const, label: t("nav.chasesOverdue") },
    { pathname: "/", search: "?view=waiting", view: "waiting" as const, label: t("nav.chasesWaiting") },
    { pathname: "/", search: "?view=paid", view: "paid" as const, label: t("nav.chasesPaid") },
    { pathname: "/templates", search: "", view: null, label: t("nav.templatesEmails") },
    { pathname: "/clients", search: "", view: null, label: t("nav.clients") },
  ];

  const toolsNav = (
    [
      workspaceAdmin
        ? { to: "/connector", hash: "api-key", label: t("nav.connectorApi") }
        : null,
      workspaceAdmin ? { to: "/webhooks", hash: undefined, label: t("nav.webhooks") } : null,
      workspaceAdmin
        ? { to: "/connector", hash: "cloud", label: t("nav.connectors") }
        : null,
      workspaceAdmin ? { to: "/branding", hash: undefined, label: t("nav.branding") } : null,
    ] as const
  ).filter(Boolean) as Array<{ to: string; hash: string | undefined; label: string }>;

  const marketplaceNav = [{ to: "/document-templates", label: t("nav.documentTemplates") }];

  const invoicesNav = [
    { to: "/invoices", label: t("nav.invoicesAll") },
    { to: "/clients", label: t("nav.clients") },
  ];

  const sslNav = [
    { to: "/ssl-domains", hash: "", label: t("nav.sslDomainsManage") },
    { to: "/ssl-domains#multi-san", hash: "#multi-san", label: t("nav.sslMultiSan") },
    { to: "/ssl-domains#wildcards", hash: "#wildcards", label: t("nav.sslWildcards") },
    { to: "/ssl-domains#acme", hash: "#acme", label: t("nav.sslAcme") },
  ];

  const certificatesNav = [
    { to: "/certificates", label: t("nav.certificatesAll") },
    { to: "/audit-log", label: t("nav.auditLog") },
  ];

  const chasesPathActive =
    (onDashboard && (view === "overdue" || view === "waiting" || view === "paid")) ||
    location.pathname.startsWith("/templates") ||
    location.pathname.startsWith("/clients");
  const marketplacePathActive = location.pathname.startsWith("/document-templates");
  const invoicesPathActive =
    location.pathname.startsWith("/invoices") || location.pathname.startsWith("/clients");
  const sslPathActive = location.pathname.startsWith("/ssl-domains");
  const certificatesPathActive =
    location.pathname.startsWith("/certificates") || location.pathname.startsWith("/audit-log");
  const toolsPathActive =
    workspaceAdmin &&
    (location.pathname.startsWith("/connector") ||
      location.pathname.startsWith("/webhooks") ||
      location.pathname.startsWith("/branding"));

  useEffect(() => {
    if (chasesPathActive) setChasesExpanded(true);
  }, [chasesPathActive]);

  useEffect(() => {
    if (toolsPathActive) setToolsExpanded(true);
  }, [toolsPathActive]);

  useEffect(() => {
    if (marketplacePathActive) setMarketplaceExpanded(true);
  }, [marketplacePathActive]);

  useEffect(() => {
    if (invoicesPathActive) setInvoicesExpanded(true);
  }, [invoicesPathActive]);

  useEffect(() => {
    if (sslPathActive) setSslExpanded(true);
  }, [sslPathActive]);

  useEffect(() => {
    if (certificatesPathActive) setCertificatesExpanded(true);
  }, [certificatesPathActive]);

  const moreLinks = (
    [
      { to: "/document-templates", label: t("nav.documentTemplates"), icon: "docTemplates" as const },
      { to: "/ssl-domains", label: t("nav.sslDomains"), icon: "ssl" as const },
      { to: "/certificates", label: t("nav.certificates"), icon: "certificates" as const },
      { to: "/audit-log", label: t("nav.auditLog"), icon: "auditLog" as const },
      { to: "/sox-reporting", label: t("nav.soxReporting"), icon: "sox" as const },
      { to: "/company-badge", label: t("nav.companyBadge"), icon: "companyBadge" as const },
      { to: "/invoices", label: t("nav.invoices"), icon: "invoices" as const },
      { to: "/templates", label: t("nav.templatesEmails"), icon: "templates" as const },
      { to: "/?view=overdue", label: t("nav.chasesOverdue"), icon: "chases" as const },
      { to: "/?view=waiting", label: t("nav.chasesWaiting"), icon: "chases" as const },
      { to: "/?view=paid", label: t("nav.chasesPaid"), icon: "chases" as const },
      { to: "/clients", label: t("nav.clients"), icon: "clients" as const },
      workspaceAdmin
        ? { to: "/connector", label: t("nav.connectorApi"), icon: "connector" as const }
        : null,
      workspaceAdmin
        ? { to: "/webhooks", label: t("nav.webhooks"), icon: "webhooks" as const }
        : null,
      workspaceAdmin
        ? { to: "/branding", label: t("nav.branding"), icon: "branding" as const }
        : null,
      { to: "/team", label: t("nav.team"), icon: "team" as const },
      { to: "/account", label: t("nav.subscription"), icon: "account" as const },
    ] as const
  ).filter(Boolean) as Array<{
    to: string;
    label: string;
    icon:
      | "chases"
      | "clients"
      | "connector"
      | "webhooks"
      | "branding"
      | "team"
      | "account"
      | "certificates"
      | "auditLog"
      | "sox"
      | "docTemplates"
      | "templates"
      | "ssl"
      | "invoices"
      | "companyBadge";
  }>;

  const pageTitles: Array<{ match: (path: string, search: string) => boolean; title: string }> = [
    {
      match: (p, s) => (p === "/" || p === "") && new URLSearchParams(s).get("view") === "overdue",
      title: t("nav.chasesOverdue"),
    },
    {
      match: (p, s) => (p === "/" || p === "") && new URLSearchParams(s).get("view") === "waiting",
      title: t("nav.chasesWaiting"),
    },
    {
      match: (p, s) => (p === "/" || p === "") && new URLSearchParams(s).get("view") === "paid",
      title: t("nav.chasesPaid"),
    },
    { match: (p) => p.startsWith("/new"), title: t("nav.newChase") },
    { match: (p) => p.startsWith("/templates"), title: t("nav.templatesEmails") },
    { match: (p) => p.startsWith("/document-templates"), title: t("nav.documentTemplates") },
    { match: (p) => p.startsWith("/company-badge"), title: t("nav.companyBadge") },
    { match: (p) => p === "/" || p === "", title: t("nav.dashboard") },
    { match: (p) => p.startsWith("/clients"), title: t("nav.clients") },
    { match: (p) => p.startsWith("/invoices"), title: t("nav.invoices") },
    { match: (p) => p.startsWith("/certificates"), title: t("nav.certificates") },
    { match: (p) => p.startsWith("/audit-log"), title: t("nav.auditLog") },
    { match: (p) => p.startsWith("/sox-reporting"), title: t("nav.soxReporting") },
    { match: (p) => p.startsWith("/connector"), title: t("nav.tools") },
    { match: (p) => p.startsWith("/team"), title: t("nav.team") },
    { match: (p) => p.startsWith("/branding"), title: t("nav.branding") },
    { match: (p) => p.startsWith("/webhooks"), title: t("nav.webhooks") },
    { match: (p) => p.startsWith("/ssl-domains"), title: t("nav.sslDomains") },
    { match: (p) => p.startsWith("/account"), title: t("nav.subscription") },
    { match: (p) => p.startsWith("/admin"), title: t("nav.admin") },
  ];

  const pageTitle =
    pageTitles.find((entry) => entry.match(location.pathname, location.search))?.title ?? "docstoc";

  useEffect(() => {
    document.title = pageTitle === "docstoc" ? "docstoc" : `${pageTitle} — docstoc`;
  }, [pageTitle]);

  function toolItemActive(to: string, hash?: string): boolean {
    if (to === "/webhooks") return location.pathname.startsWith("/webhooks");
    if (to === "/branding") return location.pathname.startsWith("/branding");
    if (!location.pathname.startsWith("/connector")) return false;
    const current = location.hash.replace(/^#/, "") || "api-key";
    return current === (hash || "api-key");
  }

  async function handleLogout() {
    setMoreSheetOpen(false);
    if (onLogout) {
      await onLogout();
      return;
    }
    await logout();
    await refresh();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link
          to="/"
          className="app-topbar-brand"
          aria-label={t("nav.home")}
          onClick={(e) => {
            e.preventDefault();
            setMoreSheetOpen(false);
            // Always return to the clean dashboard (drop ?view= / ?focus=).
            navigate({ pathname: "/", search: "" }, { replace: true });
            window.scrollTo(0, 0);
          }}
        >
          <img src={logoSrc} alt="" width="24" height="24" />
          <span>{wordmark}</span>
        </Link>
        <span className="app-topbar-title">{pageTitle}</span>
        <LanguageSwitcher className="lang-switcher-on-dark" />
      </header>

      <aside className="app-sidebar">
        <Link
          to="/"
          className="app-brand"
          aria-label={t("nav.home")}
          onClick={(e) => {
            e.preventDefault();
            setMoreSheetOpen(false);
            navigate({ pathname: "/", search: "" }, { replace: true });
            window.scrollTo(0, 0);
          }}
        >
          <img src={logoSrc} alt="" width="28" height="28" />
          <span>{wordmark}</span>
        </Link>
        <nav className="dash-side-nav" aria-label={t("nav.app")}>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive && !view ? "dash-nav-item is-active" : "dash-nav-item"
            }
          >
            <span className="dash-nav-item-label">
              <NavIcon name="dashboard" />
              <span>{t("nav.dashboard")}</span>
            </span>
          </NavLink>

          <div className="dash-side-nav-label">{t("nav.products")}</div>

          <div className="dash-nav-group">
            <button
              type="button"
              className={`dash-nav-item dash-nav-group-header${marketplacePathActive ? " is-active" : ""}`}
              aria-expanded={marketplaceExpanded}
              onClick={() => setMarketplaceExpanded((open) => !open)}
            >
              <span className="dash-nav-item-label">
                <NavIcon name="templates" />
                <span>{t("nav.marketplace")}</span>
              </span>
              <span className={`dash-nav-chevron${marketplaceExpanded ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>
            {marketplaceExpanded ? (
              <div className="dash-nav-subitems">
                {marketplaceNav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`dash-nav-subitem${location.pathname.startsWith(item.to) ? " is-active" : ""}`}
                    onClick={() => setMarketplaceExpanded(true)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="dash-nav-group">
            <button
              type="button"
              className={`dash-nav-item dash-nav-group-header${sslPathActive ? " is-active" : ""}`}
              aria-expanded={sslExpanded}
              onClick={() => setSslExpanded((open) => !open)}
            >
              <span className="dash-nav-item-label">
                <NavIcon name="ssl" />
                <span>{t("nav.sslDomains")}</span>
              </span>
              <span className={`dash-nav-chevron${sslExpanded ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>
            {sslExpanded ? (
              <div className="dash-nav-subitems">
                {sslNav.map((item) => {
                  const hashActive =
                    location.pathname.startsWith("/ssl-domains") &&
                    (item.hash
                      ? location.hash === item.hash
                      : !location.hash || location.hash === "#domains");
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`dash-nav-subitem${hashActive ? " is-active" : ""}`}
                      onClick={() => setSslExpanded(true)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="dash-nav-group">
            <button
              type="button"
              className={`dash-nav-item dash-nav-group-header${certificatesPathActive ? " is-active" : ""}`}
              aria-expanded={certificatesExpanded}
              onClick={() => setCertificatesExpanded((open) => !open)}
            >
              <span className="dash-nav-item-label">
                <NavIcon name="certificates" />
                <span>{t("nav.certificates")}</span>
              </span>
              <span className={`dash-nav-chevron${certificatesExpanded ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>
            {certificatesExpanded ? (
              <div className="dash-nav-subitems">
                {certificatesNav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`dash-nav-subitem${location.pathname.startsWith(item.to) ? " is-active" : ""}`}
                    onClick={() => setCertificatesExpanded(true)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <NavLink
            to="/sox-reporting"
            className={({ isActive }) => (isActive ? "dash-nav-item is-active" : "dash-nav-item")}
          >
            <span className="dash-nav-item-label">
              <NavIcon name="sox" />
              <span>{t("nav.soxReporting")}</span>
            </span>
          </NavLink>

          <NavLink
            to="/company-badge"
            className={({ isActive }) => (isActive ? "dash-nav-item is-active" : "dash-nav-item")}
          >
            <span className="dash-nav-item-label">
              <NavIcon name="companyBadge" />
              <span>{t("nav.companyBadge")}</span>
            </span>
          </NavLink>

          <div className="dash-nav-cluster" aria-label={t("nav.invoicesAndChases")}>
            <div className="dash-nav-group">
              <button
                type="button"
                className={`dash-nav-item dash-nav-group-header${invoicesPathActive ? " is-active" : ""}`}
                aria-expanded={invoicesExpanded}
                onClick={() => setInvoicesExpanded((open) => !open)}
              >
                <span className="dash-nav-item-label">
                  <NavIcon name="invoices" />
                  <span>{t("nav.invoices")}</span>
                </span>
                <span className={`dash-nav-chevron${invoicesExpanded ? " is-open" : ""}`} aria-hidden="true">
                  ⌄
                </span>
              </button>
              {invoicesExpanded ? (
                <div className="dash-nav-subitems">
                  {invoicesNav.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`dash-nav-subitem${location.pathname.startsWith(item.to) ? " is-active" : ""}`}
                      onClick={() => setInvoicesExpanded(true)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="dash-nav-group">
              <button
                type="button"
                className={`dash-nav-item dash-nav-group-header${chasesPathActive ? " is-active" : ""}`}
                aria-expanded={chasesExpanded}
                onClick={() => {
                  setChasesExpanded((open) => !open);
                  if (!onDashboard && !location.pathname.startsWith("/templates") && !location.pathname.startsWith("/clients")) {
                    navigate("/");
                  }
                }}
              >
                <span className="dash-nav-item-label">
                  <NavIcon name="chases" />
                  <span>{t("nav.chases")}</span>
                </span>
                <span className={`dash-nav-chevron${chasesExpanded ? " is-open" : ""}`} aria-hidden="true">
                  ⌄
                </span>
              </button>
              {chasesExpanded ? (
                <div className="dash-nav-subitems">
                  {chasesNav.map((item) => {
                    const to =
                      item.view != null
                        ? { pathname: item.pathname, search: item.search }
                        : item.pathname;
                    const active =
                      item.view != null
                        ? onDashboard && view === item.view
                        : location.pathname.startsWith(item.pathname);
                    return (
                      <Link
                        key={`${item.pathname}-${item.view ?? item.label}`}
                        to={to}
                        className={`dash-nav-subitem${active ? " is-active" : ""}`}
                        onClick={() => setChasesExpanded(true)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="dash-side-nav-label">{t("nav.more")}</div>

          <div className="dash-nav-group">
            <button
              type="button"
              className={`dash-nav-item dash-nav-group-header${toolsPathActive ? " is-active" : ""}`}
              aria-expanded={toolsExpanded}
              onClick={() => setToolsExpanded((open) => !open)}
            >
              <span className="dash-nav-item-label">
                <NavIcon name="tools" />
                <span>{t("nav.tools")}</span>
              </span>
              <span className={`dash-nav-chevron${toolsExpanded ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>
            {toolsExpanded ? (
              <div className="dash-nav-subitems">
                {toolsNav.map((item) => {
                  const href = item.hash ? `${item.to}#${item.hash}` : item.to;
                  const active = toolItemActive(item.to, item.hash);
                  return (
                    <Link
                      key={href}
                      to={href}
                      className={`dash-nav-subitem${active ? " is-active" : ""}`}
                      onClick={() => setToolsExpanded(true)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="dash-side-footer">
          {!loading && account ? (
            <UserChip
              email={account.email}
              plan={account.plan}
              isAdmin={!!account.isAdmin}
              onLogout={handleLogout}
            />
          ) : !loading ? (
            <Link to="/login" className="app-signin-chip">
              {t("nav.signin")}
            </Link>
          ) : (
            <div className="app-signin-chip is-muted">{t("common.loading")}</div>
          )}
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="app-bottom-nav" aria-label={t("nav.app")}>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `app-bottom-nav-item${isActive && !view ? " is-active" : ""}`}
          onClick={() => setMoreSheetOpen(false)}
        >
          <NavIcon name="dashboard" size={22} />
          <span>{t("nav.dashboard")}</span>
        </NavLink>
        <NavLink
          to="/document-templates"
          className={({ isActive }) => `app-bottom-nav-item${isActive ? " is-active" : ""}`}
          onClick={() => setMoreSheetOpen(false)}
        >
          <NavIcon name="templates" size={22} />
          <span>{t("nav.marketplace")}</span>
        </NavLink>
        <NavLink
          to="/invoices"
          className={({ isActive }) => `app-bottom-nav-item${isActive ? " is-active" : ""}`}
          onClick={() => setMoreSheetOpen(false)}
        >
          <NavIcon name="invoices" size={22} />
          <span>{t("nav.invoices")}</span>
        </NavLink>
        <NavLink
          to="/company-badge"
          className={({ isActive }) => `app-bottom-nav-item${isActive ? " is-active" : ""}`}
          onClick={() => setMoreSheetOpen(false)}
        >
          <NavIcon name="companyBadge" size={22} />
          <span>{t("nav.companyBadgeShort")}</span>
        </NavLink>
        <button
          type="button"
          className={`app-bottom-nav-item${moreSheetOpen ? " is-active" : ""}`}
          onClick={() => setMoreSheetOpen((open) => !open)}
        >
          <NavIcon name="more" size={22} />
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      {moreSheetOpen && (
        <div className="app-more-sheet" role="dialog" aria-label={t("nav.more")}>
          <button
            type="button"
            className="app-more-backdrop"
            aria-label={t("nav.close")}
            onClick={() => setMoreSheetOpen(false)}
          />
          <div className="app-more-panel">
            <div className="app-more-handle" aria-hidden="true" />
            {account ? <p className="app-more-email">{account.email}</p> : null}
            {moreLinks.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMoreSheetOpen(false)}>
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
            {account?.isAdmin ? (
              <Link to="/admin/analytics" onClick={() => setMoreSheetOpen(false)}>
                <NavIcon name="account" />
                <span>{t("nav.admin")}</span>
              </Link>
            ) : null}
            <a href="mailto:founder@docstoc.io" onClick={() => setMoreSheetOpen(false)}>
              <NavIcon name="support" />
              <span>{t("nav.support")}</span>
            </a>
            {account ? (
              <button type="button" className="app-more-danger" onClick={() => void handleLogout()}>
                {t("nav.logout")}
              </button>
            ) : (
              <Link to="/login" onClick={() => setMoreSheetOpen(false)}>
                {t("nav.signin")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
