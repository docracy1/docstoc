import type { Env } from "../types";
import { sanitizeForPrompt, wrapUserContent } from "./validate";
import type { TemplateRecord } from "./documentTemplateMatch";

// "-latest" alias so this never goes stale as Google ships new models — verified live: currently
// resolves to gemini-3.8-flash. Override via GEMINI_MODEL to pin a specific version if needed
// (same override pattern as WORKERS_AI_MODEL in lib/ai.ts).
const DEFAULT_MODEL = "gemini-flash-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You draft business and legal documents in the same house style as docstoc.io's template library.
Output ONLY the document itself in Markdown — no preamble, no "Here is your document", no closing commentary.
Follow this structure: a "# Title" heading, bold metadata lines near the top (e.g. **Date:**, **Party:**) where relevant,
"## N. Section Name" numbered section headers, a plain-text signature block preceded by a "---" line, and end with a
short italicized disclaimer paragraph noting this is a general template, not legal advice, and a licensed professional
should review it before use — calibrate the disclaimer's strength to the document's actual legal risk.
Use the reference template's structure and section coverage as a model, but write fresh content tailored to the
user's specific situation — do not just copy the reference verbatim, and do not invent facts (names, amounts, dates)
the user did not provide; use bracketed placeholders like [Client Name] for anything unspecified.`;

export interface GeneratedDocument {
  title: string;
  bodyMarkdown: string;
  matchedTemplateSlug: string | null;
  matchedTemplateName: string | null;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function generateDocumentFromDescription(
  env: Env,
  description: string,
  reference: TemplateRecord | null
): Promise<GeneratedDocument> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError("AI document generation is temporarily unavailable.", 503);
  }

  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const userParts = [
    wrapUserContent("user_request", sanitizeForPrompt(description)),
    reference
      ? wrapUserContent(
          "reference_template",
          `Name: ${reference.name}\nCategory: ${reference.category}\n\n${reference.bodyMarkdown}`
        )
      : "[reference_template]\nNone matched — write from general best practice for this document type.\n[/reference_template]",
  ].join("\n\n");

  const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userParts }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("[geminiDocGen] API error", res.status, errBody.slice(0, 500));
    if (res.status === 429) {
      throw new GeminiError("Too many document generations right now. Try again in a minute.", 429);
    }
    throw new GeminiError("Could not generate the document. Try again in a moment.", 502);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  // Skip any part explicitly marked as an internal "thought" summary (thinking models can return
  // these alongside the real answer) — only the non-thought parts are the actual document.
  const text =
    candidate?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("") || "";
  if (!text.trim()) {
    if (candidate?.finishReason === "SAFETY") {
      throw new GeminiError(
        "That request couldn't be generated — try rephrasing the document you need.",
        400
      );
    }
    throw new GeminiError("Could not generate the document. Try again in a moment.", 502);
  }

  const titleMatch = text.match(/^#\s+(.+)$/m);
  return {
    title: titleMatch?.[1]?.trim() || reference?.name || "Generated Document",
    bodyMarkdown: text.trim(),
    matchedTemplateSlug: reference?.slug ?? null,
    matchedTemplateName: reference?.name ?? null,
  };
}
