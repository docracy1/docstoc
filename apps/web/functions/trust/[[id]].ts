// Public company trust certificate. Worded to claim only what's verified: DNS control of a
// domain (via a real, docstoc-issued SSL certificate) and, once confirmed, a Bitcoin-anchored
// "verified since" date. Never claims legal-entity or business-registry verification.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUsDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatUsDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

type PublicTrustProfile = {
  workspaceName: string;
  domain: string | null;
  domainStatus: "active" | "expiring" | "expired" | "none";
  verifiedSince: string;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
};

function renderPage(opts: { title: string; body: string; canonical: string }): string {
  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(opts.canonical)}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${escapeHtml(opts.canonical)}">
<meta name="robots" content="noindex">
<style>
  :root {
    --ink: #1B3155;
    --muted: #5b6b82;
    --line: color-mix(in srgb, #1B3155 14%, #fff);
    --paper: #fff;
    --bg: #F2F4F8;
    --accent: #EC683C;
    --ok: #1a7f37;
    --warn: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Inter, -apple-system, system-ui, sans-serif;
    max-width: 760px; margin: 36px auto; padding: 0 20px 48px;
    line-height: 1.55; color: var(--ink); background: var(--bg);
  }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
  .actions button, .actions a.btn {
    appearance: none; border: none; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
    padding: 10px 16px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
  }
  .btn-download { background: var(--accent); color: #fff; }
  .btn-download:hover { background: color-mix(in srgb, var(--accent) 88%, var(--ink)); }
  .btn-secondary { background: #fff; color: var(--ink); border: 1px solid var(--line) !important; }
  .btn-secondary:hover { background: #eef1f6; }
  .sheet {
    background: var(--paper); border: 1px solid var(--line); border-radius: 12px;
    padding: 28px 28px 32px; box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .brand {
    display: flex; align-items: center; gap: 12px; margin-bottom: 22px;
    padding-bottom: 18px; border-bottom: 1px solid var(--line);
  }
  .brand img { width: 40px; height: 40px; border-radius: 8px; }
  .brand-meta { display: flex; flex-direction: column; gap: 2px; }
  .brand-name { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
  .brand-tag { font-size: 12.5px; color: var(--muted); font-weight: 500; }
  .doc-title { margin: 0 0 6px; font-size: 22px; letter-spacing: -0.02em; }
  .doc-sub { margin: 0 0 22px; color: var(--muted); font-size: 14px; }
  h2 {
    margin: 22px 0 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; font-size: 14.5px; }
  .grid .label { color: var(--muted); font-weight: 600; }
  .grid .value { color: var(--ink); word-break: break-word; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
  .status.active { color: var(--ok); }
  .status.expiring, .status.expired, .status.none { color: var(--warn); }
  .ots.confirmed { color: var(--warn); font-weight: 700; }
  .ots.pending { color: var(--muted); }
  .divider { height: 1px; background: var(--line); margin: 22px 0; border: 0; }
  .disclaimer {
    font-size: 12.5px; color: var(--muted); margin: 0;
    padding: 14px 16px; background: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px;
  }
  footer { margin-top: 28px; font-size: 12px; color: #666; }
  a { color: var(--accent); }
  @media (max-width: 560px) {
    .grid { grid-template-columns: 1fr; gap: 2px 0; }
    .grid .label { margin-top: 8px; }
    .sheet { padding: 22px 18px 26px; }
  }
  @media print {
    body { background: #fff; margin: 0; padding: 12mm; max-width: none; }
    .sheet { border: none; box-shadow: none; border-radius: 0; padding: 0; }
    .actions { display: none !important; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
${opts.body}
</body>
</html>`;
}

export const onRequest: PagesFunction<{ WORKER_URL: string }> = async (context) => {
  const idParam = context.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam || "";
  const url = new URL(context.request.url);
  const workerBase = context.env.WORKER_URL || "https://api.docstoc.io";
  const canonical = `${url.origin}/trust/${encodeURIComponent(id)}`;
  const logoUrl = `${url.origin}/brand/docstoc-icon.png`;

  const upstream = await fetch(`${workerBase}/api/trust/public/${encodeURIComponent(id)}`, {
    headers: { "X-Docstoc-App-Origin": url.origin },
  }).catch(() => null);

  if (!upstream || upstream.status === 404) {
    return new Response(
      renderPage({
        title: "Trust certificate not found — docstoc",
        canonical,
        body: `<h1>Trust certificate not found</h1><p>This account doesn't have a verified domain yet, or the link is incomplete.</p><p><a href="https://docstoc.io/">docstoc</a></p>`,
      }),
      { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  if (!upstream.ok) {
    return new Response(
      renderPage({
        title: "Trust certificate unavailable — docstoc",
        canonical,
        body: `<h1>Trust certificate temporarily unavailable</h1><p>Try again in a moment.</p>`,
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  const profile = (await upstream.json()) as PublicTrustProfile;
  const title = `${profile.workspaceName} — Company Trust Certificate — docstoc`;
  const statusLabel =
    profile.domainStatus === "active"
      ? "✓ SSL active"
      : profile.domainStatus === "expiring"
        ? "⚠ SSL renewal due"
        : profile.domainStatus === "expired"
          ? "⚠ SSL expired"
          : "No verified domain";

  const otsRow =
    profile.otsStatus === "confirmed"
      ? `<div class="label">Bitcoin timestamp</div>
         <div class="value"><span class="ots confirmed">₿ Confirmed</span>${
           profile.otsConfirmedAt ? ` · ${escapeHtml(formatUsDateTime(profile.otsConfirmedAt))}` : ""
         } · <a href="${escapeHtml(workerBase)}/api/trust/proof/${encodeURIComponent(id)}.ots">Download proof (.ots)</a></div>`
      : `<div class="label">Bitcoin timestamp</div>
         <div class="value"><span class="ots pending">Pending confirmation</span> — OpenTimestamps public calendars accepted this digest and are still aggregating it into a Bitcoin block. Confirmation is automatic; public calendars sometimes take longer than a few hours.</div>`;

  const autoDownload = url.searchParams.get("download") === "1";
  const printTitle = JSON.stringify(
    `Company Trust Certificate — ${profile.workspaceName.replace(/[^\w.\- ]+/g, "").slice(0, 80)}`
  );

  const body = `
<div class="actions" role="toolbar" aria-label="Certificate actions">
  <button type="button" class="btn-download" id="download-pdf">Download PDF</button>
  <button type="button" class="btn-secondary" id="copy-link">Copy share link</button>
</div>
<article class="sheet">
  <header class="brand">
    <img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="docstoc">
    <div class="brand-meta">
      <span class="brand-name">docstoc</span>
      <span class="brand-tag">Company trust certificate</span>
    </div>
  </header>

  <h1 class="doc-title">${escapeHtml(profile.workspaceName)}</h1>
  <p class="doc-sub">Domain-verified account attestation · Issued ${escapeHtml(formatUsDate(profile.verifiedSince))}</p>

  <h2>Account information</h2>
  <div class="grid">
    <div class="label">Account</div>
    <div class="value">${escapeHtml(profile.workspaceName)}</div>
    <div class="label">Profile ID</div>
    <div class="value">${escapeHtml(id)}</div>
  </div>

  <h2>Domain verification</h2>
  <div class="grid">
    ${
      profile.domain
        ? `<div class="label">Domain</div><div class="value">${escapeHtml(profile.domain)}</div>`
        : ""
    }
    <div class="label">SSL status</div>
    <div class="value"><span class="status ${profile.domainStatus}">${statusLabel}</span></div>
    <div class="label">Verified since</div>
    <div class="value">${escapeHtml(formatUsDate(profile.verifiedSince))} (UTC)</div>
    ${otsRow}
  </div>

  <hr class="divider">
  <p class="disclaimer">This confirms docstoc verified DNS control of the domain above via a real Let's Encrypt SSL certificate, and (once Bitcoin-confirmed) that this account has held verified status since the date shown. It is not a business registration, legal entity, or identity check — docstoc doesn't perform those.</p>

  <footer>
    Issued via <a href="https://docstoc.io/">docstoc</a>. Independent verification: OpenTimestamps proof when Bitcoin-confirmed.
  </footer>
</article>
<script>
(function () {
  var downloadBtn = document.getElementById("download-pdf");
  var copyBtn = document.getElementById("copy-link");
  function downloadPdf() {
    document.title = ${printTitle};
    window.print();
  }
  if (downloadBtn) downloadBtn.addEventListener("click", downloadPdf);
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var shareUrl = location.href.replace(/[?&]download=1/, "").replace(/\\?$/, "");
    navigator.clipboard.writeText(shareUrl).then(function () {
      copyBtn.textContent = "Copied!";
      setTimeout(function () { copyBtn.textContent = "Copy share link"; }, 1600);
    }).catch(function () {});
  });
  ${autoDownload ? "window.addEventListener('load', function () { setTimeout(downloadPdf, 250); });" : ""}
})();
</script>`;

  return new Response(renderPage({ title, canonical, body }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
};
