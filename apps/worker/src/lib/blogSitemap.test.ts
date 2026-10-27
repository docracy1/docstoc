import { describe, expect, it } from "vitest";
import { blogPostsSitemapXml } from "./blogWeekly";
import type { Env } from "../types";

function envWithPosts(slugs: string[]): Env {
  const rows = slugs.map((slug, i) => ({
    id: String(i),
    title: slug,
    slug,
    description: "",
    body: "",
    published: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    published_at: "2026-10-20T00:00:00Z",
  }));
  const db = { prepare: () => ({ all: async () => ({ results: rows }) }) };
  return { CHASA_DB: db } as unknown as Env;
}

describe("blogPostsSitemapXml", () => {
  it("leaves out posts whose static page is not built yet", async () => {
    const env = envWithPosts(["built-post", "published-after-last-build"]);
    const xml = await blogPostsSitemapXml(env, async (slug) => slug === "built-post");
    expect(xml).toContain("<loc>https://docstoc.io/blog/built-post/</loc>");
    expect(xml).not.toContain("published-after-last-build");
  });

  it("returns a valid empty urlset when no post is live", async () => {
    const xml = await blogPostsSitemapXml(envWithPosts(["a"]), async () => false);
    expect(xml).toContain("<urlset");
    expect(xml).not.toContain("<url>");
  });
});
