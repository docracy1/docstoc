import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { generateFollowUpEmail, getToneBand } from "../lib/ai";
import { anonIpCapScope, checkDraftQuota, incrementDraftUsage, usageScopeKey } from "../lib/usageQuota";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { mcpDraftSchema } from "../lib/schemas";
import { resolveMcpAccount } from "../lib/mcpAuth";
import type { AccountContext } from "../lib/auth";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const SERVER_INFO = {
  name: "docstoc",
  version: "1.0.0",
  title: "docstoc",
  description:
    "AI invoice follow-up for freelancers. Draft chase emails, tips, and templates — read-only / draft-only. Nothing is ever emailed for you.",
};

const TEMPLATES = [
  {
    slug: "payment-reminder-before-due-date",
    title: "Payment reminder — before due",
    stage: "pre-due",
  },
  {
    slug: "invoice-due-today-reminder",
    title: "Invoice due today",
    stage: "due-date",
  },
  {
    slug: "gentle-overdue-invoice-reminder",
    title: "Gentle overdue — 1–3 days",
    stage: "1-3-days",
  },
  {
    slug: "overdue-invoice-reminder-7-days",
    title: "Second reminder — 7 days",
    stage: "7-days",
  },
  {
    slug: "payment-plan-offer-overdue-invoice",
    title: "Payment plan offer — 14 days",
    stage: "14-days",
  },
  {
    slug: "formal-overdue-notice-30-days",
    title: "Formal notice — 30 days",
    stage: "30-days",
  },
  {
    slug: "second-formal-notice-60-days",
    title: "Second formal notice — 60 days",
    stage: "60-days",
  },
  {
    slug: "final-notice-before-collections",
    title: "Final notice — 90 days",
    stage: "90-days",
  },
  {
    slug: "thank-you-for-payment-email",
    title: "Thank you for payment",
    stage: "paid",
  },
  {
    slug: "confirm-invoice-received-email",
    title: "Confirm invoice received",
    stage: "delivery-check",
  },
] as const;

function chaseTip(days: number): string {
  if (days <= 0) return "Due today — a short friendly nudge with a pay link works best.";
  if (days <= 3) return "1–3 days late — assume an oversight; ask for a payment date, no blame.";
  if (days <= 7) return "About a week late — firm but respectful; confirm they received the invoice.";
  if (days <= 14) return "Two weeks late — offer a short payment plan if cash flow is the issue.";
  if (days <= 30) return "Approaching a month — formal tone; set a clear new deadline.";
  return "30+ days — direct consequence (pause work / next steps). Still factual, not angry.";
}

function recommendTemplate(days: number) {
  if (days <= 0) return TEMPLATES[1];
  if (days <= 3) return TEMPLATES[2];
  if (days <= 7) return TEMPLATES[3];
  if (days <= 14) return TEMPLATES[4];
  if (days <= 30) return TEMPLATES[5];
  if (days <= 60) return TEMPLATES[6];
  return TEMPLATES[7];
}

function templateUrl(appUrl: string, slug: string) {
  return `${appUrl.replace(/\/$/, "")}/free-templates/${slug}`;
}

function ok(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: JsonRpcId | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function textResult(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

const TOOLS = [
  {
    name: "draft_chase_email",
    description:
      "Draft a payment follow-up email for an overdue invoice. Returns subject + body. Does not send email — the user copies it to their own inbox.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client or company name" },
        invoice_amount: { type: "number", description: "Invoice amount in dollars" },
        days_overdue: {
          type: "number",
          description: "How many days past the due date (0 = due today)",
        },
      },
      required: ["client_name", "invoice_amount", "days_overdue"],
    },
  },
  {
    name: "get_chase_tip",
    description: "Get a short chase-tone tip for how late an invoice is.",
    inputSchema: {
      type: "object",
      properties: {
        days_overdue: { type: "number", description: "Days past due (0 = due today)" },
      },
      required: ["days_overdue"],
    },
  },
  {
    name: "recommend_template",
    description:
      "Recommend a free docstoc payment-reminder template for a given days-overdue stage, with a URL.",
    inputSchema: {
      type: "object",
      properties: {
        days_overdue: { type: "number", description: "Days past due (0 = due today)" },
      },
      required: ["days_overdue"],
    },
  },
  {
    name: "list_templates",
    description: "List docstoc free invoice follow-up email templates with URLs.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

async function callTool(
  env: Env,
  ip: string,
  account: AccountContext | null,
  name: string,
  args: Record<string, unknown>
): Promise<ReturnType<typeof textResult>> {
  const appUrl = env.PUBLIC_APP_URL || "https://docstoc.io";

  if (name === "get_chase_tip") {
    const days = Number(args.days_overdue);
    if (!Number.isFinite(days)) throw new Error("days_overdue is required");
    const band = getToneBand(Math.max(0, days));
    return textResult(
      JSON.stringify(
        {
          days_overdue: days,
          tone_band: band,
          tip: chaseTip(Math.max(0, days)),
        },
        null,
        2
      )
    );
  }

  if (name === "recommend_template") {
    const days = Number(args.days_overdue);
    if (!Number.isFinite(days)) throw new Error("days_overdue is required");
    const tpl = recommendTemplate(Math.max(0, days));
    return textResult(
      JSON.stringify(
        {
          days_overdue: days,
          template: {
            ...tpl,
            url: templateUrl(appUrl, tpl.slug),
          },
        },
        null,
        2
      )
    );
  }

  if (name === "list_templates") {
    return textResult(
      JSON.stringify(
        {
          templates: TEMPLATES.map((t) => ({
            ...t,
            url: templateUrl(appUrl, t.slug),
          })),
        },
        null,
        2
      )
    );
  }

  if (name === "draft_chase_email") {
    if (!account) {
      throw new Error("Sign in or provide Bearer API key for draft_chase_email");
    }

    const rl = await checkRateLimit(env, `mcp_draft:${ip}`, 30, 3600);
    if (!rl.ok) throw new Error("Rate limit exceeded. Try again later.");

    const draftParsed = mcpDraftSchema.safeParse(args);
    if (!draftParsed.success) {
      throw new Error("client_name, invoice_amount, and days_overdue are required");
    }
    const { client_name: clientName, invoice_amount: invoiceAmount, days_overdue: daysOverdue } =
      draftParsed.data;

    const quota = await checkDraftQuota(env, account, ip, null);
    if (!quota.allowed) throw new Error(quota.error);

    const draft = await generateFollowUpEmail(env, {
      clientName,
      invoiceAmount,
      daysOverdue: Math.max(0, daysOverdue),
    });
    await incrementDraftUsage(env, usageScopeKey(account, ip, null));
    if (!account) await incrementDraftUsage(env, anonIpCapScope("draft", ip));
    return textResult(
      JSON.stringify(
        {
          ...draft,
          tone_band: getToneBand(Math.max(0, daysOverdue)),
          tip: chaseTip(Math.max(0, daysOverdue)),
          note: "Draft only — copy into your own email client. docstoc never sends for you.",
        },
        null,
        2
      )
    );
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(
  env: Env,
  ip: string,
  req: JsonRpcRequest,
  account: AccountContext | null
): Promise<unknown> {
  const { id, method, params } = req;

  if (!method) return err(id, -32600, "Invalid Request");

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "docstoc helps draft invoice follow-up emails. Use draft_chase_email for copy-ready drafts. Tools never send email or change data.",
    });
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return null; // notification — no response body needed for some transports
  }

  if (method === "ping") {
    return ok(id, {});
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = String((params as { name?: string })?.name ?? "");
    const args = ((params as { arguments?: Record<string, unknown> })?.arguments ??
      {}) as Record<string, unknown>;
    if (name === "draft_chase_email" && !account) {
      return err(id, -32001, "Sign in or provide Bearer API key for draft_chase_email");
    }
    try {
      const result = await callTool(env, ip, account, name, args);
      return ok(id, result);
    } catch (e) {
      return ok(id, {
        isError: true,
        content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }],
      });
    }
  }

  // Optional: resources empty
  if (method === "resources/list") {
    return ok(id, { resources: [] });
  }
  if (method === "prompts/list") {
    return ok(id, { prompts: [] });
  }

  return err(id, -32601, `Method not found: ${method}`);
}

const mcp = new Hono<{ Bindings: Env }>();

mcp.all("/", async (c) => {
  // CORS for browser-based connectors
  const origin = c.req.header("Origin") || "*";
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };

  if (c.req.method === "GET") {
    // Human-friendly hint — connectors use POST
    return c.json(
      {
        name: "docstoc MCP",
        endpoint: "/mcp",
        auth: "session_or_api_key for draft_chase_email",
        note: "This is a server address for AI assistants (Claude, ChatGPT, Grok, Perplexity) — not a page to browse. POST JSON-RPC to call tools.",
        tools: TOOLS.map((t) => t.name),
        docs: `${c.env.PUBLIC_APP_URL}/ai#mcp`,
      },
      200,
      corsHeaders
    );
  }

  if (c.req.method === "DELETE") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (c.req.method !== "POST") {
    return c.json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const ip = clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });
  const mcpAccount = await resolveMcpAccount(c as Context<{ Bindings: Env }>);
  const mcpRl = await checkRateLimit(c.env, `mcp:${ip}`, 120, 3600);
  if (!mcpRl.ok) {
    return c.json(err(null, -32000, "Rate limit exceeded"), 429, corsHeaders);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(err(null, -32700, "Parse error"), 400, corsHeaders);
  }

  // Batch or single
  const requests = Array.isArray(body) ? body : [body];
  const results: unknown[] = [];

  for (const raw of requests) {
    const req = raw as JsonRpcRequest;
    // Notifications (no id) — process but may return null
    if (req.method?.startsWith("notifications/") || req.id === undefined) {
      await handleRpc(c.env, ip, req, mcpAccount);
      continue;
    }
    results.push(await handleRpc(c.env, ip, req, mcpAccount));
  }

  // If only notifications, empty 202
  if (results.length === 0) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const payload = Array.isArray(body) ? results : results[0];
  return c.json(payload, 200, {
    ...corsHeaders,
    "Content-Type": "application/json",
  });
});

export default mcp;
