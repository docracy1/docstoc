/**
 * Jurisdiction and review status for document templates (/document-templates/<slug>).
 *
 * Both are derived only from facts we actually have:
 * - Jurisdiction comes from the template's own text. A template is labelled "United States, federal law"
 *   only when its text names a US federal law, rule or citation from FEDERAL_LAWS; it is labelled
 *   "UK and Commonwealth style" only when its own text says it follows that format (UK_STYLE, with the
 *   sentence that says so). Everything else is "General", with the instruction to check it against the
 *   reader's state law. No template is ever assigned to a single US state.
 * - The review date is the last change to the template's text in git (scripts/data/template-revisions.json,
 *   written by scripts/build-template-revisions.mjs). It is shown only when the stored content hash still
 *   matches the template, so an edited template without a refreshed snapshot shows no date rather than a
 *   wrong one. There is no record of a legal review, and the notice says so.
 */
import { createHash } from "node:crypto";

/** US federal laws and rules, matched case-sensitively against the template's own name, description and body.
 *  `legislation` is the schema.org Legislation name; set only where the text names an actual act. */
export const FEDERAL_LAWS = [
  { key: "hipaa", label: "HIPAA", legislation: "Health Insurance Portability and Accountability Act (HIPAA)", pattern: /\bHIPAA\b/ },
  { key: "fcra", label: "FCRA", legislation: "Fair Credit Reporting Act (FCRA)", pattern: /\bFCRA\b|Fair Credit Reporting Act/ },
  { key: "fdcpa", label: "FDCPA", legislation: "Fair Debt Collection Practices Act (FDCPA)", pattern: /\bFDCPA\b|Fair Debt Collection Practices Act/ },
  { key: "cobra", label: "COBRA", legislation: "Consolidated Omnibus Budget Reconciliation Act (COBRA)", pattern: /\bCOBRA\b/ },
  { key: "fmla", label: "FMLA", legislation: "Family and Medical Leave Act (FMLA)", pattern: /\bFMLA\b|Family and Medical Leave Act/ },
  { key: "flsa", label: "FLSA", legislation: "Fair Labor Standards Act (FLSA)", pattern: /\bFLSA\b|Fair Labor Standards Act/ },
  { key: "erisa", label: "ERISA", legislation: "Employee Retirement Income Security Act (ERISA)", pattern: /\bERISA\b/ },
  { key: "osha", label: "OSHA", legislation: "Occupational Safety and Health Act (OSHA)", pattern: /\bOSHA\b/ },
  { key: "owbpa", label: "Older Workers Benefit Protection Act", legislation: "Older Workers Benefit Protection Act", pattern: /Older Workers Benefit Protection Act|\bOWBPA\b/ },
  { key: "ada", label: "ADA", legislation: "Americans with Disabilities Act (ADA)", pattern: /\bADA\b|Americans with Disabilities Act/ },
  { key: "title-vii", label: "Title VII", legislation: "Title VII of the Civil Rights Act of 1964", pattern: /\bTitle VII\b/ },
  { key: "fair-housing", label: "Fair Housing Act", legislation: "Fair Housing Act", pattern: /Fair Housing Act/ },
  { key: "respa", label: "RESPA", legislation: "Real Estate Settlement Procedures Act (RESPA)", pattern: /\bRESPA\b/ },
  { key: "copyright-act", label: "U.S. Copyright Act", legislation: "Copyright Act of 1976", pattern: /U\.S\. Copyright Act|US Copyright Act/ },
  { key: "irs", label: "IRS rules (Internal Revenue Code)", legislation: "Internal Revenue Code", pattern: /\bIRS\b|Internal Revenue Code|\bIRC\b|\b1031 (?:like-kind )?exchange/ },
  { key: "securities", label: "SEC rules (federal securities law)", legislation: null, pattern: /\bSEC\b|Securities Act|Regulation D\b/ },
  { key: "immigration", label: "USCIS and H-1B rules", legislation: null, pattern: /\bUSCIS\b|\bH-1B\b/ },
];

/** Statute citations written into a template ("17 U.S.C. § 204", "45 CFR 164.508"), shown as written. */
const CITATION_PATTERN = /\b\d+ U\.S\.C\. §\s?\d+[a-z]?\b|\b\d+ CFR \d+(?:\.\d+)?\b/g;

/** Templates whose own text says they follow a UK/Commonwealth format. `evidence` must appear in the text. */
export const UK_STYLE = {
  "memorandum-of-association-template": "This document follows a UK/Commonwealth-style format",
  "deed-of-variation-template": "recognized primarily in the UK and some Commonwealth jurisdictions",
  "salary-sacrifice-arrangement-template": "common in UK/Commonwealth employment",
  "statutory-declaration-template": "commonly used in the UK, Australia, and Canada",
  "heads-of-agreement-template": "common in UK/Commonwealth M&A practice",
  "temporary-event-notice-template": "this term is used specifically in UK licensing law",
};

/** Templates where a law is named only as a skill or keyword, not as a rule the document follows. */
export const NOT_A_LEGAL_REFERENCE = {
  "pharmacy-technician-resume-template": "HIPAA appears only as a listed job skill",
};

export const GENERAL_LABEL = "General: not written for a specific state. Check it against your state's law before use.";
export const UK_LABEL = "UK and Commonwealth style, not written for US law. Check it against the law of your country before use.";

function templateText(t) {
  return `${t.name}\n${t.description}\n${t.bodyMarkdown}`;
}

/** @returns {{ kind: "us-federal" | "uk-style" | "general", laws: Array<{ label: string, legislation: string | null }>, evidence?: string }} */
export function templateJurisdiction(t) {
  const text = templateText(t);
  if (UK_STYLE[t.slug]) return { kind: "uk-style", laws: [], evidence: UK_STYLE[t.slug] };
  if (NOT_A_LEGAL_REFERENCE[t.slug]) return { kind: "general", laws: [] };
  const laws = FEDERAL_LAWS.filter((l) => l.pattern.test(text)).map((l) => ({ label: l.label, legislation: l.legislation }));
  for (const c of new Set(text.match(CITATION_PATTERN) || [])) laws.push({ label: c, legislation: null });
  if (laws.length) return { kind: "us-federal", laws };
  return { kind: "general", laws: [] };
}

export function jurisdictionLabel(j) {
  if (j.kind === "uk-style") return UK_LABEL;
  if (j.kind === "us-federal") {
    const names = j.laws.map((l) => l.label).join(", ");
    return `United States, federal law. The template refers to ${names}. It is not written for a specific state: check it against your state's law before use.`;
  }
  return GENERAL_LABEL;
}

/** Hash of the parts of a template a reader sees as its content. */
export function templateContentHash(t) {
  return createHash("sha256").update(templateText(t)).digest("hex").slice(0, 16);
}

/** The snapshot date, only if the snapshot still describes this exact template text. */
export function lastContentChange(t, revisions) {
  const rev = revisions?.[t.slug];
  if (!rev || rev.hash !== templateContentHash(t)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(rev.updated) ? rev.updated : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatUsDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Fields merged into the page's Article JSON-LD. */
export function legalStatusJsonLd(t, revisions) {
  const j = templateJurisdiction(t);
  const updated = lastContentChange(t, revisions);
  const out = {};
  if (updated) out.dateModified = updated;
  if (j.kind === "us-federal") {
    out.spatialCoverage = { "@type": "Country", name: "United States" };
    const mentions = j.laws
      .filter((l) => l.legislation)
      .map((l) => ({ "@type": "Legislation", name: l.legislation, legislationJurisdiction: "US" }));
    if (mentions.length) out.mentions = mentions;
  }
  return out;
}

/** Visible notice under the page intro. `escape` is the page's HTML escaper. */
export function legalStatusHtml(t, revisions, escape) {
  const j = templateJurisdiction(t);
  const updated = lastContentChange(t, revisions);
  const changed = updated
    ? `<time datetime="${updated}">${formatUsDate(updated)}</time>, from docstoc's version history.`
    : "No date on record.";
  return `<aside class="tpl-legal-status" aria-label="Jurisdiction and review status">
    <dl>
      <dt>Jurisdiction</dt>
      <dd>${escape(jurisdictionLabel(j))}</dd>
      <dt>Last change to the template text</dt>
      <dd>${changed}</dd>
      <dt>Legal review</dt>
      <dd>None on record. This template has not been checked against current ${j.kind === "uk-style" ? "law" : "federal or state law"}. This is general information, not legal advice: check it, or have an attorney check it, before you rely on it.</dd>
    </dl>
  </aside>`;
}
