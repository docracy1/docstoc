/**
 * Shared SSL/TLS competitor records for vs pages and switch-from pages.
 * Pricing figures are approximate public info as of August 2026 — re-verify before relying on a number.
 */

export const DOCSTOC_SSL = {
  bestFit: "SMBs who want Let's Encrypt automation next to invoices & templates",
  pricing: "Automation layer on Free / Pro / Business — no certificate resale markup",
  certTypes: "Domain-validated (DV) only — real Let's Encrypt certificates",
  automation: "✓ DNS-01 TXT per issue or renewal, email reminder before expiry",
  setup: "Add a domain, add DNS TXT record(s), done",
  bundled: "✓ part of the same platform as invoicing, templates & documents",
  freeTier: "Free: 5 × 90-day LE certs · Pro: multi-SAN · Business: wildcards",
};

/** @type {Array<Record<string, any>>} */
export const SSL_COMPETITORS = [
  {
    "slug": "zerossl",
    "name": "ZeroSSL",
    "pricingUrl": "https://zerossl.com/pricing",
    "bestFit": "Developers who want a GUI dashboard on top of free ACME certs",
    "pricing": "Free (3 certs), then $14.99–$219.99/mo for annual certs & wildcards",
    "certTypes": "Free 90-day DV via ACME, plus paid 1-year DV and wildcard certs",
    "automation": "✓ ACME-automated, or manual CSR upload via dashboard",
    "setup": "Low — but still a separate cert-management dashboard to learn",
    "bundled": "✗ standalone certificate product, not part of a broader business platform",
    "freeTier": "3 free 90-day certs, renewable indefinitely",
    "summary": "ZeroSSL and docstoc both help you get DV HTTPS without raw certbot. ZeroSSL is a dedicated cert dashboard (and its own CA for some products). docstoc is an automation layer on Let's Encrypt inside your business workspace — not a certificate reseller. Free includes 5 × 90-day LE certs; Pro adds multi-SAN; Business adds wildcards.",
    "faq": [
      {
        "q": "Is docstoc the same technology as ZeroSSL?",
        "a": "Similar ACME DV automation. docstoc issues Let's Encrypt certs; ZeroSSL runs its own CA for some products. Security for a standard DV padlock is equivalent."
      },
      {
        "q": "Why use docstoc if ZeroSSL is free?",
        "a": "Avoid a second product login. docstoc Free also includes 5 × 90-day Let's Encrypt certs, then Pro/Business unlock multi-SAN and wildcards next to invoices and templates."
      },
      {
        "q": "Does ZeroSSL charge for extras?",
        "a": "Yes — annual certs and wildcards are paid tiers. docstoc charges for the automation/workspace layer (not a LE cert markup): Free 5 certs, Pro multi-SAN, Business wildcards."
      },
      {
        "q": "When stay on ZeroSSL?",
        "a": "If you want a dedicated cert-only console, ZeroSSL’s own CA annual products, or Protect-style scanning outside a small-business SaaS suite."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want Let's Encrypt DV automation — not a reseller SKU — with Free 5 certs, Pro multi-SAN, Business wildcards, and the same account as invoices and documents.",
    "stayWithThem": "Stay on ZeroSSL for a dedicated ACME dashboard, their annual CA products, or Protect-style scanning not tied to a small-business platform.",
    "switchWhy": "Teams leave ZeroSSL when a second login just for certificates becomes busywork — especially once they already run invoices and documents elsewhere.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what ZeroSSL is doing today",
        "body": "Note active hostnames, expiry dates, and whether ZeroSSL is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old ZeroSSL path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at ZeroSSL so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from ZeroSSL cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing ZeroSSL certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "letsencrypt",
    "name": "Let's Encrypt",
    "pricingUrl": "https://letsencrypt.org/",
    "bestFit": "Anyone running their own ACME client and renewal automation",
    "pricing": "Free, always — a nonprofit certificate authority",
    "certTypes": "DV only, 90-day default (short-lived options also available)",
    "automation": "Requires an ACME client (certbot, acme.sh, or custom) you run yourself",
    "setup": "Requires someone to set up and maintain the ACME client and renewal job",
    "bundled": "✗ the CA itself — not a product with a dashboard or support desk",
    "freeTier": "Unlimited free certificates, no account needed",
    "summary": "Let's Encrypt is the CA behind docstoc's certificates — not a rival product. DIY Let's Encrypt is free but you own ACME, validation, and renewals. docstoc issues the same CA's DV certs with one DNS TXT record and guided renewals inside your business workspace.",
    "faq": [
      {
        "q": "Is the certificate different from Let's Encrypt?",
        "a": "No — docstoc issues real Let's Encrypt DV certificates. The difference is automation, not cryptography."
      },
      {
        "q": "Is docstoc more secure?",
        "a": "No. Same CA, same DV trust. Value is ops elimination, not a stronger trust chain."
      },
      {
        "q": "Why not DIY Let's Encrypt?",
        "a": "You can, if you maintain certbot/acme.sh. docstoc is for teams that do not want ACME ownership."
      },
      {
        "q": "When stay on DIY Let's Encrypt?",
        "a": "When you already run ACME reliably across many hosts and do not need a bundled business platform."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay DIY if you are comfortable owning ACME clients, rate limits, and monitoring across hosts.",
    "switchWhy": "People leave DIY Let's Encrypt when renewals fail after a server rebuild, or nobody wants to own certbot anymore.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Let's Encrypt (self-managed) is doing today",
        "body": "Keep existing certbot timers until docstoc issues successfully, then disable the old job so two clients do not compete."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Let's Encrypt (self-managed) path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Let's Encrypt (self-managed) so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Let's Encrypt (self-managed) cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Let's Encrypt (self-managed) certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "sectigo",
    "name": "Sectigo",
    "pricingUrl": "https://www.sectigo.com/ssl-certificates-tls/compare",
    "bestFit": "Mid-market/enterprise IT needing OV/EV or insurance-backed certs",
    "pricing": "Typically $70–$460+/yr for DV/wildcard; OV/EV higher via resellers",
    "certTypes": "DV, OV, EV, wildcard/multi-domain (SAN)",
    "automation": "ACME via Certificate Manager; OV/EV still need business vetting",
    "setup": "DV can be automated; OV/EV vetting can take days",
    "bundled": "✗ standalone commercial CA, typically via resellers",
    "freeTier": "✗ no free tier",
    "summary": "Sectigo is a major commercial CA (formerly Comodo) selling paid DV/OV/EV and wildcards. For everyday HTTPS padlocks, docstoc's free automated DV Let's Encrypt cert removes reseller pricing and paperwork. Stay on Sectigo when procurement mandates OV/EV — docstoc is DV-only.",
    "faq": [
      {
        "q": "Is docstoc a Sectigo alternative?",
        "a": "For standard DV HTTPS, yes. For OV/EV organization validation, no — use Sectigo or similar."
      },
      {
        "q": "Why pay Sectigo instead?",
        "a": "Partner or compliance rules that require OV/EV, which docstoc does not issue."
      },
      {
        "q": "Does Sectigo renew automatically?",
        "a": "Enterprise Certificate Manager can, as a paid product. docstoc does not renew unattended: it emails you before expiry and you publish a fresh DNS TXT value in the app."
      },
      {
        "q": "When stay on Sectigo?",
        "a": "When you need OV/EV, warranties, or reseller-managed enterprise fleets."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay on Sectigo for OV/EV, wildcards at scale, or insurance-backed commercial cert programs.",
    "switchWhy": "Small teams leave Sectigo when they realize they only needed DV HTTPS and were paying reseller prices plus renewal friction.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Sectigo is doing today",
        "body": "Note active hostnames, expiry dates, and whether Sectigo is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Sectigo path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Sectigo so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Sectigo cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Sectigo certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "digicert",
    "name": "DigiCert",
    "pricingUrl": "https://www.digicert.com/",
    "bestFit": "Large enterprises needing audited trust, warranties, and PKI at scale",
    "pricing": "OV often $300+/yr; wildcards higher; EV highest — via enterprise/resellers",
    "certTypes": "DV, OV, EV, wildcard, plus broader PKI (devices, code signing, S/MIME)",
    "automation": "ACME/ARI via Trust Lifecycle Manager for enterprise fleets",
    "setup": "Enterprise-oriented inventory and policy — not a quick self-serve SMB flow",
    "bundled": "✗ standalone enterprise CA / PKI platform",
    "freeTier": "✗ no free tier",
    "summary": "DigiCert Group powers much of Fortune-scale TLS and PKI. That is a different buyer than a small business needing a padlock. docstoc solves the SMB HTTPS problem with free automated DV Let's Encrypt certs — not DigiCert's warranty and enterprise PKI stack.",
    "faq": [
      {
        "q": "Is docstoc a DigiCert alternative?",
        "a": "Only narrowly for DV web TLS. DigiCert targets enterprise trust, warranties, and PKI."
      },
      {
        "q": "Should SMBs buy DigiCert?",
        "a": "Usually no for a simple site padlock. docstoc's automated DV covers that need."
      },
      {
        "q": "Does docstoc match DigiCert warranties?",
        "a": "No. Let's Encrypt DV has no commercial warranty program."
      },
      {
        "q": "When stay on DigiCert?",
        "a": "Enterprise compliance, OV/EV mandates, device/code-signing PKI, or insurance-backed trust requirements."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay on DigiCert Group products for enterprise PKI, OV/EV, warranties, and regulated trust chains.",
    "switchWhy": "SMBs leave DigiCert (or DigiCert-resold certs) when enterprise pricing and vetting are overkill for a single marketing site or client portal.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what DigiCert is doing today",
        "body": "Note active hostnames, expiry dates, and whether DigiCert is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old DigiCert path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at DigiCert so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from DigiCert cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing DigiCert certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "cloudflare-ssl",
    "name": "Cloudflare SSL",
    "pricingUrl": "https://www.cloudflare.com/products/ssl/",
    "bestFit": "Sites already routing DNS/traffic through Cloudflare's proxy",
    "pricing": "Free Universal SSL (root + one subdomain level); Advanced Certificate Manager ~$10/mo/domain",
    "certTypes": "Edge Universal SSL; paid tiers for deeper subdomains & custom validity",
    "automation": "✓ automatic once DNS is proxied through Cloudflare",
    "setup": "Trivial if already on Cloudflare; otherwise requires proxy/DNS architecture change",
    "bundled": "Bundled with Cloudflare CDN/proxy — not with invoicing/documents",
    "freeTier": "Free on Cloudflare plans for root + first-level subdomains",
    "summary": "Cloudflare SSL is excellent if you already proxy through Cloudflare. It encrypts visitor↔edge traffic and requires that architecture. docstoc issues a certificate for your actual hosting setup with one DNS TXT record — no mandatory CDN proxy — and lives next to your invoices and documents.",
    "faq": [
      {
        "q": "Same as Cloudflare Universal SSL?",
        "a": "No. Cloudflare is edge SSL behind their proxy. docstoc issues origin/host-oriented Let's Encrypt DV via ACME without requiring Cloudflare proxy."
      },
      {
        "q": "Should I use Cloudflare instead?",
        "a": "Yes if you already want Cloudflare CDN/DNS proxy. Use docstoc if you do not want to re-architect DNS just for HTTPS."
      },
      {
        "q": "Does free Cloudflare cover all subdomains?",
        "a": "No — deeper levels need paid Advanced Certificate Manager."
      },
      {
        "q": "When stay on Cloudflare SSL?",
        "a": "When Cloudflare is already your edge and you want Universal SSL as part of that stack."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay on Cloudflare SSL when the site should remain orange-cloud proxied and Universal SSL already meets your needs.",
    "switchWhy": "Teams add docstoc when they need HTTPS without forcing all traffic through Cloudflare, or when SSL is just one piece of a broader trust/ops workspace.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Cloudflare SSL is doing today",
        "body": "You can run Cloudflare edge SSL and an origin cert strategy in parallel. Only change proxy settings if you intentionally leave Cloudflare's edge."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Cloudflare SSL path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Cloudflare SSL so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Cloudflare SSL cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Cloudflare SSL certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "ssl-com",
    "name": "SSL.com",
    "pricingUrl": "https://www.ssl.com/products/website-security/acme/",
    "bestFit": "Developers wanting free ACME DV plus optional paid OV/EV",
    "pricing": "Free DV via ACME; paid wildcards/OV/EV on commercial tiers",
    "certTypes": "Free 90-day DV via ACME; paid DV/OV/EV",
    "automation": "✓ ACME for DV; OV/EV still portal/manual verification",
    "setup": "Low for free ACME DV; manual for paid OV/EV",
    "bundled": "✗ standalone CA with its own ACME/dashboard",
    "freeTier": "Free 90-day DV via ACME",
    "summary": "SSL.com offers free ACME DV like Let's Encrypt/ZeroSSL. docstoc's edge is not 'also free' — it is zero separate ACME account: issuance and renewal live inside the small-business platform you already use.",
    "faq": [
      {
        "q": "Is SSL.com free like docstoc?",
        "a": "DV via ACME can be. docstoc removes the separate CA account and client setup by bundling automation."
      },
      {
        "q": "When need SSL.com paid tiers?",
        "a": "OV/EV organization validation — docstoc is DV-only."
      },
      {
        "q": "Does it renew automatically?",
        "a": "ACME clients can renew SSL.com DV. docstoc does not renew unattended: it emails you before expiry and you publish a fresh DNS TXT value in the app."
      },
      {
        "q": "When stay on SSL.com?",
        "a": "When you want that CA specifically, wildcards, or paid OV/EV."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay for SSL.com-specific trust needs, wildcards, or OV/EV purchases.",
    "switchWhy": "Leave SSL.com's free ACME path when you do not want another CA login and client to babysit.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what SSL.com is doing today",
        "body": "Note active hostnames, expiry dates, and whether SSL.com is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old SSL.com path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at SSL.com so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from SSL.com cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing SSL.com certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "globalsign",
    "name": "GlobalSign",
    "pricingUrl": "https://shop.globalsign.com/en/ssl/domain-ssl",
    "bestFit": "Enterprises and manufacturers needing full PKI platforms",
    "pricing": "Typically hundreds of USD/EUR per year for DV/OV/EV (confirm live pricing)",
    "certTypes": "DV, OV, EV, IntranetSSL, IoT device certificates",
    "automation": "ACME/SCEP via Atlas — enterprise PKI feature, not SMB self-serve",
    "setup": "Enterprise integration; OV/EV need business verification",
    "bundled": "✗ enterprise PKI platform",
    "freeTier": "✗ no free tier",
    "summary": "GlobalSign is enterprise PKI. docstoc is SMB HTTPS automation. For one small-business domain, free automated DV Let's Encrypt via docstoc removes enterprise pricing and integration. Keep GlobalSign for IoT fleets, IntranetSSL, or OV/EV programs.",
    "faq": [
      {
        "q": "Is docstoc a GlobalSign alternative?",
        "a": "For a single SMB domain's DV HTTPS, yes on cost/effort. Not for enterprise PKI."
      },
      {
        "q": "Does GlobalSign renew automatically?",
        "a": "Atlas can, as paid enterprise automation — not a bundled SMB feature."
      },
      {
        "q": "Why choose GlobalSign?",
        "a": "OV/EV, IoT, IntranetSSL, or centralized enterprise PKI."
      },
      {
        "q": "When stay?",
        "a": "When those enterprise capabilities are actual requirements."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay for enterprise PKI, IoT, IntranetSSL, or OV/EV mandates.",
    "switchWhy": "SMBs leave GlobalSign when they only needed a website padlock and not a PKI platform.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what GlobalSign is doing today",
        "body": "Note active hostnames, expiry dates, and whether GlobalSign is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old GlobalSign path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at GlobalSign so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from GlobalSign cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing GlobalSign certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "sslforfree",
    "name": "SSL For Free",
    "pricingUrl": "https://www.sslforfree.com/",
    "bestFit": "Hobbyists OK repeating manual validation every ~90 days",
    "pricing": "Free tier; paid convenience tiers roughly $14–$150/mo",
    "certTypes": "Free DV via ACME (ZeroSSL-backed), ~90-day validity",
    "automation": "Free tier often means repeating validation/install unless you script it",
    "setup": "Manual validation and installation each cycle on the free path",
    "bundled": "✗ standalone free-certificate tool",
    "freeTier": "Free 90-day DV via web app or ACME client",
    "summary": "SSL For Free is genuinely free DV, but the free path often reintroduces manual work every ~90 days. docstoc: one DNS TXT once, then automated reissue inside your business workspace — Let's Encrypt backed, not ZeroSSL.",
    "faq": [
      {
        "q": "Is SSL For Free free?",
        "a": "Yes for certificates. Ongoing effort differs: docstoc emails you before expiry and guides each renewal, which needs a fresh DNS TXT value."
      },
      {
        "q": "Same CA as docstoc?",
        "a": "No. SSL For Free commonly uses ZeroSSL infrastructure; docstoc uses Let's Encrypt."
      },
      {
        "q": "Why pay SSL For Free tiers?",
        "a": "Convenience allotments/wildcards outside a business suite. docstoc bundles automation into the paid business plan."
      },
      {
        "q": "When stay?",
        "a": "If you like that UI and accept manual cycles or pay their automation tiers."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay if the free manual flow is fine for a hobby site, or you already pay their convenience tiers.",
    "switchWhy": "People leave when they want expiry reminders and renewal in the same account as their invoices and documents.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what SSL For Free is doing today",
        "body": "Note active hostnames, expiry dates, and whether SSL For Free is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old SSL For Free path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at SSL For Free so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from SSL For Free cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing SSL For Free certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "freessl-org",
    "name": "FreeSSL.org",
    "pricingUrl": "https://freessl.org/",
    "bestFit": "Developers wanting ACME/API with a nicer UI than raw certbot",
    "pricing": "Free tier; paid from about $9.90/mo",
    "certTypes": "90-day DV, wildcard, multi-domain via ACME/API",
    "automation": "ACME/API available; free tier still needs you to operate renewal",
    "setup": "Low–moderate; confirm which CA backs issued certs on their site",
    "bundled": "✗ standalone certificate tool",
    "freeTier": "Free tier advertised; paid for higher allotments",
    "summary": "FreeSSL.org is another ACME-oriented tool with free and paid tiers. docstoc discloses Let's Encrypt plainly and bundles automation into invoicing/documents — no separate cert product account.",
    "faq": [
      {
        "q": "More transparent than FreeSSL.org?",
        "a": "docstoc states Let's Encrypt. Confirm FreeSSL.org's backing CA on their docs before relying on it."
      },
      {
        "q": "Is FreeSSL.org free like docstoc?",
        "a": "They advertise a free tier; paid plans add allotments. docstoc has no separate per-cert SSL SKU."
      },
      {
        "q": "Separate account?",
        "a": "Yes for FreeSSL.org. docstoc SSL lives in your existing workspace."
      },
      {
        "q": "When stay?",
        "a": "If you want their API/UI specifically for multi-domain ACME outside docstoc."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay for their API/allotments if you are already standardized on that tool.",
    "switchWhy": "Switch when you want transparent Let's Encrypt automation inside a business platform instead of another cert SaaS.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what FreeSSL.org is doing today",
        "body": "Note active hostnames, expiry dates, and whether FreeSSL.org is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old FreeSSL.org path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at FreeSSL.org so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from FreeSSL.org cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing FreeSSL.org certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "certum",
    "name": "Certum",
    "pricingUrl": "https://shop.certum.eu/ssl.html",
    "bestFit": "Buyers wanting inexpensive paid certs with a financial guarantee",
    "pricing": "DV from roughly €25/yr; OV/EV higher (confirm live)",
    "certTypes": "DV, OV, EV, plus code/document signing offerings",
    "automation": "Typically manual CSR and renewal/re-purchase — not consumer ACME SMB UX",
    "setup": "Manual CSR, validation; OV/EV need business docs",
    "bundled": "✗ commercial CA / reseller-friendly vendor",
    "freeTier": "✗ no free tier",
    "summary": "Certum sells affordable commercial certs with guarantee options and broader signing products. For plain DV HTTPS, docstoc's free automated Let's Encrypt path is simpler. Keep Certum for guarantees, OV/EV, or code/document signing.",
    "faq": [
      {
        "q": "docstoc vs Certum for DV?",
        "a": "docstoc: free automated DV. Certum: paid, often manual, with commercial extras."
      },
      {
        "q": "Does it renew automatically?",
        "a": "Certum commonly needs repurchase/revalidation. docstoc reissues automatically after DNS is set."
      },
      {
        "q": "Why pay Certum?",
        "a": "Financial guarantee, OV/EV, or signing certificates docstoc does not sell."
      },
      {
        "q": "When stay?",
        "a": "When those commercial extras are required."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay for guarantee-backed certs, OV/EV, or code/document signing.",
    "switchWhy": "Leave Certum when you only needed automated DV HTTPS and not commercial extras.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Certum is doing today",
        "body": "Note active hostnames, expiry dates, and whether Certum is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Certum path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Certum so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Certum cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Certum certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "godaddy-ssl",
    "name": "GoDaddy SSL",
    "pricingUrl": "https://www.godaddy.com/web-security/ssl-certificate",
    "bestFit": "GoDaddy Group hosting/domain customers wanting one vendor",
    "pricing": "Promotional first-term pricing often ~$70–$100/yr; renewals commonly much higher",
    "certTypes": "DV, OV, EV, wildcard, SAN — commercial/reseller certs",
    "automation": "Managed options exist; base certs often need active renewal attention",
    "setup": "CSR/setup; OV/EV need business verification",
    "bundled": "Bundled with GoDaddy domains/hosting — not with invoicing/documents",
    "freeTier": "✗ no free tier",
    "summary": "GoDaddy Group SSL is a common upsell with intro pricing and painful renewal jumps. docstoc issues free automated Let's Encrypt DV with no separate SSL repurchase — renewal is part of the platform, not a surprise line item.",
    "faq": [
      {
        "q": "Is docstoc a GoDaddy SSL alternative?",
        "a": "Yes for DV HTTPS — especially if renewal-price surprises are the pain point."
      },
      {
        "q": "Why do GoDaddy renewals jump?",
        "a": "Promotional first term then higher renewals — widely reported; confirm your invoice."
      },
      {
        "q": "Does docstoc need repurchase?",
        "a": "No separate SSL repurchase. Automated reissue while the plan stays active and DNS remains correct."
      },
      {
        "q": "When stay on GoDaddy?",
        "a": "When you want SSL tightly bundled with GoDaddy hosting support and accept their pricing."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay if GoDaddy support/hosting bundling matters more than certificate price.",
    "switchWhy": "Customers switch after a renewal bill shock or when they want HTTPS without a separate GoDaddy SSL SKU.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what GoDaddy SSL is doing today",
        "body": "Issue docstoc first. Then cancel the GoDaddy SSL add-on from their billing so the next renewal does not charge."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old GoDaddy SSL path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at GoDaddy SSL so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from GoDaddy SSL cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing GoDaddy SSL certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "actalis",
    "name": "Actalis",
    "pricingUrl": "https://www.actalis.com/ssl-certificates.aspx",
    "bestFit": "European buyers seeking commercial CA certs (often via resellers/hosts)",
    "pricing": "Commercial DV/OV/EV pricing via Actalis and partners (confirm live quotes)",
    "certTypes": "DV, OV, EV and related commercial TLS products",
    "automation": "Depends on reseller/host integration — not a free SMB ACME bundle like docstoc",
    "setup": "Typically purchase + validation through Actalis or a hosting partner",
    "bundled": "✗ commercial CA (often sold with European hosting/reseller channels)",
    "freeTier": "✗ no free forever DV automation comparable to Let's Encrypt via docstoc",
    "summary": "Actalis is an Italian commercial CA in the broader European TLS market. If you only need a domain-validated padlock, docstoc's free automated Let's Encrypt path avoids CA purchase cycles. Keep Actalis when you specifically need their commercial validation products or a host that only ships Actalis certs.",
    "faq": [
      {
        "q": "Is docstoc an Actalis alternative?",
        "a": "For DV HTTPS on your own domain, yes on cost and automation. Not as a drop-in for every commercial Actalis product."
      },
      {
        "q": "Does Actalis offer free ACME like Let's Encrypt?",
        "a": "Actalis is a commercial CA. docstoc uses Let's Encrypt for free DV automation."
      },
      {
        "q": "When stay on Actalis?",
        "a": "Host/reseller constraints, regional commercial requirements, or OV/EV needs."
      },
      {
        "q": "Wildcards?",
        "a": "Buy from a commercial CA. docstoc focuses on straightforward DV domain automation for SMB sites."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay when your host requires Actalis or you need their commercial validation tier.",
    "switchWhy": "Switch when an Actalis/reseller cert was only bought for a basic padlock and renewals feel like busywork.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Actalis is doing today",
        "body": "Note active hostnames, expiry dates, and whether Actalis is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Actalis path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Actalis so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Actalis cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Actalis certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "secom-trust",
    "name": "Secom Trust",
    "pricingUrl": "https://www.secomtrust.net/",
    "bestFit": "Organizations needing Japanese commercial trust/PKI services",
    "pricing": "Commercial enterprise pricing (quote-based; confirm with Secom Trust)",
    "certTypes": "Commercial SSL/TLS and broader trust services oriented to JP enterprise needs",
    "automation": "Enterprise/service-desk oriented — not an SMB free ACME bundle",
    "setup": "Sales/onboarding with a commercial trust provider",
    "bundled": "✗ commercial trust / security services vendor",
    "freeTier": "✗ not positioned as free Let's Encrypt automation for global SMBs",
    "summary": "Secom Trust Systems serves commercial trust needs, especially in Japan. docstoc is a global SMB platform that automates Let's Encrypt DV certificates beside invoices and documents. They overlap only on 'get HTTPS'; for other buyers they barely compete.",
    "faq": [
      {
        "q": "Is docstoc a Secom Trust alternative?",
        "a": "Only for simple DV website HTTPS. Not for Secom's broader commercial trust offerings."
      },
      {
        "q": "Same market?",
        "a": "Partially. Secom Trust is commercial/JP-enterprise leaning; docstoc is SMB automation with Let's Encrypt DV."
      },
      {
        "q": "When stay?",
        "a": "When you need Secom Trust's commercial/local trust services or contracts."
      },
      {
        "q": "Language/support?",
        "a": "Choose the vendor that matches your support and compliance locale. docstoc SSL is self-serve ACME automation."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay for Secom Trust commercial contracts, local enterprise requirements, or services beyond website DV TLS.",
    "switchWhy": "International SMBs move to docstoc when they only needed automated DV HTTPS, not a commercial JP trust engagement.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Secom Trust is doing today",
        "body": "Note active hostnames, expiry dates, and whether Secom Trust is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Secom Trust path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Secom Trust so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Secom Trust cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Secom Trust certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "freessl-cfd",
    "name": "FreeSSL.CFD",
    "pricingUrl": "https://freessl.cfd/",
    "bestFit": "Users hunting free/cheap SSL landing-page tools",
    "pricing": "Marketed as free/cheap SSL tooling — verify terms and CA backing on-site before relying on it",
    "certTypes": "Typically DV-oriented free SSL offers (confirm live)",
    "automation": "Varies — many free SSL sites still push manual steps or upsells",
    "setup": "Usually create an account on a standalone free-SSL site",
    "bundled": "✗ standalone free-SSL marketing site",
    "freeTier": "Advertised free options — read limitations carefully",
    "summary": "FreeSSL.CFD is one of many free-SSL marketing sites. Treat claims carefully and confirm the issuing CA. docstoc is explicit: real Let's Encrypt DV, one DNS TXT record, guided renewals inside a full small-business platform — not a disposable free-SSL landing page.",
    "faq": [
      {
        "q": "Is FreeSSL.CFD safe to rely on?",
        "a": "Verify the CA, terms, and renewal behavior on their site. docstoc documents Let's Encrypt and guides each renewal in the app."
      },
      {
        "q": "Why docstoc instead?",
        "a": "Transparent CA, renewal reminders, and SSL next to invoices/documents instead of a one-off free-SSL site."
      },
      {
        "q": "Do I need both?",
        "a": "No. Pick one issuance path per hostname to avoid conflicting renewals."
      },
      {
        "q": "When stay?",
        "a": "Only if you have validated their CA/process and it already works for a non-critical site."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay only after you have verified their CA and renewal process for your risk tolerance.",
    "switchWhy": "Switch when free-SSL landing pages feel opaque about CA backing or renewals keep failing.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what FreeSSL.CFD is doing today",
        "body": "Note active hostnames, expiry dates, and whether FreeSSL.CFD is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old FreeSSL.CFD path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at FreeSSL.CFD so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from FreeSSL.CFD cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing FreeSSL.CFD certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "certkit",
    "name": "CertKit",
    "pricingUrl": "https://www.certkit.io",
    "bestFit": "Teams wanting a modern certificate toolkit/API workflow",
    "pricing": "See certkit.io for current product/pricing (tooling-oriented)",
    "certTypes": "Certificate tooling oriented around issuance/management workflows (confirm on-site)",
    "automation": "Developer/tooling focused automation — separate from an SMB business suite",
    "setup": "Adopt CertKit's product workflow/API",
    "bundled": "✗ certificate tooling product, not an invoicing/documents platform",
    "freeTier": "Check CertKit's site for trials/free tiers",
    "summary": "CertKit targets certificate tooling workflows. docstoc targets small businesses that want HTTPS handled without becoming certificate engineers — Let's Encrypt DV automation beside templates, invoices, and trust badges. Pick CertKit for toolkit/API depth; pick docstoc for bundled SMB ops.",
    "faq": [
      {
        "q": "Is docstoc a CertKit alternative?",
        "a": "For SMB 'just secure my domain' yes. For developer certificate toolkit workflows, CertKit may fit better."
      },
      {
        "q": "Same buyer?",
        "a": "Often no — tooling vs bundled business platform."
      },
      {
        "q": "When stay on CertKit?",
        "a": "When you need their toolkit/API as part of an engineering workflow."
      },
      {
        "q": "Can I use both?",
        "a": "Possible but usually redundant per hostname — pick one system of record for renewals."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay on CertKit for engineering-centric certificate workflows and APIs.",
    "switchWhy": "Non-engineering teams leave certificate toolkits when they only needed a domain secured next to billing/docs.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what CertKit is doing today",
        "body": "Note active hostnames, expiry dates, and whether CertKit is also your host or DNS. You do not import private keys into docstoc — you issue a new certificate."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old CertKit path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at CertKit so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from CertKit cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing CertKit certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  },
  {
    "slug": "hostinger-ssl",
    "name": "Hostinger SSL",
    "pricingUrl": "https://www.hostinger.com/ssl-certificate",
    "bestFit": "Hostinger hosting customers enabling SSL from the hPanel",
    "pricing": "Often included with hosting plans; paid SSL upgrades may apply for some products — confirm in hPanel",
    "certTypes": "Typically DV via host-integrated Let's Encrypt or paid upgrades (plan-dependent)",
    "automation": "✓ convenient inside Hostinger when the site lives on Hostinger",
    "setup": "Easy on Hostinger hosting; couples SSL to that host",
    "bundled": "Bundled with Hostinger hosting — not with invoicing/documents",
    "freeTier": "Commonly included on hosting; depends on plan",
    "summary": "Hostinger SSL is the right default when your site is hosted on Hostinger — one panel, SSL on. docstoc matters when the domain is not locked to Hostinger, or when you want certificate automation inside the same platform as invoices, templates, and trust badges without making Hostinger your system of record for trust ops.",
    "faq": [
      {
        "q": "Should Hostinger customers switch?",
        "a": "If the site stays on Hostinger and free SSL works, staying is fine. Switch/add docstoc when you need platform-bundled SSL outside that host or multi-product trust automation."
      },
      {
        "q": "Is Hostinger using Let's Encrypt?",
        "a": "Often yes for free host SSL — confirm in your panel. docstoc also uses Let's Encrypt, independently of Hostinger."
      },
      {
        "q": "Can both run?",
        "a": "Avoid two renewal controllers on one hostname. Prefer one issuer path."
      },
      {
        "q": "When stay on Hostinger SSL?",
        "a": "When hosting + SSL in hPanel is already green and you do not need docstoc's broader workspace."
      }
    ],
    "pickDocstoc": "Choose docstoc when you want a real Let's Encrypt DV certificate on your own domain with one DNS TXT record, an email reminder before expiry, and no separate certificate dashboard — inside the same account you use for invoices and documents.",
    "stayWithThem": "Stay when the site remains on Hostinger and included SSL already renews cleanly.",
    "switchWhy": "Move when your domain is leaving Hostinger, or you want SSL managed beside invoices/documents rather than only in hPanel.",
    "whatTransfers": "You keep your domain and DNS provider. Certificate private keys and commercial warranty programs do not transfer — docstoc issues a fresh Let's Encrypt DV certificate with guided renewal instead.",
    "switchSteps": [
      {
        "title": "Inventory what Hostinger SSL is doing today",
        "body": "If leaving Hostinger hosting, issue docstoc SSL on the new host/DNS first, then cancel Hostinger services you no longer need."
      },
      {
        "title": "Add the domain in docstoc",
        "body": "Sign in, open SSL certificates, and add the hostname. docstoc starts an ACME order and shows the DNS TXT challenge to publish."
      },
      {
        "title": "Publish one DNS TXT record",
        "body": "Create the TXT record at your DNS provider. You do not need to change nameservers or put traffic through a CDN proxy for validation."
      },
      {
        "title": "Verify issuance",
        "body": "Use Check status in docstoc. When DNS is visible, a real Let's Encrypt certificate is issued. Each renewal gives you a fresh TXT value to publish."
      },
      {
        "title": "Retire the old Hostinger SSL path",
        "body": "After HTTPS works via docstoc, cancel paid seats or disable old renewal jobs at Hostinger SSL so you are not charged twice."
      }
    ],
    "switchFaq": [
      {
        "q": "Will switching from Hostinger SSL cause downtime?",
        "a": "Usually not. Issue the new certificate first, confirm HTTPS, then cancel the old one. Overlapping validity is normal."
      },
      {
        "q": "Do I move hosting to docstoc?",
        "a": "No. Keep your host. docstoc only needs one DNS TXT record for ACME — it is not your CDN or nameserver."
      },
      {
        "q": "Can I upload my existing Hostinger SSL certificate?",
        "a": "No. docstoc issues a fresh Let's Encrypt DV certificate. That avoids sharing private keys and starts a clean renewal path."
      },
      {
        "q": "What if I need OV or EV?",
        "a": "Stay with a commercial CA. docstoc issues DV only — enough for the browser padlock on most small-business sites."
      }
    ]
  }
];

export function sslCompetitorBySlug(slug) {
  return SSL_COMPETITORS.find((c) => c.slug === slug) || null;
}
