export interface GeneratedEmail {
  subject: string;
  body: string;
  remaining?: number | null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

function visitorId(): string | undefined {
  try {
    return localStorage.getItem("docstoc_vid") || undefined;
  } catch {
    return undefined;
  }
}

export interface Account {
  email: string;
  plan: "free" | "pro" | "business";
  workspaceName?: string | null;
  logoDataUrl?: string | null;
  paymentLink?: string | null;
  lateFeeEnabled?: boolean;
  lateFeeHint?: string | null;
  digestEnabled?: boolean;
  marketingOptIn?: boolean;
  role?: "admin" | "member";
  workspaceId?: string;
  /** True when email matches ADMIN_EMAIL — show Admin in the account menu. */
  isAdmin?: boolean;
}

export type Branding = {
  workspaceName: string | null;
  logoDataUrl: string | null;
  paymentLink: string | null;
  lateFeeEnabled?: boolean;
  lateFeeHint?: string | null;
  businessAddress?: string | null;
  businessState?: string | null;
  businessPostal?: string | null;
  businessCountry?: string | null;
  businessVat?: string | null;
  paid: boolean;
};

export function getBranding() {
  return jsonFetch<Branding>("/account/branding");
}

export function updateBranding(input: {
  workspaceName?: string;
  logoDataUrl?: string;
  paymentLink?: string;
  lateFeeEnabled?: boolean;
  lateFeeHint?: string;
  businessAddress?: string;
  businessState?: string;
  businessPostal?: string;
  businessCountry?: string;
  businessVat?: string;
  removeLogo?: boolean;
  removeName?: boolean;
  removePaymentLink?: boolean;
}) {
  return jsonFetch<Branding>("/account/branding", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort);
  try {
    return await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  const data =
    ct.includes("application/json") || ct.includes("text/json")
      ? await res.json().catch(() => ({}))
      : {};
  if (!res.ok) {
    const fallback =
      Object.keys(data as object).length === 0 && ct.includes("text/html")
        ? `Request failed (${res.status}) — refresh the page and try again.`
        : (data as { error?: string }).error || `Request failed (${res.status})`;
    if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(fallback, res.status, (data as { code?: string }).code);
  }
  return data as T;
}

type JsonFetchOptions = {
  timeoutMs?: number;
};

async function jsonFetch<T>(path: string, init?: RequestInit, options?: JsonFetchOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const headers = {
    "Content-Type": "application/json",
    "X-Docstoc-Client": "app",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const requestInit: RequestInit = { ...init, headers };
  const res = await fetchWithTimeout(`/api${path}`, requestInit, timeoutMs);
  return await parseJsonResponse<T>(res);
}

export function generateEmail(
  input: {
    client_name: string;
    invoice_amount: number;
    days_overdue: number;
    payment_link?: string;
    visitorId?: string;
    invoices?: Array<{
      client_name?: string;
      invoice_amount: number;
      days_overdue: number;
      due_date?: string;
    }>;
  },
  init?: Pick<RequestInit, "signal">
) {
  return generateEmailAsync(input, init);
}

type DraftJobPoll =
  | { status: "pending" }
  | { status: "done"; subject: string; body: string; remaining?: number | null }
  | { status: "error"; error?: string };

type DraftStartResponse = {
  jobId?: string;
  subject?: string;
  body?: string;
  remaining?: number | null;
};

const WORKER_API_ORIGIN = "https://api.docstoc.io";
const DRAFT_API_PREFIX = "/ai/draft";

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || /failed to fetch|networkerror|load failed|blocked/i.test(err.message);
}

/** Draft API: hit worker directly first (avoids Pages /api proxy stalls), fall back to same-origin. */
async function draftJsonFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15_000
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    "X-Docstoc-Client": "app",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const requestInit: RequestInit = { ...init, headers };
  const urls = [`${WORKER_API_ORIGIN}/api${path}`, `/api${path}`];
  let lastErr: unknown;
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetchWithTimeout(urls[i], requestInit, timeoutMs);
      return await parseJsonResponse<T>(res);
    } catch (err) {
      lastErr = err;
      const hasAlternate = i < urls.length - 1;
      if (!hasAlternate) throw err;
      if (err instanceof ApiError) throw err;
      if (!isNetworkFailure(err)) throw err;
    }
  }
  throw lastErr;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

async function generateEmailAsync(
  input: Parameters<typeof generateEmail>[0],
  init?: Pick<RequestInit, "signal">
): Promise<GeneratedEmail> {
  const payload = { ...input, visitorId: input.visitorId ?? visitorId() };
  const started = await draftJsonFetch<DraftStartResponse>(
    DRAFT_API_PREFIX,
    {
      method: "POST",
      body: JSON.stringify(payload),
      ...init,
    },
    15_000
  );

  if (started.subject && started.body) {
    return {
      subject: started.subject,
      body: started.body,
      remaining: started.remaining,
    };
  }

  const jobId = started.jobId?.trim();
  if (!jobId) {
    throw new ApiError("Draft could not start — refresh and try again.", 502);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const status = await draftJsonFetch<DraftJobPoll>(
      `${DRAFT_API_PREFIX}/${jobId}`,
      { method: "GET", ...init },
      12_000
    );
    if (status.status === "done") {
      return {
        subject: status.subject,
        body: status.body,
        remaining: status.remaining,
      };
    }
    if (status.status === "error") {
      throw new ApiError(status.error || "Could not generate a draft right now.", 502);
    }
    await sleep(1500, init?.signal ?? undefined);
  }
  throw new ApiError("Draft took too long — try again.", 504);
}

export type RewriteAction = "softer" | "firmer" | "shorter";

export function rewriteEmail(input: { subject: string; body: string; action: RewriteAction }) {
  return jsonFetch<GeneratedEmail>("/rewrite-email", { method: "POST", body: JSON.stringify(input) });
}

export function generateThankYou(input: { client_name: string; invoice_amount: number }) {
  return jsonFetch<GeneratedEmail>("/generate-thank-you", { method: "POST", body: JSON.stringify(input) });
}

export function generateReply(input: {
  client_name: string;
  invoice_amount: number;
  days_overdue: number;
  client_message: string;
}) {
  return jsonFetch<GeneratedEmail>("/generate-reply", { method: "POST", body: JSON.stringify(input) });
}

export type ChaseSequence = {
  tip: string;
  steps: { step: number; daysFromNow: number; label: string; subject: string; body: string }[];
};

export function generateSequence(input: {
  client_name: string;
  invoice_amount: number;
  days_overdue: number;
  aging_invoice_id?: string;
}) {
  return jsonFetch<ChaseSequence>("/generate-sequence", { method: "POST", body: JSON.stringify(input) });
}

export type SmsWhatsAppDraft = {
  sms: string;
  whatsapp: string;
  smsUri: string;
  whatsappUri: string;
};

export function generateSms(input: {
  client_name: string;
  invoice_amount: number;
  days_overdue: number;
  phone?: string;
}) {
  return jsonFetch<SmsWhatsAppDraft>("/generate-sms", { method: "POST", body: JSON.stringify(input) });
}

export type ChaseReminder = {
  id: string;
  agingInvoiceId: string | null;
  clientName: string;
  stepNumber: number;
  plannedDate: string;
  label: string | null;
  subject: string | null;
  body: string | null;
  status: "planned" | "done" | "skipped";
  createdAt: string;
  updatedAt: string;
};

export function listReminders(opts?: { from?: string; to?: string; status?: string }) {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.status) q.set("status", opts.status);
  const qs = q.toString();
  return jsonFetch<{ reminders: ChaseReminder[] }>(`/reminders${qs ? `?${qs}` : ""}`);
}

export function updateReminderStatus(id: string, status: "planned" | "done" | "skipped") {
  return jsonFetch<{ reminder: ChaseReminder }>(`/reminders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function snoozeReminder(id: string, days: number) {
  return jsonFetch<{ reminder: ChaseReminder }>(`/reminders/${id}/snooze`, {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}

export function scheduleFollowUpReminder(input: {
  agingInvoiceId?: string;
  clientName: string;
  daysFromNow: number;
  label?: string;
  subject: string;
  body: string;
}) {
  return jsonFetch<{ reminder: ChaseReminder }>("/reminders/follow-up", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getEvidencePack(invoiceId: string) {
  return jsonFetch<{ html: string; clientName: string }>(`/aging/${invoiceId}/evidence-pack`);
}

export type TrackedChase = {
  chaseId: string;
  html: string;
  plainBody: string;
  pixelUrl: string;
  note: string;
};

export function createTrackedCopy(input: {
  subject?: string;
  body: string;
  clientName?: string;
  agingInvoiceId?: string;
}) {
  return jsonFetch<TrackedChase>("/tracking/create", { method: "POST", body: JSON.stringify(input) });
}

export function listTracking() {
  return jsonFetch<{
    tracking: Array<{
      id: string;
      agingInvoiceId: string | null;
      clientName: string | null;
      subject: string | null;
      createdAt: string;
      openCount: number;
      clickCount: number;
      lastOpenAt: string | null;
      lastClickAt: string | null;
    }>;
    note: string;
  }>("/tracking");
}

export function trackingStats(invoiceIds: string[]) {
  return jsonFetch<{
    stats: Record<string, { openCount: number; clickCount: number; lastOpenAt: string | null }>;
  }>("/tracking/stats", { method: "POST", body: JSON.stringify({ invoiceIds }) });
}

export type AccountingProvider = "quickbooks" | "xero";

export type AccountingConnectorStatus = {
  provider: AccountingProvider;
  connected: boolean;
  externalEmail: string | null;
  realmId: string | null;
  connectedAt: string | null;
  configured: boolean;
};

export function accountingConnectUrl(provider: AccountingProvider) {
  return `/api/account/connectors/${provider}/connect`;
}

export function disconnectAccountingConnector(provider: AccountingProvider) {
  return jsonFetch<{ ok: true }>(`/account/connectors/${provider}`, { method: "DELETE" });
}

export function listAccountingInvoices(provider: AccountingProvider) {
  return jsonFetch<{
    invoices: Array<{ externalId: string; clientName: string; amount: number; dueDate: string }>;
  }>(`/account/connectors/${provider}/invoices`);
}

export function importAccountingInvoices(provider: AccountingProvider) {
  return jsonFetch<{
    imported: number;
    invoices: Array<{ id: string; clientName: string; amount: number; dueDate: string }>;
  }>(`/account/connectors/${provider}/import-invoices`, { method: "POST", body: "{}" });
}

export const ACCOUNTING_REDIRECT_URIS: Record<AccountingProvider, string> = {
  quickbooks: "https://api.docstoc.io/api/account/connectors/quickbooks/callback",
  xero: "https://api.docstoc.io/api/account/connectors/xero/callback",
};

export const ACCOUNTING_SECRET_NAMES: Record<AccountingProvider, [string, string]> = {
  quickbooks: ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET"],
  xero: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
};

export type TeamInfo = {
  ownerEmail: string;
  members: Array<{
    id: string;
    email: string;
    role: "admin" | "member";
    status: "pending" | "active";
    invitedAt: string;
    joinedAt: string | null;
  }>;
  seats: { used: number; limit: number; remaining: number };
  yourRole: "admin" | "member";
  plan: string;
};

export function getTeam() {
  return jsonFetch<TeamInfo>("/team");
}

export function inviteTeamMember(email: string, role: "admin" | "member" = "member") {
  return jsonFetch<{ member: TeamInfo["members"][0]; inviteUrl: string }>("/team/invite", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function acceptTeamInvite(token: string) {
  return jsonFetch<{ ok: true; workspaceId: string }>("/team/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function removeTeamMember(id: string) {
  return jsonFetch<{ ok: true }>(`/team/${id}`, { method: "DELETE" });
}

export function updateTeamMemberRole(id: string, role: "admin" | "member") {
  return jsonFetch<{ ok: true }>(`/team/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export type WebhookItem = { id: string; url: string; createdAt: string };

export function listWebhooks() {
  return jsonFetch<{ webhooks: WebhookItem[] }>("/webhooks");
}

export function createWebhook(url: string) {
  return jsonFetch<WebhookItem>("/webhooks", { method: "POST", body: JSON.stringify({ url }) });
}

export function deleteWebhook(id: string) {
  return jsonFetch<{ ok: true }>(`/webhooks/${id}`, { method: "DELETE" });
}

export type ConnectorKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function listConnectorKeys() {
  return jsonFetch<{ keys: ConnectorKey[] }>("/connector/keys");
}

export function createConnectorKey(name?: string) {
  return jsonFetch<ConnectorKey & { token: string }>("/connector/keys", {
    method: "POST",
    body: JSON.stringify(name ? { name } : {}),
  });
}

export function revokeConnectorKey(id: string) {
  return jsonFetch<{ ok: true }>(`/connector/keys/${id}`, { method: "DELETE" });
}

export type CloudProvider = "dropbox" | "onedrive" | "box" | "google";

export type CloudConnectorStatus = {
  provider: CloudProvider;
  connected: boolean;
  externalEmail: string | null;
  externalUserId: string | null;
  connectedAt: string | null;
  configured: boolean;
};

export type CloudFile = {
  id: string;
  name: string;
  path: string | null;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
};

export type CloudInvoiceHints = {
  clientName: string | null;
  amount: number | null;
  dueDate: string | null;
  confidence: "none" | "low" | "medium" | "high";
};

export type CloudFileImport = {
  file: CloudFile;
  hints: CloudInvoiceHints;
  textPreview: string;
  extractedChars: number;
};

export type CloudConnectorTestResult = {
  ok: boolean;
  provider: CloudProvider;
  configured: boolean;
  connected: boolean;
  message: string;
  externalEmail: string | null;
  filesFound: number | null;
  hint: string | null;
  explanation?: string;
};

/** sessionStorage key — Connector / New chase write, Tool reads + clears */
export const CLOUD_IMPORT_STORAGE_KEY = "docstoc.cloudImport";
/** sessionStorage key — New chase manual/CSV rows → Tool adds on mount */
export const PENDING_INVOICES_STORAGE_KEY = "docstoc.pendingInvoices";
/** sessionStorage key — free template subject/body applied after first generate */
export const PENDING_TEMPLATE_STORAGE_KEY = "docstoc.pendingTemplate";

export function importLocalPdf(filename: string, base64: string) {
  return jsonFetch<CloudFileImport>("/account/pdf/import", {
    method: "POST",
    body: JSON.stringify({ filename, base64 }),
  });
}

export function listCloudConnectors() {
  return jsonFetch<{ connectors: CloudConnectorStatus[]; accounting?: AccountingConnectorStatus[] }>(
    "/account/connectors"
  );
}

export function disconnectCloudConnector(provider: CloudProvider) {
  return jsonFetch<{ ok: true }>(`/account/connectors/${provider}`, { method: "DELETE" });
}

export function listCloudConnectorFiles(provider: CloudProvider) {
  return jsonFetch<{ files: CloudFile[] }>(`/account/connectors/${provider}/files`);
}

export function testCloudConnector(provider: CloudProvider) {
  return jsonFetch<CloudConnectorTestResult>(`/account/connectors/${provider}/test`, {
    method: "POST",
  });
}

export function importCloudConnectorFile(
  provider: CloudProvider,
  file: { id: string; path?: string | null }
) {
  return jsonFetch<CloudFileImport>(`/account/connectors/${provider}/files/import`, {
    method: "POST",
    body: JSON.stringify({ id: file.id, path: file.path ?? null }),
  });
}

/** Start OAuth — full-page navigate so the session cookie is sent. */
export function cloudConnectorConnectUrl(provider: CloudProvider) {
  return `/api/account/connectors/${provider}/connect`;
}

/** Exact redirect URIs to register in each provider console. */
export const CLOUD_REDIRECT_URIS: Record<CloudProvider, string> = {
  dropbox: "https://api.docstoc.io/api/account/connectors/dropbox/callback",
  onedrive: "https://api.docstoc.io/api/account/connectors/onedrive/callback",
  box: "https://api.docstoc.io/api/account/connectors/box/callback",
  google: "https://api.docstoc.io/api/account/connectors/google/callback",
};

export const CLOUD_SECRET_NAMES: Record<CloudProvider, [string, string]> = {
  dropbox: ["DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET"],
  onedrive: ["ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET"],
  box: ["BOX_CLIENT_ID", "BOX_CLIENT_SECRET"],
  google: ["GOOGLE_INTEGRATIONS_CLIENT_ID", "GOOGLE_INTEGRATIONS_CLIENT_SECRET"],
};

/** Map OAuth / connect query error codes to founder-friendly copy. */
export function explainCloudConnectorError(code: string, description?: string | null): string {
  const c = code.toLowerCase();
  if (description && description.trim()) return description.trim().slice(0, 200);
  if (c === "access_denied" || c === "user_denied") {
    return "You denied access in the provider consent screen. Click Connect and approve again.";
  }
  if (c.includes("redirect") || c === "redirect_uri_mismatch") {
    return "Redirect URI mismatch — register the exact callback URIs under Operator notes.";
  }
  if (c.includes("scope") || c === "invalid_scope" || c === "consent_required") {
    return "Required scopes were not granted. Reconnect and accept file read + offline access.";
  }
  if (c === "token_exchange") {
    return "Token exchange failed — check client ID/secret and that the redirect URI matches exactly.";
  }
  if (c === "missing_code") {
    return "Provider returned no authorization code. Try Connect again.";
  }
  if (c === "invalid_state") {
    return "OAuth state expired or invalid (15 min). Click Connect again from this tab.";
  }
  if (c === "not_configured" || c === "not_configured_yet") {
    return "OAuth secrets are not set on the worker yet. Expand Operator notes for wrangler secret put …";
  }
  return code.slice(0, 160);
}

export function notifyWebhook(
  event:
    | "chase.sent"
    | "chase.downloaded"
    | "chase.drafted"
    | "chase.thank_you"
    | "chase.reply_drafted"
    | "chase.sequence_planned",
  data?: Record<string, unknown>
) {
  return jsonFetch<{ ok: true }>("/webhooks/notify", {
    method: "POST",
    body: JSON.stringify({ event, data }),
  }).catch(() => ({ ok: true as const }));
}

export function requestMagicLink(email: string, turnstileToken?: string | null) {
  return jsonFetch<{ ok: true }>("/auth/request", {
    method: "POST",
    body: JSON.stringify({ email, turnstileToken: turnstileToken || undefined }),
  });
}

/** Password sign-in for ADMIN_EMAIL — sets the normal app session cookie. */
export function adminPasswordLogin(
  email: string,
  password: string,
  turnstileToken?: string | null
) {
  return jsonFetch<{ ok: true }>("/auth/admin-login", {
    method: "POST",
    body: JSON.stringify({ email, password, turnstileToken: turnstileToken || undefined }),
  });
}

export type AuthConfig = {
  turnstileSiteKey: string | null;
  turnstileRequired: boolean;
  googleLoginEnabled?: boolean;
  /** When set, login UI shows a password field for this address. */
  adminEmail?: string;
};

export function logout() {
  return jsonFetch<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<Account | null> {
  try {
    return await jsonFetch<Account>("/account/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    return null;
  }
}

export function startCheckout(plan: "pro" | "business") {
  return jsonFetch<{ url: string }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export function confirmCheckoutSession(sessionId: string) {
  const q = new URLSearchParams({ session_id: sessionId });
  return jsonFetch<{ ok: true; status: "active" | "pending" | "pending_payment"; plan: "pro" | "business" }>(
    `/billing/confirm-session?${q.toString()}`
  );
}

export function openBillingPortal() {
  return jsonFetch<{ url: string }>("/billing/portal", { method: "POST" });
}

export type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  address: string | null;
  state: string | null;
  postal: string | null;
  country: string | null;
  vat: string | null;
  lastContactNote: string | null;
  lastContactAt: string | null;
  avgDaysLate?: number | null;
  riskScore?: number | null;
  paidInvoiceCount?: number;
  lateInvoiceCount?: number;
  createdAt: string;
  updatedAt: string;
  outstandingCount: number;
  outstandingTotal: number;
};

export type AgingInvoiceRecord = {
  id: string;
  clientId: string | null;
  clientName: string;
  amount: number;
  dueDate: string;
  status?: "open" | "paid";
  paidAt?: string | null;
  lastChaseStatus: string | null;
  lastChaseAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function listClients() {
  return jsonFetch<{ clients: ClientRecord[] }>("/clients");
}

export function getClient(id: string) {
  return jsonFetch<{ client: ClientRecord; invoices: AgingInvoiceRecord[] }>(`/clients/${id}`);
}

export function createClient(input: {
  name: string;
  email?: string;
  notes?: string;
  address?: string;
  state?: string;
  postal?: string;
  country?: string;
  vat?: string;
}) {
  return jsonFetch<ClientRecord>("/clients", { method: "POST", body: JSON.stringify(input) });
}

export function updateClient(
  id: string,
  input: {
    name?: string;
    email?: string;
    notes?: string;
    address?: string;
    state?: string;
    postal?: string;
    country?: string;
    vat?: string;
    lastContactNote?: string;
    clearLastContact?: boolean;
  }
) {
  return jsonFetch<ClientRecord>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteClient(id: string) {
  return jsonFetch<{ ok: true }>(`/clients/${id}`, { method: "DELETE" });
}

export function listAging() {
  return jsonFetch<{ invoices: AgingInvoiceRecord[] }>("/aging");
}

export function syncAging(
  invoices: Array<{
    id: string;
    clientName: string;
    amount: number;
    dueDate: string;
    status?: "open" | "paid";
    paidAt?: string | null;
    lastChaseStatus?: string | null;
    lastChaseAt?: string | null;
  }>,
  replace = false
) {
  return jsonFetch<{ invoices: AgingInvoiceRecord[]; synced: number }>("/aging/sync", {
    method: "PUT",
    body: JSON.stringify({ invoices, replace }),
  });
}

export function markAgingChase(id: string, status: string) {
  return jsonFetch<{ ok: true; lastChaseStatus: string; lastChaseAt: string }>(
    `/aging/${id}/chase`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
}

export function deleteAgingInvoice(id: string) {
  return jsonFetch<{ ok: true }>(`/aging/${id}`, { method: "DELETE" });
}

export type ChaseEventRecord = {
  id: string;
  agingInvoiceId: string | null;
  clientName: string;
  eventType: string;
  channel: string;
  subject: string | null;
  bodyPreview: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export function recordChaseEvent(input: {
  agingInvoiceId?: string;
  clientName: string;
  eventType: "drafted" | "sent" | "copied" | "mailto" | "marked_paid" | "reply_detected" | "note";
  channel?: "email" | "sms" | "whatsapp" | "system";
  subject?: string;
  body?: string;
}) {
  return jsonFetch<{ event: ChaseEventRecord }>("/chase/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getInvoiceTimeline(invoiceId: string) {
  return jsonFetch<{ events: ChaseEventRecord[] }>(`/aging/${invoiceId}/timeline`);
}

export function markInvoicePaid(invoiceId: string, note?: string) {
  return jsonFetch<{ ok: true; paidAt: string; daysLate: number }>(
    `/aging/${invoiceId}/mark-paid`,
    { method: "POST", body: JSON.stringify({ note }) }
  );
}

export function updateDigestSettings(digestEnabled: boolean) {
  return jsonFetch<{ digestEnabled: boolean }>("/account/digest", {
    method: "PATCH",
    body: JSON.stringify({ digestEnabled }),
  });
}

export function updateMarketingOptIn(marketingOptIn: boolean) {
  return jsonFetch<{ marketingOptIn: boolean }>("/account/marketing-opt-in", {
    method: "PATCH",
    body: JSON.stringify({ marketingOptIn }),
  });
}

export type ClassifiedReply = {
  classification: string;
  summary: string;
  suggestedAction: string;
  subject: string;
  body: string;
  promisedPayDate: string | null;
};

export function generateReplySmart(input: {
  client_name: string;
  invoice_amount: number;
  days_overdue: number;
  client_message?: string;
  client_email?: string;
  fetch_from_gmail?: boolean;
  payment_link?: string;
  aging_invoice_id?: string;
}) {
  return jsonFetch<ClassifiedReply>("/generate-reply-smart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importGoogleContacts() {
  return jsonFetch<{ ok: true; imported: number; skipped: number }>("/clients/import-google", {
    method: "POST",
  });
}

export function saveGmailDraft(input: { to: string; subject: string; body: string }) {
  return jsonFetch<{ ok: true; draftId: string }>("/account/google/gmail-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importGoogleSheet(spreadsheetId: string, range?: string) {
  return jsonFetch<{ rows: Array<{ clientName: string; amount: number; dueDate: string }>; skipped: number }>(
    "/account/google/sheets/import",
    { method: "POST", body: JSON.stringify({ spreadsheetId, range }) }
  );
}

export function exportAgingToGoogleSheet(input: {
  title?: string;
  rows: Array<{ clientName: string; amount: number; dueDate: string; status?: string }>;
}) {
  return jsonFetch<{ spreadsheetId: string; spreadsheetUrl: string }>("/account/google/sheets/export-aging", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function syncReminderToGoogleCalendar(input: {
  date: string;
  summary?: string;
  description?: string;
  clientName?: string;
}) {
  return jsonFetch<{ eventId: string; htmlLink: string | null }>("/account/google/calendar/sync-reminder", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function findGmailClientReply(input: { clientName: string; clientEmail?: string | null }) {
  return jsonFetch<{ found: boolean; snippet: string | null; subject: string | null; date: string | null }>(
    "/account/google/gmail/find-reply",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function generateDemandLetter(input: {
  client_name: string;
  client_address?: string;
  invoice_number?: string;
  invoice_amount: number;
  due_date: string;
  days_overdue: number;
  letter_level?: number;
  sender_name?: string;
  sender_address?: string;
  payment_link?: string;
}) {
  return jsonFetch<{ level: number; title: string; html: string }>("/generate-demand-letter", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** @deprecated Use generateDemandLetter */
export const generateMahnung = generateDemandLetter;

export type CertificateRecord = {
  id: string;
  publicId: string;
  sha256Hash: string;
  originalFilename: string | null;
  fileSizeBytes: number | null;
  issuerName: string | null;
  planAtCreation: string;
  status: "active" | "revoked";
  revokedAt: string | null;
  createdAt: string;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
};

export function listCertificates() {
  return jsonFetch<{ certificates: CertificateRecord[] }>("/verify/mine");
}

export type AuditAnchorRecord = {
  id: string;
  accountId: string;
  periodDate: string;
  eventCount: number;
  eventsHash: string;
  prevChainHash: string | null;
  chainHash: string;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
  createdAt: string;
};

export function listAuditAnchors() {
  return jsonFetch<{ anchors: AuditAnchorRecord[] }>("/audit-log/anchors");
}

export type SoxControlStatus = {
  id: string;
  title: string;
  status: "ready" | "partial" | "missing";
  detail: string;
};

export type SoxSettings = {
  sodRequired: boolean;
  retentionDays: number;
  legalHold: boolean;
  retentionEnforced: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
};

export type SoxRetentionStatus = {
  cutoffIso: string;
  chaseEventsPastRetention: number;
  auditEventsPastRetention: number;
  legalHold: boolean;
  retentionEnforced: boolean;
  retentionDays: number;
};

export type SoxControlTest = {
  id: string;
  controlId: string;
  periodStart: string;
  periodEnd: string;
  result: "pass" | "fail" | "exception";
  notes: string | null;
  testedByEmail: string;
  evidencePackId: string | null;
  testedAt: string;
};

export type SoxControl = {
  id: string;
  controlKey: string;
  title: string;
  description: string | null;
  frequency: string;
  ownerEmail: string | null;
  status: "active" | "retired";
  createdAt: string;
  lastTest: SoxControlTest | null;
};

export type SoxOverview = {
  settings: SoxSettings;
  controls: SoxControlStatus[];
  pendingApprovals: number;
  recentAuditCount: number;
  anchorCount: number;
  confirmedAnchors: number;
  certificateCount: number;
  chaseEventCount30d: number;
  retention?: SoxRetentionStatus;
  controlLibraryCount?: number;
  controlTests30d?: number;
};

export type SoxAuditEvent = {
  id: string;
  actorAccountId: string | null;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export type SoxSendApproval = {
  id: string;
  agingInvoiceId: string;
  clientName: string;
  subject: string | null;
  bodyPreview: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedByEmail: string;
  decidedByEmail: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export function getSoxOverview() {
  return jsonFetch<{ overview: SoxOverview }>("/sox/overview");
}

export function getSoxStatus() {
  return jsonFetch<{
    paid: boolean;
    business?: boolean;
    message?: string;
    overview?: SoxOverview;
  }>("/sox/status");
}

export function listSoxAuditEvents(limit = 100) {
  return jsonFetch<{ events: SoxAuditEvent[] }>(`/sox/audit-events?limit=${limit}`);
}

export function getSoxSettings() {
  return jsonFetch<{ settings: SoxSettings }>("/sox/settings");
}

export function updateSoxSettings(input: {
  sodRequired?: boolean;
  retentionDays?: number;
  legalHold?: boolean;
  retentionEnforced?: boolean;
}) {
  return jsonFetch<{ settings: SoxSettings }>("/sox/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function listSoxControls() {
  return jsonFetch<{ controls: SoxControl[] }>("/sox/controls");
}

export function listSoxControlTests(controlId?: string) {
  const qs = controlId ? `?controlId=${encodeURIComponent(controlId)}` : "";
  return jsonFetch<{ tests: SoxControlTest[] }>(`/sox/control-tests${qs}`);
}

export function createSoxControlTest(input: {
  controlId: string;
  periodStart: string;
  periodEnd: string;
  result: "pass" | "fail" | "exception";
  notes?: string | null;
  evidencePackId?: string | null;
}) {
  return jsonFetch<{ test: SoxControlTest }>("/sox/control-tests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function purgeSoxRetention() {
  return jsonFetch<{ deletedChase: number; deletedAudit: number; cutoffIso: string }>(
    "/sox/retention/purge",
    { method: "POST", body: "{}" }
  );
}

export function listSoxApprovals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return jsonFetch<{ approvals: SoxSendApproval[] }>(`/sox/approvals${qs}`);
}

export function createSoxApproval(input: {
  agingInvoiceId: string;
  clientName: string;
  subject?: string | null;
  body?: string | null;
}) {
  return jsonFetch<{ approval: SoxSendApproval }>("/sox/approvals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function decideSoxApproval(
  id: string,
  input: { decision: "approved" | "rejected"; note?: string | null }
) {
  return jsonFetch<{ approval: SoxSendApproval }>(`/sox/approvals/${id}/decide`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function soxPeriodEvidenceUrl(from: string, to: string): string {
  return `/api/sox/period-evidence?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export type SoxAuditorPack = {
  id: string;
  fromDate: string;
  toDate: string;
  contentSha256: string;
  invoiceCount: number;
  eventCount: number;
  createdByEmail: string | null;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
  createdAt: string;
};

export function listSoxAuditorPacks() {
  return jsonFetch<{ packs: SoxAuditorPack[] }>("/sox/auditor-packs");
}

export function createSoxAuditorPack(input: { from: string; to: string }) {
  return jsonFetch<{ pack: SoxAuditorPack }>("/sox/auditor-packs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function soxAuditorPackHtmlUrl(id: string): string {
  return `/api/sox/auditor-packs/${encodeURIComponent(id)}.html`;
}

export function soxAuditorPackSha256Url(id: string): string {
  return `/api/sox/auditor-packs/${encodeURIComponent(id)}.sha256`;
}

export function soxAuditorPackOtsUrl(id: string): string {
  return `/api/sox/auditor-packs/${encodeURIComponent(id)}.ots`;
}

export type TrustProfileRecord = {
  accountId: string;
  firstVerifiedAt: string;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
};

export function getMyTrustProfile() {
  return jsonFetch<{ profile: TrustProfileRecord | null }>("/trust/mine");
}

export type InvoiceLineItem = { description: string; quantity: number; unitPrice: number };

export type InvoiceRecord = {
  id: string;
  publicId: string;
  agingInvoiceId: string | null;
  clientId?: string | null;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress?: string | null;
  clientState?: string | null;
  clientPostal?: string | null;
  clientCountry?: string | null;
  clientVat?: string | null;
  issuerName?: string | null;
  issuerAddress?: string | null;
  issuerState?: string | null;
  issuerPostal?: string | null;
  issuerCountry?: string | null;
  issuerVat?: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  taxRate: number;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: "draft" | "sent" | "paid";
  certificatePublicId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listInvoices() {
  return jsonFetch<{ invoices: InvoiceRecord[] }>("/invoices");
}

export function createInvoice(input: {
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  clientState?: string;
  clientPostal?: string;
  clientCountry?: string;
  clientVat?: string;
  issuerName?: string;
  issuerAddress?: string;
  issuerState?: string;
  issuerPostal?: string;
  issuerCountry?: string;
  issuerVat?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  taxRate: number;
  notes?: string;
}) {
  return jsonFetch<{ ok: true; invoice: InvoiceRecord }>("/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setInvoiceStatus(id: string, status: "draft" | "sent" | "paid") {
  return jsonFetch<{ ok: true; invoice: InvoiceRecord }>(`/invoices/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteInvoice(id: string) {
  return jsonFetch<{ ok: true }>(`/invoices/${id}`, { method: "DELETE" });
}

export function createCertificate(input: {
  sha256Hash: string;
  originalFilename?: string;
  fileSizeBytes?: number;
  issuerName?: string;
  turnstileToken?: string;
}) {
  return jsonFetch<{ ok: true; publicId: string; createdAt: string }>("/verify/certificates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeCertificate(id: string) {
  return jsonFetch<{ ok: true }>(`/verify/certificates/${id}`, { method: "DELETE" });
}

export type SslDns01Challenge = {
  identifier: string;
  recordName: string;
  txtValue: string;
};

export type CustomerCertificate = {
  id: string;
  domain: string;
  hostnames?: string[];
  status: "pending_dns" | "verifying" | "issued" | "expiring" | "expired" | "failed";
  dns01Token: string | null;
  dns01TxtValue: string | null;
  dns01Challenges?: SslDns01Challenge[];
  lastError: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type SslFeatures = {
  multiSan: boolean;
  wildcard: boolean;
  wildcardLimit: number;
  maxSansPerCert: number;
  acmeApi: boolean;
};

export type SslHealth = {
  ok: boolean;
  relayConfigured: boolean;
  relayReachable: boolean;
  letsEncryptReachable: boolean;
  directory: "production" | "staging" | "custom";
  directoryUrl: string;
  error?: string;
};

export function listCustomHostnames() {
  return jsonFetch<{ certificates: CustomerCertificate[]; limit: number; features: SslFeatures }>("/ssl/domains");
}

export function getSslHealth() {
  return jsonFetch<SslHealth>("/ssl/health");
}

export function createCustomHostname(hostname: string, hostnames?: string[]) {
  return jsonFetch<{
    certificate: CustomerCertificate;
    dnsRecord: { name: string; type: "TXT"; value: string; identifier?: string };
    dnsRecords?: Array<{ name: string; type: "TXT"; value: string; identifier?: string }>;
  }>(
    "/ssl/domains",
    {
      method: "POST",
      body: JSON.stringify(hostnames?.length ? { hostnames } : { hostname }),
    }
  );
}

export function verifyCustomHostname(id: string) {
  return jsonFetch<{ status: "valid" | "pending" | "invalid" | "issued" | "error"; error?: string }>(
    `/ssl/domains/${id}/verify`,
    { method: "POST" }
  );
}

export function deleteCustomHostname(id: string) {
  return jsonFetch<{ ok: true }>(`/ssl/domains/${id}`, { method: "DELETE" });
}

export function renewCustomHostname(id: string) {
  return jsonFetch<{
    certificate: CustomerCertificate;
    dnsRecord: { name: string; type: "TXT"; value: string };
    dnsRecords?: Array<{ name: string; type: "TXT"; value: string }>;
  }>(`/ssl/domains/${id}/renew`, { method: "POST" });
}

export function downloadCustomHostname(id: string) {
  return jsonFetch<{
    domain: string;
    certificatePem: string;
    privateKeyPem: string;
    expiresAt: string | null;
    formats: { nginx: string; apache: string; caddy: string };
  }>(`/ssl/domains/${id}/download`);
}
