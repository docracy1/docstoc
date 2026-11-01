/**
 * Content Security Policy with a nonce per response.
 *
 * public/_headers carries the static policy for every file. Its script-src names no 'unsafe-inline';
 * the middleware puts a fresh nonce into the header and onto every <script> of an HTML document
 * (HTMLRewriter), so the inline snippets of the static pages keep running while injected scripts
 * do not. Cloudflare adds the same nonce to scripts it injects itself (challenges, email
 * obfuscation) by reading the header.
 */

/** 128 random bits, base64: one nonce per response. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The policy with `'nonce-…'` added to script-src. A policy without script-src is returned as is. */
export function withScriptNonce(policy: string, nonce: string): string {
  return policy.replace(/(^|;\s*)script-src(\s|;|$)/, (match, lead, tail) => {
    const sep = tail === " " ? " " : "";
    return `${lead}script-src 'nonce-${nonce}'${sep}${tail === " " ? "" : tail}`;
  });
}

/** HTML gets nonces; everything else keeps the static header unchanged. */
export function isHtmlResponse(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return /^text\/html\b/i.test(type);
}

/** Adds the nonce to the policy header and to every script element of an HTML response. */
export function applyNonce(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  const policy = headers.get("content-security-policy");
  if (policy) headers.set("content-security-policy", withScriptNonce(policy, nonce));
  // A cached copy with yesterday's nonces must never be revalidated against a header with today's.
  headers.delete("etag");
  headers.delete("last-modified");
  const fresh = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  if (!response.body) return fresh;
  return new HTMLRewriter()
    .on("script", {
      element(el) {
        el.setAttribute("nonce", nonce);
      },
    })
    .transform(fresh);
}

/** Conditional request headers would let the asset layer answer 304 for a document whose nonces changed. */
export function withoutConditionalHeaders(request: Request): Request {
  if (!request.headers.has("if-none-match") && !request.headers.has("if-modified-since")) return request;
  const headers = new Headers(request.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  return new Request(request, { headers });
}

/** Paths that can serve an HTML document: no file extension, or .html. */
export function mayBeHtml(pathname: string): boolean {
  return !/\.[a-z0-9]+$/i.test(pathname) || /\.html?$/i.test(pathname);
}
