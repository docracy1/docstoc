#!/usr/bin/env node
/**
 * SOX SEO landers (EN + ES): keyword use-cases, competitor alts, AR SOX hub.
 * Hand-maintained content written every build so deploys stay discoverable.
 * Run: node apps/web/scripts/generate-sox-seo-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page({
  lang,
  path,
  altPath,
  title,
  description,
  keywords,
  h1,
  lede,
  eyebrow,
  sections,
  faq,
  related,
  ctaPrimary,
  ctaSecondary,
}) {
  const origin = "https://docstoc.io";
  const canonical = `${origin}${path}`;
  const alt = `${origin}${altPath}`;
  const enHref = lang === "en" ? canonical : alt;
  const esHref = lang === "es" ? canonical : alt;
  const faqLd =
    faq?.length > 0
      ? {
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;
  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: lang === "es" ? "Inicio" : "Home", item: `${origin}${lang === "es" ? "/es/" : "/"}` },
        { "@type": "ListItem", position: 2, name: lang === "es" ? "SOX" : "SOX", item: `${origin}/compliance/sox` },
        { "@type": "ListItem", position: 3, name: h1, item: canonical },
      ],
    },
    {
      "@type": "WebPage",
      name: h1,
      url: canonical,
      description,
      inLanguage: lang === "es" ? "es" : "en",
      isPartOf: { "@type": "WebSite", name: "docstoc", url: origin },
    },
  ];
  if (faqLd) graph.push(faqLd);

  const sectionHtml = sections
    .map((s) => {
      const body = s.bullets
        ? `<ul style="font-size:16px;line-height:1.85;color:#374151;padding-left:20px;">${s.bullets
            .map((b) => `<li>${b}</li>`)
            .join("")}</ul>`
        : `<p style="font-size:16px;line-height:1.7;color:#374151;">${s.body}</p>`;
      return `<section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin-bottom:24px;">
  <h2 style="font-size:22px;font-weight:700;margin-bottom:12px;">${esc(s.h2)}</h2>
  ${body}
</section>`;
    })
    .join("\n");

  const faqHtml = faq?.length
    ? `<section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin-bottom:24px;">
  <h2 style="font-size:22px;font-weight:700;margin-bottom:14px;">FAQ</h2>
  ${faq
    .map(
      (f) => `<h3 style="font-size:17px;margin:0 0 6px;">${esc(f.q)}</h3>
  <p style="font-size:15px;color:#4b5563;line-height:1.65;margin-bottom:14px;">${esc(f.a)}</p>`
    )
    .join("\n")}
</section>`
    : "";

  const relatedHtml = `<section style="margin-bottom:40px;">
  <h2 style="font-size:20px;font-weight:700;margin-bottom:14px;">${lang === "es" ? "Relacionado" : "Related"}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
    ${related
      .map(
        (r) =>
          `<a href="${esc(r.href)}" style="display:block;padding:14px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;color:inherit;"><strong style="display:block;font-size:15px;">${esc(r.title)}</strong><span style="font-size:13px;color:#6b7280;">${esc(r.sub)}</span></a>`
      )
      .join("")}
  </div>
</section>`;

  const home = lang === "es" ? "../../es/" : lang === "en" && path.startsWith("/es/") ? "/" : path.includes("/use-cases/") ? "../" : "/";
  const css = path.includes("/use-cases/") || path.startsWith("/es/use-cases/")
    ? (lang === "es" ? "../../site.css?v=20260905sox" : "../site.css?v=20260905sox")
    : path.startsWith("/es/")
      ? "../site.css?v=20260905sox"
      : "/site.css?v=20260905sox";
  const favicon = path.includes("/use-cases/") || path.startsWith("/es/use-cases/")
    ? (lang === "es" ? "../../favicon.png" : "../favicon.png")
    : path.startsWith("/es/")
      ? "../favicon.png"
      : "/favicon.png";
  const logo = path.includes("/use-cases/") || path.startsWith("/es/use-cases/")
    ? (lang === "es" ? "../../brand/docstoc-icon.png" : "../brand/docstoc-icon.png")
    : path.startsWith("/es/")
      ? "../brand/docstoc-icon.png"
      : "/brand/docstoc-icon.png";
  const js = path.includes("/use-cases/") || path.startsWith("/es/use-cases/")
    ? (lang === "es" ? "../../site.js?v=20260905sox" : "../site.js?v=20260905sox")
    : path.startsWith("/es/")
      ? "../site.js?v=20260905sox"
      : "/site.js?v=20260905sox";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${enHref}">
<link rel="alternate" hreflang="es" href="${esHref}">
<link rel="alternate" hreflang="x-default" href="${enHref}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="docstoc">
<meta property="og:locale" content="${lang === "es" ? "es_ES" : "en_US"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://docstoc.io/brand/og/docstoc-og-1200x630.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="keywords" content="${esc(keywords)}">
<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)}
</script>
<link rel="icon" href="${favicon}" type="image/png">
<link rel="stylesheet" href="${css}">
</head>
<body>
<header class="site-header">
  <div class="wrap site-header-inner">
    <a href="${lang === "es" ? "/es/" : "/"}" class="logo" aria-label="docstoc home"><img class="logo-mark" src="${logo}" alt="" width="28" height="28" /><span class="logo-word">docstoc</span></a>
    <nav class="header-nav-right">
      <a href="/compliance/sox" class="header-nav-link header-nav-collapse">SOX</a>
      <a href="${lang === "es" ? "/es/use-cases/sox-reporting" : "/use-cases/sox-reporting"}" class="header-nav-link header-nav-collapse">${lang === "es" ? "Informes SOX" : "SOX reporting"}</a>
      <a href="/compare/" class="header-nav-link header-nav-collapse">${lang === "es" ? "Comparar" : "Compare"}</a>
      <a href="/app/sox-reporting" class="nav-cta">${ctaPrimary}</a>
    </nav>
  </div>
</header>
<main class="wrap page-main">
<article>
  <div style="margin-bottom:36px;text-align:center;">
    <span style="font-size:13px;font-weight:700;text-transform:uppercase;color:var(--accent,#F58025);letter-spacing:0.05em;">${esc(eyebrow)}</span>
    <h1 style="font-family:'Fraunces',serif;font-size:36px;font-weight:700;margin:12px 0 16px;">${esc(h1)}</h1>
    <p style="font-size:18px;color:#4b5563;line-height:1.6;max-width:760px;margin:0 auto;">${esc(lede)}</p>
    <p style="margin-top:22px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
      <a href="/app/sox-reporting" style="display:inline-block;padding:12px 24px;background:#F58025;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">${esc(ctaPrimary)}</a>
      <a href="${esc(ctaSecondary.href)}" style="display:inline-block;padding:12px 24px;border:1px solid #d8dee8;border-radius:8px;text-decoration:none;font-weight:600;color:#1B3155;">${esc(ctaSecondary.label)}</a>
    </p>
  </div>
  ${sectionHtml}
  ${faqHtml}
  ${relatedHtml}
</article>
</main>
<footer class="site-footer">
  <div class="wrap site-footer-inner">
    <div class="site-footer-brand">
      <a href="${lang === "es" ? "/es/" : "/"}" class="logo" aria-label="docstoc home"><img class="logo-mark" src="${logo}" alt="" width="24" height="24" /><span class="logo-word">docstoc</span></a>
      <p>${lang === "es" ? "La capa de automatización de confianza para negocios modernos." : "The Trust Automation Layer for Modern Business."}</p>
    </div>
  </div>
  <div class="site-footer-bottom">© 2026 docstoc — a product of RELACON GmbH</div>
</footer>
<script src="${js}" defer></script>
</body>
</html>
`;
}

const relatedEn = [
  { href: "/use-cases/sox-reporting", title: "SOX reporting →", sub: "Dashboard readiness and auditor packs." },
  { href: "/use-cases/auditor-evidence-pack", title: "Auditor packs →", sub: "HTML + SHA-256 + OpenTimestamps." },
  { href: "/compliance/sox", title: "SOX compliance →", sub: "Framework overview." },
  { href: "/compare/", title: "Compare →", sub: "Workiva, FloQast, AuditBoard, Hyperproof." },
  { href: "/workiva-alternative", title: "vs Workiva →", sub: "AR SOX without a reporting suite." },
  { href: "/floqast-alternative", title: "vs FloQast →", sub: "Collections ICFR next to close." },
];

const relatedEs = [
  { href: "/es/use-cases/sox-reporting", title: "Informes SOX →", sub: "Panel y packs de auditor." },
  { href: "/es/use-cases/auditor-evidence-pack", title: "Packs de auditor →", sub: "HTML + SHA-256 + OpenTimestamps." },
  { href: "/compliance/sox", title: "Cumplimiento SOX →", sub: "Visión del marco." },
  { href: "/compare/", title: "Comparar →", sub: "Workiva, FloQast, AuditBoard, Hyperproof." },
  { href: "/es/workiva-alternative", title: "vs Workiva →", sub: "SOX AR sin suite de reporting." },
  { href: "/es/floqast-alternative", title: "vs FloQast →", sub: "ICFR de cobros junto al cierre." },
];

const keywordPages = [
  {
    slug: "maker-checker-invoice-chase",
    en: {
      title: "Maker-Checker for Invoice Chase Sends | docstoc",
      description:
        "Maker-checker (segregation of duties) for AR invoice chase: requester cannot approve their own send. Business plan SOX reporting with attributable approvals.",
      keywords: "maker checker invoice, segregation of duties collections, SOX maker checker AR, dual control chase send",
      h1: "Maker-checker for invoice chase sends",
      lede: "Require a second teammate before Mark as sent. The requester cannot approve their own chase — logged for auditors on Business.",
      eyebrow: "Use case / SOX",
      sections: [
        {
          h2: "Why makers and checkers matter for AR",
          body: "SOX ICFR expects dual control on actions that affect financial reporting evidence. Invoice chase sends are often informal — docstoc makes the approval chain explicit without auto-emailing customers.",
        },
        {
          h2: "What you get",
          bullets: [
            "<strong>SoD toggle</strong> — require approval before Mark as sent",
            "<strong>Requester ≠ approver</strong> — enforced in the API",
            "<strong>Email notify</strong> — teammates get a request to review",
            "<strong>One-time consume</strong> — an approval cannot be reused after send",
            "<strong>Audit log</strong> — every request and decision is attributable",
          ],
        },
      ],
      faq: [
        {
          q: "Does docstoc auto-send chase emails after approval?",
          a: "No. You always send from your own inbox. Maker-checker gates Mark as sent / send-like events so the audit trail is dual-controlled.",
        },
        {
          q: "Which plan includes maker-checker?",
          a: "Business ($39.99/mo). Enable it under SOX reporting → Retention & SoD.",
        },
      ],
    },
    es: {
      title: "Maker-checker para envíos de cobro de facturas | docstoc",
      description:
        "Maker-checker (segregación de funciones) para cobros AR: quien solicita no puede aprobar su propio envío. Informes SOX en plan Business.",
      keywords: "maker checker facturas, segregación de funciones cobros, SOX AR, doble control envío",
      h1: "Maker-checker para envíos de cobro",
      lede: "Exige un segundo compañero antes de Marcar como enviado. Quien solicita no puede aprobarse a sí mismo — registrado para auditores en Business.",
      eyebrow: "Caso de uso / SOX",
      sections: [
        {
          h2: "Por qué importa en AR",
          body: "SOX ICFR espera doble control en acciones que afectan la evidencia de reporting financiero. docstoc hace explícita la cadena de aprobación sin enviar emails automáticamente a clientes.",
        },
        {
          h2: "Qué incluye",
          bullets: [
            "<strong>SoD</strong> — aprobación antes de marcar enviado",
            "<strong>Solicitante ≠ aprobador</strong> — forzado en la API",
            "<strong>Aviso por email</strong> — el equipo recibe la solicitud",
            "<strong>Consumo único</strong> — la aprobación no se reutiliza tras el envío",
            "<strong>Pista de auditoría</strong> — cada decisión es atribuible",
          ],
        },
      ],
      faq: [
        {
          q: "¿docstoc envía el email tras aprobar?",
          a: "No. Siempre envías tú desde tu bandeja. El maker-checker controla Marcar como enviado para la evidencia.",
        },
        {
          q: "¿En qué plan está?",
          a: "Business ($39.99/mes). Actívalo en Informes SOX → Retención y SoD.",
        },
      ],
    },
  },
  {
    slug: "icfr-accounts-receivable",
    en: {
      title: "ICFR for Accounts Receivable Collections | docstoc",
      description:
        "ICFR-aligned AR collections evidence: attributable chase trails, maker-checker, control library period tests, and Bitcoin-timestamped auditor packs. Business plan.",
      keywords: "ICFR accounts receivable, SOX AR controls, ICFR collections evidence, AR internal controls",
      h1: "ICFR evidence for accounts receivable",
      lede: "Internal control over financial reporting needs proof for collections activity — who chased what, who approved sends, and that the period pack was not rewritten later.",
      eyebrow: "Use case / ICFR",
      sections: [
        {
          h2: "The AR control gap",
          body: "Close tools and GRC suites rarely capture day-to-day invoice chase evidence. Controllers still need attributable trails and dual control when auditors sample AR follow-ups.",
        },
        {
          h2: "docstoc AR ICFR slice",
          bullets: [
            "Seeded AR control library with period pass/fail/exception tests",
            "Actor email/role on chase events and SOX actions",
            "Daily Bitcoin-anchored hash chains",
            "Frozen auditor packs (HTML + SHA-256 + .ots)",
            "Retention window, legal hold, optional purge",
          ],
        },
      ],
      faq: [
        {
          q: "Is this a full ICFR platform?",
          a: "No. It covers the AR collections evidence layer. Keep your GRC/close tools for entity-wide controls.",
        },
      ],
    },
    es: {
      title: "ICFR para cobros de cuentas por cobrar | docstoc",
      description:
        "Evidencia ICFR para cobros AR: pistas atribuibles, maker-checker, pruebas de controles y packs de auditor con timestamp Bitcoin. Plan Business.",
      keywords: "ICFR cuentas por cobrar, controles SOX AR, evidencia ICFR cobros",
      h1: "Evidencia ICFR para cuentas por cobrar",
      lede: "El control interno sobre reporting financiero necesita prueba de la actividad de cobros: quién cobró qué, quién aprobó envíos, y que el pack del periodo no se reescribió después.",
      eyebrow: "Caso de uso / ICFR",
      sections: [
        {
          h2: "El hueco en AR",
          body: "Las herramientas de cierre y GRC rara vez capturan el seguimiento diario de facturas. Los controladores siguen necesitando pistas atribuibles y doble control cuando el auditor muestrea cobros.",
        },
        {
          h2: "Qué cubre docstoc",
          bullets: [
            "Biblioteca de controles AR con pruebas de periodo",
            "Actor email/rol en eventos de cobro",
            "Anclajes diarios a Bitcoin",
            "Packs de auditor congelados (HTML + SHA-256 + .ots)",
            "Retención, legal hold y purge opcional",
          ],
        },
      ],
      faq: [
        {
          q: "¿Es una plataforma ICFR completa?",
          a: "No. Cubre la capa de evidencia de cobros AR. Mantén tu GRC/cierre para el resto.",
        },
      ],
    },
  },
  {
    slug: "segregation-of-duties-collections",
    en: {
      title: "Segregation of Duties for Invoice Collections | docstoc",
      description:
        "Segregation of duties (SoD) for invoice collections: Admin/Member roles plus maker-checker on chase sends. SOX reporting on Business.",
      keywords: "segregation of duties collections, SoD accounts receivable, SOX SoD invoice chase",
      h1: "Segregation of duties for collections",
      lede: "Separate who drafts/requests a chase from who approves Mark as sent — with workspace roles and a full approval history for auditors.",
      eyebrow: "Use case / SoD",
      sections: [
        {
          h2: "SoD without a GRC rollout",
          body: "You do not need AuditBoard to enforce dual control on AR chase sends. Enable SoD in SOX reporting, invite a teammate, and every approval is logged.",
        },
        {
          h2: "Controls in product",
          bullets: [
            "Workspace Admin vs Member",
            "Maker-checker on send (optional)",
            "Pending approvals queue in SOX reporting",
            "Request approval from the chase card",
            "Consumed after successful send",
          ],
        },
      ],
      faq: [
        {
          q: "Can one person approve their own send?",
          a: "No — when SoD is on, the API rejects self-approval.",
        },
      ],
    },
    es: {
      title: "Segregación de funciones para cobros de facturas | docstoc",
      description:
        "Segregación de funciones (SoD) para cobros: roles Admin/Miembro y maker-checker en envíos. Informes SOX en Business.",
      keywords: "segregación de funciones cobros, SoD cuentas por cobrar, SOX SoD",
      h1: "Segregación de funciones para cobros",
      lede: "Separa quién redacta/solicita un cobro de quién aprueba Marcar como enviado — con roles y historial de aprobaciones para auditores.",
      eyebrow: "Caso de uso / SoD",
      sections: [
        {
          h2: "SoD sin un despliegue GRC",
          body: "No necesitas AuditBoard para doble control en envíos de cobro. Activa SoD, invita a un compañero y cada aprobación queda registrada.",
        },
        {
          h2: "En el producto",
          bullets: [
            "Admin vs Miembro",
            "Maker-checker opcional",
            "Cola de aprobaciones en Informes SOX",
            "Solicitar aprobación desde la tarjeta de cobro",
            "Consumo tras envío exitoso",
          ],
        },
      ],
      faq: [
        {
          q: "¿Puede uno aprobarse a sí mismo?",
          a: "No — con SoD activo, la API rechaza la autoaprobación.",
        },
      ],
    },
  },
];

const hubEn = {
  path: "/accounts-receivable-sox",
  altPath: "/es/accounts-receivable-sox",
  title: "Accounts Receivable SOX Reporting Software | docstoc",
  description:
    "AR SOX reporting software for collections: maker-checker, ICFR trails, control tests, and Bitcoin-timestamped auditor packs. Business plan — not a full GRC suite.",
  keywords:
    "accounts receivable SOX, AR SOX software, SOX collections reporting, invoice chase audit trail, OpenTimestamps auditor pack",
  h1: "Accounts receivable SOX reporting",
  lede: "The searchable home for docstoc AR SOX: dual-control chase sends, attributable evidence, and auditor packs anyone can verify without trusting our database.",
  eyebrow: "SOX / Accounts receivable",
  sections: [
    {
      h2: "Built for controllers and AR leads",
      body: "When auditors ask who approved overdue follow-ups, open SOX reporting — Ready/Partial/Missing controls, SoD queue, control library tests, and Create timestamped pack.",
    },
    {
      h2: "SEO map — start here",
      bullets: [
        '<a href="/use-cases/sox-reporting">SOX reporting use case</a> — dashboard walkthrough',
        '<a href="/use-cases/maker-checker-invoice-chase">Maker-checker</a> — dual control on send',
        '<a href="/use-cases/icfr-accounts-receivable">ICFR for AR</a> — control framing',
        '<a href="/use-cases/segregation-of-duties-collections">SoD collections</a> — roles + approvals',
        '<a href="/use-cases/auditor-evidence-pack">Auditor evidence pack</a> — HTML + .sha256 + .ots',
        '<a href="/compare/">Compare</a> — vs Workiva, FloQast, AuditBoard, Hyperproof',
      ],
    },
  ],
  faq: [
    {
      q: "Who is this for?",
      a: "Finance teams that chase overdue invoices and need ICFR-friendly evidence — without buying a full GRC platform.",
    },
    {
      q: "How do I get the auditor file?",
      a: "SOX reporting → Evidence & exports → Create timestamped pack. Send HTML + SHA-256 + .ots together.",
    },
  ],
};

const hubEs = {
  path: "/es/accounts-receivable-sox",
  altPath: "/accounts-receivable-sox",
  title: "Software de informes SOX para cuentas por cobrar | docstoc",
  description:
    "Informes SOX de AR para cobros: maker-checker, pistas ICFR, pruebas de control y packs de auditor con timestamp Bitcoin. Plan Business.",
  keywords: "SOX cuentas por cobrar, software SOX AR, informes cobros SOX, pista auditoría facturas",
  h1: "Informes SOX para cuentas por cobrar",
  lede: "El punto de entrada SEO de docstoc para SOX AR: envíos con doble control, evidencia atribuible y packs que el auditor verifica sin confiar en nuestra base de datos.",
  eyebrow: "SOX / Cuentas por cobrar",
  sections: [
    {
      h2: "Para controladores y cobros",
      body: "Cuando el auditor pregunta quién aprobó los seguimientos, abre Informes SOX: controles Ready/Partial/Missing, cola SoD, biblioteca de controles y Crear pack con timestamp.",
    },
    {
      h2: "Mapa de páginas",
      bullets: [
        '<a href="/es/use-cases/sox-reporting">Informes SOX</a>',
        '<a href="/es/use-cases/maker-checker-invoice-chase">Maker-checker</a>',
        '<a href="/es/use-cases/icfr-accounts-receivable">ICFR AR</a>',
        '<a href="/es/use-cases/segregation-of-duties-collections">SoD cobros</a>',
        '<a href="/es/use-cases/auditor-evidence-pack">Pack de auditor</a>',
        '<a href="/compare/">Comparar</a>',
      ],
    },
  ],
  faq: [
    {
      q: "¿Para quién es?",
      a: "Equipos de finanzas que cobran facturas vencidas y necesitan evidencia ICFR sin un GRC completo.",
    },
  ],
};

const competitors = [
  {
    slug: "workiva-alternative",
    enName: "Workiva",
    en: {
      title: "Workiva Alternative for AR SOX Evidence | docstoc",
      description:
        "Need SOX-ready AR chase evidence without Workiva? docstoc Business: maker-checker, attributable trails, Bitcoin-timestamped auditor packs.",
      h1: "Workiva alternative for AR SOX evidence",
      lede: "Workiva is connected reporting and SOX workpapers. docstoc is the AR chase evidence slice auditors can verify independently.",
    },
    es: {
      title: "Alternativa a Workiva para evidencia SOX AR | docstoc",
      description:
        "¿Evidencia SOX de cobros AR sin Workiva? docstoc Business: maker-checker, pistas atribuibles y packs con timestamp Bitcoin.",
      h1: "Alternativa a Workiva para evidencia SOX AR",
      lede: "Workiva es reporting conectado y papeles SOX. docstoc es la capa de evidencia de cobros AR que el auditor puede verificar de forma independiente.",
    },
  },
  {
    slug: "floqast-alternative",
    enName: "FloQast",
    en: {
      title: "FloQast Alternative for Collections SOX Evidence | docstoc",
      description:
        "FloQast owns the close. docstoc covers AR chase SOX evidence: SoD, trails, and timestamped auditor packs on Business.",
      h1: "FloQast alternative for collections SOX evidence",
      lede: "Keep FloQast for close checklists. Add docstoc for attributable chase activity and Bitcoin-anchored auditor files.",
    },
    es: {
      title: "Alternativa a FloQast para evidencia SOX de cobros | docstoc",
      description:
        "FloQast cubre el cierre. docstoc cubre evidencia SOX de cobros AR: SoD, pistas y packs con timestamp en Business.",
      h1: "Alternativa a FloQast para evidencia SOX de cobros",
      lede: "Mantén FloQast para el cierre. Añade docstoc para actividad de cobro atribuible y archivos de auditor anclados a Bitcoin.",
    },
  },
  {
    slug: "auditboard-sox-alternative",
    enName: "AuditBoard",
    en: {
      title: "AuditBoard SOX Alternative for AR Evidence | docstoc",
      description:
        "AuditBoard is GRC. docstoc is AR SOX evidence: maker-checker chase sends, attributable logs, OpenTimestamps auditor packs — Business.",
      h1: "AuditBoard alternative for AR SOX reporting",
      lede: "Use AuditBoard for the SOX program. Use docstoc when the gap is invoice chase controls and a verifiable period pack.",
    },
    es: {
      title: "Alternativa AuditBoard SOX para evidencia AR | docstoc",
      description:
        "AuditBoard es GRC. docstoc es evidencia SOX AR: maker-checker, logs atribuibles y packs OpenTimestamps — Business.",
      h1: "Alternativa a AuditBoard para informes SOX AR",
      lede: "Usa AuditBoard para el programa SOX. Usa docstoc cuando el hueco son controles de cobro y un pack de periodo verificable.",
    },
  },
  {
    slug: "hyperproof-sox-alternative",
    enName: "Hyperproof",
    en: {
      title: "Hyperproof SOX Alternative for Invoice Chase Evidence | docstoc",
      description:
        "Hyperproof runs compliance programs. docstoc Business delivers AR SOX reporting: SoD, trails, and Bitcoin-timestamped auditor packs.",
      h1: "Hyperproof alternative for invoice chase SOX evidence",
      lede: "Keep Hyperproof for program tasks. Add docstoc for live AR chase evidence and frozen auditor packs.",
    },
    es: {
      title: "Alternativa Hyperproof SOX para evidencia de cobros | docstoc",
      description:
        "Hyperproof gestiona programas de compliance. docstoc Business entrega informes SOX AR: SoD, pistas y packs con timestamp Bitcoin.",
      h1: "Alternativa a Hyperproof para evidencia SOX de cobros",
      lede: "Mantén Hyperproof para el programa. Añade docstoc para evidencia viva de cobros y packs de auditor congelados.",
    },
  },
];

let n = 0;

for (const kp of keywordPages) {
  const enPath = `/use-cases/${kp.slug}`;
  const esPath = `/es/use-cases/${kp.slug}`;
  mkdirSync(join(publicDir, "use-cases"), { recursive: true });
  mkdirSync(join(publicDir, "es/use-cases"), { recursive: true });
  writeFileSync(
    join(publicDir, `use-cases/${kp.slug}.html`),
    page({
      lang: "en",
      path: enPath,
      altPath: esPath,
      ...kp.en,
      related: relatedEn,
      ctaPrimary: "Open SOX reporting",
      ctaSecondary: { href: "/accounts-receivable-sox", label: "AR SOX hub →" },
    }),
    "utf8"
  );
  writeFileSync(
    join(publicDir, `es/use-cases/${kp.slug}.html`),
    page({
      lang: "es",
      path: esPath,
      altPath: enPath,
      ...kp.es,
      related: relatedEs,
      ctaPrimary: "Abrir informes SOX",
      ctaSecondary: { href: "/es/accounts-receivable-sox", label: "Hub SOX AR →" },
    }),
    "utf8"
  );
  n += 2;
}

writeFileSync(
  join(publicDir, "accounts-receivable-sox.html"),
  page({
    lang: "en",
    ...hubEn,
    related: relatedEn,
    ctaPrimary: "Open SOX reporting",
    ctaSecondary: { href: "/use-cases/sox-reporting", label: "Use case →" },
  }),
  "utf8"
);
mkdirSync(join(publicDir, "es"), { recursive: true });
writeFileSync(
  join(publicDir, "es/accounts-receivable-sox.html"),
  page({
    lang: "es",
    ...hubEs,
    related: relatedEs,
    ctaPrimary: "Abrir informes SOX",
    ctaSecondary: { href: "/es/use-cases/sox-reporting", label: "Caso de uso →" },
  }),
  "utf8"
);
n += 2;

for (const c of competitors) {
  const enPath = `/${c.slug}`;
  const esPath = `/es/${c.slug}`;
  const enSections = [
    {
      h2: `${c.enName} vs docstoc (AR SOX)`,
      bullets: [
        "<strong>Scope</strong> — they run broad close/GRC; we prove AR chase evidence.",
        "<strong>Maker-checker</strong> — dual control before Mark as sent on Business.",
        "<strong>Tamper evidence</strong> — daily anchors + OpenTimestamps auditor packs.",
        "<strong>Price</strong> — Business $39.99/mo for this slice, not a seat-heavy GRC rollout.",
      ],
    },
    {
      h2: "What ships on Business",
      bullets: [
        "SOX reporting dashboard",
        "Control library + period tests",
        "Timestamped auditor packs (HTML + SHA-256 + .ots)",
        "Retention / legal hold",
      ],
    },
  ];
  const esSections = [
    {
      h2: `${c.enName} vs docstoc (SOX AR)`,
      bullets: [
        "<strong>Alcance</strong> — ellos cubren cierre/GRC; nosotros evidencia de cobros AR.",
        "<strong>Maker-checker</strong> — doble control antes de Marcar como enviado.",
        "<strong>Prueba de integridad</strong> — anclajes diarios + packs OpenTimestamps.",
        "<strong>Precio</strong> — Business $39.99/mes para esta capa.",
      ],
    },
  ];
  writeFileSync(
    join(publicDir, `${c.slug}.html`),
    page({
      lang: "en",
      path: enPath,
      altPath: esPath,
      title: c.en.title,
      description: c.en.description,
      keywords: `${c.enName} alternative, SOX reporting, AR SOX, maker checker, auditor pack`,
      h1: c.en.h1,
      lede: c.en.lede,
      eyebrow: "Compare / SOX",
      sections: enSections,
      faq: [
        {
          q: `Is docstoc a full ${c.enName} replacement?`,
          a: `No. Keep ${c.enName} for its core job. Use docstoc for AR chase SOX evidence and timestamped auditor packs.`,
        },
      ],
      related: relatedEn,
      ctaPrimary: "Open SOX reporting",
      ctaSecondary: { href: "/accounts-receivable-sox", label: "AR SOX hub →" },
    }),
    "utf8"
  );
  writeFileSync(
    join(publicDir, `es/${c.slug}.html`),
    page({
      lang: "es",
      path: esPath,
      altPath: enPath,
      title: c.es.title,
      description: c.es.description,
      keywords: `alternativa ${c.enName}, informes SOX, SOX AR, maker checker`,
      h1: c.es.h1,
      lede: c.es.lede,
      eyebrow: "Comparar / SOX",
      sections: esSections,
      faq: [
        {
          q: `¿docstoc sustituye a ${c.enName}?`,
          a: `No. Mantén ${c.enName} para su trabajo principal. Usa docstoc para evidencia SOX de cobros AR y packs de auditor.`,
        },
      ],
      related: relatedEs,
      ctaPrimary: "Abrir informes SOX",
      ctaSecondary: { href: "/es/accounts-receivable-sox", label: "Hub SOX AR →" },
    }),
    "utf8"
  );
  n += 2;
}

console.log(`Generated ${n} SOX SEO pages (EN+ES keyword, hub, competitors).`);
