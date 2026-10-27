import type { Env } from "../types";
import { createPost, listPosts, updatePost, type BlogPost } from "./blog";
import { sanitizeJsonStringNewlines } from "./aiJson";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
/** Kept for local `__scheduled?cron=` testing; production uses the daily cron + Monday check. */
export const BLOG_WEEKLY_CRON = "0 9 * * 1";

export function isWeeklyBlogMondayUtc(now = new Date()): boolean {
  return now.getUTCDay() === 1;
}

interface TopicRow {
  id: string;
  slug: string;
  title: string;
  angle: string;
  cluster: string;
  status: string;
}

interface DraftedPost {
  title: string;
  description: string;
  body: string;
  slug: string;
}

const DOCSTOC_BLURB = `
docstoc (docstoc.io) is a free automation layer for small businesses and freelancers, with four
parts: (1) hundreds of free business & legal document templates, no signup required; (2) a
document generator that creates real invoices with line items, tax, and a shareable/printable
link; (3) tamper-evident document certificates — hash any file in your browser, get a shareable
verification link anchored to the Bitcoin blockchain via OpenTimestamps, free; (4) free SSL/TLS
automation for your own domain, plus AI-drafted invoice follow-up emails (warm at 1-7 days
overdue, firmer at 30+) that users copy and send from their own inbox — docstoc never sends on
their behalf. Pro plan is a flat $14.99/mo per workspace (Business $39.99/mo); the free tier works with no
signup (18 templates + 5 AI chase drafts/month).
`.trim();

const META_SYSTEM_PROMPT = `
You write SEO blog post metadata for docstoc (docstoc.io), an AI invoice follow-up tool.
Respond with ONLY a JSON object — no markdown fences, no prose outside JSON:
{"title":"...","description":"...","slug":"..."}

Rules:
- title: clear how-to or question style, under 70 characters, include the main keyword naturally
- description: meta description, 140-160 characters, compelling, includes keyword
- slug: lowercase kebab-case, 3-80 chars, match the title topic (letters, numbers, hyphens only)
`.trim();

/** Generated as its own plain-text call (not nested in JSON) — wrapping a 900-1400 word article
 *  inside a single JSON string field is fragile for an 8B model: it reliably produces good prose
 *  but frequently fails to close out the JSON envelope afterward (observed truncated/invalid JSON
 *  well under the token budget, i.e. the model just loses track of the wrapper, not a length
 *  limit). Plain text has no such failure mode — the response IS the body, nothing to parse. */
const BODY_SYSTEM_PROMPT = `
You write SEO blog post bodies for docstoc (docstoc.io), an AI invoice follow-up tool for freelancers
and small businesses. ${DOCSTOC_BLURB}

Respond with ONLY the article body as plain text — no JSON, no markdown fences, no title line.
Use these markers only:
- Lines starting with "## " for H2 section titles
- Lines starting with "### " for FAQ questions
- Blank line between paragraphs
- Bullet lines starting with "- " for lists

Structure like a strong competitor SEO guide: intro, why-it-matters section, practical script or
step-by-step, common mistakes list, FAQ (5-7 ### questions), short closing mention of docstoc.
Mention docstoc naturally; do not invent features. Do NOT give legal, tax, or collections-
enforceability advice — add a one-line disclaimer where relevant. Do NOT use **, *, # (except
## / ###), or HTML. Aim for roughly 900-1400 words of useful content.
`.trim();

function requireDb(env: Env) {
  if (!env.CHASA_DB) throw new Error("D1 is not configured on this deployment");
  return env.CHASA_DB;
}

function slugifyLoose(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type Meta = { title: string; description: string; slug: string };

function parseMeta(raw: string, fallback: TopicRow): Meta | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(sanitizeJsonStringNewlines(match[0])) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 120) : "";
    const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 200) : "";
    const slugRaw = typeof parsed.slug === "string" && parsed.slug.trim() ? parsed.slug.trim() : fallback.slug;
    const slug = slugifyLoose(slugRaw) || fallback.slug;
    if (!title) return null;
    return { title, description: description || title, slug };
  } catch {
    return null;
  }
}

async function runAi(env: Env, messages: { role: string; content: string }[], maxTokens: number): Promise<string | null> {
  try {
    const result = await env.AI.run((env.WORKERS_AI_MODEL || DEFAULT_MODEL) as keyof AiModels, {
      temperature: 0.45,
      max_tokens: maxTokens,
      messages,
    });
    return (result as { response?: string }).response?.trim() || null;
  } catch (err) {
    console.error("Weekly blog AI call failed:", err);
    return null;
  }
}

async function draftMeta(env: Env, topic: TopicRow): Promise<Meta | null> {
  const messages = [
    { role: "system", content: META_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Suggested title: ${topic.title}\nPreferred slug: ${topic.slug}\nBrief:\n${topic.angle}`,
    },
  ];
  // Small, short JSON response — cheap to retry a couple of times if the model garbles it.
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await runAi(env, messages, 300);
    if (raw) {
      const meta = parseMeta(raw, topic);
      if (meta) return meta;
    }
  }
  return null;
}

async function draftBody(env: Env, topic: TopicRow): Promise<string | null> {
  const messages = [
    { role: "system", content: BODY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Topic: ${topic.title}\nCluster: ${topic.cluster}\nBrief:\n${topic.angle}`,
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runAi(env, messages, 1800);
    if (raw && raw.trim().length >= 400) return raw.trim().slice(0, 20000);
  }
  return null;
}

async function draftFromTopic(env: Env, topic: TopicRow): Promise<DraftedPost | null> {
  const meta = await draftMeta(env, topic);
  if (!meta) {
    console.error(`Weekly blog: metadata draft failed for topic ${topic.slug}`);
    return null;
  }
  const body = await draftBody(env, topic);
  if (!body) {
    console.error(`Weekly blog: body draft failed for topic ${topic.slug}`);
    return null;
  }
  return { title: meta.title, description: meta.description, slug: meta.slug, body };
}

async function nextQueuedTopic(env: Env): Promise<TopicRow | null> {
  const db = requireDb(env);
  return (
    (await db
      .prepare(
        `SELECT id, slug, title, angle, cluster, status FROM blog_topic_queue
         WHERE status = 'queued' ORDER BY sort_order ASC, created_at ASC LIMIT 1`
      )
      .first<TopicRow>()) ?? null
  );
}

/** Prefer publishing an existing admin-authored draft; otherwise generate from the topic queue. */
async function publishOldestDraft(env: Env): Promise<string | null> {
  const drafts = (await listPosts(env, { publishedOnly: false })).filter((p: BlogPost) => !p.published);
  if (drafts.length === 0) return null;
  // listPosts sorts created_at DESC — the oldest draft is the last one in that order.
  const oldest = drafts[drafts.length - 1];
  const result = await updatePost(env, oldest.id, { published: true });
  if ("error" in result) return null;
  console.log(`Weekly blog: published existing draft ${oldest.slug}`);
  return oldest.slug;
}

async function markTopicPublished(env: Env, topicId: string, postId: string): Promise<void> {
  const db = requireDb(env);
  await db
    .prepare(
      `UPDATE blog_topic_queue SET status = 'published', published_post_id = ?, published_at = ? WHERE id = ?`
    )
    .bind(postId, new Date().toISOString(), topicId)
    .run();
}

/**
 * Monday job: publish one blog post.
 * 1) If an admin draft exists, publish the oldest.
 * 2) Else take the next queued SEO topic, draft with Workers AI, publish.
 * createPost() already appends a random suffix on slug collision, so no separate uniqueness check
 * is needed here the way Docracy's port required one.
 */
export async function runWeeklyBlogPublish(env: Env): Promise<void> {
  if (!env.CHASA_DB) {
    console.log("Weekly blog: skipped (no D1)");
    return;
  }

  const fromDraft = await publishOldestDraft(env);
  if (fromDraft) return;

  const topic = await nextQueuedTopic(env);
  if (!topic) {
    console.log("Weekly blog: no queued topics left");
    return;
  }

  const draft = await draftFromTopic(env, topic);
  if (!draft) {
    console.error(`Weekly blog: AI draft failed for topic ${topic.slug}`);
    return;
  }

  const created = await createPost(env, {
    title: draft.title,
    slug: draft.slug || topic.slug,
    description: draft.description,
    body: draft.body,
    published: true,
  });
  if ("error" in created) {
    console.error(`Weekly blog: create failed for ${draft.slug}: ${created.error}`);
    return;
  }

  await markTopicPublished(env, topic.id, created.id);
  console.log(`Weekly blog: published ${created.slug} from topic ${topic.id}`);
}

/** True when the post's static page is live. A post the weekly cron published since the last site
 *  build has no page yet: docstoc.io answers with the noindex 404 fallback (public/blog/404.html),
 *  and listing that URL is what Search Console reported as Soft 404 / "Excluded by noindex". */
export type PostPageCheck = (slug: string) => Promise<boolean>;

const livePostPage: PostPageCheck = async (slug) => {
  try {
    const res = await fetch(`https://docstoc.io/blog/${slug}/`, { method: "HEAD", redirect: "manual" });
    return res.status === 200;
  } catch {
    return false;
  }
};

/** XML sitemap fragment listing published D1 posts that already have a built page, served live at
 *  /api/blog/sitemap.xml. Posts newer than the last site build are left out until the rebuild
 *  bakes them; they would only 404 for crawlers before that. */
export async function blogPostsSitemapXml(env: Env, isLive: PostPageCheck = livePostPage): Promise<string> {
  const all = await listPosts(env, { publishedOnly: true });
  const live = await Promise.all(all.map((p) => isLive(p.slug)));
  const posts = all.filter((_, i) => live[i]);
  const urls = posts
    .map((p) => {
      const lastmod = (p.publishedAt ?? p.createdAt).slice(0, 10);
      return `  <url>\n    <loc>https://docstoc.io/blog/${p.slug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
