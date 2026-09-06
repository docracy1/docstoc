/** SEO chase landing pages — main content + FAQ for generate-chase-landings.mjs */

export const CHASE_LANDINGS = [
  {
    slug: "scan-document",
    title: "Scan an Invoice With Your Phone — No Scanner Needed | docstoc",
    description:
      "Take a photo of a paper invoice — docstoc straightens and cleans it up in your browser, then imports it as a PDF ready to chase. Pro and Business plans.",
    breadcrumb: "Scan a document",
    faq: [
      {
        q: "Do I need a scanner or an app?",
        a: "No. It runs in your phone's browser, right on the New follow-up screen — nothing to install.",
      },
      {
        q: "Is scanning free?",
        a: "Scan-to-PDF import is included on Pro and Business, the same as regular PDF import. Free plan works with CSV import.",
      },
      {
        q: "What if it can't detect the page edges?",
        a: "You get your original photo instead, so you can still use it or retake it — it never leaves you stuck.",
      },
    ],
    main: `<h1>No scanner. Just your phone.</h1>
  <p class="lede">A paper invoice doesn't need a scanner anymore. Take a photo, docstoc straightens and crops it right in your browser, and it comes in as a normal PDF — ready to chase like any other invoice.</p>

  <h3>Why this matters</h3>
  <p>Not every invoice starts as a clean PDF. Some come from a paper copy, a printed statement, or a client who handed you something on the spot. Most "free" scanner apps want an account or a subscription before they'll give you a usable page — docstoc's scan tool is built into the same upload screen you already use.</p>

  <h3>How it works</h3>
  <p>Open New follow-up, tap Scan a document, and take a photo. docstoc detects the page edges, straightens the angle, and cleans it up — all on your device, before anything is imported. Scan multiple pages if you need to, then import it like a regular PDF.</p>

  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Try New follow-up</a></p>

  <h3>FAQ</h3>
  {{FAQ}}

  <h3>Related resources</h3>
  <ul>
    <li><a href="/guides/invoice-chasing/">Invoice chasing hub</a></li>
    <li><a href="/tools/invoice-chase-calculator">Invoice chase calculator</a></li>
    <li><a href="/invoice-follow-up">Invoice follow-up emails</a></li>
    <li><a href="/free-templates/">Free email templates</a></li>
  </ul>`,
  },
  {
    slug: "invoice-follow-up",
    title: "Invoice Follow-Up Email Template — Free Copy-Paste & AI Drafts | docstoc",
    description:
      "Free invoice follow-up email templates for every stage of late payment. Copy-paste reminders or get AI drafts matched to days overdue — send from your own inbox.",
    breadcrumb: "Invoice follow-up",
    faq: [
      {
        q: "Does docstoc send invoice follow-up emails for me?",
        a: "No. docstoc drafts the email — you review it and send from your own inbox. Clients always hear from you, not from us.",
      },
      {
        q: "Can I use docstoc invoice follow-ups for free?",
        a: "Yes — 5 AI drafts per month and 18+ copy-paste templates are free. Pro ($14.99/mo) adds unlimited drafts, QuickBooks/Xero sync, and tone adjustments.",
      },
      {
        q: "How does docstoc match tone to days overdue?",
        a: "Friendly under a week overdue, professional at 8–30 days, direct past 30 days. Paste invoice details and docstoc picks the right wording automatically.",
      },
    ],
    main: `<h1>Invoice follow-up emails that match how late the payment is</h1>
  <p class="lede">docstoc drafts invoice follow-up emails for freelancers — friendly when an invoice is a few days late, firmer when it has been sitting for weeks. You send from your own inbox.</p>

  <h3>Why follow-ups stall</h3>
  <p>Most freelancers know they should chase unpaid invoices. The hard part is wording: too soft and nothing happens; too sharp and you risk the relationship. docstoc removes that guesswork by matching tone to days overdue.</p>

  <h3>How docstoc helps</h3>
  <p>Paste client name, amount, and due date — or upload a CSV from QuickBooks, Xero, or your spreadsheet. docstoc writes a follow-up you can copy into Gmail, Outlook, or Apple Mail. No auto-send, no collections theater.</p>

  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Try free — 5 AI drafts</a></p>

  <h3>FAQ</h3>
  {{FAQ}}

  <h3>Related resources</h3>
  <ul>
    <li><a href="/guides/invoice-chasing/">Invoice chasing hub</a></li>
    <li><a href="/tools/invoice-chase-calculator">Invoice chase calculator</a></li>
    <li><a href="/payment-reminder">Payment reminder emails</a></li>
    <li><a href="/overdue-invoice">Overdue invoice follow-up</a></li>
    <li><a href="/freelancer-invoice-follow-up">Freelancer invoice follow-up guide</a></li>
    <li><a href="/free-templates/">18 free email templates</a></li>
    <li><a href="/unpaid-invoice-follow-up-templates">Unpaid invoice follow-up templates by stage</a></li>
    <li><a href="/features/ai-tone">AI tone matching</a></li>
  </ul>`,
  },
  {
    slug: "chase-invoices",
    title: "Chase Invoices — Free Payment Reminder Templates & AI Drafts | docstoc",
    description:
      "Chase unpaid invoices with free copy-paste email templates and AI follow-up drafts. Tone matched to days overdue — you send from your own inbox, no auto-send.",
    breadcrumb: "Chase invoices",
    faq: [
      {
        q: "What's the difference between chasing invoices and collections?",
        a: "Chasing is a polite follow-up you send yourself. Collections involves third parties and legal escalation. docstoc only drafts chase emails — you stay in control of when and how to send them.",
      },
      {
        q: "Does docstoc auto-send chase emails?",
        a: "No. docstoc writes the draft; you copy it into your email client and send it. Nothing goes out automatically and clients never hear from us directly.",
      },
      {
        q: "Can I sync overdue invoices from QuickBooks or Xero?",
        a: "Yes on Pro ($14.99/mo) and Business — native OAuth imports overdue invoices. Free tier supports CSV upload or manual entry.",
      },
    ],
    main: `<h1>Chase invoices — without the awkward email</h1>
  <p class="lede">Chasing payment is part of freelancing. docstoc handles the wording so you can focus on the relationship — paste invoices, get drafts, send from your inbox.</p>

  <h3>Chase, don't collect</h3>
  <p>docstoc is built for freelancers who want to get paid without sounding like a collections agency. We draft the email; you decide when and how to send it. Clients always hear from you, not from us.</p>

  <h3>A simple chase workflow</h3>
  <p>Add overdue invoices to docstoc (type them in, upload CSV, or sync from QuickBooks/Xero on paid plans). Review the draft, tweak tone with Soften or Firm up on Pro+, then copy to your email client. Mark done when paid.</p>

  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Start chasing — free</a></p>

  <h3>FAQ</h3>
  {{FAQ}}

  <h3>Related resources</h3>
  <ul>
    <li><a href="/guides/invoice-chasing/">Invoice chasing hub</a></li>
    <li><a href="/tools/invoice-chase-calculator">Invoice chase calculator</a></li>
    <li><a href="/invoice-follow-up">Invoice follow-up emails</a></li>
    <li><a href="/freelancer-invoice-follow-up">Freelancer invoice follow-up</a></li>
    <li><a href="/overdue-invoice">Overdue invoice reminders</a></li>
    <li><a href="/features/">docstoc features</a></li>
    <li><a href="/docs/">Getting started docs</a></li>
  </ul>`,
  },
  {
    slug: "payment-reminder",
    title: "Payment Reminder Email Template — Free Copy-Paste (28 Templates) | docstoc",
    description:
      "Free payment reminder email templates — before due date, gentle overdue, formal 30-day notice, and final warning. Copy-paste or AI drafts, no account required.",
    breadcrumb: "Payment reminder",
    faq: [
      {
        q: "When should I send a payment reminder?",
        a: "A courtesy reminder 7 days before the due date prevents most late payments. After the due date, send a gentle nudge at 1–3 days, then escalate at 7, 30, and 60 days.",
      },
      {
        q: "Are docstoc payment reminder templates free?",
        a: "Yes — 18+ copy-paste templates are free with no account required. AI drafts (5/month on Free) adjust tone automatically for your exact invoice.",
      },
      {
        q: "Does docstoc send payment reminders for me?",
        a: "No. docstoc drafts the reminder — you send it from your own inbox. Clients hear from you, not from us.",
      },
    ],
    main: `<h1>Payment reminder emails — before and after the due date</h1>
  <p class="lede">A good payment reminder is short, specific, and easy to act on. docstoc gives you free templates for every stage plus AI drafts when you want the wording done for you.</p>

  <h3>Before the due date</h3>
  <p>A reminder a week before payment is due prevents most late payments. It is not a chase — it is a courtesy nudge with invoice number, amount, and pay link. See our <a href="/free-templates/payment-reminder-before-due-date">payment reminder before due date template</a>.</p>

  <h3>After the due date</h3>
  <p>Once an invoice is overdue, tone matters. Start gentle at 1–3 days, then escalate at 7, 30, and 60 days. docstoc matches tone automatically, or browse the <a href="/free-templates/">free template library</a>.</p>

  <p style="margin-top:28px"><a href="/app/login?start=1" class="nav-cta">Draft a payment reminder</a></p>

  <h3>FAQ</h3>
  {{FAQ}}

  <h3>Related resources</h3>
  <ul>
    <li><a href="/guides/invoice-chasing/">Invoice chasing hub</a></li>
    <li><a href="/tools/invoice-chase-calculator">Invoice chase calculator</a></li>
    <li><a href="/invoice-follow-up">Invoice follow-up emails</a></li>
    <li><a href="/overdue-invoice">Overdue invoice reminders</a></li>
    <li><a href="/chase-invoices">How to chase invoices</a></li>
    <li><a href="/polite-payment-reminder-email">Polite payment reminder email — how to write one</a></li>
    <li><a href="/features/templates">Email templates feature</a></li>
    <li><a href="/blog/invoice-payment-reminder-email-templates/">Payment reminder template guide</a></li>
  </ul>`,
  },
];
