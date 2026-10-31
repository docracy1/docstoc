import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data/compare-pages");

export const CHECKED_ON = { en: "31 October 2026", es: "31 de octubre de 2026" };

/** slug → page content. Spanish entries use the key "es/{slug}". */
export function loadComparePages() {
  const pages = new Map();
  for (const name of readdirSync(dataDir)) {
    if (!name.endsWith(".json")) continue;
    for (const page of JSON.parse(readFileSync(join(dataDir, name), "utf8"))) pages.set(page.slug, page);
  }
  return pages;
}

const LABELS = {
  en: {
    what: (n) => `What ${n} is`,
    stronger: (n) => `Where ${n} is stronger`,
    fits: "Where docstoc fits",
    table: (n) => `${n} and docstoc compared`,
    topic: "Topic",
    choose: "Which one to choose",
    faq: "FAQ",
    sources: "Sources",
    checked: (d) => `Competitor details come from these pages, checked on ${d}. Prices and features change, so confirm them with the vendor.`,
  },
  es: {
    what: (n) => `Qué es ${n}`,
    stronger: (n) => `Dónde ${n} es más fuerte`,
    fits: "Dónde encaja docstoc",
    table: (n) => `${n} y docstoc comparados`,
    topic: "Tema",
    choose: "Cuál elegir",
    faq: "Preguntas frecuentes",
    sources: "Fuentes",
    checked: (d) => `Los datos de la competencia vienen de estas páginas, revisadas el ${d}. Los precios y las funciones cambian: confírmalos con el proveedor.`,
  },
};

export function comparePageLang(page) {
  return page.slug.startsWith("es/") ? "es" : "en";
}

/** Only public URLs: repo paths in `sources` were research notes for docstoc's own facts. */
export function publicSources(page) {
  const seen = new Set();
  return page.sources.filter((s) => {
    const url = String(s.url || "");
    if (!/^https?:\/\//.test(url) || /(^|\/\/|\.)docstoc\.io/.test(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/** Sections as { h2, html }, so both page shells (alt landing, SOX) can lay them out. */
export function comparePageSections(page, esc) {
  const t = LABELS[comparePageLang(page)];
  const n = esc(page.name);
  const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  const rows = page.comparison
    .map((r) => `<tr><th scope="row">${esc(r.topic)}</th><td>${esc(r.competitor)}</td><td>${esc(r.docstoc)}</td></tr>`)
    .join("");
  return [
    { h2: t.what(page.name), html: `<p>${esc(page.whatItIs)}</p>` },
    { h2: t.stronger(page.name), html: list(page.whereTheyAreStronger) },
    { h2: t.fits, html: list(page.whereDocstocFits) },
    {
      h2: t.table(page.name),
      html: `<div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th scope="col">${t.topic}</th><th scope="col">${n}</th><th scope="col">docstoc</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    },
    {
      h2: t.choose,
      html: `<p>${esc(page.whenToChoose.competitor)}</p><p>${esc(page.whenToChoose.docstoc)}</p>`,
    },
  ];
}

/** Empty list when a page has no public source, so callers can spread it. */
export function comparePageSourcesSection(page, esc) {
  const lang = comparePageLang(page);
  const t = LABELS[lang];
  const sources = publicSources(page)
    .map((s) => `<li><a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(new URL(s.url).hostname.replace(/^www\./, ""))}</a>: ${esc(s.supports || "")}</li>`)
    .join("");
  return sources
    ? [{ h2: t.sources, html: `<p class="cmp-sources-note">${esc(t.checked(CHECKED_ON[lang]))}</p><ul class="cmp-sources">${sources}</ul>` }]
    : [];
}

export function comparePageFaqSection(page, esc) {
  const t = LABELS[comparePageLang(page)];
  return {
    h2: t.faq,
    html: page.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join(""),
  };
}

export function comparePageFaqJsonLd(page) {
  return {
    "@type": "FAQPage",
    mainEntity: page.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
