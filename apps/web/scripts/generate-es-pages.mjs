#!/usr/bin/env node
/**
 * Generates real, crawlable /es/ counterparts for the pages with full data-i18n coverage —
 * NOT the client-side JS text-swap every other page still uses. Run AFTER
 * generate-marketing.mjs and generate-blog.mjs, since it reads their EN output.
 *
 * Adding a page here requires it to have full data-i18n / data-i18n-html coverage in its
 * <main> already (check with `grep -c data-i18n public/<file>`), plus an entry in
 * es-alternates.mjs's EN_TO_ES map. Don't add one without the other — an alternates entry
 * with no generated file means hreflang/sitemap point at a 404; a generated file with no
 * alternates entry means it's invisible to hreflang, sitemap, and the locale switcher.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";
import { es as esCatalog } from "./data/marketing-i18n.mjs";
import { EN_TO_ES, ES_PAGE_PAIRS } from "./data/es-alternates.mjs";
import { HOME_PAGE_TITLE_ES } from "./data/seo-config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

/** Page-specific SEO metadata isn't part of the shared UI catalog (it's per-page, not a
 *  reusable string), so it's hand-translated here instead. */
const SEO_ES = {
  "/": {
    title: HOME_PAGE_TITLE_ES,
    description:
      "Más de 1,000 plantillas de documentos de negocio y legales para pequeñas empresas en EE. UU. Léelas, edítalas en tu navegador y guárdalas en PDF gratis.",
  },
  "/privacy": {
    title: "Política de Privacidad — docstoc | Protección de Datos",
    description:
      "Qué hace docstoc con tus datos: qué recopilamos, por qué, qué subencargados lo tratan, cuánto tiempo se conserva y cómo pedir su eliminación o exportación.",
  },
  "/terms": {
    title: "Términos de Servicio — docstoc | Condiciones de Uso",
    description:
      "Cómo funciona docstoc, explicado en lenguaje sencillo: qué hace el servicio, qué cuesta, tus responsabilidades y las condiciones de tu cuenta.",
  },
  "/blog/": {
    title: "Guías de facturas y recordatorios de pago | Blog docstoc",
    description:
      "Guías prácticas para hacer seguimiento de facturas vencidas, escribir recordatorios de pago y construir una política de cuentas por cobrar.",
  },
  "/invoice-follow-up": {
    title: "Seguimiento de facturas — borradores con IA | docstoc",
    description:
      "Redacta correos de seguimiento de facturas con el tono adecuado según el retraso. Borradores con IA y plantillas gratuitas para autónomos.",
  },
  "/chase-invoices": {
    title: "Reclamar facturas impagas — borradores con IA | docstoc",
    description:
      "Reclama facturas impagas con seguimientos redactados por IA que envías desde tu propia bandeja. Sin envío automático ni cobranza.",
  },
  "/payment-reminder": {
    title: "Recordatorios de pago — plantillas y IA | docstoc",
    description:
      "Correos de recordatorio de pago antes y después del vencimiento. Plantillas gratuitas y borradores con IA según el retraso.",
  },
  "/guides/invoice-chasing/": {
    title: "Centro de reclamación de facturas — guías y plantillas | docstoc",
    description:
      "Todo para reclamar facturas impagas: borradores con IA, plantillas gratuitas, guías de escalada, calculadoras y comparativas.",
  },
};

/** Hand-translated main bodies for ES pages without full data-i18n coverage in EN source. */
const MAIN_ES = {
  "/invoice-follow-up": `<p class="crumb"><a href="/es/">Inicio</a> / Seguimiento de facturas</p>
  <h1>Correos de seguimiento de facturas con el tono adecuado al retraso</h1>
  <p class="lede">docstoc redacta correos de seguimiento para autónomos — amables cuando la factura lleva pocos días de retraso, más firmes cuando lleva semanas. Tú envías desde tu propia bandeja.</p>

  <h3>Por qué se estancan los seguimientos</h3>
  <p>La mayoría de autónomos sabe que debe reclamar facturas impagas. Lo difícil es el tono: demasiado suave y no pasa nada; demasiado duro y arriesgas la relación. docstoc elimina esa incertidumbre adaptando el tono a los días de retraso.</p>

  <h3>Cómo ayuda docstoc</h3>
  <p>Pega nombre del cliente, importe y fecha de vencimiento — o sube un CSV de QuickBooks, Xero o tu hoja de cálculo. docstoc escribe un seguimiento que puedes copiar en Gmail, Outlook o Apple Mail. Sin envío automático ni teatro de cobranza.</p>

  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Probar gratis — 5 borradores con IA</a></p>

  <h3>Recursos relacionados</h3>
  <ul>
    <li><a href="/es/guides/invoice-chasing/">Centro de reclamación de facturas</a></li>
    <li><a href="/tools/invoice-chase-calculator">Calculadora de seguimiento de facturas</a></li>
    <li><a href="/payment-reminder">Correos de recordatorio de pago</a></li>
    <li><a href="/overdue-invoice">Seguimiento de facturas vencidas</a></li>
    <li><a href="/freelancer-invoice-follow-up">Guía de seguimiento para autónomos</a></li>
    <li><a href="/free-templates/">18 plantillas de correo gratis</a></li>
    <li><a href="/features/ai-tone">Tono con IA</a></li>
  </ul>`,
  "/chase-invoices": `<p class="crumb"><a href="/es/">Inicio</a> / Reclamar facturas</p>
  <h1>Reclamar facturas — sin el correo incómodo</h1>
  <p class="lede">Reclamar el pago forma parte del trabajo autónomo. docstoc redacta el texto para que te centres en la relación — pega facturas, obtén borradores, envía desde tu bandeja.</p>
  <h3>Reclamar, no cobrar</h3>
  <p>docstoc está pensado para autónomos que quieren cobrar sin sonar como una agencia de cobranza. Redactamos el correo; tú decides cuándo y cómo enviarlo.</p>
  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Empezar a reclamar — gratis</a></p>
  <h3>Recursos relacionados</h3>
  <ul>
    <li><a href="/es/guides/invoice-chasing/">Centro de reclamación de facturas</a></li>
    <li><a href="/es/invoice-follow-up">Seguimiento de facturas</a></li>
    <li><a href="/payment-reminder">Recordatorios de pago</a></li>
    <li><a href="/free-templates/">Plantillas gratuitas</a></li>
  </ul>`,
  "/payment-reminder": `<p class="crumb"><a href="/es/">Inicio</a> / Recordatorio de pago</p>
  <h1>Correos de recordatorio de pago — antes y después del vencimiento</h1>
  <p class="lede">Un buen recordatorio es breve, concreto y fácil de pagar. docstoc ofrece plantillas gratuitas para cada etapa y borradores con IA cuando prefieres que redactemos el texto.</p>
  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Redactar un recordatorio</a></p>
  <h3>Recursos relacionados</h3>
  <ul>
    <li><a href="/es/guides/invoice-chasing/">Centro de reclamación de facturas</a></li>
    <li><a href="/es/invoice-follow-up">Seguimiento de facturas</a></li>
    <li><a href="/chase-invoices">Cómo reclamar facturas</a></li>
    <li><a href="/free-templates/">Plantillas gratuitas</a></li>
  </ul>`,
  "/guides/invoice-chasing/": `<p class="crumb"><a href="/es/">Inicio</a> / Guías / Reclamación de facturas</p>
  <h1>Centro de reclamación de facturas</h1>
  <p class="guide-hero-lede">Facturas impagas, recordatorios y seguimientos — plantillas, guías, herramientas y borradores con IA en un solo lugar. Tú envías cada correo.</p>
  <p style="margin-top:20px"><a href="/app/login?start=1" class="nav-cta">Probar la plataforma gratis →</a></p>
  <section class="guide-section">
    <h2>Empezar aquí</h2>
    <ul>
      <li><a href="/app/">Abrir la plataforma</a></li>
      <li><a href="/free-templates/">28 plantillas de recordatorio gratis</a></li>
      <li><a href="/es/invoice-follow-up">Seguimiento de facturas con IA</a></li>
      <li><a href="/es/chase-invoices">Cómo reclamar facturas</a></li>
      <li><a href="/es/payment-reminder">Recordatorios de pago</a></li>
    </ul>
  </section>`,
};

function extractMain(html) {
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!match) throw new Error("No <main> found");
  return match[1].trim();
}

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i);
  return match ? match[1].trim() : null;
}

/** aria-label lives on the SAME tag as data-i18n-aria — no closing-tag matching needed. */
function translateAriaLabels(html) {
  return html.replace(/<([a-zA-Z][^>]*?)\sdata-i18n-aria="([\w.]+)"([^>]*?)(\/?)>/g, (m, pre, key, post, selfClose) => {
    const val = esCatalog[key];
    if (val == null) return m;
    const cleaned = (pre + post).replace(/\s*aria-label="[^"]*"/g, "");
    return `<${cleaned} data-i18n-aria="${key}" aria-label="${escapeHtml(val)}"${selfClose}>`;
  });
}

/** data-i18n-html values are pre-authored HTML (e.g. inline <a> links) — inserted raw. */
function translateHtmlBlocks(html) {
  return html.replace(/<(\w+)([^>]*?)\sdata-i18n-html="([\w.]+)"([^>]*)>[\s\S]*?<\/\1>/g, (m, tag, pre, key, post) => {
    const val = esCatalog[key];
    if (val == null) return m;
    return `<${tag}${pre} data-i18n-html="${key}"${post}>${val}</${tag}>`;
  });
}

/** Plain data-i18n text nodes never contain nested tags — [^<]* is a safe, exact match. */
function translateTextNodes(html) {
  return html.replace(/<(\w+)([^>]*?)\sdata-i18n="([\w.]+)"([^>]*)>[^<]*<\/\1>/g, (m, tag, pre, key, post) => {
    const val = esCatalog[key];
    if (val == null) return m;
    return `<${tag}${pre} data-i18n="${key}"${post}>${escapeHtml(val)}</${tag}>`;
  });
}

function translateToSpanish(html) {
  return translateTextNodes(translateHtmlBlocks(translateAriaLabels(html)));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Nav/footer links that point at a page with a real ES counterpart should point at it —
 *  everything else (no counterpart yet) correctly keeps pointing at the EN version. The
 *  negative lookbehind keeps this from also matching inside data-en-href/data-es-href,
 *  which end in the same "href=" substring. */
function rewriteInternalLinks(html) {
  let out = html;
  for (const [en, es] of Object.entries(EN_TO_ES)) {
    out = out.replace(new RegExp(`(?<![\\w-])href="${escapeRegex(en)}"`, "g"), `href="${es}"`);
  }
  return out;
}

mkdirSync(join(publicDir, "es"), { recursive: true });

for (const [enPath, esPath] of ES_PAGE_PAIRS) {
  const srcFile = enPath === "/" ? "index.html" : `${enPath.replace(/^\//, "").replace(/\/$/, "")}${enPath.endsWith("/") ? "/index.html" : ".html"}`;
  const srcPath = join(publicDir, srcFile);
  if (!existsSync(srcPath)) {
    console.warn(`Skipping ${enPath} → ${esPath}: ${srcFile} not found`);
    continue;
  }
  const enHtml = readFileSync(srcPath, "utf8");
  const seo = SEO_ES[enPath];
  if (!seo) throw new Error(`No SEO_ES entry for ${enPath} — add one before generating it.`);

  let outHtml;
  if (enPath === "/") {
    // Homepage bypasses chrome() (bespoke hero layout) — translate the whole file in place.
    outHtml = enHtml
      .replace(/<html lang="en">/, `<html lang="es">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(seo.description)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(seo.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(seo.description)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(seo.title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(seo.description)}$2`)
      .replace(
        /<link rel="canonical" href="https:\/\/(?:docstoc|chasa)\.io\/">\n<link rel="alternate" hreflang="en" href="https:\/\/(?:docstoc|chasa)\.io\/">\n<link rel="alternate" hreflang="es" href="https:\/\/(?:docstoc|chasa)\.io\/es\/">\n<link rel="alternate" hreflang="x-default" href="https:\/\/(?:docstoc|chasa)\.io\/">/,
        `<link rel="canonical" href="https://docstoc.io${esPath}">
<link rel="alternate" hreflang="en" href="https://docstoc.io/">
<link rel="alternate" hreflang="es" href="https://docstoc.io${esPath}">
<link rel="alternate" hreflang="x-default" href="https://docstoc.io/">`
      )
      .replace(/<link rel="canonical" href="https:\/\/chasa\.io\/">/, `<link rel="canonical" href="https://docstoc.io${esPath}">`)
      .replace(`data-i18n-aria="nav.language" data-es-href="/es/"`, `data-i18n-aria="nav.language" data-en-href="/"`);
    outHtml = translateToSpanish(outHtml);
  } else {
    // Translate AFTER chrome() wraps the page, not before — mainHtml alone excludes the
    // header/footer chrome, which also carries data-i18n attributes (nav links, footer
    // columns) that need translating too.
    outHtml = chrome({
      title: seo.title,
      description: seo.description,
      canonical: esPath,
      mainHtml: MAIN_ES[enPath] ?? extractMain(enHtml),
      jsonLd: extractJsonLd(enHtml),
      lang: "es",
    });
    outHtml = translateToSpanish(outHtml);
  }

  outHtml = rewriteInternalLinks(outHtml);

  const destFile = esPath.slice(1) + (esPath.endsWith("/") ? "index.html" : ".html");
  const destPath = join(publicDir, destFile);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, outHtml, "utf8");
  console.log(`Generated ${destFile}`);
}
