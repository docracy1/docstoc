import { Hono } from "hono";
import type { AuthEnv } from "../lib/auth";
import { aiDocumentGeneratorSchema, parseJsonBody } from "../lib/schemas";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { clientIp, turnstileSiteKey, verifyTurnstile } from "../lib/turnstile";
import { findClosestTemplate } from "../lib/documentTemplateMatch";
import { generateDocumentFromDescription, GeminiError } from "../lib/geminiDocGen";
import { trackEvent } from "../lib/analytics";
import { checkDocgenQuota, incrementDraftUsage, docgenScopeKey, FREE_MONTHLY_DOCGEN_GENERATIONS } from "../lib/usageQuota";

const aiDocumentGenerator = new Hono<AuthEnv>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

aiDocumentGenerator.get("/config", (c) => {
  return c.json({
    turnstileSiteKey: turnstileSiteKey(c.env),
    turnstileRequired: Boolean(c.env.TURNSTILE_SECRET_KEY?.trim()),
    freeMonthlyLimit: FREE_MONTHLY_DOCGEN_GENERATIONS,
  });
});

aiDocumentGenerator.post("/generate", async (c) => {
  const parsed = await parseJsonBody(c.req, aiDocumentGeneratorSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const ip = clientIp(c) || clientIpFromHeaders(c.req.raw.headers);

  // Public, no-signup, and each call costs a real external API request — tighter than the leads
  // endpoints (which only send email) and much tighter than the free Workers AI draft flow.
  const rl = await checkRateLimit(c.env, `ai_docgen:${ip}`, 5, 3600);
  if (!rl.ok) {
    return c.json({ error: "Too many document generations from this connection. Try again later." }, 429);
  }

  const check = await verifyTurnstile(c.env, parsed.data.turnstileToken, ip);
  if (!check.ok) return c.json({ error: check.error }, 400);

  // Separate from the rate limit above (abuse prevention) — this is the actual free-tier cap
  // meant to convert: checked before the costly Gemini call, not after.
  const quota = await checkDocgenQuota(c.env, ip, parsed.data.visitorId);
  if (!quota.allowed) {
    return c.json({ error: quota.error, remaining: 0, limitReached: true }, 402);
  }

  try {
    const reference = await findClosestTemplate(c.env, parsed.data.description).catch((err) => {
      console.error("[aiDocumentGenerator] template match failed", err);
      return null;
    });

    const doc = await withTimeout(
      generateDocumentFromDescription(c.env, parsed.data.description, reference),
      45_000,
      "gemini document generation"
    );

    // Only counts against the free-tier cap on an actual successful generation — a Gemini failure
    // or timeout shouldn't burn someone's limited free tries.
    const scope = docgenScopeKey(ip, parsed.data.visitorId);
    const used = await incrementDraftUsage(c.env, scope);
    const remaining = Math.max(0, FREE_MONTHLY_DOCGEN_GENERATIONS - used);

    c.executionCtx.waitUntil(
      trackEvent(c.env, {
        name: "ai_document_generated",
        properties: { matchedTemplateSlug: doc.matchedTemplateSlug || undefined, remaining },
        path: "/api/ai-document-generator/generate",
      }).catch(() => {})
    );

    return c.json({ ok: true, ...doc, remaining });
  } catch (err) {
    if (err instanceof GeminiError) {
      return c.json({ error: err.message }, err.status as 400 | 429 | 502 | 503);
    }
    console.error("[aiDocumentGenerator] generate failed", err);
    return c.json({ error: "Could not generate the document. Try again in a moment." }, 502);
  }
});

export default aiDocumentGenerator;
