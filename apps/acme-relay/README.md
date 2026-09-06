# acme-relay

A tiny, stateless HTTPS forwarder that lets docstoc's ACME client (`apps/worker/src/lib/acme.ts`)
reach Let's Encrypt. It exists solely because **Cloudflare Workers cannot reliably reach Let's
Encrypt's ACME API** — outbound `fetch()` from a deployed Worker to
`acme-v02.api.letsencrypt.org` or `acme-staging-v02.api.letsencrypt.org` fails with a `525 SSL
handshake` error, a known, unresolved issue on Cloudflare's side. The exact same request works
from any non-Cloudflare host, hence this relay.

**This process holds no secrets.** It never sees an ACME account key, a certificate private key,
or docstoc's database — it only forwards already-built (already-signed, where relevant) HTTP
requests to Let's Encrypt and returns the raw response. The only thing worth protecting is the
shared bearer secret, which just prevents randoms from using it as an open proxy.

> **2026-07 note:** Deno Deploy Classic (`*.deno.dev`) was **sunset on July 20, 2026**. The old
> `docstoc-acme-relay.deno.dev` URL returns `DEPLOYMENT_NOT_FOUND`. This app runs on the **new
> Deno Deploy** platform at [console.deno.com](https://console.deno.com).

## Deploy on Deno Deploy (production)

Config lives in `deno.jsonc` (`org: docracy1`, `app: docstoc-acme-relay`, entrypoint `main.ts`).

**GitHub (recommended):** link repo `docracy1/chasa`, set **App directory** to `apps/acme-relay`
in the dashboard (required for monorepos — not configurable in source). Runtime settings come from
`deno.jsonc`. Set `RELAY_SECRET` under environment variables (Production). Pushes to `main` auto-deploy.

**Dashboard:** [console.deno.com](https://console.deno.com) → org **docracy1** → app
**docstoc-acme-relay** → **Deploy default branch** to redeploy manually.

**CLI** (from this directory, with Deno 2+ and `deno deploy` auth):

```bash
cd apps/acme-relay
RELAY_SECRET="$(openssl rand -hex 32)"
echo "Save this for the worker: $RELAY_SECRET"
# Set RELAY_SECRET in the Deno Deploy dashboard (Production context), then:
deno deploy
```

Production URL: **`https://docstoc-acme-relay.docracy1.deno.net`**

Entrypoint: `main.ts` (Dynamic app — no build step).

## Point docstoc at it

```bash
cd ../worker
wrangler secret put ACME_RELAY_URL
# paste: https://docstoc-acme-relay.docracy1.deno.net
wrangler secret put ACME_RELAY_SECRET
# paste: the same RELAY_SECRET
wrangler secret put ACME_DIRECTORY_URL
# paste: https://acme-v02.api.letsencrypt.org/directory
```

Verify from a signed-in session: `GET /api/ssl/health` should return `"ok": true`.

## Local dev

```bash
RELAY_SECRET=dev-secret deno run --allow-net --allow-env main.ts
# or: RELAY_SECRET=dev-secret node relay.mjs
```

## Security notes

- The relay only forwards to `acme-v02.api.letsencrypt.org` and
  `acme-staging-v02.api.letsencrypt.org` — any other target host is rejected with 403.
- Requires `Authorization: Bearer <RELAY_SECRET>` on every request, including the `GET /`
  liveness probe (`{"ok":true}`) — this closes it off as an open, unauthenticated target for
  internet-wide scanners. Any uptime monitor pointed at `GET /` must send that header too.
- Deno Deploy terminates TLS at the edge.
