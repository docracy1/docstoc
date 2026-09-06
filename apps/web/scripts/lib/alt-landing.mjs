import { chrome, escapeHtml } from "./chrome.mjs";
import { SECTORS, siblingAlts } from "../data/compare-competitors.mjs";

function sectorOf(c) {
  return SECTORS.find((s) => s.id === c.sector);
}

function altUrl(c) {
  if (c.hubHref) return c.hubHref;
  return `/${c.slug}-alternative`;
}

function importUrl(c) {
  return `/import-from-${c.slug}`;
}

function hero({ h1, lede, primaryHref, primaryLabel, secondaryHref, secondaryLabel }) {
  const second = secondaryHref
    ? `<a href="${escapeHtml(secondaryHref)}" class="alt-hero-secondary">${escapeHtml(secondaryLabel)}</a>`
    : "";
  return `<section class="tpl-hero alt-hero">
  <div class="wrap tpl-hero-inner alt-hero-inner">
    <h1>${h1}</h1>
    <p class="tpl-hero-lede">${lede}</p>
    <div class="alt-hero-ctas">
      <a href="${escapeHtml(primaryHref)}" class="alt-hero-primary">${escapeHtml(primaryLabel)}</a>
      ${second}
    </div>
  </div>
</section>`;
}

function alsoSee(c) {
  const sibs = siblingAlts(c);
  if (!sibs.length) return "";
  const links = sibs
    .map((s) => `<li><a href="${altUrl(s)}">${escapeHtml(s.name)} alternative</a></li>`)
    .join("");
  return `<h2>Also see</h2>
<ul class="alt-also">
  ${links}
  <li><a href="/compare/">All comparisons</a></li>
</ul>`;
}

function importAlso(c) {
  const sibs = siblingAlts(c);
  const links = sibs
    .map((s) => `<a href="${importUrl(s)}">${escapeHtml(s.name)}</a>`)
    .join(" · ");
  return `<p class="alt-import-more">Importing from somewhere else? ${links || ""}</p>`;
}

export function alternativeMainHtml(c) {
  const sector = sectorOf(c);
  const bullets = (c.compares || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  return `${hero({
    h1: escapeHtml(c.headline),
    lede: escapeHtml(c.sub),
    primaryHref: sector?.ctaHref || "/app/login?start=1",
    primaryLabel: sector?.ctaLabel || "Try free",
    secondaryHref: "/#pricing",
    secondaryLabel: "See pricing",
  })}
<div class="wrap alt-body">
  <h2>The problem</h2>
  <p>${escapeHtml(c.problem)}</p>
  <h2>The docstoc way</h2>
  <p>${escapeHtml(c.way)}</p>
  <h2>How docstoc compares</h2>
  <ul>${bullets}</ul>
  <p><a href="${importUrl(c)}">Import from ${escapeHtml(c.name)} →</a></p>
  ${alsoSee(c)}
  <div class="alt-footer-cta">
    <p>Free to start — no account needed for templates and a first hash check.</p>
    <a href="${escapeHtml(sector?.ctaHref || "/document-templates/")}" class="nav-cta">${escapeHtml(sector?.ctaLabel || "Get started")}</a>
  </div>
</div>`;
}

export function importMainHtml(c) {
  const sector = sectorOf(c);
  const imp = c.import || {};
  const steps = (imp.exportSteps || [])
    .map((s, i) => `<li><span class="alt-step-n">${i + 1}</span><span>${escapeHtml(s)}</span></li>`)
    .join("");
  return `${hero({
    h1: escapeHtml(c.importHero),
    lede: escapeHtml(c.importLede),
    primaryHref: sector?.importCtaHref || "/app/login?start=1",
    primaryLabel: sector?.importCtaLabel || "Get started",
    secondaryHref: altUrl(c),
    secondaryLabel: `Why teams switch from ${c.name}`,
  })}
<div class="wrap alt-body">
  <h2>Why there’s no “Connect your account” button</h2>
  <p>${escapeHtml(imp.noConnect)}</p>
  <h2>Exporting from ${escapeHtml(c.name)}</h2>
  <ol class="alt-steps">${steps}</ol>
  ${imp.exportNote ? `<p class="alt-note">${escapeHtml(imp.exportNote)}</p>` : ""}
  <h2>Once you have the files</h2>
  <p>${escapeHtml(imp.after)}</p>
  <h3>Just doing this once?</h3>
  <p>${escapeHtml(imp.once)}</p>
  <h3>Making it the new default?</h3>
  <p>${escapeHtml(imp.reuse)}</p>
  <h2>Where your files end up</h2>
  <p>${escapeHtml(imp.where)}</p>
  <p><a href="${altUrl(c)}">Why teams switch from ${escapeHtml(c.name)} →</a></p>
  ${importAlso(c)}
  <div class="alt-footer-cta">
    <p>Have the export ready? Finish the move in a few minutes.</p>
    <a href="${escapeHtml(sector?.importCtaHref || "/app/login?start=1")}" class="nav-cta">${escapeHtml(sector?.importCtaLabel || "Continue")}</a>
  </div>
</div>`;
}

export function compareHubMainHtml(sectors) {
  const blocks = sectors
    .map((s) => {
      const cards = s.competitors
        .map(
          (c) => `<a class="cmp-row" href="${altUrl(c)}">
  <strong>${escapeHtml(c.name)}${c.hubHref ? "" : " alternative"}</strong>
  <span>${escapeHtml(c.sub)}</span>
</a>`
        )
        .join("");
      const imports = Array.isArray(s.hubImports)
        ? s.hubImports.map((x) => `<a href="${escapeHtml(x.href)}">${escapeHtml(x.label)}</a>`).join(" · ")
        : s.competitors
            .filter((c) => !c.hubHideImport && !c.customLanding)
            .map((c) => `<a href="${importUrl(c)}">Import from ${escapeHtml(c.name)}</a>`)
            .join(" · ");
      return `<section class="cmp-sector">
  <h2>${escapeHtml(s.hubTitle)}</h2>
  <p class="cmp-sector-lede">${escapeHtml(s.hubLede)}</p>
  <div class="cmp-grid">${cards}</div>
  ${imports ? `<p class="cmp-imports">${imports}</p>` : ""}
</section>`;
    })
    .join("\n");

  return `${hero({
    h1: "Compare docstoc",
    lede: "Pick the product you care about. Each competitor gets its own page — not a 40-row spreadsheet.",
    primaryHref: "/document-templates/",
    primaryLabel: "Start with free templates",
    secondaryHref: "/#compare",
    secondaryLabel: "Price calculator",
  })}
<div class="wrap alt-body cmp-hub">
  ${blocks}
</div>`;
}

export function writeLanding({ title, description, canonical, mainHtml, jsonLd, robots = "" }) {
  const extraHead = robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : "";
  return chrome({
    title,
    description,
    canonical,
    activeNav: "",
    mainHtml,
    jsonLd,
    depth: 0,
    extraHead,
  });
}

export { altUrl, importUrl };
