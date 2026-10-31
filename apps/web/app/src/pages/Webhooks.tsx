import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  type Account,
  type WebhookItem,
} from "../lib/api";
import { isWorkspaceAdmin } from "../lib/plan";
import { useT } from "../lib/i18n";

export default function WebhooksPage({ account }: { account: Account | null }) {
  const t = useT();
  const [hooks, setHooks] = useState<WebhookItem[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isPaid = !!account && account.plan !== "free";
  const canManage = isPaid && isWorkspaceAdmin(account);

  async function refresh() {
    if (!account || !isPaid || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listWebhooks();
      setHooks(res.webhooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("webhooks.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [account?.email, isPaid]);

  if (!account) {
    return (
      <div className="panel">
        <h1>{t("webhooks.title")}</h1>
        <p className="page-sub">{t("webhooks.signInSub")}</p>
        <a className="btn-primary" href="/app/login">
          {t("nav.signin")}
        </a>
      </div>
    );
  }

  if (isPaid && !canManage) {
    return (
      <div className="webhooks-page">
        <h1 className="webhooks-title">{t("webhooks.title")}</h1>
        <div className="panel">
          <p className="page-sub">{t("workspace.adminOnly")}</p>
          <Link className="btn-secondary" to="/">
            {t("nav.dashboard")}
          </Link>
        </div>
      </div>
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!isPaid) return;
    setBusy(true);
    setError(null);
    try {
      await createWebhook(url.trim());
      setUrl("");
      setAdding(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("webhooks.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isPaid) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWebhook(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("webhooks.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="webhooks-page">
      <p className="crumb">
        <Link to="/account">{t("team.crumbAccount")}</Link> / {t("webhooks.title")}
      </p>
      <section className="branding-card">
        <h1 className="webhooks-title">{t("webhooks.title")}</h1>
        <p className="branding-help">{t("webhooks.pageSub")}</p>

        {!isPaid && (
          <div className="upgrade-nudge">
            {t("webhooks.upgradeNudge")} <Link to="/account">{t("branding.upgradeLink")}</Link>{" "}
            {t("webhooks.upgradeHint")}
          </div>
        )}

        {loading ? (
          <p className="page-sub">{t("common.loading")}</p>
        ) : hooks.length === 0 ? (
          <p className="webhooks-empty">{t("webhooks.empty")}</p>
        ) : (
          <ul className="webhooks-list">
            {hooks.map((h) => (
              <li key={h.id}>
                <code>{h.url}</code>
                {h.signingSecret && (
                  <details>
                    <summary>{t("webhooks.signingSecret")}</summary>
                    <code>{h.signingSecret}</code>
                  </details>
                )}
                {isPaid && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => handleDelete(h.id)}
                  >
                    {t("common.remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isPaid && !adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            {t("webhooks.add")}
          </button>
        )}

        {isPaid && adding && (
          <form className="webhooks-add" onSubmit={handleAdd}>
            <input
              type="url"
              required
              placeholder={t("webhooks.urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setUrl("");
              }}
            >
              {t("common.cancel")}
            </button>
          </form>
        )}

        {error && <div className="error-msg">{error}</div>}

        <div className="webhooks-events">
          <h2>{t("webhooks.events")}</h2>
          <ul>
            <li>
              <code>chase.drafted</code> — {t("webhooks.eventDrafted")}
            </li>
            <li>
              <code>chase.sent</code> — {t("webhooks.eventSent")}
            </li>
            <li>
              <code>chase.thank_you</code> — {t("webhooks.eventThankYou")}
            </li>
            <li>
              <code>chase.reply_drafted</code> — {t("webhooks.eventReply")}
            </li>
            <li>
              <code>chase.sequence_planned</code> — {t("webhooks.eventSequence")}
            </li>
            <li>
              <code>chase.downloaded</code> — {t("webhooks.eventDownloaded")}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
