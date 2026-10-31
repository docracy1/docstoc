// Public "Certificate of Authenticity" verification page. A Pages Function (not an SPA route) so
// anonymous visitors don't need to load the React bundle, and shared links get real OG/Twitter
// meta tags for link previews — neither is cheap to do from a client-rendered route.
//
// The hash comparison for "drop a file to re-check" runs entirely client-side against the hash
// already fetched for this page; no second network round-trip and no file upload.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

type CertificateResponse = {
  publicId: string;
  sha256Hash: string;
  originalFilename: string | null;
  fileSizeBytes: number | null;
  issuerName: string;
  issuerSelfDeclared?: boolean;
  logoDataUrl: string | null;
  isBranded: boolean;
  status: "active" | "revoked";
  createdAt: string;
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
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.55; color: #1B3155; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
  .brand img { width: 32px; height: 32px; border-radius: 6px; }
  .card { border: 1px solid #d8dee8; border-radius: 10px; padding: 20px; margin: 20px 0; background: #fafbfc; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
  .status.active { color: #1a7f37; }
  .status.revoked { color: #c1121f; }
  .ots-row { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e5e7eb; }
  .ots-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
  .ots-badge.confirmed { color: #b45309; }
  .ots-badge.pending { color: #6b7280; }
  .ots-note { font-size: 12.5px; color: #6b7280; margin-top: 4px; }
  .ots-note a { color: #2e5bdb; }
  .hash { font-family: "SF Mono", ui-monospace, monospace; font-size: 12px; word-break: break-all; background: #f0f2f5; padding: 8px; border-radius: 6px; display: block; margin-top: 8px; }
  .drop { border: 2px dashed #c6cedb; border-radius: 10px; padding: 24px; text-align: center; margin-top: 24px; cursor: pointer; }
  .drop.drag { border-color: #2e7d32; background: #f4faf5; }
  .result { margin-top: 12px; font-weight: 600; }
  .result.match { color: #1a7f37; }
  .result.mismatch { color: #c1121f; }
  footer { margin-top: 32px; font-size: 12px; color: #666; }
  a { color: #2e5bdb; }
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
  const canonical = `${url.origin}/verify/${encodeURIComponent(id)}`;

  const upstream = await fetch(`${workerBase}/api/verify/certificates/${encodeURIComponent(id)}`, {
    headers: { "X-Docstoc-App-Origin": url.origin },
  }).catch(() => null);

  if (!upstream || upstream.status === 404) {
    return new Response(
      renderPage({
        title: "Certificate not found — docstoc",
        canonical,
        body: `<h1>Certificate not found</h1><p>This verification link doesn't match a certificate on file. Check that you have the full link.</p><p><a href="https://docstoc.io/">docstoc</a></p>`,
      }),
      { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  if (!upstream.ok) {
    return new Response(
      renderPage({
        title: "Verification unavailable — docstoc",
        canonical,
        body: `<h1>Verification temporarily unavailable</h1><p>Try again in a moment.</p>`,
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  const cert = (await upstream.json()) as CertificateResponse;
  const isRevoked = cert.status === "revoked";
  const title = `Certificate of Authenticity — ${cert.publicId} — docstoc`;

  const otsBlock =
    cert.otsStatus === "confirmed"
      ? `<div class="ots-row">
          <span class="ots-badge confirmed">₿ Bitcoin-timestamped${cert.otsConfirmedAt ? ` — confirmed ${escapeHtml(formatUsDateTime(cert.otsConfirmedAt))}` : ""}</span>
          <p class="ots-note">This hash is anchored to the Bitcoin blockchain via <a href="https://opentimestamps.org" target="_blank" rel="noopener">OpenTimestamps</a> — an independent, public proof that doesn't rely on trusting docstoc. <a href="${workerBase}/api/verify/certificates/${encodeURIComponent(cert.publicId)}/timestamp.ots">Download the proof (.ots)</a> to verify it yourself with the <code>ots</code> CLI or any OpenTimestamps-compatible verifier.</p>
        </div>`
      : cert.otsStatus === "pending"
      ? `<div class="ots-row">
          <span class="ots-badge pending">₿ Bitcoin timestamp pending</span>
          <p class="ots-note">This hash has been submitted for Bitcoin timestamping via <a href="https://opentimestamps.org" target="_blank" rel="noopener">OpenTimestamps</a>. Anchoring a batch to the blockchain typically takes a few hours; this page will show "Bitcoin-timestamped" once confirmed.</p>
        </div>`
      : "";

  const body = `
<div class="brand">
  ${cert.logoDataUrl ? `<img src="${escapeHtml(cert.logoDataUrl)}" alt="">` : `<img src="https://docstoc.io/brand/docstoc-icon.png" alt="">`}
  <strong>${escapeHtml(cert.issuerName)}</strong>
  ${cert.issuerSelfDeclared ? `<small>Name entered by the uploader, not verified by docstoc</small>` : ""}
</div>
<h1>Certificate of Authenticity</h1>
<p class="status ${isRevoked ? "revoked" : "active"}">
  ${isRevoked ? "⚠ Revoked" : "✓ File fingerprint verified"}
</p>
<div class="card">
  <p><strong>Certificate ID:</strong> ${escapeHtml(cert.publicId)}</p>
  ${cert.originalFilename ? `<p><strong>File:</strong> ${escapeHtml(cert.originalFilename)}</p>` : ""}
  <p><strong>Created:</strong> ${escapeHtml(formatUsDateTime(cert.createdAt))}</p>
  <p><strong>SHA-256 fingerprint:</strong></p>
  <code class="hash" id="stored-hash">${escapeHtml(cert.sha256Hash)}</code>
  ${otsBlock}
</div>

<div class="drop" id="drop-zone">
  <p><strong>Drop a file here (or click to choose)</strong> to check it against this certificate.</p>
  <p style="font-size:13px;color:#666">The file is hashed in your browser and never uploaded anywhere.</p>
  <input type="file" id="file-input" style="display:none">
</div>
<div id="result"></div>

<footer>
  Issued via <a href="https://docstoc.io/">docstoc</a> — SHA-256 document verification. Not legal advice.
</footer>

<script>
(function() {
  var dropZone = document.getElementById("drop-zone");
  var fileInput = document.getElementById("file-input");
  var result = document.getElementById("result");
  var storedHash = document.getElementById("stored-hash").textContent.trim().toLowerCase();

  async function hashFile(file) {
    var buffer = await file.arrayBuffer();
    var digest = await crypto.subtle.digest("SHA-256", buffer);
    var bytes = new Uint8Array(digest);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
  }

  async function handleFile(file) {
    if (!file) return;
    result.className = "result";
    result.textContent = "Hashing…";
    var hex = await hashFile(file);
    if (hex === storedHash) {
      result.className = "result match";
      result.textContent = "✓ Match — this file is identical to the certified original.";
    } else {
      result.className = "result mismatch";
      result.textContent = "✗ No match — this file's contents differ from the certified original.";
    }
  }

  dropZone.addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function(e) { handleFile(e.target.files[0]); });
  dropZone.addEventListener("dragover", function(e) { e.preventDefault(); dropZone.classList.add("drag"); });
  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("drag"); });
  dropZone.addEventListener("drop", function(e) {
    e.preventDefault();
    dropZone.classList.remove("drag");
    handleFile(e.dataTransfer.files[0]);
  });
})();
</script>`;

  return new Response(renderPage({ title, canonical, body }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
};
