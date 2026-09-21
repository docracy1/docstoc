import { Hono } from "hono";
import type { AuthEnv } from "../lib/auth";
import { aiDocumentGeneratorSchema, parseJsonBody } from "../lib/schemas";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { clientIp, turnstileSiteKey, verifyTurnstile } from "../lib/turnstile";
import { findClosestTemplate } from "../lib/documentTemplateMatch";
import { generateDocumentFromDescription, GeminiError } from "../lib/geminiDocGen";
import { trackEvent } from "../lib/analytics";

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

    c.executionCtx.waitUntil(
      trackEvent(c.env, {
        name: "ai_document_generated",
        properties: { matchedTemplateSlug: doc.matchedTemplateSlug || undefined },
        path: "/api/ai-document-generator/generate",
      }).catch(() => {})
    );

    return c.json({ ok: true, ...doc });
  } catch (err) {
    if (err instanceof GeminiError) {
      return c.json({ error: err.message }, err.status as 400 | 429 | 502 | 503);
    }
    console.error("[aiDocumentGenerator] generate failed", err);
    return c.json({ error: "Could not generate the document. Try again in a moment." }, 502);
  }
});

export default aiDocumentGenerator;
