import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync(new URL("../../../public/analytics.js", import.meta.url), "utf8");

/** Runs public/analytics.js in a bare fake browser and returns what the cookieless count sent. */
function run(opts: { path?: string; host?: string; cookie?: string; dnt?: string; gpc?: boolean; webdriver?: boolean; twice?: boolean } = {}) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const docListeners: Record<string, (() => void)[]> = {};
  const winListeners: Record<string, (() => void)[]> = {};
  const storage = { getItem: () => { throw new Error("localStorage must not be read"); }, setItem: () => { throw new Error("localStorage must not be written"); } };
  const document = {
    readyState: "complete",
    cookie: opts.cookie ?? "",
    referrer: "https://www.google.com/",
    visibilityState: "visible",
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: (t: string, f: () => void) => (docListeners[t] ??= []).push(f),
    documentElement: {},
  };
  const window: Record<string, unknown> = {
    innerWidth: 390,
    addEventListener: (t: string, f: () => void) => (winListeners[t] ??= []).push(f),
  };
  class FakeBlob {
    constructor(public parts: string[]) {}
  }
  const navigator = {
    doNotTrack: opts.dnt ?? null,
    globalPrivacyControl: opts.gpc ?? false,
    webdriver: opts.webdriver ?? false,
    sendBeacon: (url: string, blob: FakeBlob) => {
      if (url === "/api/analytics/visit") sent.push({ url, body: JSON.parse(blob.parts[0]!) });
      return true;
    },
  };
  const context = {
    window,
    document,
    navigator,
    localStorage: storage,
    location: { pathname: opts.path ?? "/document-templates/nda-template", search: "?utm_source=newsletter", hostname: opts.host ?? "docstoc.io", href: "https://docstoc.io/" },
    URL,
    URLSearchParams,
    Blob: FakeBlob,
    JSON,
    fetch: () => Promise.resolve(),
    setTimeout,
  };
  window.window = window;
  runInNewContext(SCRIPT, context);
  if (opts.twice) runInNewContext(SCRIPT, context);
  const hide = () => {
    document.visibilityState = "hidden";
    docListeners.visibilitychange?.forEach((f) => f());
  };
  const show = () => {
    document.visibilityState = "visible";
    docListeners.visibilitychange?.forEach((f) => f());
  };
  const pagehide = () => winListeners.pagehide?.forEach((f) => f());
  return { sent, hide, show, pagehide };
}

describe("analytics.js cookieless visit count", () => {
  it("sends one view without touching localStorage, then one leave per hide", () => {
    const r = run();
    expect(r.sent).toEqual([
      { url: "/api/analytics/visit", body: { ev: "view", path: "/document-templates/nda-template", referrer: "https://www.google.com/", utmSource: "newsletter", width: 390 } },
    ]);
    r.hide();
    r.pagehide();
    expect(r.sent.map((s) => s.body.ev)).toEqual(["view", "leave"]);
    r.show();
    r.hide();
    r.show();
    r.hide();
    r.show();
    r.hide();
    expect(r.sent.filter((s) => s.body.ev === "leave")).toHaveLength(3);
  });

  it("counts once when the file is loaded twice", () => {
    expect(run({ twice: true }).sent).toHaveLength(1);
  });

  it("skips DNT, GPC, automation, local hosts, the app and the operator's device", () => {
    expect(run({ dnt: "1" }).sent).toHaveLength(0);
    expect(run({ gpc: true }).sent).toHaveLength(0);
    expect(run({ webdriver: true }).sent).toHaveLength(0);
    expect(run({ host: "localhost" }).sent).toHaveLength(0);
    expect(run({ path: "/app/login" }).sent).toHaveLength(0);
    expect(run({ cookie: "a=b; docstoc_notrack=1" }).sent).toHaveLength(0);
  });
});
