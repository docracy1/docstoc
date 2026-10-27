import { Hono } from "hono";
import type { AuthEnv } from "../lib/auth";
import { getPostBySlug, listPosts } from "../lib/blog";
import { blogPostsSitemapXml } from "../lib/blogWeekly";

const blog = new Hono<AuthEnv>();

/** Live sitemap for D1-backed posts (weekly-cron + admin-authored), limited to posts whose static
 *  page is already built. No longer listed in robots.txt: the static sitemap.xml carries the same
 *  posts after each build, and listing them twice only added duplicates. Kept for anyone who
 *  submitted this URL in Search Console. */
blog.get("/sitemap.xml", async (c) => {
  const xml = await blogPostsSitemapXml(c.env);
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
});

blog.get("/posts", async (c) => {
  const posts = await listPosts(c.env, { publishedOnly: true });
  return c.json({
    posts: posts.map((p) => ({
      title: p.title,
      slug: p.slug,
      description: p.description,
      publishedAt: p.publishedAt,
    })),
  });
});

blog.get("/posts/:slug", async (c) => {
  const post = await getPostBySlug(c.env, c.req.param("slug"), true);
  if (!post) return c.json({ error: "Not found" }, 404);
  return c.json({ post });
});

export default blog;
