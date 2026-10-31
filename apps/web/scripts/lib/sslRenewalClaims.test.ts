import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Each renewal needs a fresh DNS TXT value from the customer (lib/customerCertificates.ts in the
// worker), so docstoc reminds and guides but does not renew unattended. Public copy must say that.
const scripts = join(__dirname, "..");
const SOURCES = [
  "data/ssl-competitors.mjs",
  "data/compare-competitors.mjs",
  "generate-ssl-feature-pages.mjs",
  "generate-ssl-landings.mjs",
  "demos/product-ssl.html",
  "data/blog-bodies/acme-protocol-certificate-automation.html",
  "data/blog-bodies/ssl-certificate-providers-compared.html",
  "data/blog-bodies/ssl-tls-certificate-lifetime-shortening.html",
];
const FALSE_PROMISE =
  /hands-off renew|automatic renewal|automated renewal|renews automatically|renewals handled|renewals in-product|renewals stay in|keeps renewals|leave (it|the txt)[^"]{0,30}for renewals|"auto-renew"|<strong>auto-renew/i;

describe("SSL renewal claims", () => {
  it.each(SOURCES)("%s does not promise unattended renewal", (file) => {
    const text = readFileSync(join(scripts, file), "utf8");
    expect(text.match(FALSE_PROMISE)?.[0] ?? null).toBeNull();
  });
});
