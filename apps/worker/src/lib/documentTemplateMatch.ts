import type { Env } from "../types";
import { configuredAppOrigin } from "./appUrl";

export interface TemplateRecord {
  slug: string;
  name: string;
  seoTitle: string;
  description: string;
  category: string;
  bodyMarkdown: string;
}

// The 1000+ template library is a build-time static artifact for the Pages site (apps/web/public/
// document-templates/templates.json), not a worker asset — fetching it lazily and caching it in
// module scope means most requests hit the cache (a Workers isolate is reused across many requests)
// without bundling ~1.8MB of template content into every route's cold start.
let cache: { templates: TemplateRecord[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — the library changes weekly at most.

async function loadTemplates(env: Env): Promise<TemplateRecord[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.templates;

  const origin = configuredAppOrigin(env) || "https://docstoc.io";
  const res = await fetch(`${origin}/document-templates/templates.json`, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) {
    if (cache) return cache.templates; // serve stale on a transient fetch failure
    throw new Error(`Failed to load template library (${res.status})`);
  }
  const templates = (await res.json()) as TemplateRecord[];
  cache = { templates, fetchedAt: Date.now() };
  return templates;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "need", "want", "have",
  "template", "document", "agreement", "letter", "form", "please", "someone",
]);

/** Best-effort keyword overlap match — good enough to ground the AI's output in an existing,
 *  vetted template rather than writing entirely from scratch. Not semantic search; that would
 *  need embeddings + a vector index, overkill for a first version of this tool. */
export async function findClosestTemplate(
  env: Env,
  description: string
): Promise<TemplateRecord | null> {
  const templates = await loadTemplates(env);
  const queryWords = new Set(tokenize(description).filter((w) => !STOPWORDS.has(w)));
  if (queryWords.size === 0) return null;

  let best: TemplateRecord | null = null;
  let bestScore = 0;
  for (const t of templates) {
    const haystack = tokenize(`${t.name} ${t.description} ${t.category} ${t.seoTitle}`);
    let score = 0;
    for (const word of haystack) {
      if (queryWords.has(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore > 0 ? best : null;
}
