import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import LanguageSwitcher from "./components/LanguageSwitcher";
import ProtectedRoute from "./components/ProtectedRoute";
import AppConsentBanner from "./components/AppConsentBanner";
import { AccountProvider, useAccountContext } from "./lib/AccountContext";
import { setUnauthorizedHandler } from "./lib/api";
import { track } from "./lib/analytics";
import { detectReferralOnce } from "./lib/referralTracking";
import { useT } from "./lib/i18n";

const Tool = lazy(() => import("./pages/Tool"));
const NewChase = lazy(() => import("./pages/NewChase"));
const Templates = lazy(() => import("./pages/Templates"));
const DocumentTemplates = lazy(() => import("./pages/DocumentTemplates"));
const Login = lazy(() => import("./pages/Login"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Branding = lazy(() => import("./pages/Branding"));
const Webhooks = lazy(() => import("./pages/Webhooks"));
const Connector = lazy(() => import("./pages/Connector"));
const Clients = lazy(() => import("./pages/Clients"));
const Team = lazy(() => import("./pages/Team"));
const Certificates = lazy(() => import("./pages/Certificates"));
const Invoices = lazy(() => import("./pages/Invoices"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const SoxReporting = lazy(() => import("./pages/SoxReporting"));
const SslCertificates = lazy(() => import("./pages/SslCertificates"));
const CompanyBadge = lazy(() => import("./pages/CompanyBadge"));
const Roadmap = lazy(() => import("./pages/Roadmap"));

function AppRoutes() {
  const t = useT();
  const { account, loading, refresh, signOut } = useAccountContext();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isLogin = location.pathname === "/login";

  useEffect(() => {
    detectReferralOnce();
  }, [location.search]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // A 401 here is the normal "not signed in yet" state while already on the login page — not an
      // expired session to bounce out of. Redirecting to the page we're already on still triggers a
      // full reload, which re-fires the same 401 forever. Admin uses the normal app session
      // (ADMIN_EMAIL via /app/login) — unauthenticated visitors go to login first.
      if (
        window.location.pathname !== "/app/login" &&
        window.location.pathname !== "/app/roadmap" &&
        !window.location.pathname.startsWith("/app/admin")
      ) {
        window.location.href = "/app/login";
      }
    });
  }, []);

  useEffect(() => {
    if (!isAdmin && account) track("dashboard_loaded");
  }, [isAdmin, account]);

  if (isAdmin) {
    return (
      <Suspense fallback={<p className="page-sub">Loading…</p>}>
        <Routes>
          <Route path="/admin/analytics" element={<Admin />} />
          <Route path="/admin" element={<Navigate to="/admin/analytics" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (isLogin) {
    return (
      <div className="app-auth">
        <header className="app-topbar app-topbar-auth">
          {account ? (
            <Link to="/" className="app-topbar-brand" aria-label={t("nav.home")}>
              <img src="/brand/docstoc-icon.png" alt="" width="24" height="24" />
              <span>docstoc</span>
            </Link>
          ) : (
            <a href="/" className="app-topbar-brand" aria-label="docstoc home">
              <img src="/brand/docstoc-icon.png" alt="" width="24" height="24" />
              <span>docstoc</span>
            </a>
          )}
          <LanguageSwitcher className="lang-switcher-on-dark" />
        </header>
        <Suspense fallback={<p className="page-sub">Loading…</p>}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <AppShell account={account} loading={loading} refresh={refresh} onLogout={() => void signOut()}>
        <Suspense fallback={<p className="page-sub">Loading…</p>}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Tool account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/new"
              element={
                <ProtectedRoute>
                  <NewChase account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <ProtectedRoute>
                  <Templates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/document-templates"
              element={
                <ProtectedRoute>
                  <DocumentTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <Account account={account} refresh={refresh} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute>
                  <Team account={account} refresh={refresh} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/branding"
              element={
                <ProtectedRoute>
                  <Branding account={account} refresh={refresh} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute>
                  <Clients account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificates"
              element={
                <ProtectedRoute>
                  <Certificates account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <ProtectedRoute>
                  <Invoices account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ssl-domains"
              element={
                <ProtectedRoute>
                  <SslCertificates account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/company-badge"
              element={
                <ProtectedRoute>
                  <CompanyBadge account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute>
                  <AuditLog account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sox-reporting"
              element={
                <ProtectedRoute>
                  <SoxReporting account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/webhooks"
              element={
                <ProtectedRoute>
                  <Webhooks account={account} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/connector"
              element={
                <ProtectedRoute>
                  <Connector account={account} />
                </ProtectedRoute>
              }
            />
            {/* Public — no account needed, votes deduped by an anonymous cookie (Docracy parity). */}
            <Route path="/roadmap" element={<Roadmap />} />
          </Routes>
        </Suspense>
      </AppShell>
    </>
  );
}

export default function App() {
  return (
    <AccountProvider>
      <AppRoutes />
      <AppConsentBanner />
    </AccountProvider>
  );
}
