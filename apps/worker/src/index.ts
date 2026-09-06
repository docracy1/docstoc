import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AuthEnv } from "./lib/auth";
import type { Env } from "./types";
import auth from "./routes/auth";
import account from "./routes/account";
import billing from "./routes/billing";
import emails from "./routes/emails";
import analytics from "./routes/analytics";
import roadmap from "./routes/roadmap";
import admin from "./routes/admin";
import blog from "./routes/blog";
import mcp from "./routes/mcp";
import webhooks from "./routes/webhooks";
import connector from "./routes/connector";
import v1 from "./routes/v1";
import clients from "./routes/clients";
import aging from "./routes/aging";
import chase from "./routes/chase";
import reminders from "./routes/reminders";
import tracking from "./routes/tracking";
import team from "./routes/team";
import cspReport from "./routes/cspReport";
import leads from "./routes/leads";
import demo from "./routes/demo";
import marketplace from "./routes/marketplace";
import verify from "./routes/verify";
import ssl from "./routes/ssl";
import auditLog from "./routes/auditLog";
import sox from "./routes/sox";
import trust from "./routes/trust";
import invoices from "./routes/invoices";
import { configuredAppOrigin, isAllowedAppOrigin } from "./lib/appUrl";
import { purgeExpiredSessions } from "./lib/sessionCleanup";
import { sendDailyChaseDigests } from "./lib/chaseDigest";
import { sendOnboardingNudges } from "./lib/onboardingNudge";
import { runSpaSmokeAndAlert } from "./lib/spaSmoke";
import { refreshClaritySnapshot } from "./lib/clarityApi";
import { isWeeklyBlogMondayUtc, runWeeklyBlogPublish } from "./lib/blogWeekly";
import { sendCertExpiryReminders } from "./lib/customerCertificates";
import { sweepPendingTimestamps } from "./lib/openTimestamps";
import { runDailyAuditAnchors, sweepPendingAuditAnchors } from "./lib/auditLog";
import { sweepPendingAuditorPacks, sweepSoxRetention } from "./lib/sox";
import { backfillTrustProfiles, sweepPendingTrustProfiles } from "./lib/trustProfile";
import { legacyApiRedirectUrl } from "./lib/legacyHostRedirect";

const app = new Hono<AuthEnv>();

app.use("*", async (c, next) => {
  const target = legacyApiRedirectUrl(c.req.url);
  if (target) return c.redirect(target, 301);
  return next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const primary = configuredAppOrigin(c.env);
      if (!origin) return primary;
      return isAllowedAppOrigin(origin, c.env) ? origin : primary;
    },
    credentials: true,
  })
);

app.route("/api/auth", auth);
app.route("/api/account", account);
app.route("/api/clients", clients);
app.route("/api/aging", aging);
app.route("/api/chase", chase);
app.route("/api/reminders", reminders);
app.route("/api/t", tracking);
app.route("/api/tracking", tracking);
app.route("/api/team", team);
app.route("/api/billing", billing);
app.route("/api/analytics", analytics);
app.route("/api/roadmap", roadmap);
app.route("/api/csp-report", cspReport);
app.route("/api/admin", admin);
app.route("/api/blog", blog);
app.route("/api/leads", leads);
app.route("/api/demo", demo);
app.route("/api/marketplace", marketplace);
app.route("/api/verify", verify);
app.route("/api/ssl", ssl);
app.route("/api/audit-log", auditLog);
app.route("/api/sox", sox);
app.route("/api/trust", trust);
app.route("/api/invoices", invoices);
app.route("/api/webhooks", webhooks);
app.route("/api/connector", connector);
app.route("/api/v1", v1);
app.route("/api", emails);

// Public MCP for Claude / ChatGPT / Grok / Perplexity — no auth, draft-only tools
app.route("/mcp", mcp);

app.get("/", (c) => c.text("chasa-worker ok"));

const HOURLY_CRON = "0 * * * *";

export default {
  fetch: app.fetch.bind(app),
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    // Always: SPA Sign in / Start free smoke (fast outage signal).
    ctx.waitUntil(runSpaSmokeAndAlert(env, app).catch((err) => console.error("SPA smoke sweep failed:", err)));
    // Hourly: upgrade / resubmit pending Bitcoin stamps (calendars confirm on their own schedule).
    ctx.waitUntil(sweepPendingTrustProfiles(env).catch((err) => console.error("Trust profile OTS sweep failed:", err)));
    ctx.waitUntil(sweepPendingTimestamps(env).catch((err) => console.error("OpenTimestamps sweep failed:", err)));
    ctx.waitUntil(sweepPendingAuditAnchors(env).catch((err) => console.error("Audit anchor OTS sweep failed:", err)));
    ctx.waitUntil(sweepPendingAuditorPacks(env).catch((err) => console.error("Auditor pack OTS sweep failed:", err)));
    ctx.waitUntil(sweepSoxRetention(env).catch((err) => console.error("SOX retention sweep failed:", err)));

    // Once daily at 08:00 UTC — same hourly trigger, gated by clock (no second cron; account limit).
    const hourUtc = new Date().getUTCHours();
    if (hourUtc === 8 || event.cron !== HOURLY_CRON) {
      ctx.waitUntil(
        (async () => {
          await purgeExpiredSessions(env);
          await sendDailyChaseDigests(env);
          await sendOnboardingNudges(env).catch((err) =>
            console.error("Onboarding nudge sweep failed:", err)
          );
          await sendCertExpiryReminders(env).catch((err) => console.error("Cert expiry reminders failed:", err));
          await runDailyAuditAnchors(env).catch((err) => console.error("Daily audit anchor run failed:", err));
          await backfillTrustProfiles(env).catch((err) => console.error("Trust profile backfill failed:", err));
          if (isWeeklyBlogMondayUtc()) {
            await runWeeklyBlogPublish(env).catch((err) => console.error("Weekly blog publish failed:", err));
          }
          if (env.CLARITY_API_TOKEN) {
            await refreshClaritySnapshot(env, { force: true }).catch((err) =>
              console.error("Clarity snapshot refresh failed:", err)
            );
          }
        })()
      );
    }
  },
};
