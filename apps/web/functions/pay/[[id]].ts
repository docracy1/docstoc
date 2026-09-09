// Public "Get paid" payment page. A Pages Function (not an SPA route) so the client just gets a
// link they can open and pay — no login, no React bundle required. Mirrors functions/invoice/[[id]].ts.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Best-effort readable name from a template slug — no extra fetch to templates.json just to
 *  resolve a display label for a link that already includes the slug in its URL. */
function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

type PayResponse = {
  clientName: string;
  amount: number;
  status: "open" | "paid";
  paymentMethod: "crypto" | "own_link" | null;
  paymentUrl: string | null;
  templateSlug: string | null;
};

function renderPage(opts: { title: string; body: string; canonical: string }): string {
  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<link rel="canonical" href="${escapeHtml(opts.canonical)}">
<meta name="robots" content="noindex">
<style>
  body { font-family: Inter, -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 560px; margin: 40px auto; padding: 0 20px 48px; line-height: 1.55; color: #1B3155; background: #F2F4F8; }
  .sheet { background: #fff; border: 1px solid color-mix(in srgb, #1B3155 14%, #fff); border-radius: 12px; padding: 32px 28px; box-shadow: 0 8px 24px color-mix(in srgb, #1B3155 6%, transparent); text-align: center; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .brand img { width: 28px; height: 28px; border-radius: 6px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .amount { font-size: 36px; font-weight: 700; margin: 12px 0; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; padding: 3px 10px; border-radius: 999px; margin-bottom: 12px; }
  .status.paid { color: #1a7f37; background: #eaf6ec; }
  .status.open { color: #b45309; background: #fdf3e3; }
  .template-link { display: block; margin: 16px 0; font-size: 14px; color: #556; }
  .pay-link { display: inline-block; margin-top: 20px; padding: 12px 28px; background: #EC683C; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; }
  .pay-link:hover { background: color-mix(in srgb, #EC683C 88%, #1B3155); }
  a { color: #EC683C; }
  footer { margin-top: 32px; font-size: 12px; color: #666; text-align: center; }
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
  const canonical = `${url.origin}/pay/${encodeURIComponent(id)}`;

  const upstream = await fetch(`${workerBase}/api/aging/public/${encodeURIComponent(id)}`, {
    headers: { "X-Docstoc-App-Origin": url.origin },
  }).catch(() => null);

  if (!upstream || upstream.status === 404) {
    return new Response(
      renderPage({
        title: "Payment link not found — docstoc",
        canonical,
        body: `<article class="sheet"><h1>Payment link not found</h1><p>This link doesn't match anything on file. Check that you have the full link.</p><p><a href="https://docstoc.io/">docstoc</a></p></article>`,
      }),
      { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  if (!upstream.ok) {
    return new Response(
      renderPage({
        title: "Payment link unavailable — docstoc",
        canonical,
        body: `<article class="sheet"><h1>Temporarily unavailable</h1><p>Try again in a moment.</p></article>`,
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=UTF-8" } }
    );
  }

  const pay = (await upstream.json()) as PayResponse;
  const title = `Payment request from ${pay.clientName ? "your invoice" : "docstoc"} — ${formatMoney(pay.amount)}`;

  const templateBlock = pay.templateSlug
    ? `<a class="template-link" href="${escapeHtml(`${url.origin}/document-templates/${pay.templateSlug}`)}" target="_blank" rel="noopener noreferrer">Includes: ${escapeHtml(titleFromSlug(pay.templateSlug))} →</a>`
    : "";

  const payBlock =
    pay.status === "paid"
      ? `<span class="status paid">✓ Paid</span>`
      : pay.paymentUrl
        ? `<a class="pay-link" href="${escapeHtml(pay.paymentUrl)}" target="_blank" rel="noopener noreferrer">Pay now</a>`
        : `<p>This payment link isn't ready yet — ask the sender to finish setting it up.</p>`;

  const body = `
<article class="sheet">
<div class="brand">
  <img src="https://docstoc.io/brand/docstoc-icon.png" alt="">
  <strong>Payment request</strong>
</div>
${pay.status === "open" ? `<span class="status open">Awaiting payment</span>` : ""}
<h1>${escapeHtml(pay.clientName)}</h1>
<div class="amount">${formatMoney(pay.amount)}</div>
${templateBlock}
${payBlock}
</article>
<footer>Generated via <a href="https://docstoc.io/">docstoc</a>.</footer>`;

  return new Response(renderPage({ title, canonical, body }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
};
