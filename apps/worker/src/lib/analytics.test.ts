import { describe, expect, it } from "vitest";
import { campaignTagFromReferralProps, getFunnelStats, getTrafficSources, trackEvent } from "./analytics";
import type { Env } from "../types";

type Query = { sql: string; args: unknown[] };

function mockEnv(): { env: Env; queries: Query[] } {
  const queries: Query[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => {
          queries.push({ sql, args });
          return {
            all: async () => ({ results: [] }),
            first: async () => null,
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
  return { env: { CHASA_DB: db } as unknown as Env, queries };
}

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** Column order of the analytics_events insert. */
const IS_BOT_ARG = 6;

describe("trackEvent", () => {
  it("flags a classified crawler", async () => {
    const { env, queries } = mockEnv();
    await trackEvent(env, { name: "landingpage_loaded", userAgent: "Mozilla/5.0 (compatible; GPTBot/1.2)" });
    expect(queries[0].args[IS_BOT_ARG]).toBe(1);
  });

  it("records a browser user agent as human", async () => {
    const { env, queries } = mockEnv();
    await trackEvent(env, { name: "landingpage_loaded", userAgent: CHROME_UA });
    expect(queries[0].args[IS_BOT_ARG]).toBe(0);
  });

  // Cron sweeps and Resend sends have no request behind them; they must not be filed as crawlers.
  it("records an event with no user agent as human", async () => {
    const { env, queries } = mockEnv();
    await trackEvent(env, { name: "email_sent" });
    expect(queries[0].args[IS_BOT_ARG]).toBe(0);
  });

  it("ignores events outside the allowlist", async () => {
    const { env, queries } = mockEnv();
    await trackEvent(env, { name: "not_a_real_event" });
    expect(queries).toHaveLength(0);
  });
});

describe("getFunnelStats", () => {
  it("filters every event read when humansOnly is set", async () => {
    const { env, queries } = mockEnv();
    await getFunnelStats(env, 30, true);

    const eventQueries = queries.filter((q) => q.sql.includes("analytics_events"));
    expect(eventQueries.length).toBeGreaterThan(0);
    // Both the step rows and the KPI totals, or the funnel would compare two audiences.
    for (const q of eventQueries) {
      expect(q.sql).toContain("COALESCE(is_bot, 0) = 0");
    }
  });

  it("counts crawlers too when the filter is off", async () => {
    const { env, queries } = mockEnv();
    await getFunnelStats(env, 30);

    expect(queries.some((q) => q.sql.includes("analytics_events"))).toBe(true);
    expect(queries.some((q) => q.sql.includes("is_bot"))).toBe(false);
  });

  it("reports which audience the counts describe", async () => {
    const { env } = mockEnv();
    expect((await getFunnelStats(env, 7, true)).humansOnly).toBe(true);
    expect((await getFunnelStats(env, 7)).humansOnly).toBe(false);
  });
});

/** A `referral_source_detected` row exactly as recorded for a UTM-tagged link opened directly
 *  (email, ad, DM) with no document.referrer at all -- the case that exposed the double-count. */
function referralRow(properties: Record<string, unknown>, createdAt = "2026-09-04T10:00:00.000Z") {
  return { name: "referral_source_detected", properties: JSON.stringify(properties), created_at: createdAt };
}

function mockEnvWithRows(rows: ReturnType<typeof referralRow>[]): Env {
  const db = {
    prepare() {
      return {
        bind: () => ({
          all: async () => ({ results: rows }),
          first: async () => null,
          run: async () => ({ meta: { changes: 1 } }),
        }),
      };
    },
  };
  return { CHASA_DB: db } as unknown as Env;
}

describe("getTrafficSources", () => {
  it("does not double-count a seo-tagged direct link as both an external site and a campaign click", async () => {
    // Real bug: opening a seo-* tagged link with no referrer (e.g. from an email or ad) set
    // props.source to the utm_source value itself, which then got used as a fake "external site
    // hostname" fallback on top of correctly being recorded as a campaign click.
    const env = mockEnvWithRows([
      referralRow({ source: "seo-job-description", utm_source: "seo-job-description" }),
    ]);
    const { rows } = await getTrafficSources(env, 30);

    expect(rows.filter((r) => r.event === "referral_source_detected")).toHaveLength(0);
    expect(rows.filter((r) => r.event === "campaign_click")).toHaveLength(1);
    expect(rows.find((r) => r.event === "campaign_click")?.attribution).toBe("seo-job-description");
  });

  it("still records a genuine external referrer as a site, even without a campaign tag", async () => {
    const env = mockEnvWithRows([referralRow({ source: "referral", referrer: "https://www.producthunt.com/posts/x" })]);
    const { rows } = await getTrafficSources(env, 30);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "referral_source_detected", source: "www.producthunt.com" });
  });

  it("still records both when a tagged link is also opened via a real referrer", async () => {
    // e.g. a seo-* link shared on LinkedIn and clicked from there -- the referrer is real (LinkedIn
    // is genuinely a site that sent this visitor), so it must still show up as an external site
    // *in addition to* the campaign click, unlike the no-referrer case above.
    const env = mockEnvWithRows([
      referralRow({
        source: "seo-job-description",
        utm_source: "seo-job-description",
        referrer: "https://www.linkedin.com/feed/",
      }),
    ]);
    const { rows } = await getTrafficSources(env, 30);

    expect(rows.find((r) => r.event === "referral_source_detected")?.source).toBe("www.linkedin.com");
    expect(rows.find((r) => r.event === "campaign_click")?.attribution).toBe("seo-job-description");
  });
});

describe("campaignTagFromReferralProps", () => {
  it("reads seo CTA utm_source token", () => {
    expect(
      campaignTagFromReferralProps({ utm_source: "seo-daycare-registration-form" })
    ).toBe("seo-daycare-registration-form");
  });

  it("reads utm source/campaign pairs", () => {
    expect(
      campaignTagFromReferralProps({ utm_source: "outreach", utm_campaign: "dm" })
    ).toBe("outreach/dm");
  });

  it("reads seo-* ref param", () => {
    expect(campaignTagFromReferralProps({ ref: "seo-digicert-alternative" })).toBe(
      "seo-digicert-alternative"
    );
  });

  it("ignores generic ref like producthunt", () => {
    expect(campaignTagFromReferralProps({ ref: "producthunt" })).toBe("");
  });

  it("ignores third-party utm_source stamps (ChatGPT, OpenAI)", () => {
    expect(campaignTagFromReferralProps({ utm_source: "chatgpt.com" })).toBe("");
    expect(campaignTagFromReferralProps({ utm_source: "openai" })).toBe("");
  });
});

describe("getTrafficSources chatgpt stamps", () => {
  it("counts ChatGPT utm landings as an external site, not a campaign", async () => {
    const env = mockEnvWithRows([
      referralRow({ source: "chatgpt.com", utm_source: "chatgpt.com" }),
    ]);
    const { rows } = await getTrafficSources(env, 30);

    expect(rows.filter((r) => r.event === "campaign_click")).toHaveLength(0);
    expect(rows.find((r) => r.event === "referral_source_detected")?.source).toBe("chatgpt.com");
  });
});
