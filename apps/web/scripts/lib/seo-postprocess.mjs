/** Pure HTML passes run by generate-seo.mjs over every generated page. */

const SITE_SUFFIX = /\s+(?:\||—)\s+docstoc(?: Blog)?$/;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

/** Search results cut long titles anyway; the brand suffix is what can go first. */
export function fitTitle(html) {
  return html.replace(/<title>([^<]*)<\/title>/i, (full, title) => {
    if (title.length <= TITLE_MAX) return full;
    return `<title>${title.replace(SITE_SUFFIX, "")}</title>`;
  });
}

/** Cuts at the last sentence end that fits, otherwise the last word. Only the search snippet:
 *  og:description keeps the full text. */
export function fitDescription(html) {
  return html.replace(/(<meta\s+name="description"\s+content=")([^"]*)(")/i, (full, open, text, close) => {
    if (text.length <= DESCRIPTION_MAX) return full;
    const head = text.slice(0, DESCRIPTION_MAX);
    const sentence = head.lastIndexOf(". ");
    const cut = sentence >= 80 ? head.slice(0, sentence + 1) : head.slice(0, head.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "");
    return `${open}${cut}${close}`;
  });
}

/** Points internal links straight at a page's canonical URL, so link equity does not depend on
 *  a page that is left out of the sitemap. `canonicalByPath` holds only paths that differ. */
export function rewriteCanonicalLinks(html, canonicalByPath) {
  return html.replace(/href="(?:https:\/\/docstoc\.io)?(\/[^"#?]*)"/g, (full, path) => {
    const target = canonicalByPath.get(path);
    return target ? `href="${target}"` : full;
  });
}

/** `git log --format=@%cs --name-only` output, newest first → path to last commit date. */
export function parseGitLastmods(log) {
  const dates = new Map();
  let date = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("@")) date = line.slice(1).trim();
    else if (line.trim() && date && !dates.has(line.trim())) dates.set(line.trim(), date);
  }
  return dates;
}
