import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

const getAuditorPackHtml = vi.fn();
const getAuditorPackProof = vi.fn();

vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  requireProAccount: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("account", { id: "a", workspaceId: "w", plan: "business" });
    await next();
  },
}));
vi.mock("../lib/sox", async (original) => ({
  ...(await original<typeof import("../lib/sox")>()),
  getAuditorPackHtml,
  getAuditorPackProof,
}));

async function get(path: string) {
  const { default: sox } = await import("./sox");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/sox", sox as never);
  return app.request(path, { method: "GET" }, {} as Env);
}

const pack = { html: "<h1>Pack</h1>", fromDate: "2026-01-01", toDate: "2026-03-31", contentSha256: "abc123" };

describe("auditor pack downloads", () => {
  beforeEach(() => {
    getAuditorPackHtml.mockReset();
    getAuditorPackProof.mockReset();
  });

  it("serves the HTML pack for the id in the file name", async () => {
    getAuditorPackHtml.mockResolvedValue(pack);
    const res = await get("/sox/auditor-packs/p1.html");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(pack.html);
    expect(res.headers.get("Content-Disposition")).toContain("sox-auditor-pack-2026-01-01_2026-03-31.html");
    expect(getAuditorPackHtml).toHaveBeenCalledWith(expect.anything(), "w", "p1");
  });

  it("serves the checksum for the same pack", async () => {
    getAuditorPackHtml.mockResolvedValue(pack);
    const res = await get("/sox/auditor-packs/p1.sha256");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123  sox-auditor-pack-2026-01-01_2026-03-31.html\n");
    expect(getAuditorPackHtml).toHaveBeenCalledWith(expect.anything(), "w", "p1");
  });

  it("serves the timestamp proof and names the file after the pack id", async () => {
    getAuditorPackProof.mockResolvedValue({ proofBase64: btoa("proof"), contentSha256: "abc123" });
    const res = await get("/sox/auditor-packs/p1.ots");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("proof");
    expect(res.headers.get("Content-Disposition")).toContain('filename="sox-auditor-pack-p1.ots"');
    expect(getAuditorPackProof).toHaveBeenCalledWith(expect.anything(), "w", "p1");
  });

  it("answers 404 for a pack this workspace does not have", async () => {
    getAuditorPackHtml.mockResolvedValue(null);
    const res = await get("/sox/auditor-packs/other.html");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Pack not found" });
  });
});
