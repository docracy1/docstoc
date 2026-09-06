/**
 * Compare hub + alternative + import-from landings.
 * Hub shows 5 per sector (templates first). Import/alternative pages exist for every listed competitor.
 */

export const SECTORS = [
  {
    id: "templates",
    label: "Templates",
    hubTitle: "Document templates",
    hubLede: "Free business & legal documents — the original docstoc job.",
    ctaHref: "/document-templates/",
    ctaLabel: "Browse free templates",
    importCtaHref: "/document-templates/",
    importCtaLabel: "Open the template library",
  },
  {
    id: "invoices",
    label: "Invoices",
    hubTitle: "Invoicing",
    hubLede: "Create and share invoices, then follow up if they run late.",
    ctaHref: "/invoices",
    ctaLabel: "Invoices product",
    importCtaHref: "/tools/invoice-generator",
    importCtaLabel: "Create an invoice",
  },
  {
    id: "ssl",
    label: "SSL",
    hubTitle: "SSL certificates",
    hubLede: "Let’s Encrypt on your own domain — one DNS record, auto-renew.",
    ctaHref: "/ssl",
    ctaLabel: "SSL product",
    importCtaHref: "/app/login?start=1",
    importCtaLabel: "Add a domain",
  },
  {
    id: "certificates",
    label: "Certificates",
    hubTitle: "Document certificates",
    hubLede: "Prove a file hasn’t changed since you certified it.",
    ctaHref: "/certificate",
    ctaLabel: "Document certificates",
    importCtaHref: "/tools/file-hash-checker",
    importCtaLabel: "Hash a file",
  },
  {
    id: "chase",
    label: "Invoice chasing",
    hubTitle: "Invoice chasing",
    hubLede: "AI drafts you send yourself — not auto-spam.",
    ctaHref: "/features/ai-tone",
    ctaLabel: "AI chasing",
    importCtaHref: "/app/login?start=1",
    importCtaLabel: "Paste an invoice",
  },
  {
    id: "sox",
    label: "SOX / AR evidence",
    hubTitle: "SOX / AR evidence",
    hubLede: "Maker-checker chase sends and timestamped auditor packs — not a full GRC suite.",
    ctaHref: "/use-cases/sox-reporting",
    ctaLabel: "SOX reporting",
    importCtaHref: "/app/sox-reporting",
    importCtaLabel: "Open SOX reporting",
    hubImports: [
      { href: "/compliance/sox", label: "SOX compliance" },
      { href: "/use-cases/auditor-evidence-pack", label: "Auditor evidence pack" },
      { href: "/auditboard-alternative", label: "AuditBoard (files)" },
      { href: "/hyperproof-alternative", label: "Hyperproof (files)" },
    ],
  },
];

const DEFAULT_IMPORT = {
  templates: {
    noConnect:
      "There is no “connect your LegalZoom / Rocket Lawyer account” button. Those products do not give small-business plans a safe way to pull your whole library, and we will not ask for your password. Export the documents you actually use, then keep working in docstoc.",
    after:
      "Open the matching free template in docstoc (or paste your text into one), personalize the blanks, and optionally certify the finished file so anyone can verify it later.",
    once: "Copy the template — no account required.",
    reuse: "Save it in your workspace (Pro) and certify versions you send to clients.",
    where:
      "docstoc is not a paid legal-plan archive. Keep the files you care about in your own drive; use docstoc for the working copy and a tamper-evident certificate when you need proof.",
  },
  invoices: {
    noConnect:
      "We do not ask for your invoicing password. Native OAuth exists for QuickBooks Online and Xero on Pro+. For everyone else, export a CSV or PDF and bring the data across yourself.",
    after:
      "Create the invoice in docstoc, share the link, and if it goes overdue, generate a tone-matched follow-up draft you send from your own inbox.",
    once: "Paste the details or upload a CSV — Free works without signup for a first pass.",
    reuse: "Pro adds accounting sync (QuickBooks / Xero) so you are not retyping overdue invoices.",
    where:
      "Your books of record stay in Wave, FreshBooks, QuickBooks, or Xero if that is where you already file. docstoc is the invoice + follow-up layer, not a replacement general ledger.",
  },
  ssl: {
    noConnect:
      "You cannot “import” a live certificate private key into docstoc — and you should not email one to anyone. Issue a fresh Let’s Encrypt certificate on the same hostname, then retire the old renewal path.",
    after:
      "Add the domain in docstoc, publish the DNS TXT record we show you, wait for issuance, leave the TXT in place for renewals, then cancel the old vendor so you are not billed twice.",
    once: "One hostname on Pro.",
    reuse: "Business covers more domains, still with no separate per-certificate SSL fee.",
    where:
      "Your website host and DNS provider stay where they are. docstoc is not a CDN or nameserver — only ACME issuance and renewal.",
  },
  certificates: {
    noConnect:
      "File certificates are hashes of bytes, not e-sign envelopes. We do not connect to Adobe or DocuSign accounts. Export the original file you need to prove, then certify it here.",
    after:
      "Drop the file in the hash checker or create a certificate in the app. Share the verification link. Optional Bitcoin timestamping is available on accounts that enable it.",
    once: "Hash in the browser — the file does not need to leave your machine for a client-side check.",
    reuse: "Issue a full certificate when you want a durable public verify page.",
    where:
      "Keep the original file. The certificate proves that this exact file still matches — it is not a qualified electronic signature.",
  },
  chase: {
    noConnect:
      "We do not scrape your Chaser/Paidnice login. Export open invoices (CSV or from QuickBooks/Xero) and paste them into docstoc. Drafts stay in your workspace until you send them.",
    after:
      "Review the AI draft, copy it into Gmail/Outlook, or save to Gmail drafts if Google is connected. Nothing emails your clients until you do.",
    once: "Free includes 5 AI drafts per month.",
    reuse: "Pro is a flat workspace fee — not a revenue-tier AR suite.",
    where:
      "Your sending identity stays yours. docstoc never auto-sends chase mail from a collections domain.",
  },
};

function imp(sector, extra = {}) {
  return { ...DEFAULT_IMPORT[sector], ...extra };
}

/** @type {Array<Record<string, any>>} */
export const COMPETITORS = [
  /* —— Templates (hub first) —— */
  {
    slug: "legalzoom",
    name: "LegalZoom",
    sector: "templates",
    featured: true,
    headline: "A free-library alternative to LegalZoom.",
    sub: "Copy business & legal documents anytime — no membership for the templates themselves.",
    problem:
      "LegalZoom is the brand people know for formation and attorney plans. Ongoing document access is sold as a subscription or à la carte service, not a free copy library.",
    way: "docstoc’s template library is free, no account required. Formation, registered-agent, and attorney consults are still LegalZoom’s job — we don’t pretend otherwise.",
    compares: [
      "1,000 free business & legal templates — copy anytime",
      "No membership required to read or copy a template",
      "Optional document certificate (hash proof) on the finished file",
      "Invoices, SSL, and chase drafts in the same workspace if you upgrade",
      "Pro is a flat $14.99/mo — not a legal-plan retainer",
    ],
    importHero: "Bring your LegalZoom documents to docstoc",
    importLede: "No account-linking, no LegalZoom password. Export the PDFs you already paid for.",
    import: imp("templates", {
      exportSteps: [
        "Sign in to LegalZoom and open Documents (or the order that produced the file).",
        "Download the PDF or Word copy of each document you still use.",
        "Repeat for formation packets you need to keep — those stay your records.",
        "Keep anything that required a lawyer review in your own archive; templates here are general-use.",
      ],
      exportNote:
        "LegalZoom formation filings and attorney work product do not “convert” into our templates. You keep those files; you use docstoc for the next NDA, lease, or policy you would otherwise repurchase.",
    }),
  },
  {
    slug: "rocket-lawyer",
    name: "Rocket Lawyer",
    sector: "templates",
    featured: true,
    headline: "A no-membership alternative to Rocket Lawyer.",
    sub: "Unlimited free copies of common business documents — without an annual plan to unlock them.",
    problem:
      "Rocket Lawyer gates unlimited documents and e-sign behind membership. Fine if you want attorney Q&A bundled; expensive if you only needed the form.",
    way: "docstoc is the form library. Copy, personalize, certify. Ask a lawyer when the matter is real — we don’t sell attorney minutes.",
    compares: [
      "Free templates without a membership trial clock",
      "No per-document unlock after a 7-day trial",
      "Hash certificates for files you actually send",
      "Same workspace as invoices and SSL if you need them",
      "Flat Pro $14.99/mo when you want the rest of the product",
    ],
    importHero: "Bring your Rocket Lawyer documents to docstoc",
    importLede: "Export the PDFs from your membership. We will not ask for your Rocket Lawyer login.",
    import: imp("templates", {
      exportSteps: [
        "Sign in to Rocket Lawyer and open your documents / interviews.",
        "Download each finished document as PDF.",
        "If a document is still an interview, complete it once and download before you cancel membership.",
        "Store those PDFs in your drive — then use docstoc templates for the next round.",
      ],
    }),
  },
  {
    slug: "pandadoc",
    name: "PandaDoc",
    sector: "templates",
    featured: true,
    headline: "A template-library alternative to PandaDoc.",
    sub: "Ready legal/business forms and file proof — not a per-seat proposal CRM.",
    problem:
      "PandaDoc is a sales-document and e-sign workflow priced per seat. The free cap on documents is easy to hit. You pay for sending proposals, not for a public legal-template library.",
    way: "docstoc is the opposite job: copy a contract or policy for free, certify the file, invoice and chase if you need to. E-sign routing stays in PandaDoc if that is what you bought.",
    compares: [
      "Uncapped free template library (no 60-document/year cap)",
      "No per-seat tax for reading templates",
      "Tamper-evident file certificates",
      "Invoice + chase in the same account",
      "Honest: not a PandaDoc-style e-sign sequencer",
    ],
    importHero: "Bring your PandaDoc documents to docstoc",
    importLede: "Download completed PDFs from PandaDoc. Field blocks and routing do not transfer — the file does.",
    import: imp("templates", {
      exportSteps: [
        "Sign in to PandaDoc and open Documents or Templates.",
        "Download the completed PDF (or the source file attached to the template).",
        "Repeat for each template you still send.",
        "Optional: keep PandaDoc for e-sign; use docstoc for the next draft and a hash certificate.",
      ],
      exportNote:
        "PandaDoc’s field placement and signing order are proprietary. The PDF comes with you; the workflow does not. Recreate fields only if you still e-sign elsewhere.",
    }),
  },
  {
    slug: "google-workspace",
    name: "Google Workspace",
    sector: "templates",
    featured: true,
    headline: "Ready-made documents — not a blank Google Doc.",
    sub: "Start from a business/legal template instead of a blinking cursor.",
    problem:
      "Workspace is where drafts live. It is not a library of contractor agreements, leases, or demand letters. Teams reinvent the same form in Drive every quarter.",
    way: "Copy from docstoc, paste into Docs if you want, or keep working here. Certify the version you actually sent.",
    compares: [
      "1,000 starting points instead of a blank doc",
      "No extra Workspace SKU for “legal templates”",
      "Certificate link you can share with a counterparty",
      "Works alongside Drive — we are not asking you to leave Google",
      "Free to copy; Pro is optional",
    ],
    importHero: "Bring Google Docs and Drive files to docstoc",
    importLede: "Download or export the Doc/PDF. No Google admin OAuth required to copy a template.",
    import: imp("templates", {
      noConnect:
        "You do not grant docstoc access to your whole Drive to use templates. Export the file you care about. (Pro+ can import PDFs from Drive for invoicing/chase — that is a different, explicit connector.)",
      exportSteps: [
        "Open the Google Doc or Drive file.",
        "File → Download → PDF (or Word) for anything you need to certify.",
        "Copy-paste text into a docstoc template if you are rewriting, not archiving.",
        "Certify the export if you need a verify link.",
      ],
    }),
  },
  {
    slug: "bonsai",
    name: "Bonsai",
    sector: "templates",
    featured: true,
    headline: "A flatter alternative to Bonsai.",
    sub: "Free contracts and invoices without a per-seat freelancer OS.",
    problem:
      "Bonsai bundles time tracking, CRM, and contracts per seat. There is no real free template library, and a two-person team pays twice.",
    way: "docstoc is documents + invoices + proof + SSL + chase drafts at a flat workspace price. Keep Bonsai if you need its project OS.",
    compares: [
      "Free public template library",
      "Flat Pro $14.99/mo — not $9 × seats",
      "Document certificates Bonsai does not offer",
      "AI chase drafts if invoices run late",
      "No 7-day-trial-only wall for basic docs",
    ],
    importHero: "Bring your Bonsai contracts and invoices to docstoc",
    importLede: "Export PDFs from Bonsai. We will not take over your Bonsai login.",
    import: imp("templates", {
      exportSteps: [
        "Sign in to Bonsai and open Contracts / Documents.",
        "Download each contract PDF you still rely on.",
        "Export invoices you want to chase as PDF or CSV if available.",
        "Recreate the next contract from a docstoc template; paste overdue invoices into chasing if needed.",
      ],
    }),
  },
  {
    slug: "honeybook",
    name: "HoneyBook",
    sector: "templates",
    featured: false,
    headline: "A cheaper documents-and-invoices alternative to HoneyBook.",
    sub: "Templates and chasing without a $29+/mo client portal.",
    problem:
      "HoneyBook is a branded client OS for creatives. Entry pricing sits well above docstoc Pro, and it is not a public legal-template library.",
    way: "Use HoneyBook if you need scheduling and lead forms. Use docstoc for free templates, file proof, and invoice follow-ups.",
    compares: [
      "Free templates vs trial-only HoneyBook",
      "Pro $14.99 vs $29+/mo entry",
      "Hash certificates",
      "AI chase drafts",
      "Not a replacement for HoneyBook’s scheduler",
    ],
    importHero: "Bring your HoneyBook files to docstoc",
    importLede: "Download completed contracts and invoices as PDF. No HoneyBook password sharing.",
    import: imp("templates", {
      exportSteps: [
        "Open HoneyBook projects / files.",
        "Download signed or sent PDFs.",
        "Export invoice history if you will chase balances in docstoc.",
        "Use docstoc templates for the next agreement you would have rebuilt in HoneyBook.",
      ],
    }),
  },

  /* —— Invoices —— */
  {
    slug: "invoicely",
    name: "Invoicely",
    sector: "invoices",
    featured: true,
    headline: "A workspace alternative to Invoicely.",
    sub: "Invoices plus templates, file proof, SSL, and chase drafts — not invoices alone.",
    problem:
      "Invoicely is a solid freemium invoicer (Free → Basic $9.99 → Professional $19.99) with client and team caps. It does not include a legal-template library, SSL, or hash certificates.",
    way: "docstoc Pro is $14.99 flat for the bundle. Stay on Invoicely if you only want their payment-gateway invoicing UI and nothing else.",
    compares: [
      "Flat workspace price vs Invoicely’s invoice/client caps",
      "1,000 free document templates included on Free",
      "AI chase drafts when invoices go late",
      "Let’s Encrypt SSL on paid plans",
      "File certificates for anything you send",
    ],
    importHero: "Bring your Invoicely invoices to docstoc",
    importLede: "Export CSV or PDF from Invoicely. We do not ask for your Invoicely password.",
    import: imp("invoices", {
      exportSteps: [
        "Sign in to Invoicely and open Invoices.",
        "Export a CSV (or download PDFs) for open and overdue invoices.",
        "Download client names you still need — we won’t pull your contact book via API.",
        "Create matching invoices in docstoc or paste overdue rows into chasing.",
      ],
    }),
  },
  {
    slug: "wave",
    name: "Wave",
    sector: "invoices",
    featured: true,
    headline: "Follow-ups Wave does not write for you.",
    sub: "Keep Wave’s free books. Use docstoc when you need wording, templates, or SSL.",
    problem:
      "Wave is free invoicing and bookkeeping. Reminders and extras often sit behind Payments or Pro. It will not draft tone-matched chase email or give you a legal-template library.",
    way: "Keep Wave as the ledger. docstoc is the document + chase + SSL layer beside it.",
    compares: [
      "AI drafts from day one on Free (5/month)",
      "Templates and file certificates Wave does not sell",
      "You send from your inbox — not a Wave reminder skin",
      "Works alongside Wave; we are not a GL",
      "Pro $14.99 when you outgrow copy-paste",
    ],
    importHero: "Bring Wave invoices into docstoc",
    importLede: "Export from Wave. No Wave password, no silent account link.",
    import: imp("invoices", {
      exportSteps: [
        "In Wave, open Invoices and export CSV or download PDFs.",
        "Note which invoices are overdue.",
        "Paste or create them in docstoc.",
        "Keep Wave for accounting; use docstoc for the email you actually send.",
      ],
    }),
  },
  {
    slug: "freshbooks",
    name: "FreshBooks",
    sector: "invoices",
    featured: true,
    headline: "Lateness-matched wording FreshBooks does not write.",
    sub: "Keep FreshBooks for time and books. Use docstoc for the follow-up.",
    problem:
      "FreshBooks is a full suite from ~$19–23/mo with one reminder template through their system — not AI wording matched to how late the invoice is.",
    way: "docstoc does not replace FreshBooks accounting. It writes the email you send from your own inbox.",
    compares: [
      "AI draft vs one fixed reminder template",
      "Send from your inbox vs FreshBooks-hosted mail",
      "Free templates + certificates on the side",
      "Pro $14.99 as a layer, not a $23 accounting SKU",
      "Zapier/CSV if you do not want another suite",
    ],
    importHero: "Bring FreshBooks invoices to docstoc",
    importLede: "Export CSV or PDF. We do not request your FreshBooks password.",
    import: imp("invoices", {
      exportSteps: [
        "In FreshBooks, export invoices (CSV) or download PDFs.",
        "Filter to unpaid / overdue.",
        "Upload CSV or paste rows in docstoc (headers map on Free too).",
        "Leave FreshBooks as the system of record.",
      ],
    }),
  },
  {
    slug: "quickbooks",
    name: "QuickBooks Online",
    sector: "invoices",
    featured: true,
    headline: "Reminders from your inbox — not Intuit no-reply.",
    sub: "Connect QBO on Pro, draft the follow-up, send it yourself.",
    problem:
      "QuickBooks Online auto-reminders go out from an Intuit no-reply address with a static template. Simple Start already costs more than docstoc Pro.",
    way: "Keep QBO. Native OAuth on Pro+ pulls overdue invoices. You still send the email.",
    compares: [
      "OAuth import on Pro+ — not retyping invoices",
      "Drafts from your inbox vs Intuit no-reply",
      "Tone matched to days overdue",
      "Templates and SSL in the same plan",
      "Not a QuickBooks replacement",
    ],
    importHero: "Bring QuickBooks Online invoices to docstoc",
    importLede: "Pro+ uses official OAuth — we never ask for your Intuit password in a form.",
    import: imp("invoices", {
      noConnect:
        "QuickBooks Online is one of the two native connectors (with Xero). Connect in Connector using Intuit OAuth. We will not ask you to paste an Intuit password into docstoc.",
      exportSteps: [
        "Upgrade to Pro if you want native sync.",
        "Open Connector in docstoc and complete QuickBooks Online OAuth.",
        "Import overdue invoices into aging.",
        "Or: export CSV from QBO and upload if you prefer not to connect.",
      ],
    }),
  },
  {
    slug: "zoho-invoice",
    name: "Zoho Invoice",
    sector: "invoices",
    featured: true,
    headline: "AI wording on top of Zoho’s free invoices.",
    sub: "Zoho Invoice can stay free. docstoc writes the follow-up Zoho will not.",
    problem:
      "Zoho Invoice is free with merge-field reminder templates and volume caps. The wording does not change with lateness.",
    way: "Keep Zoho for invoice PDFs. Use docstoc when you need a human-sounding chase draft plus templates/SSL.",
    compares: [
      "Lateness-matched AI vs merge fields",
      "You send it — Zoho branding stays off that email",
      "Document templates Zoho Invoice does not include",
      "SSL and file certs in one upgrade",
      "Honest: Zoho wins on “invoice app is $0”",
    ],
    importHero: "Bring Zoho Invoice data to docstoc",
    importLede: "Export CSV/PDF from Zoho. No Zoho password in our forms.",
    import: imp("invoices", {
      exportSteps: [
        "In Zoho Invoice, export invoices or download PDFs.",
        "Note overdue amounts and client emails.",
        "Create or paste into docstoc.",
        "Keep Zoho as the invoice generator if you like it.",
      ],
    }),
  },
  {
    slug: "xero",
    name: "Xero",
    sector: "invoices",
    featured: false,
    headline: "Chase drafts from your inbox — not noreply@xero.com.",
    sub: "Native Xero OAuth on Pro+. You still hit send.",
    problem: "Xero reminders default to noreply@xero.com with a fixed schedule and template.",
    way: "Keep Xero. Connect on Pro+. Draft in docstoc.",
    compares: [
      "OAuth pull of overdue invoices",
      "Your inbox vs noreply@xero.com",
      "Tone by lateness",
      "Flat Pro vs Xero’s accounting SKU",
      "Not a Xero replacement",
    ],
    importHero: "Bring Xero invoices to docstoc",
    importLede: "Official OAuth on Pro+ — never paste your Xero password into docstoc.",
    import: imp("invoices", {
      noConnect:
        "Xero is a native OAuth connector on Pro+. We will not ask for your Xero password in a web form.",
      exportSteps: [
        "Open Connector in docstoc (Pro+) and complete Xero OAuth.",
        "Import overdue invoices.",
        "Or export CSV from Xero and upload.",
        "Send every draft yourself.",
      ],
    }),
  },
  {
    slug: "zervant",
    name: "Zervant",
    sector: "invoices",
    featured: false,
    headline: "EU-based follow-ups Zervant gates to paid.",
    sub: "AI drafts on Free — Zervant reminders need Starter+.",
    problem: "Zervant’s free plan skips payment reminders. Paid reminders are schedules, not AI copy.",
    way: "Stay on Zervant for EU invoicing if you like it. Use docstoc for wording and templates.",
    compares: ["Free AI drafts", "EU-hosted like Zervant", "Templates + certs", "You send the mail", "Flat Pro"],
    importHero: "Bring Zervant invoices to docstoc",
    importLede: "Export invoices from Zervant. No password sharing.",
    import: imp("invoices", {
      exportSteps: [
        "Export or download invoices from Zervant.",
        "Paste overdue ones into docstoc.",
        "Send the draft from your own mailbox.",
      ],
    }),
  },
  {
    slug: "billomat",
    name: "Billomat",
    sector: "invoices",
    featured: false,
    headline: "AI drafts instead of fixed Mahnwesen stages.",
    sub: "No 14-day-only wall for a first follow-up.",
    problem: "Billomat dunning is stage templates; full automation is a higher tier; no lasting free plan.",
    way: "Keep Billomat for German invoicing. Use docstoc for the actual email text.",
    compares: ["Free tier exists", "AI wording", "You send it", "Flat $14.99", "Not a DATEV replacement"],
    importHero: "Bring Billomat invoices to docstoc",
    importLede: "Export from Billomat. We do not take your Billomat password.",
    import: imp("invoices", {
      exportSteps: [
        "Export open invoices from Billomat.",
        "Paste overdue rows into docstoc.",
        "Send from your own inbox.",
      ],
    }),
  },

  /* —— SSL —— */
  {
    slug: "zerossl",
    name: "ZeroSSL",
    sector: "ssl",
    featured: true,
    headline: "Let’s Encrypt without a second cert dashboard.",
    sub: "Same padlock job as ZeroSSL — inside the workspace you already use for documents and invoices.",
    problem:
      "ZeroSSL is a dedicated ACME dashboard. Free is capped (3 certs). Paid tiers exist for volume and wildcards. It is another login for a small business that already has somewhere to work.",
    way: "docstoc is an automation layer on Let’s Encrypt — not a certificate reseller. Free includes 5 × 90-day DV certs; Pro adds multi-SAN; Business adds wildcards. One DNS TXT path, renewals in-product. Not OV/EV.",
    compares: [
      "No separate certificate console",
      "Free: 5 × 90-day LE certs; Pro multi-SAN; Business wildcards",
      "Same account as templates and invoices",
      "You keep your host and DNS",
      "Stay on ZeroSSL for a dedicated console / their annual CA products",
    ],
    importHero: "Move a domain from ZeroSSL to docstoc",
    importLede: "Do not upload private keys. Issue a new Let’s Encrypt cert, then retire ZeroSSL renewals.",
    import: imp("ssl", {
      exportSteps: [
        "In ZeroSSL, note hostnames and expiry dates — you are not exporting the key.",
        "Add the same hostname in docstoc SSL.",
        "Publish the DNS TXT challenge; wait for issuance.",
        "Confirm HTTPS, then disable ZeroSSL auto-renew / cancel paid seats.",
      ],
    }),
  },
  {
    slug: "letsencrypt",
    name: "Let's Encrypt",
    sector: "ssl",
    featured: true,
    headline: "Let’s Encrypt without owning certbot.",
    sub: "Same CA. We run ACME so you do not have to.",
    problem:
      "DIY Let’s Encrypt is free and excellent — until a server rebuild, a missed timer, or nobody on the team wants certbot.",
    way: "docstoc issues the same CA’s DV certs with one DNS TXT and renewals inside your workspace.",
    compares: [
      "Real Let’s Encrypt certificates",
      "No ACME client to babysit",
      "One DNS record, leave it for renewals",
      "Bundled with the rest of docstoc",
      "Stay DIY if you already run ACME well",
    ],
    importHero: "Move DIY Let’s Encrypt onto docstoc",
    importLede: "Leave certbot running until the new cert is live, then disable the old job.",
    import: imp("ssl", {
      exportSteps: [
        "Inventory hostnames and how certbot/acme.sh is installed.",
        "Add the domain in docstoc and publish TXT.",
        "Verify issuance.",
        "Disable the old renewal timer so two clients do not fight.",
      ],
    }),
  },
  {
    slug: "digicert",
    name: "DigiCert",
    sector: "ssl",
    featured: true,
    headline: "A small-business DV alternative to DigiCert.",
    sub: "Padlock without enterprise PKI pricing — when DV is enough.",
    problem:
      "DigiCert is the enterprise/OV-EV brand. Retail DV is hundreds a year and you still operate CertCentral.",
    way: "If you need OV/EV, warranties, or a private CA, stay. If you need HTTPS on a marketing site, Let’s Encrypt via docstoc is enough.",
    compares: [
      "No per-certificate retail invoice for DV",
      "Automated renewals",
      "Honest limit: DV only",
      "One DNS TXT",
      "Business plan for more hostnames",
    ],
    importHero: "Replace a DigiCert DV hostname with docstoc",
    importLede: "Issue new LE certs. Do not export DigiCert private keys.",
    import: imp("ssl", {
      exportSteps: [
        "List DV hostnames you do not need OV/EV on.",
        "Issue in docstoc first (overlap is normal).",
        "Point HTTPS at the new cert via your host.",
        "Let the DigiCert order lapse only after you confirm.",
      ],
    }),
  },
  {
    slug: "sectigo",
    name: "Sectigo",
    sector: "ssl",
    featured: true,
    headline: "Free automated DV instead of Sectigo retail.",
    sub: "Skip the $70–460+/yr cert SKU when you only needed a padlock.",
    problem: "Sectigo (and resellers) sell paid DV/OV/EV. Fine for org validation; overkill for a brochure site.",
    way: "docstoc: Let’s Encrypt DV, bundled, auto-renew. Stay for OV/EV.",
    compares: ["$0 extra SSL SKU on paid docstoc", "Auto-renew", "DV only — we say so", "Keep your host", "Reseller invoices go away"],
    importHero: "Leave a Sectigo DV cert for docstoc",
    importLede: "New issuance, not a key import.",
    import: imp("ssl", {
      exportSteps: [
        "Note the hostname and whether it is DV vs OV/EV.",
        "If DV-only, add it in docstoc.",
        "Publish TXT, verify, then stop paying the retail renew.",
      ],
    }),
  },
  {
    slug: "cloudflare-ssl",
    name: "Cloudflare",
    sector: "ssl",
    featured: true,
    headline: "SSL without putting traffic through Cloudflare.",
    sub: "Keep your host. One TXT record. Universal SSL not required.",
    problem:
      "Cloudflare Universal SSL is free if you proxy through Cloudflare. That is a DNS/CDN decision, not “just a certificate.”",
    way: "docstoc issues LE on your hostname without becoming your CDN.",
    compares: [
      "No orange-cloud requirement",
      "You keep nameservers if you want",
      "Same Let’s Encrypt trust",
      "Bundled workspace",
      "Stay on Cloudflare if you already want the proxy",
    ],
    importHero: "Issue SSL in docstoc without a Cloudflare proxy",
    importLede: "You can keep Cloudflare for DNS. You do not have to proxy to get a cert from us.",
    import: imp("ssl", {
      exportSteps: [
        "Decide whether the hostname must stay proxied.",
        "Add the hostname in docstoc.",
        "Create the TXT at whatever DNS you use (including Cloudflare DNS-only).",
        "Do not disable Cloudflare proxy until you know you want to — this is optional.",
      ],
    }),
  },
  ...sslRest(),
  /* —— File certificates (closest named vs pages) —— */
  {
    slug: "adobe-acrobat",
    name: "Adobe Acrobat",
    sector: "certificates",
    featured: true,
    headline: "Hash proof for any file — not only a certified PDF.",
    sub: "Prove bytes have not changed. Acrobat is still the PDF specialist.",
    problem:
      "Acrobat certifies and protects PDFs inside Adobe’s subscription. It is not a public verify link for an arbitrary zip or contract scan.",
    way: "SHA-256 certificate + shareable verify page. Not a replacement for Acrobat editing or qualified PDF signatures.",
    compares: [
      "Any file type",
      "Public verification URL",
      "Free to check",
      "Optional BTC timestamp",
      "Stay on Acrobat for PDF workflows",
    ],
    importHero: "Certify files you used to lock in Acrobat",
    importLede: "Export the original file. We do not connect to your Adobe ID.",
    import: imp("certificates", {
      exportSteps: [
        "Download the PDF or original from Acrobat / Creative Cloud.",
        "Hash it in docstoc or issue a certificate.",
        "Share the verify link with the counterparty.",
        "Keep Acrobat if you still need PDF markup.",
      ],
    }),
  },
  {
    slug: "docusign",
    name: "DocuSign",
    sector: "certificates",
    featured: true,
    headline: "Prove the file — not who clicked to sign.",
    sub: "Integrity of bytes vs identity of a signer. Different jobs.",
    problem:
      "DocuSign proves who signed an envelope. It does not replace a simple “this PDF is still the one I sent on Tuesday” hash certificate.",
    way: "Certify the document you already have. Keep DocuSign if you need legally framed e-sign.",
    compares: [
      "Hash certificate vs envelope audit trail",
      "Any file, not only DocuSign packages",
      "No per-seat e-sign tax for proof-of-integrity",
      "Free verify links",
      "Honest: not an e-sign product",
    ],
    importHero: "Bring completed DocuSign PDFs to docstoc",
    importLede: "Download the signed PDF from DocuSign. We will not ask for your DocuSign password.",
    import: imp("certificates", {
      noConnect:
        "DocuSign’s API is not how small plans export a whole account, and we will not ask for your DocuSign password. Download the completed PDF.",
      exportSteps: [
        "Sign in to DocuSign → Manage.",
        "Open the completed envelope.",
        "Download the signed PDF.",
        "Certify that PDF in docstoc if you need a verify link on the file itself.",
      ],
      exportNote:
        "Signing fields and routing stay in DocuSign. You are importing the finished artifact, not the envelope workflow.",
    }),
  },
  {
    slug: "digicert-doc",
    name: "DigiCert Document Trust",
    sector: "certificates",
    featured: true,
    headline: "Simple file proof — not enterprise document trust.",
    sub: "When you needed a verify link, not a qualified signing program.",
    problem: "DigiCert Document Trust is enterprise signing/identity. Pricing and sales motion match that.",
    way: "docstoc hash certificates are the small-business version of “this file has not changed.”",
    compares: ["Free/cheap hash proof", "No enterprise sales cycle", "Public verify page", "Not eIDAS qualified signing", "Pair with SSL in the same account"],
    importHero: "Certify files outside DigiCert Document Trust",
    importLede: "Export the document. Issue a hash certificate. No private-key import.",
    import: imp("certificates", {
      exportSteps: [
        "Download the document you need to prove.",
        "Certify it in docstoc.",
        "Share the verification link.",
      ],
    }),
  },
  {
    slug: "originstamp",
    name: "OriginStamp",
    sector: "certificates",
    featured: true,
    headline: "A productized timestamp — not an API you have to wire.",
    sub: "Shareable verify page in the same workspace as your templates.",
    problem: "OriginStamp is a specialist timestamp API. Great if you are building; extra if you just needed a link.",
    way: "Certify in docstoc; optional BTC timestamp. No second vendor for a single file.",
    compares: ["UI + link, not only an API", "Bundled with templates", "Optional chain timestamp", "Free to start", "Stay on OriginStamp for custom integrations"],
    importHero: "Recreate OriginStamp proofs as docstoc certificates",
    importLede: "You cannot import their timestamps. Re-hash the original file here.",
    import: imp("certificates", {
      exportSteps: [
        "Keep the original file (the hash input).",
        "Issue a new certificate in docstoc.",
        "Optional: enable Bitcoin timestamping on your account.",
      ],
    }),
  },
  {
    slug: "opentimestamps",
    name: "OpenTimestamps",
    sector: "certificates",
    featured: true,
    headline: "A verify page on top of the timestamp idea.",
    sub: "OTS is a protocol. docstoc is a product your client can open.",
    problem: "OpenTimestamps is free and correct — and invisible to a non-technical counterparty.",
    way: "Same integrity idea, with a URL you can send.",
    compares: ["Shareable page", "No DIY tooling", "Optional BTC timestamp", "Templates in the same app", "Stay on OTS if you already automate it"],
    importHero: "Add a verify page beside OpenTimestamps",
    importLede: "Keep your .ots proofs. Certify the file in docstoc for people who will not run ots-client.",
    import: imp("certificates", {
      exportSteps: [
        "Keep the original file and any .ots proof you already have.",
        "Certify the same file in docstoc for a public link.",
        "Do not delete your OTS proofs if they matter legally to you.",
      ],
    }),
  },

  /* —— Chase —— */
  {
    slug: "chaser",
    name: "Chaser",
    sector: "chase",
    featured: true,
    headline: "A lightweight alternative to Chaser.",
    sub: "Draft-only follow-ups at $14.99 — not revenue-tier auto-send from $259.",
    problem:
      "Chaser is mid-market AR: auto-send, portals, credit tools, Compact from ~$259/mo. Right product for that team; wrong price and posture for a freelancer who just needs the wording.",
    way: "docstoc writes the email. You send it. Flat Pro. Templates and SSL come along.",
    compares: [
      "Flat $14.99 vs Compact $259+",
      "Draft-only — clients hear from you",
      "No per-seat / revenue ladder",
      "AI tone by days overdue",
      "Stay on Chaser for auto-send AR ops",
    ],
    importHero: "Bring Chaser invoices into docstoc",
    importLede: "Export open invoices. We do not connect to your Chaser account.",
    import: imp("chase", {
      exportSteps: [
        "Export unpaid invoices from Chaser or from the accounting tool behind it.",
        "Upload CSV or connect QuickBooks/Xero on Pro+.",
        "Generate drafts; send from your inbox.",
        "Turn off Chaser auto-send when you are ready so clients are not double-emailed.",
      ],
    }),
  },
  {
    slug: "paidnice",
    name: "Paidnice",
    sector: "chase",
    featured: true,
    headline: "AI drafts instead of Paidnice auto-sequences.",
    sub: "$14.99 flat vs $69–$99 entry — you keep the send button.",
    problem: "Paidnice auto-sends, Xero-native, UK late fees. Strong if you want that automation.",
    way: "docstoc is cheaper, draft-only, and bundled with documents/SSL.",
    compares: ["Lower flat price", "You send every mail", "AI wording", "No UK statutory-fee engine — we say so", "Templates included"],
    importHero: "Move Paidnice chases to docstoc drafts",
    importLede: "Export invoices from Xero/QBO or CSV. Pause Paidnice auto-send before you dual-run.",
    import: imp("chase", {
      exportSteps: [
        "Export open invoices from Paidnice or Xero.",
        "Import to docstoc (OAuth or CSV).",
        "Disable Paidnice sequences so clients get one voice.",
      ],
    }),
  },
  {
    slug: "duefy",
    name: "Duefy",
    sector: "chase",
    featured: true,
    headline: "The Duefy idea — without auto-send.",
    sub: "Tone-matched drafts you send. Flat workspace, not seat math.",
    problem: "Duefy is close in spirit but sends for you and prices Solo/Pro/Team.",
    way: "Same “write the reminder” job, manual send, $14.99 Pro.",
    compares: ["Draft-only", "Flat fee", "Templates + SSL bundled", "QBO/Xero on Pro+", "Stay on Duefy if you want auto-send"],
    importHero: "Bring Duefy invoices to docstoc",
    importLede: "Export the invoice list. Stop Duefy sends before overlapping.",
    import: imp("chase", {
      exportSteps: [
        "Export invoices from Duefy.",
        "Paste or CSV-import into docstoc.",
        "Turn off Duefy auto-send.",
      ],
    }),
  },
  {
    slug: "satago",
    name: "Satago",
    sector: "chase",
    featured: true,
    headline: "Chasing without Satago’s credit-control stack.",
    sub: "If you only needed the email written — not Experian and invoice finance.",
    problem: "Satago is UK credit control plus chasing. Different product, higher price.",
    way: "docstoc does the wording. Stay on Satago for finance and credit scores.",
    compares: ["$14.99 vs ~£45+", "No auto-send", "No invoice finance — honest", "AI drafts", "Templates included"],
    importHero: "Bring Satago invoice lists to docstoc",
    importLede: "Export AR. We do not replace Satago finance products.",
    import: imp("chase", {
      exportSteps: [
        "Export overdue invoices from Satago or Xero.",
        "Import to docstoc.",
        "Keep Satago if you still use credit/finance features.",
      ],
    }),
  },
  {
    slug: "chaseai",
    name: "ChaseAI",
    sector: "chase",
    featured: true,
    headline: "Draft-only chasing — plus the rest of docstoc.",
    sub: "ChaseAI is cheaper on Starter. We bundle documents, certs, and SSL.",
    problem: "ChaseAI auto-sends and is chasing-only. Starter can undercut Pro on price.",
    way: "Pay $14.99 when you want templates, certs, QBO/Xero, and send-it-yourself.",
    compares: ["Draft-only vs auto-send", "Native QBO/Xero", "Template library", "SSL on paid plans", "ChaseAI can be cheaper — we say so"],
    importHero: "Bring ChaseAI invoices to docstoc",
    importLede: "Export whatever ChaseAI let you download. Pause their send schedule.",
    import: imp("chase", {
      exportSteps: [
        "Export or copy open invoices from ChaseAI.",
        "Paste into docstoc.",
        "Disable ChaseAI auto-send.",
      ],
    }),
  },
  /* —— SOX / AR evidence (custom landings; do not regenerate pages) —— */
  {
    slug: "workiva",
    name: "Workiva",
    sector: "sox",
    featured: true,
    customLanding: true,
    headline: "AR SOX evidence without a connected-reporting platform.",
    sub: "AR SOX evidence and auditor packs without a connected-reporting platform.",
    problem: "Workiva is enterprise reporting / SOX workpapers across the close.",
    way: "docstoc Business proves chase SoD, trails, and timestamped auditor packs.",
    compares: [],
    importHero: "",
    importLede: "",
    import: imp("chase"),
  },
  {
    slug: "floqast",
    name: "FloQast",
    sector: "sox",
    featured: true,
    customLanding: true,
    headline: "Collections ICFR evidence next to your close.",
    sub: "Collections ICFR evidence next to your close — not a FloQast replacement.",
    problem: "FloQast owns the close checklist.",
    way: "docstoc covers AR chase SOX evidence beside the close.",
    compares: [],
    importHero: "",
    importLede: "",
    import: imp("chase"),
  },
  {
    slug: "auditboard-sox",
    name: "AuditBoard SOX (AR)",
    sector: "sox",
    featured: true,
    customLanding: true,
    headline: "Chase SoD and Bitcoin-timestamped packs for AR controls.",
    sub: "Chase SoD, trails, and Bitcoin-timestamped packs for AR controls.",
    problem: "AuditBoard runs enterprise SOX / GRC programs.",
    way: "docstoc is the AR chase evidence slice.",
    compares: [],
    importHero: "",
    importLede: "",
    import: imp("chase"),
  },
  {
    slug: "hyperproof-sox",
    name: "Hyperproof SOX (AR)",
    sector: "sox",
    featured: true,
    customLanding: true,
    headline: "Invoice chase evidence beside your compliance program.",
    sub: "Invoice chase evidence layer alongside your compliance program.",
    problem: "Hyperproof manages compliance programs.",
    way: "docstoc delivers AR SOX reporting for collections.",
    compares: [],
    importHero: "",
    importLede: "",
    import: imp("chase"),
  },
  {
    slug: "sox-reporting",
    name: "SOX reporting use case",
    sector: "sox",
    featured: true,
    customLanding: true,
    hubHref: "/use-cases/sox-reporting",
    hubHideImport: true,
    headline: "What Ready / Partial / Missing mean.",
    sub: "What Ready / Partial / Missing mean and how to export the auditor file.",
    problem: "",
    way: "",
    compares: [],
    importHero: "",
    importLede: "",
    import: imp("chase"),
  },
  ...chaseRest(),
  ...grcRest(),
];

function sslRest() {
  const extras = [
    ["ssl-com", "SSL.com"],
    ["globalsign", "GlobalSign"],
    ["sslforfree", "SSL For Free"],
    ["freessl-org", "FreeSSL.org"],
    ["certum", "Certum"],
    ["godaddy-ssl", "GoDaddy SSL"],
    ["actalis", "Actalis"],
    ["secom-trust", "Secom Trust"],
    ["freessl-cfd", "FreeSSL.CFD"],
    ["certkit", "CertKit"],
    ["hostinger-ssl", "Hostinger SSL"],
  ];
  return extras.map(([slug, name]) => ({
    slug,
    name,
    sector: "ssl",
    featured: false,
    headline: `Let’s Encrypt instead of ${name}.`,
    sub: "Automated DV on your domain when you do not need that vendor’s paid SKU.",
    problem: `${name} is a dedicated SSL path — another dashboard, often another invoice, sometimes a manual renew.`,
    way: "docstoc issues Let’s Encrypt DV with one DNS TXT inside your business workspace.",
    compares: ["Bundled SSL", "Auto-renew", "DV only", "Keep your host", "No key import"],
    importHero: `Move a hostname off ${name} onto docstoc`,
    importLede: "Issue a new certificate. Never email a private key.",
    import: imp("ssl", {
      exportSteps: [
        `Note the hostname currently using ${name}.`,
        "Add it in docstoc and publish the TXT record.",
        "Confirm HTTPS, then cancel the old cert product.",
      ],
    }),
  }));
}

function chaseRest() {
  const extras = [
    ["upflow", "Upflow", "Sales-led AR. We publish $14.99."],
    ["invoicesherpa", "InvoiceSherpa", "Trigger auto-send from $49. We draft at $14.99."],
    ["gaviti", "Gaviti", "Enterprise AR, no public price. We do."],
    ["yaypay", "Quadient AR", "Mid-market collections. We write freelancer drafts."],
  ];
  return extras.map(([slug, name, sub]) => ({
    slug,
    name,
    sector: "chase",
    featured: false,
    headline: `A small-team alternative to ${name}.`,
    sub,
    problem: `${name} is built for heavier AR automation than a freelancer usually wants to operate.`,
    way: "docstoc: AI draft, you send, flat price, plus templates/SSL.",
    compares: ["Published $14.99", "Draft-only", "Templates included", "QBO/Xero on Pro+", "Not an enterprise AR suite"],
    importHero: `Bring ${name} invoices to docstoc`,
    importLede: "Export CSV. Pause their auto-send before you overlap.",
    import: imp("chase", {
      exportSteps: [
        `Export open invoices from ${name} or the ERP behind it.`,
        "Import CSV or QBO/Xero into docstoc.",
        "Send drafts yourself.",
      ],
    }),
  }));
}

function grcRest() {
  const extras = [
    ["vanta", "Vanta"],
    ["drata", "Drata"],
    ["secureframe", "Secureframe"],
    ["thoropass", "Thoropass"],
    ["tugboat", "Tugboat Logic"],
    ["hyperproof", "Hyperproof"],
    ["auditboard", "AuditBoard"],
    ["purview", "Microsoft Purview"],
    ["aws-security-hub", "AWS Security Hub"],
  ];
  return extras.map(([slug, name]) => ({
    slug,
    name,
    sector: "certificates",
    featured: false,
    hubHide: true,
    headline: `File evidence — not a ${name} GRC platform.`,
    sub: "docstoc is not SOC 2 automation. We certify files and AR trails.",
    problem: `${name} automates compliance checks. docstoc does not replace that. Confusing the two wastes a sales cycle.`,
    way: `Use ${name} for GRC. Use docstoc to hash invoices, contracts, and chase evidence you already produce.`,
    compares: [
      "Tamper-evident file certificates",
      "AR chase drafts with a trail",
      "Not a control-mapping GRC",
      "Honest roadmap vs live",
      "Cheap enough to sit beside GRC, not instead of it",
    ],
    importHero: `Certify evidence you keep beside ${name}`,
    importLede: `We do not import ${name} controls. Export the files you need to prove, then hash them.`,
    import: imp("certificates", {
      noConnect: `There is no “connect ${name}” button. Export the artifact (PDF, export, screenshot pack) and certify the file.`,
      exportSteps: [
        `Download the evidence file from ${name} or your drive.`,
        "Certify it in docstoc.",
        "Store the verify link with the audit packet.",
      ],
    }),
  }));
}

export function competitorsBySector(sectorId) {
  return COMPETITORS.filter((c) => c.sector === sectorId);
}

export function featuredBySector(sectorId) {
  return COMPETITORS.filter((c) => c.sector === sectorId && c.featured);
}

export function hubSectors() {
  return SECTORS.map((s) => ({
    ...s,
    competitors: COMPETITORS.filter((c) => c.sector === s.id && c.featured && !c.hubHide),
  }));
}

export function siblingAlts(c, limit = 4) {
  return COMPETITORS.filter((x) => x.sector === c.sector && x.slug !== c.slug && x.featured).slice(0, limit);
}
