import { isExcludeSelf, setExcludeSelf, track } from "./analytics";

export type FunnelStats = {
  days: number;
  since: string;
  humansOnly: boolean;
  totals: {
    accounts: number;
    paidAccounts: number;
    events: number;
    activationKpi: number;
    completionKpi: number;
    growthKpi: number;
  };
  activation: { name: string; count: number }[];
  growth: { name: string; count: number }[];
  completion: { name: string; count: number }[];
  template: { name: string; count: number }[];
  traffic: { name: string; count: number }[];
  email: { name: string; count: number }[];
  errors: { name: string; count: number }[];
};

export type TrafficStats = {
  days: number;
  day: string | null;
  pageViews: number;
  humanPageViews: number;
  crawlerPageViews: number;
  botPct: number;
  chasesSent: number;
  chasesCompleted: number;
  conversion: string;
  byDay: { day: string; human: number; bot: number }[];
  byRoute: { path: string; total: number; human: number; bot: number }[];
  byBot: { bot: string; count: number }[];
  byCountry: { country: string; count: number }[];
  note: string;
};

export type CfTrafficStats =
  | { configured: false }
  | { configured: true; ok: false; error: string }
  | {
      configured: true;
      ok: true;
      days: number;
      zones: string[];
      byDay: { day: string; requests: number; pageViews: number; uniques: number }[];
      totals: { requests: number; pageViews: number; uniques: number };
      day: string;
      eyeballRequests: number;
      botCount: number;
      humanCount: number;
      botPct: number;
      byBot: { bot: string; count: number }[];
      byRoute: { path: string; count: number }[];
      byCountry: { country: string; count: number }[];
      byDevice: { device: string; count: number }[];
    };

export type TrafficSourceRow = {
  event: "referral_source_detected" | "campaign_click";
  source: string;
  attribution: string;
  day: string;
  count: number;
};

export type TrafficSourcesStats = {
  days: number;
  humansOnly: boolean;
  rows: TrafficSourceRow[];
};

export type MarketplaceSubmission = {
  id: string;
  slug: string;
  name: string;
  description: string;
  stage: string;
  tone: string;
  category: string;
  templateType: "email" | "document";
  subject: string;
  body: string;
  bodyMarkdown: string | null;
  tags: string[];
  submitterName: string | null;
  submitterUrl: string | null;
  featured: boolean;
  verifiedExpert: boolean;
  expertCredential: string | null;
  submittedAt: string;
  accountId: string | null;
  submitterEmail: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export function adminMarketplacePending() {
  return adminFetch<{ templates: MarketplaceSubmission[] }>("/marketplace/pending");
}

export function adminMarketplaceApprove(
  id: string,
  opts?: { featured?: boolean; verifiedExpert?: boolean; expertCredential?: string }
) {
  return adminFetch<{ ok: true }>(`/marketplace/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({
      featured: opts?.featured || undefined,
      verifiedExpert: opts?.verifiedExpert || undefined,
      expertCredential: opts?.expertCredential || undefined,
    }),
  });
}

export function adminMarketplaceReject(id: string, reason?: string) {
  return adminFetch<{ ok: true }>(`/marketplace/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined }),
  });
}

export type SignupLists = {
  total: number;
  free: { email: string; plan: string; createdAt: string }[];
  paid: { email: string; plan: string; createdAt: string }[];
  business: { email: string; plan: string; createdAt: string }[];
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  description: string;
  body: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function adminLogin(email: string, password: string, turnstileToken?: string | null) {
  return adminFetch<{ ok: true; email: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password, turnstileToken: turnstileToken || undefined }),
  });
}

export function adminLogout() {
  return adminFetch<{ ok: true }>("/logout", { method: "POST" });
}

export function adminMe() {
  return adminFetch<{ email: string }>("/me");
}

/** `humansOnly` drops classified crawlers from the event counts — see getFunnelStats in the worker
 *  for why a funnel read across both audiences at once is misleading. */
export function adminFunnels(days = 30, humansOnly = false) {
  return adminFetch<FunnelStats>(`/funnels?days=${days}${humansOnly ? "&humansOnly=1" : ""}`);
}

export type OutreachStats = {
  days: number;
  since: string;
  humanOpens: number;
  botOpens: number;
  byCampaign: { label: string; count: number }[];
  byWho: { who: string; count: number }[];
  recent: { at: string; code: string; label: string; who: string | null; isBot: boolean }[];
  links: { path: string; use: string }[];
};

export function adminTraffic(days = 30, day?: string | null) {
  const params = new URLSearchParams({ days: String(days) });
  if (day) params.set("day", day);
  return adminFetch<TrafficStats>(`/traffic?${params.toString()}`);
}

export function adminTrafficCloudflare(days = 30, day?: string | null) {
  const params = new URLSearchParams({ days: String(days) });
  if (day) params.set("day", day);
  return adminFetch<CfTrafficStats>(`/traffic-cloudflare?${params.toString()}`);
}

export function adminTrafficSources(days = 30, humansOnly = true) {
  const params = new URLSearchParams({ days: String(days) });
  if (humansOnly) params.set("humansOnly", "1");
  return adminFetch<TrafficSourcesStats>(`/traffic-sources?${params.toString()}`);
}

export function adminOutreach(days = 30) {
  return adminFetch<OutreachStats>(`/outreach?days=${days}`);
}

export function adminSignups() {
  return adminFetch<SignupLists>("/signups");
}

export function adminGrantBusiness(email: string) {
  return adminFetch<{ ok: true; email: string; plan: string }>("/grant-business", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** Permanently deletes an account and everything tied to it. No undo. */
export function adminDeleteAccount(email: string) {
  return adminFetch<{ ok: true; email: string }>("/delete-account", {
    method: "POST",
    body: JSON.stringify({ email, confirmEmail: email }),
  });
}

export function adminBlogList() {
  return adminFetch<{ posts: BlogPost[] }>("/blog");
}

export function adminBlogCreate(input: {
  title: string;
  slug?: string;
  description?: string;
  body: string;
  published?: boolean;
}) {
  return adminFetch<{ post: BlogPost }>("/blog", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function adminBlogUpdate(
  id: string,
  input: Partial<{ title: string; slug: string; description: string; body: string; published: boolean }>
) {
  return adminFetch<{ post: BlogPost }>(`/blog/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function adminBlogDelete(id: string) {
  return adminFetch<{ ok: true }>(`/blog/${id}`, { method: "DELETE" });
}

/** Runs the same weekly-cron publish step on demand — publishes an existing draft if one's
 *  waiting, otherwise drafts and publishes the next queued SEO topic with Workers AI. */
export function adminBlogPublishNext() {
  return adminFetch<{ post: BlogPost }>("/blog/publish-next", { method: "POST" });
}

export type BroadcastResult = { recipientCount: number; sent?: number; failed?: number };

export function adminBroadcast(input: { subject: string; bodyHtml: string; dryRun?: boolean }) {
  return adminFetch<BroadcastResult>("/broadcast", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Refreshes the founder notrack cookie — admin visits stay out of analytics (Docracy parity). */
export type RoadmapFeature = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  yesVotes: number;
  noVotes: number;
  myVote: "yes" | "no" | null;
};

export function adminRoadmapList() {
  return adminFetch<{ features: RoadmapFeature[] }>("/roadmap");
}

export function adminRoadmapCreate(input: { title: string; description: string }) {
  return adminFetch<{ ok: true; id: string }>("/roadmap", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function adminRoadmapDelete(id: string) {
  return adminFetch<{ ok: true }>(`/roadmap/${id}`, { method: "DELETE" });
}

export type AeParityRow = {
  day: string;
  event: string;
  d1Count: number;
  aeHumanCount: number;
  aeBotCount: number;
};

export type AeParityResponse =
  | { configured: true; rows: AeParityRow[] }
  | { configured: false; failure: { kind: string; status?: number; detail?: string }; d1Counts: { day: string; event: string; count: number }[] };

export function adminAeParity(days = 7) {
  return adminFetch<AeParityResponse>(`/analytics/ae-parity?days=${days}`);
}

export function adminSetNoTrack() {
  return adminFetch<{ ok: true; enabled: boolean }>("/analytics/notrack", {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
}

export { track, isExcludeSelf, setExcludeSelf };
