# docstoc

Paste your unpaid invoices. Get the follow-up email already written, in the right tone for how late it is.

**docstoc never emails your clients for you** — it drafts follow-ups you copy into Gmail, Outlook, or Apple Mail. Tone escalates with days overdue (friendly → firm → direct).

## Live URLs

| | URL |
|---|---|
| **Marketing** | https://docstoc.io/ |
| **App (Tool)** | https://docstoc.io/app/ |
| **Login** | https://docstoc.io/app/login |
| **Connector** | https://docstoc.io/app/connector |
| **Admin** | https://docstoc.io/app/admin |
| **API** | https://api.docstoc.io |
| **MCP** | https://api.docstoc.io/mcp — read-only tools public; `draft_chase_email` requires session or API key |

Worker `PUBLIC_APP_URL` is `https://docstoc.io` (magic links, OAuth callbacks, Stripe return URLs, digest links).

Legacy `chasa.io` / `api.chasa.io` **301** to docstoc (Pages `_middleware.ts` + worker redirect). See `scripts/oauth-redirect-uris.md` for provider console URIs.

**Go-live checklist**

1. Attach `docstoc.io` on Cloudflare Pages project `chasa` and wait for **Active**.
2. `www.docstoc.io` → apex: handled by `apps/web/functions/_middleware.ts` (redeploy web).
3. `chasa.io` / `www.chasa.io` → `docstoc.io`: same middleware.
4. `api.chasa.io` → `api.docstoc.io`: worker middleware in `apps/worker/src/lib/legacyHostRedirect.ts`.
5. Register OAuth redirect URIs on `api.docstoc.io` — see `scripts/oauth-redirect-uris.md`.
6. Optional DMARC: `./scripts/dmarc-remove-rua.sh` (removes `rua=` from `_dmarc.docstoc.io`).
7. Run `./scripts/go-live-verify.sh`.

The order does not matter: browser-facing links are built from the origin the request came in on (see “App origin resolution” below), so pages.dev and chasa.io both keep working whichever is deployed first.

### App origin resolution

Magic links, post-login redirects, Stripe return URLs and team invites use the origin the user is actually on, not `PUBLIC_APP_URL`. The Pages `/api` proxy forwards it as `X-Docstoc-App-Origin`, and the worker honours it only if it matches `lib/appUrl.ts`'s allowlist (`PUBLIC_APP_URL`, `docstoc.io`, `www.docstoc.io`, legacy `chasa.io` hosts, `*.pages.dev` project/preview hosts, localhost). This keeps preview deploys self-contained and makes the domain cutover zero-downtime.

Requests that arrive without a trusted origin — provider OAuth callbacks hitting `api.docstoc.io` directly, and the digest cron — still fall back to `PUBLIC_APP_URL`.

---

## Product specs

### Plans & pricing

| Plan | Price | AI drafts | Team seats | Notes |
|------|-------|-----------|------------|-------|
| **Free** | $0 | **5 / month** (server-enforced) | 1 (owner only) | No signup required for drafts; sign in to upgrade |
| **Pro** | **$14.99 / mo** | Unlimited | **5** (owner + invites) | Flat workspace fee — not per-seat; most popular |
| **Business** | **$39.99 / mo** | Unlimited | **20** | Smart reply, risk score, demand letters, cert branding, SSL automation |

Stripe price IDs live in `apps/worker/wrangler.toml` as `STRIPE_PRICE_SOLO` (maps to Pro), `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` (map to Business; non-secret). Billing portal and webhooks update `accounts.plan` and `is_paid`.

### Feature matrix (by plan)

| Feature | Free | Pro+ |
|---------|------|-------|
| AI chase email drafts (tone by days overdue) | 5/mo | Unlimited |
| 15+ copy-paste email templates (`/free-templates/`) | ✓ | ✓ |
| CSV invoice upload (Tool) | ✓ | ✓ |
| Manual invoice list + aging board (Tool) | ✓ | ✓ |
| Rewrite softer / firmer / shorter | — | ✓ |
| Thank-you, reply-to-client, 3-step sequence, SMS/WhatsApp drafts | — | ✓ |
| Clients CRM + contact notes | — | ✓ |
| Aging sync (Tool → server) | — | ✓ |
| Reminder calendar (planned chase dates) | — | ✓ |
| Chase timeline + mark sent/paid | — | ✓ |
| Daily chase digest email (9 AM Eastern, approve-to-send) | — | ✓ |
| Reminder snooze + stop when marked paid | — | ✓ |
| Email open/click tracking on tracked HTML | — | ✓ |
| Default payment link (Stripe, PayPal, Venmo, Zelle…) | — | ✓ |
| Zapier templates (FreshBooks, Wave, Zoho Books) | — | ✓ |
| Smart reply classifier + promised pay date detection | — | Business |
| Client payment risk score | — | Business |
| Formal demand letter + collections evidence pack | — | Business |
| Custom certificate branding + SSL automation | — | Business |
| Custom branding (logo, late-fee hint) | — | ✓ (admin role) |
| Outbound webhooks (`chase.drafted`, `chase.sent`, …) + HMAC signatures | — | ✓ (admin) |
| Click tracking (tracked copy HTML) | — | ✓ |
| Team invites (admin / member roles) | — | ✓ |
| Cloud storage PDF import (Dropbox, OneDrive, Box) | — | ✓ |
| QuickBooks Online + Xero overdue import | — | ✓ |
| HTTP API + API keys (`/api/v1/chase/draft`) | — | ✓ |
| Zapier / Make via API key | — | ✓ |

**Workspace roles:** owner is always admin. Invited members can use Pro+ features; **admin-only** actions: branding, webhooks, connector OAuth connect/import, API key CRUD, team invites.

### App routes (`/app/*`)

| Route | Purpose |
|-------|---------|
| `/` | Tool — invoice list, AI drafts, CSV/PDF import, multi-select batch |
| `/login` | Magic-link login + Cloudflare Turnstile |
| `/account` | Plan, billing portal, payment link |
| `/team` | Invite members, roles (Pro+) |
| `/clients` | Client CRM (Pro+) |
| `/branding` | Logo + late-fee hint (workspace admin) |
| `/webhooks` | Outbound webhook URLs (workspace admin) |
| `/connector` | Cloud storage + QBO/Xero OAuth + API keys |
| `/admin` | Internal admin dashboard (separate cookie) |

All app routes except `/login` and `/admin` require a session. Unauthenticated users redirect to `/login`. SPA analytics require cookie consent (GDPR).

### i18n (EN + ES)

Same path as Docracy: lightweight catalogs in `apps/web/app/src/lib/i18n/` (no i18next). `LocaleProvider` + EN|ES switcher on login, sidebar, and More sheet. P1 covers login / shell / welcome; expand catalogs for the rest of the app next. Preference stored as `chasa_locale`. Marketing HTML stays English until a later pass.

### Marketing & SEO (static HTML in `apps/web/public/`)

- Homepage with pricing, FAQ JSON-LD, competitor comparison
- SEO landing pages: `/invoice-follow-up`, `/payment-reminder`, `/overdue-invoice`, `/chase-invoices`, `/freelancer-invoice-follow-up`
- `/features/` (index, AI tone, templates), `/docs/`, `/ai`, `/about`
- `/blog/` (3 articles + dynamic `post.html`)
- `/free-templates/` — 15 generated template pages + index
- Legal: `/privacy`, `/terms`, `/imprint`
- `sitemap.xml`, `robots.txt`, `404.html`, cookie consent, scroll-depth analytics
- Self-hosted fonts (no Google Fonts); enforcing CSP via `_headers`

Regenerate free templates after editing `apps/web/scripts/generate-free-templates.mjs`:

```bash
npm run generate:templates --workspace apps/web
```

---

## Architecture

Monorepo (npm workspaces):

| Package | Stack | Deploy target |
|---------|-------|---------------|
| `apps/web` | React 18 + Vite + React Router | Cloudflare Pages (`chasa`) |
| `apps/worker` | Hono + Cloudflare Workers + D1 + Workers AI | `api.chasa.io` |

```
apps/web/
  app/              React SPA (/app/*) — lazy-loaded routes, AccountProvider
    src/pages/tool/     Tool module (components, CSV import, aging sync)
    src/pages/connector/ Connector module (OAuth, API keys)
  public/           Static marketing site + fonts + _headers
  scripts/          copy-fonts, generate-free-templates, validate-static-html

apps/worker/
  src/routes/       HTTP handlers (auth, billing, emails, aging, mcp, …)
  src/lib/          auth, ai, billing, schemas (Zod), rate limits, webhooks
  migrations/       D1 SQL (0001–0011)
```

**Data:** Cloudflare D1 (`chasa-db`). OAuth tokens encrypted at rest (AES-GCM, `TOKEN_SECRET`). Sessions in `sessions` table; magic links single-use (atomic consume).

**AI:** Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8`). Prompts wrap user content in delimiters to reduce injection.

### API surface (worker)

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Magic link request/verify, logout, Turnstile config |
| `/api/account` | Profile, branding |
| `/api` (emails) | `generate-email`, `rewrite-email`, `generate-thank-you`, `generate-reply`, `generate-sequence`, `generate-sms` |
| `/api/billing` | Stripe checkout, portal, webhook |
| `/api/aging` | Aging board CRUD + atomic batch sync |
| `/api/clients` | Client CRM |
| `/api/reminders` | Chase reminder calendar |
| `/api/team` | Workspace members + invites |
| `/api/webhooks` | Outbound webhook CRUD |
| `/api/connector` | Legacy API key CRUD |
| `/api/account/connectors` | Cloud + accounting OAuth |
| `/api/tracking` | Tracked copy + click stats |
| `/api/analytics` | Event track + pageview aggregates |
| `/api/v1/chase/draft` | Public HTTP API (Bearer `chasa_…` key) |
| `/api/admin` | Admin dashboard API |
| `/api/blog` | Public blog posts from D1 |
| `/api/csp-report` | CSP violation reports |
| `/mcp` | MCP JSON-RPC (draft tools, template list) |
| `/api/t/:id` | Click redirect (allowlisted URLs only) |

---

## Security & compliance (implemented)

- **Free-tier quota:** 5 AI drafts/month enforced in D1 (`ai_usage`), not client-side
- **Rate limits:** AI drafts, MCP, analytics, admin login (D1 buckets)
- **Turnstile:** fail-closed in production HTTPS when secret is set; 60s magic-link cooldown per email
- **HKDF token purposes:** separate keys for session, magic-link, API key, admin, invite, OAuth state, webhook signing (legacy hash fallback on lookup)
- **Session rotation:** prior sessions invalidated on magic-link login; admin sessions cleared on admin login
- **Session cleanup:** daily cron purges expired sessions, magic links, rate-limit buckets
- **RBAC:** workspace admin for branding, webhooks, connector OAuth, API keys, team invites
- **Input validation:** Zod schemas on all JSON API routes (auth, emails, clients, team, webhooks, billing, admin, MCP draft args)
- **Stripe webhooks:** event-id deduplication (`stripe_events`)
- **Outbound webhooks:** `X-Chasa-Signature: sha256=…` HMAC
- **Click tracking:** redirects only to URLs stored when the tracked email was created
- **Webhook URLs:** SSRF checks (no localhost / private IPs)
- **OAuth state:** timing-safe HMAC compare
- **CSP:** enforcing policy on Pages; `report-uri` → `/api/csp-report`
- **GDPR:** cookie consent gates SPA analytics; no visitor IDs on page views (aggregate only)
- **Secrets:** never committed — `wrangler secret put …`

---

## Local development

```bash
npm install
npm run dev:worker   # wrangler dev --local, http://127.0.0.1:8787
npm run dev:web      # vite, http://localhost:5173 (proxies /api to worker)
```

Without `RESEND_API_KEY`, magic links log to the worker console — copy the URL into your browser.

### Quality checks

```bash
npm run lint          # ESLint (web app + worker)
npm run test          # Vitest (schemas, crypto, dates)
npm run typecheck     # tsc worker + vite build web
```

CI (`.github/workflows/ci.yml`) runs lint → test → static HTML validation → typecheck on every PR; **auto-deploys worker + web on push to `main`** when `CLOUDFLARE_API_TOKEN` is set.

### Deploy manually

```bash
npm run deploy:worker
npm run deploy:web    # builds (copies fonts) then pages deploy
```

After schema changes:

```bash
cd apps/worker
wrangler d1 migrations apply chasa-db --local    # dev
wrangler d1 migrations apply chasa-db --remote   # production
```

Migrations `0001`–`0011` include plans, admin/analytics, branding, webhooks, API keys, cloud connectors, clients/aging, parity features, and security hardening (rate limits, AI usage, Stripe idempotency, tracking link allowlist).

---

## Cloudflare Turnstile (bot protection)

Protects `/api/auth/request` and admin login.

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Turnstile** → **Add widget**
2. Hostnames: `chasa-71s.pages.dev`, `chasa.io`, `localhost`
3. Site key → `TURNSTILE_SITE_KEY` in `wrangler.toml` `[vars]`
4. Secret → `wrangler secret put TURNSTILE_SECRET_KEY`
5. Redeploy worker. Login UI reads config from `GET /api/auth/config`.

**Local / without keys:** verification bypassed with console warning. Test keys:

| | Value |
|---|---|
| Site key | `1x00000000000000000000AA` |
| Secret key | `1x0000000000000000000000000000000AA` |

---

## One-time cloud setup

1. `cd apps/worker && wrangler d1 create chasa-db` — paste `database_id` into `wrangler.toml`
2. `wrangler d1 migrations apply chasa-db --remote`
3. **Stripe (test mode first):** create two recurring Prices (Pro $14.99, Business $39.99). Copy `price_…` IDs into `wrangler.toml`:
   - `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`
4. `wrangler secret put TOKEN_SECRET` — `openssl rand -hex 32`
5. `wrangler secret put STRIPE_SECRET_KEY` (test key first)
6. Stripe webhook → `https://api.chasa.io/api/billing/webhook` — events: `checkout.session.completed`, `customer.subscription.deleted` → `wrangler secret put STRIPE_WEBHOOK_SECRET`
7. `wrangler secret put RESEND_API_KEY` — verify sending domain in Resend
8. Turnstile — see above
9. `wrangler secret put ADMIN_PASSWORD` — for `/app/admin`
9a. **AI Document Generator (optional, public marketing tool):** [Google AI Studio](https://aistudio.google.com/apikey) → create a free API key → `wrangler secret put GEMINI_API_KEY`. Free tier is rate-limited; the worker also enforces its own per-IP limit + Turnstile. See `apps/worker/src/lib/geminiDocGen.ts`.
10. **Cloud storage OAuth (optional, Pro+):**

    | Provider | Redirect URI |
    |----------|--------------|
    | Dropbox | `https://api.docstoc.io/api/account/connectors/dropbox/callback` |
    | OneDrive | `https://api.docstoc.io/api/account/connectors/onedrive/callback` |
    | Box | `https://api.docstoc.io/api/account/connectors/box/callback` |
    | Google | `https://api.docstoc.io/api/account/connectors/google/callback` |

    Google Sign-In redirect: `https://api.docstoc.io/api/auth/google/callback`

    Step-by-step for each provider: [`scripts/connectors-docstoc-setup.md`](../scripts/connectors-docstoc-setup.md)

    ```bash
    wrangler secret put DROPBOX_CLIENT_ID
    wrangler secret put DROPBOX_CLIENT_SECRET
    wrangler secret put ONEDRIVE_CLIENT_ID
    wrangler secret put ONEDRIVE_CLIENT_SECRET
    wrangler secret put BOX_CLIENT_ID
    wrangler secret put BOX_CLIENT_SECRET
    wrangler secret put GOOGLE_LOGIN_CLIENT_SECRET
    wrangler secret put GOOGLE_INTEGRATIONS_CLIENT_SECRET
    ```

11. **QuickBooks Online + Xero (optional, Pro+):**

    | Provider | Redirect URI |
    |----------|--------------|
    | QBO | `https://api.docstoc.io/api/account/connectors/quickbooks/callback` |
    | Xero | `https://api.docstoc.io/api/account/connectors/xero/callback` |

    See [`scripts/connectors-docstoc-setup.md`](../scripts/connectors-docstoc-setup.md) for console steps.

    ```bash
    wrangler secret put QBO_CLIENT_ID
    wrangler secret put QBO_CLIENT_SECRET
    wrangler secret put XERO_CLIENT_ID
    wrangler secret put XERO_CLIENT_SECRET
    ```

12. Cloudflare Pages project `chasa` + custom domain `chasa.io`; Worker custom domain `api.chasa.io`
13. Switch to Stripe **live** keys/prices/webhook only after end-to-end test-mode smoke test

### Local secrets (`apps/worker/.dev.vars`, gitignored)

```
TOKEN_SECRET=dev-secret-not-for-prod
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_PASSWORD=your-dev-admin-password
# Optional Turnstile test keys (or omit to bypass):
# TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Optional — AI Document Generator tool returns 503 until set:
# GEMINI_API_KEY=your-google-ai-studio-key
```

Stripe CLI for local webhooks:

```bash
stripe listen --forward-to localhost:8787/api/billing/webhook
```

### Staging environment

```bash
wrangler deploy --env staging
```

Uses separate D1 (`chasa-db-staging`) — create and paste ID in `wrangler.toml` `[env.staging]`.

---

## SEO launch checklist

### Automated (build)

`generate-seo.mjs` runs on every `npm run build` and writes:

- `sitemap.xml` — all public pages (marketing, templates, blog)
- `robots.txt` — crawl rules + sitemap URL
- `blog/feed.xml` — RSS for blog posts
- `{indexnow-key}.txt` — IndexNow key file for Bing/Yandex
- Verification meta on `index.html` / `ai.html` when env vars are set (see below)

Press kit at [/press](https://chasa.io/press) — logos, boilerplate, suggested anchor text for backlinks.

### Google Search Console (one-time)

1. Add property `https://chasa.io` at [Search Console](https://search.google.com/search-console)
2. Choose **HTML tag** verification → copy the `content="…"` value
3. Rebuild with the token:

   ```bash
   GOOGLE_SITE_VERIFICATION=your_token_here npm run build --workspace apps/web
   npm run deploy:web
   ```

   Or use **DNS TXT** in Cloudflare (no rebuild needed).
4. Submit sitemap: `https://chasa.io/sitemap.xml`
5. URL Inspection on `/`, `/app/`, `/payment-reminder`, `/free-templates/`

Optional Bing: `BING_SITE_VERIFICATION=…` same as Google.

After deploy, ping IndexNow (Bing):

```bash
curl -X POST https://api.indexnow.org/indexnow \
  -H 'Content-Type: application/json' \
  -d '{"host":"chasa.io","key":"chasa-indexnow-20260727","keyLocation":"https://chasa.io/chasa-indexnow-20260727.txt","urlList":["https://chasa.io/sitemap.xml"]}'
```

### Backlinks (founder — use [/press](https://chasa.io/press))

Site-side done: social links + `sameAs` schema on all pages, internal links from blog → landing pages, RSS + llms.txt.

Still manual (copy from press kit):

- [ ] LinkedIn company page — website field + launch post linking to `/app/` or a blog article
- [ ] [X @DocstocHQ](https://x.com/DocstocHQ) — pin launch post
- [ ] Product Hunt / Indie Hackers when ready
- [ ] RELACON GmbH website cross-link to `chasa.io`
- [ ] 3–5 freelancer communities — link to `/blog/` articles or `/free-templates/`, not just homepage
- [ ] Email signature with `chasa.io`

---

## Entity

docstoc is a product of **RELACON GmbH**, Vienna, Austria. See [/imprint](https://chasa.io/imprint) and [/privacy](https://chasa.io/privacy).

Contact: [founder@chasa.io](mailto:founder@chasa.io)
