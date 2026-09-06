import type { Env } from "../types";
import { trackEvent } from "./analytics";
import type { Locale } from "./locale";

const ACCENT = "#EC683C";
const INK = "#1B3155";
const MUTED_HEX = "#6B7A90";
const PAPER = "#F2F4F8";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FOOTER_TEXT: Record<Locale, string> = {
  en: "Drafts only — you always send from your own inbox",
  es: "Solo borradores — siempre envías tú desde tu bandeja",
};

/** Shared branded shell — same Swipesign-style pattern as Docracy: gray canvas, white card,
 *  centered logo, pill CTA. */
export function emailShell(appUrl: string, bodyHtml: string, locale: Locale = "en"): string {
  const logo = `${appUrl.replace(/\/$/, "")}/brand/docstoc-icon.png`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;max-width:520px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 32px 8px 32px;">
            <img src="${logo}" alt="docstoc" width="40" height="40" style="display:block;width:40px;height:40px;margin:0 auto 8px;border-radius:8px;" />
            <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:${ACCENT};">docstoc</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 36px 36px 36px;">
            ${bodyHtml}
          </td>
        </tr>
      </table>
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr>
          <td style="padding:24px 32px 0 32px;text-align:center;font-size:12px;color:${MUTED_HEX};line-height:1.6;">
            ${FOOTER_TEXT[locale]} · <a href="${appUrl}" style="color:${MUTED_HEX};text-decoration:underline;">docstoc</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

export function emailHeadline(text: string): string {
  return `<p style="margin:0 0 20px 0;font-size:22px;font-weight:700;color:${ACCENT};text-align:center;line-height:1.3;">${escapeHtml(text)}</p>`;
}

export function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td align="center" style="border-radius:999px;background:${ACCENT};">
    <a href="${url}" style="display:inline-block;padding:14px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

const SIGN_OFF_TEXT: Record<Locale, string> = {
  en: "Until soon,",
  es: "Hasta pronto,",
};

export function signOff(locale: Locale = "en"): string {
  return `<p style="margin:28px 0 0 0;font-size:15px;color:${INK};line-height:1.5;">${SIGN_OFF_TEXT[locale]}<br><em style="font-style:italic;color:${MUTED_HEX};">docstoc</em></p>`;
}

function appUrl(env: Env): string {
  return (env.PUBLIC_APP_URL || "https://docstoc.io").replace(/\/$/, "");
}

const MAGIC_LINK_COPY: Record<Locale, { subject: string; headline: string; body: string; cta: string; note: string }> = {
  en: {
    subject: "Your docstoc sign-in link",
    headline: "Sign in to docstoc",
    body: "Click the button below to sign in. This link expires in 15 minutes and can only be used once.",
    cta: "Sign in",
    note: "If you didn't request this, you can safely ignore this email.",
  },
  es: {
    subject: "Tu enlace de inicio de sesión de docstoc",
    headline: "Inicia sesión en docstoc",
    body: "Haz clic en el botón para iniciar sesión. Este enlace caduca en 15 minutos y solo se puede usar una vez.",
    cta: "Iniciar sesión",
    note: "Si no solicitaste esto, puedes ignorar este correo con tranquilidad.",
  },
};

export type EmailSendResult = { ok: true } | { ok: false; status?: number };

// Falls back to logging when RESEND_API_KEY isn't set, so local dev never blocks on a missing secret.
export async function sendMagicLinkEmail(
  env: Env,
  email: string,
  verifyUrl: string,
  locale: Locale = "en"
): Promise<EmailSendResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] magic link email queued for ${email} (token not logged)`);
    await trackEvent(env, {
      name: "email_sent",
      properties: { type: "onboarding", channel: "dev" },
      path: "/api/auth/request",
    }).catch(() => {});
    return { ok: true };
  }

  const copy = MAGIC_LINK_COPY[locale];
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.body}
    </p>
    ${ctaButton(verifyUrl, copy.cta)}
    <p style="margin:0;font-size:13px;color:${MUTED_HEX};line-height:1.5;">
      ${copy.note}
    </p>
    ${signOff(locale)}
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [email],
      subject: copy.subject,
      html: emailShell(appUrl(env), body, locale),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Resend send failed (${res.status}): ${detail}`);
    await trackEvent(env, {
      name: "email_bounced",
      properties: { type: "onboarding", status: res.status },
      path: "/api/auth/request",
    }).catch(() => {});
    return { ok: false, status: res.status };
  }

  await trackEvent(env, {
    name: "email_sent",
    properties: { type: "onboarding" },
    path: "/api/auth/request",
  }).catch(() => {});
  return { ok: true };
}

const TEAM_INVITE_COPY: Record<
  Locale,
  { subject: (inviter: string) => string; headline: string; body: (inviter: string, to: string) => string; cta: string }
> = {
  en: {
    subject: (inviter) => `${inviter} invited you to a docstoc workspace`,
    headline: "You're invited to a docstoc workspace",
    body: (inviter, to) =>
      `${escapeHtml(inviter)} invited you to collaborate on invoice follow-ups in docstoc. Sign in with <strong>${escapeHtml(to)}</strong> to join. docstoc never emails your clients — drafts only.`,
    cta: "Accept invite",
  },
  es: {
    subject: (inviter) => `${inviter} te invitó a un espacio de trabajo de docstoc`,
    headline: "Te invitaron a un espacio de trabajo de docstoc",
    body: (inviter, to) =>
      `${escapeHtml(inviter)} te invitó a colaborar en seguimientos de facturas en docstoc. Inicia sesión con <strong>${escapeHtml(to)}</strong> para unirte. docstoc nunca envía correos a tus clientes — solo borradores.`,
    cta: "Aceptar invitación",
  },
};

/** `locale` is the inviter's own preference (see team.ts sendInviteEmail) — the invitee hasn't
 *  signed up yet, so there's nothing else to go on. */
export async function sendTeamInviteEmail(
  env: Env,
  to: string,
  inviterEmail: string,
  inviteUrl: string,
  locale: Locale = "en"
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] team invite email queued for ${to} (link not logged)`);
    return;
  }

  const copy = TEAM_INVITE_COPY[locale];
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.body(inviterEmail, to)}
    </p>
    ${ctaButton(inviteUrl, copy.cta)}
    ${signOff(locale)}
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [to],
      subject: copy.subject(inviterEmail),
      html: emailShell(appUrl(env), body, locale),
    }),
  });
  if (!res.ok) {
    console.error(`Resend invite failed (${res.status}): ${await res.text()}`);
  }
}

const SOX_APPROVAL_COPY: Record<
  Locale,
  {
    subject: (client: string) => string;
    headline: string;
    body: (requester: string, client: string, subject: string | null) => string;
    cta: string;
  }
> = {
  en: {
    subject: (client) => `SOX send approval needed: ${client}`,
    headline: "Chase send needs your approval",
    body: (requester, client, subject) =>
      `<strong>${escapeHtml(requester)}</strong> requested maker-checker approval to mark a chase as sent for <strong>${escapeHtml(client)}</strong>${
        subject ? ` — “${escapeHtml(subject)}”` : ""
      }. Open SOX reporting to approve or reject. The requester cannot approve their own send.`,
    cta: "Review approvals",
  },
  es: {
    subject: (client) => `Aprobación SOX de envío: ${client}`,
    headline: "Un cobro necesita tu aprobación",
    body: (requester, client, subject) =>
      `<strong>${escapeHtml(requester)}</strong> pidió aprobación maker-checker para marcar un cobro como enviado de <strong>${escapeHtml(client)}</strong>${
        subject ? ` — “${escapeHtml(subject)}”` : ""
      }. Abre Informes SOX para aprobar o rechazar. Quien solicita no puede aprobarse a sí mismo.`,
    cta: "Revisar aprobaciones",
  },
};

/** Notify workspace teammates when someone requests maker-checker send approval. */
export async function sendSoxApprovalRequestEmail(
  env: Env,
  to: string,
  input: {
    clientName: string;
    requestedByEmail: string;
    subject: string | null;
    locale?: Locale;
  }
): Promise<void> {
  const locale = input.locale ?? "en";
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] SOX approval email queued for ${to} (${input.clientName})`);
    return;
  }
  const copy = SOX_APPROVAL_COPY[locale];
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.body(input.requestedByEmail, input.clientName, input.subject)}
    </p>
    ${ctaButton(`${appUrl(env)}/app/sox-reporting`, copy.cta)}
    ${signOff(locale)}
  `;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [to],
      subject: copy.subject(input.clientName).slice(0, 200),
      html: emailShell(appUrl(env), body, locale),
    }),
  });
  if (!res.ok) {
    console.error(`Resend SOX approval email failed (${res.status}): ${await res.text()}`);
  }
}

const PAYMENT_FAILED_COPY: Record<Locale, { subject: string; headline: string; body: string; cta: string }> = {
  en: {
    subject: "Action needed: your docstoc payment failed",
    headline: "We couldn't charge your card",
    body: "Stripe tried to renew your docstoc subscription but the payment didn't go through. Your account is still active — update your card to avoid an interruption.",
    cta: "Update billing",
  },
  es: {
    subject: "Acción necesaria: falló tu pago de docstoc",
    headline: "No pudimos cobrar tu tarjeta",
    body: "Stripe intentó renovar tu suscripción de docstoc, pero el pago no se completó. Tu cuenta sigue activa — actualiza tu tarjeta para evitar una interrupción.",
    cta: "Actualizar facturación",
  },
};

/** Sent on Stripe's invoice.payment_failed — a heads-up, not an access change. Stripe's own retry
 *  schedule (and eventual subscription cancellation) is what actually revokes paid status; this
 *  just gives the account owner a chance to fix their card before that happens. */
export async function sendPaymentFailedEmail(env: Env, email: string, locale: Locale = "en"): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] payment-failed email queued for ${email}`);
    return;
  }

  const copy = PAYMENT_FAILED_COPY[locale];
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0 0 12px 0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.body}
    </p>
    ${ctaButton(`${appUrl(env)}/app/account`, copy.cta)}
    ${signOff(locale)}
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [email],
      subject: copy.subject,
      html: emailShell(appUrl(env), body, locale),
    }),
  });
  if (!res.ok) {
    console.error(`Resend payment-failed email failed (${res.status}): ${await res.text()}`);
  }
}

/** Let's Encrypt certs are 90 days with no per-registrar DNS API to renew unattended (hand-rolled
 *  DNS-01 needs a human to re-paste a TXT value) — this is a reminder to re-verify, not a silent
 *  auto-renewal. See lib/customerCertificates.ts's listExpiringSoon, called from the daily cron
 *  branch in index.ts. */
export async function sendCertExpiryReminderEmail(env: Env, email: string, domain: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] cert-expiry reminder email queued for ${email} (${domain})`);
    return;
  }

  const body = `
    ${emailHeadline("Your certificate for " + escapeHtml(domain) + " is expiring soon")}
    <p style="margin:0 0 12px 0;font-size:15px;color:${INK};line-height:1.55;">
      Its SSL certificate expires within 30 days. docstoc can't renew it automatically — open your
      custom domains page and click "Renew" to get a new DNS record to add, then verify it.
    </p>
    ${ctaButton(`${appUrl(env)}/app/ssl-domains`, "Renew certificate")}
    ${signOff("en")}
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [email],
      subject: `Renew your certificate for ${domain}`,
      html: emailShell(appUrl(env), body, "en"),
    }),
  });
  if (!res.ok) {
    console.error(`Resend cert-expiry reminder email failed (${res.status}): ${await res.text()}`);
  }
}

function greetingName(email: string): string {
  const local = email.split("@")[0] || "";
  const token = local.split(/[._+-]/)[0] || "";
  if (!token || token.length < 2) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

// Blog articles themselves are English-only content (no Spanish version exists), so titles stay in
// English even in the es copy below — only the surrounding email copy is translated. Linking to a
// Spanish title for an English page would be worse than an honest English link.
const TEMPLATES_ARTICLES = [
  { title: "How to follow up on overdue invoices (without burning bridges)", href: "/blog/how-to-follow-up-on-overdue-invoices/" },
  { title: "Building an AR policy that works with docstoc", href: "/blog/ar-policy-that-works-with-docstoc/" },
  { title: "Freelancer late payment policy", href: "/blog/freelancer-late-payment-policy/" },
];

const TEMPLATES_WELCOME_COPY: Record<
  Locale,
  {
    subject: string;
    greeting: (name: string) => string;
    intro: string;
    downloadCta: string;
    readsIntro: string;
    tryIntro: string;
    tryCta: string;
    freeNote: string;
    unsubscribe: string;
  }
> = {
  en: {
    subject: "Your polite invoice templates (plus a few reads)",
    greeting: (name) => `Hi ${name},`,
    intro:
      "Thanks for downloading our politely worded invoice templates. They’re yours to copy, personalize, and send from your own inbox — no awkward blank page.",
    downloadCta: "Download the PDF again",
    readsIntro: "We keep publishing practical notes for freelancers and small teams. These may help next:",
    tryIntro:
      "Prefer not to rewrite every chase by hand? Paste unpaid invoices into docstoc and get a tone-matched draft for how late each one is. You still send — clients always hear from you, not from an automated collections domain.",
    tryCta: "Try docstoc free",
    freeNote: "Five AI drafts per month on Free · no card required.",
    unsubscribe: "Unsubscribe from template updates",
  },
  es: {
    subject: "Tus plantillas de facturas (y algunas lecturas)",
    greeting: (name) => `Hola ${name},`,
    intro:
      "Gracias por descargar nuestras plantillas de facturas con un tono cordial. Son tuyas para copiar, personalizar y enviar desde tu propia bandeja — sin la incómoda hoja en blanco.",
    downloadCta: "Descargar el PDF de nuevo",
    readsIntro: "Seguimos publicando notas prácticas para freelancers y equipos pequeños. Estas pueden ayudarte después:",
    tryIntro:
      "¿Prefieres no reescribir cada seguimiento a mano? Pega facturas impagas en docstoc y recibe un borrador con el tono correcto según el retraso de cada una. Tú sigues enviando — tus clientes siempre te escuchan a ti, no a un dominio automatizado de cobranza.",
    tryCta: "Probar docstoc gratis",
    freeNote: "Cinco borradores con IA al mes en el plan Gratis · sin tarjeta.",
    unsubscribe: "Darse de baja de actualizaciones de plantillas",
  },
};

/** Welcome email after someone downloads the polite templates PDF pack. */
export async function sendTemplatesPackWelcomeEmail(
  env: Env,
  email: string,
  opts: { downloadUrl: string; unsubUrl: string; firstName?: string | null },
  locale: Locale = "en"
): Promise<void> {
  const base = appUrl(env);
  const name = (opts.firstName && opts.firstName.trim()) || greetingName(email);
  const copy = TEMPLATES_WELCOME_COPY[locale];

  const articleList = TEMPLATES_ARTICLES.map(
    (a) =>
      `<li style="margin:0 0 8px 0;"><a href="${base}${a.href}" style="color:${ACCENT};text-decoration:underline;">${escapeHtml(a.title)}</a></li>`
  ).join("");

  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.greeting(escapeHtml(name))}
    </p>
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.intro}
    </p>
    ${ctaButton(opts.downloadUrl, copy.downloadCta)}
    <p style="margin:0 0 12px 0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.readsIntro}
    </p>
    <ul style="margin:0 0 20px 0;padding-left:20px;font-size:15px;color:${INK};line-height:1.5;">
      ${articleList}
    </ul>
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">
      ${copy.tryIntro}
    </p>
    ${ctaButton(`${base}/app/`, copy.tryCta)}
    <p style="margin:0;font-size:13px;color:${MUTED_HEX};line-height:1.5;">
      ${copy.freeNote}
    </p>
    ${signOff(locale)}
    <p style="margin:24px 0 0 0;font-size:11px;color:${MUTED_HEX};line-height:1.55;text-align:center;">
      RELACON GmbH · Elisabethstraße 15/5b · 1010 Vienna · Austria<br/>
      <a href="${opts.unsubUrl}" style="color:${MUTED_HEX};text-decoration:underline;">${copy.unsubscribe}</a>
    </p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[dev] templates-pack welcome queued for ${email}`);
    await trackEvent(env, {
      name: "email_sent",
      properties: { type: "templates_pack_welcome", channel: "dev" },
      path: "/api/leads/templates-pack",
    }).catch(() => {});
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [email],
      subject: copy.subject,
      html: emailShell(base, body, locale),
    }),
  });

  if (!res.ok) {
    console.error(`Resend templates-pack welcome failed (${res.status}): ${await res.text()}`);
    await trackEvent(env, {
      name: "email_bounced",
      properties: { type: "templates_pack_welcome", status: res.status },
      path: "/api/leads/templates-pack",
    }).catch(() => {});
    return;
  }

  await trackEvent(env, {
    name: "email_sent",
    properties: { type: "templates_pack_welcome" },
    path: "/api/leads/templates-pack",
  }).catch(() => {});
}

const MARKETING_UNSUB_TEXT: Record<Locale, string> = {
  en: "Unsubscribe from product news",
  es: "Darse de baja de novedades del producto",
};

/** Admin-composed product news/update email — only sent to accounts.marketing_opt_in accounts,
 *  each with their own unsubscribe token. Subject/body are free text from the admin broadcast
 *  form (routes/admin.ts); this just wraps them in the branded shell with a locale-aware
 *  unsubscribe footer. */
export async function sendMarketingEmail(
  env: Env,
  to: string,
  opts: { subject: string; bodyHtml: string; unsubUrl: string },
  locale: Locale = "en"
): Promise<{ ok: boolean; status?: number }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] marketing email queued for ${to}: ${opts.subject}`);
    return { ok: true };
  }

  const body = `
    ${opts.bodyHtml}
    ${signOff(locale)}
    <p style="margin:20px 0 0 0;font-size:11px;color:${MUTED_HEX};line-height:1.5;text-align:center;">
      <a href="${opts.unsubUrl}" style="color:${MUTED_HEX};text-decoration:underline;">${MARKETING_UNSUB_TEXT[locale]}</a>
    </p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [to],
      subject: opts.subject,
      html: emailShell(appUrl(env), body, locale),
    }),
  });
  if (!res.ok) {
    console.error(`Resend marketing email failed (${res.status}) to=${to}: ${await res.text()}`);
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

/** SPA hydrate failure (Sign in / Start free) — recipient is usually FEEDBACK_EMAIL / founder@docstoc.io. */
export async function sendSpaSmokeAlert(
  env: Env,
  to: string,
  failures: { name: string; detail?: string }[]
): Promise<void> {
  const lines = failures
    .map((f) => `<li><strong>${escapeHtml(f.name)}</strong>: ${escapeHtml(f.detail ?? "failed")}</li>`)
    .join("");
  const body = `
    ${emailHeadline("docstoc SPA smoke check failed")}
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">
      Sign in (/app/login) or Start free (/app/) may be stuck because the main JS bundle is not
      serving as JavaScript (often <code>text/html</code> SPA fallback).
    </p>
    <ul style="margin:0;padding-left:20px;font-size:14px;color:${INK};line-height:1.6;">${lines}</ul>
    <p style="margin:20px 0 0 0;font-size:13px;color:${MUTED_HEX};line-height:1.5;">
      Deduped: alert on new failure, then every 6 hours while still down.
    </p>
    ${signOff()}
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[dev] spa smoke alert to=${to}\n${body}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [to],
      subject: "docstoc: Sign in / Start free broken (SPA JS)",
      html: emailShell(appUrl(env), body),
    }),
  });
  if (!res.ok) {
    console.error(`Resend spa smoke alert failed (${res.status}): ${await res.text()}`);
  }
}

/** Marketing assistant “Contact sales” form — forward to sales@docstoc.io. */
export async function sendContactInquiryEmail(
  env: Env,
  fromEmail: string,
  message: string
): Promise<void> {
  const to = "sales@docstoc.io";
  const body = `
    ${emailHeadline("New sales inquiry")}
    <p style="margin:0 0 12px 0;font-size:15px;color:${INK};line-height:1.55;">
      <strong>From:</strong> ${escapeHtml(fromEmail)}
    </p>
    <p style="margin:0;font-size:15px;color:${INK};line-height:1.55;white-space:pre-wrap;">${escapeHtml(message)}</p>
    ${signOff()}
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[dev] contact inquiry to=${to} from=${fromEmail}\n${message}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <hello@docstoc.io>`,
      to: [to],
      reply_to: fromEmail,
      subject: `docstoc sales inquiry from ${fromEmail}`,
      html: emailShell(appUrl(env), body),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend contact inquiry failed (${res.status}): ${await res.text()}`);
  }

  trackEvent(env, {
    name: "contact_inquiry_sent",
    properties: { type: "sales_assistant" },
    path: "/api/leads/contact",
  }).catch(() => {});
}

const ONBOARDING_NUDGE_COPY: Record<
  Locale,
  {
    subject: string;
    headline: string;
    body: string;
    productsHtml: (base: string) => string;
    cta: string;
    note: string;
  }
> = {
  en: {
    subject: "5 tools on docstoc — pick one to try",
    headline: "You signed up a couple of days ago — here's what's inside.",
    body:
      "Everything below lives on one platform. Start with whichever tool fits your workflow today:",
    productsHtml: (base) => `
      <ul style="margin:0 0 20px 0;padding-left:20px;font-size:15px;color:${INK};line-height:1.65;">
        <li style="margin-bottom:10px;"><strong>Document templates</strong> — 1,000+ free NDAs, contracts, and HR forms to copy and edit. <a href="${base}/document-templates" style="color:${ACCENT};">Browse templates →</a></li>
        <li style="margin-bottom:10px;"><strong>SSL for your domain</strong> — Managed TLS certificates with automatic renewal. <a href="${base}/ssl-domains" style="color:${ACCENT};">Manage SSL →</a></li>
        <li style="margin-bottom:10px;"><strong>Document certificates</strong> — Tamper-evident SHA-256 fingerprint + public verify link for any file. <a href="${base}/certificates" style="color:${ACCENT};">Certify a file →</a></li>
        <li style="margin-bottom:10px;"><strong>Invoice generator</strong> — Build a clean PDF invoice right in your browser. <a href="${base}/tools/invoice-generator" style="color:${ACCENT};">Create invoice →</a></li>
        <li style="margin-bottom:0;"><strong>AI invoice chasing</strong> — Draft polite payment reminders (always sent securely from your own inbox). <a href="${base}/app?view=overdue" style="color:${ACCENT};">Open chases →</a></li>
      </ul>`,
    cta: "Open your dashboard",
    note: "Free tier included — upgrade only when you need Pro features like Google sync or unlimited AI drafts.",
  },
  es: {
    subject: "5 herramientas en docstoc — elige una para probar",
    headline: "Te registraste hace un par de días — esto es lo que incluye.",
    body:
      "Todo lo siguiente está en una sola plataforma. Empieza por la herramienta que encaje con tu flujo de trabajo hoy:",
    productsHtml: (base) => `
      <ul style="margin:0 0 20px 0;padding-left:20px;font-size:15px;color:${INK};line-height:1.65;">
        <li style="margin-bottom:10px;"><strong>Plantillas de documentos</strong> — Más de 1.000 NDAs, contratos y formularios HR gratis para copiar. <a href="${base}/document-templates" style="color:${ACCENT};">Ver plantillas →</a></li>
        <li style="margin-bottom:10px;"><strong>SSL para tu dominio</strong> — Certificados TLS gestionados con renovación automática. <a href="${base}/ssl-domains" style="color:${ACCENT};">Gestionar SSL →</a></li>
        <li style="margin-bottom:10px;"><strong>Certificados de documentos</strong> — Huella SHA-256 + enlace público de verificación. <a href="${base}/certificates" style="color:${ACCENT};">Certificar archivo →</a></li>
        <li style="margin-bottom:10px;"><strong>Generador de facturas</strong> — Crea una factura PDF limpia directamente en el navegador. <a href="${base}/tools/invoice-generator" style="color:${ACCENT};">Crear factura →</a></li>
        <li style="margin-bottom:0;"><strong>Seguimiento de facturas con IA</strong> — Borradores de recordatorios de pago (siempre enviados de forma segura desde tu propia bandeja). <a href="${base}/app?view=overdue" style="color:${ACCENT};">Abrir seguimientos →</a></li>
      </ul>`,
    cta: "Abrir tu panel",
    note: "Incluye nivel gratuito — mejora solo cuando necesites Pro (Google, borradores IA ilimitados, etc.).",
  },
};

const PAID_ONBOARDING_NUDGE_COPY: Record<
  Locale,
  {
    subject: string;
    headline: string;
    body: string;
    stepsHtml: (base: string) => string;
    cta: string;
    note: string;
  }
> = {
  en: {
    subject: "Your docstoc plan is ready — pick a next step",
    headline: "A couple of days in — finish one thing today.",
    body:
      "You already have Pro. The fastest way to feel it working is to complete a single concrete step:",
    stepsHtml: (base) => `
      <ul style="margin:0 0 20px 0;padding-left:20px;font-size:15px;color:${INK};line-height:1.65;">
        <li style="margin-bottom:10px;"><strong>Send an invoice</strong> — Open a draft (or start a new one) and send it. <a href="${base}/app/invoices" style="color:${ACCENT};">Open invoices →</a></li>
        <li style="margin-bottom:10px;"><strong>Chase an overdue invoice</strong> — Draft a polite reminder and send it from your own inbox. <a href="${base}/app?view=overdue" style="color:${ACCENT};">Open chases →</a></li>
        <li style="margin-bottom:10px;"><strong>Add SSL for your domain</strong> — Managed TLS with automatic renewal, plus your company badge. <a href="${base}/ssl-domains" style="color:${ACCENT};">Manage SSL →</a></li>
        <li style="margin-bottom:0;"><strong>Certify a document</strong> — Tamper-evident SHA-256 fingerprint + public verify link. <a href="${base}/certificates" style="color:${ACCENT};">Certify a file →</a></li>
      </ul>`,
    cta: "Open your dashboard",
    note: "Stuck on anything? Just reply to this email — we read every reply.",
  },
  es: {
    subject: "Tu plan de docstoc está listo — elige el siguiente paso",
    headline: "Llevas un par de días — termina una cosa hoy.",
    body:
      "Ya tienes Pro. La forma más rápida de notarlo es completar un solo paso concreto:",
    stepsHtml: (base) => `
      <ul style="margin:0 0 20px 0;padding-left:20px;font-size:15px;color:${INK};line-height:1.65;">
        <li style="margin-bottom:10px;"><strong>Envía una factura</strong> — Abre un borrador (o crea uno nuevo) y envíalo. <a href="${base}/app/invoices" style="color:${ACCENT};">Abrir facturas →</a></li>
        <li style="margin-bottom:10px;"><strong>Haz seguimiento de una factura vencida</strong> — Redacta un recordatorio educado y envíalo desde tu bandeja. <a href="${base}/app?view=overdue" style="color:${ACCENT};">Abrir seguimientos →</a></li>
        <li style="margin-bottom:10px;"><strong>Añade SSL para tu dominio</strong> — TLS gestionado con renovación automática y tu company badge. <a href="${base}/ssl-domains" style="color:${ACCENT};">Gestionar SSL →</a></li>
        <li style="margin-bottom:0;"><strong>Certifica un documento</strong> — Huella SHA-256 a prueba de manipulación + enlace público de verificación. <a href="${base}/certificates" style="color:${ACCENT};">Certificar archivo →</a></li>
      </ul>`,
    cta: "Abrir tu panel",
    note: "¿Algo se atasca? Responde a este correo — leemos cada respuesta.",
  },
};

/** One-time nudge ~2 days after signup if the free account never activated any product. */
export async function sendOnboardingNudgeEmail(
  env: Env,
  email: string,
  locale: Locale = "en"
): Promise<EmailSendResult> {
  const copy = ONBOARDING_NUDGE_COPY[locale];
  const base = appUrl(env);
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">${copy.body}</p>
    ${copy.productsHtml(base)}
    ${ctaButton(`${base}/app`, copy.cta)}
    <p style="margin:0;font-size:13px;color:${MUTED_HEX};line-height:1.5;">${copy.note}</p>
    ${signOff(locale)}
  `;

  return sendNudgeEmail(env, email, locale, {
    subject: copy.subject,
    body,
    type: "onboarding_nudge",
  });
}

/** One-time nudge ~2 days after a paid plan starts — push toward a first completed win. */
export async function sendPaidOnboardingNudgeEmail(
  env: Env,
  email: string,
  locale: Locale = "en"
): Promise<EmailSendResult> {
  const copy = PAID_ONBOARDING_NUDGE_COPY[locale];
  const base = appUrl(env);
  const body = `
    ${emailHeadline(copy.headline)}
    <p style="margin:0 0 16px 0;font-size:15px;color:${INK};line-height:1.55;">${copy.body}</p>
    ${copy.stepsHtml(base)}
    ${ctaButton(`${base}/app`, copy.cta)}
    <p style="margin:0;font-size:13px;color:${MUTED_HEX};line-height:1.5;">${copy.note}</p>
    ${signOff(locale)}
  `;

  return sendNudgeEmail(env, email, locale, {
    subject: copy.subject,
    body,
    type: "paid_onboarding_nudge",
  });
}

async function sendNudgeEmail(
  env: Env,
  email: string,
  locale: Locale,
  opts: { subject: string; body: string; type: "onboarding_nudge" | "paid_onboarding_nudge" }
): Promise<EmailSendResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev] ${opts.type} queued for ${email}`);
    await trackEvent(env, {
      name: "email_sent",
      properties: { type: opts.type, channel: "dev" },
      path: "/cron/onboarding-nudge",
    }).catch(() => {});
    return { ok: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `docstoc <login@docstoc.io>`,
      to: [email],
      subject: opts.subject,
      html: emailShell(appUrl(env), opts.body, locale),
    }),
  });

  if (!res.ok) {
    console.error(`Resend ${opts.type} failed (${res.status}): ${await res.text()}`);
    await trackEvent(env, {
      name: "email_bounced",
      properties: { type: opts.type, status: res.status },
      path: "/cron/onboarding-nudge",
    }).catch(() => {});
    return { ok: false, status: res.status };
  }

  await trackEvent(env, {
    name: "email_sent",
    properties: { type: opts.type },
    path: "/cron/onboarding-nudge",
  }).catch(() => {});
  return { ok: true };
}
