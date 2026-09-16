# Connector OAuth setup (docstoc.io)

Worker uses `PUBLIC_WORKER_URL=https://api.docstoc.io`. Every connector callback must be registered **exactly** as listed below.

Secrets: `cd apps/worker && npx wrangler secret put …`  
Non-secret client IDs for Google integrations: `apps/worker/wrangler.toml` → redeploy worker after change.

Test after each: `docstoc.io/app/connector` → Connect → Test.

---

## 1. Google (Drive + Gmail + Sheets + Calendar + Contacts)

**Separate from Sign-In** — use a second OAuth client (not the login client).

### Google Cloud (project `docstoc` recommended)

1. [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **OAuth client ID**
2. Type: **Web application**
3. Name: `docstoc-google-integrations`
4. **Authorized redirect URIs** (only this one):

   ```
   https://api.docstoc.io/api/account/connectors/google/callback
   ```

5. Enable APIs (APIs & Services → Library):
   - Google Drive API
   - Gmail API
   - Google Sheets API
   - Google Calendar API
   - People API (Contacts)

6. OAuth consent screen → add scopes (or approve on first connect):
   - `drive.readonly`, `gmail.readonly`, `gmail.compose`, `spreadsheets` (read + export write; do not add `spreadsheets.readonly` — it must match the OAuth request string-for-string), `calendar.events`, `contacts.readonly`, `userinfo.email`
   - `gmail.compose` (not `gmail.modify`) since 2026-09 — Google's OAuth verification flagged `gmail.modify` as broader than needed for the actual usage (creating Gmail drafts only, via `POST /users/me/drafts`); `gmail.compose` covers that exactly. Do not re-add `gmail.modify` unless the app starts doing something drafts alone can't cover (e.g. modifying labels on existing messages).

7. Download JSON → update production:

   ```bash
   # Paste client id into wrangler.toml → GOOGLE_INTEGRATIONS_CLIENT_ID
   cd apps/worker
   npx wrangler secret put GOOGLE_INTEGRATIONS_CLIENT_SECRET
   npx wrangler deploy
   ```

**Legacy shortcut:** If you still have project `chasa-503910`, add the docstoc redirect URI to the existing integrations client (`…ie2hbeub…`) — no worker change if client id/secret stay the same.

---

## 2. Dropbox

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) → your app (or create **Scoped access** app)
2. **Redirect URIs**:

   ```
   https://api.docstoc.io/api/account/connectors/dropbox/callback
   ```

3. Permissions: `files.metadata.read`, `files.content.read` (and any scopes your app already uses)

4. ```bash
   cd apps/worker
   npx wrangler secret put DROPBOX_CLIENT_ID
   npx wrangler secret put DROPBOX_CLIENT_SECRET
   ```

---

## 3. OneDrive / Microsoft Entra

1. [Entra admin center](https://entra.microsoft.com/) → **App registrations** → **New registration**
2. Supported accounts: **Accounts in any organizational directory and personal Microsoft accounts**
3. Redirect URI — platform **Web**:

   ```
   https://api.docstoc.io/api/account/connectors/onedrive/callback
   ```

4. **API permissions** → Microsoft Graph delegated:
   - `User.Read`
   - `Files.Read`
   - `offline_access`

5. **Certificates & secrets** → new client secret

6. ```bash
   cd apps/worker
   npx wrangler secret put ONEDRIVE_CLIENT_ID      # Application (client) ID
   npx wrangler secret put ONEDRIVE_CLIENT_SECRET
   ```

---

## 4. Box

1. [Box Developer Console](https://app.box.com/developers/console) → your app → **Configuration**
2. **OAuth 2.0 Redirect URI**:

   ```
   https://api.docstoc.io/api/account/connectors/box/callback
   ```

3. Application scopes: read files/folders as needed for invoice import

4. ```bash
   cd apps/worker
   npx wrangler secret put BOX_CLIENT_ID
   npx wrangler secret put BOX_CLIENT_SECRET
   ```

---

## 5. QuickBooks Online (Intuit)

1. [Intuit Developer](https://developer.intuit.com/) → your app → **Keys & OAuth**
2. **Redirect URIs**:

   ```
   https://api.docstoc.io/api/account/connectors/quickbooks/callback
   ```

3. Scopes: `com.intuit.quickbooks.accounting` (as configured on your app)

4. Use **Production** keys when live; sandbox for testing

5. ```bash
   cd apps/worker
   npx wrangler secret put QBO_CLIENT_ID
   npx wrangler secret put QBO_CLIENT_SECRET
   ```

---

## 6. Xero

1. [Xero Developer](https://developer.xero.com/app/manage) → your app → **OAuth 2.0 credentials**
2. **Redirect URI**:

   ```
   https://api.docstoc.io/api/account/connectors/xero/callback
   ```

3. Scopes: `openid`, `profile`, `email`, `accounting.transactions`, `accounting.contacts` (match your app config)

4. ```bash
   cd apps/worker
   npx wrangler secret put XERO_CLIENT_ID
   npx wrangler secret put XERO_CLIENT_SECRET
   ```

---

## Keep during transition

Leave legacy `https://api.chasa.io/api/account/connectors/*/callback` URIs registered until chasa API traffic is zero, then remove.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | URI in provider console must match character-for-character |
| Connect button grey / not configured | Worker secrets missing — run `wrangler secret put` |
| Google `access_denied` / Testing mode | Add user under OAuth consent screen → Test users |
| Token exchange failed | Wrong secret or client id for the app that owns the redirect URI |
