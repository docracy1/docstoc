(function () {
  var CONSENT_KEY = "docstoc_cookie_consent";
  var STYLE_ID = "docstoc-cookie-consent-style";

  function getConsent() {
    try {
      var v = localStorage.getItem(CONSENT_KEY);
      if (v) return v;
      var legacy = localStorage.getItem("chasa_cookie_consent");
      if (legacy) {
        localStorage.setItem(CONSENT_KEY, legacy);
        localStorage.removeItem("chasa_cookie_consent");
        return legacy;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {}
  }

  function loadClarity() {
    if (document.querySelector("script[data-docstoc-clarity],script[data-docstoc-clarity-loader]")) return;
    var s = document.createElement("script");
    s.src = "/clarity.js";
    s.async = true;
    s.setAttribute("data-docstoc-clarity-loader", "1");
    document.body.appendChild(s);
  }

  // analytics.js's own pageview() call is unconditional (aggregate page-view counting doesn't
  // need consent), so it's always loaded — its consent-gated parts (Clarity, event tracking) are
  // internally gated and only run once consent actually exists. See analytics.js for that split.
  function loadAnalytics() {
    if (document.querySelector('script[data-docstoc-analytics]')) return;
    var s = document.createElement("script");
    s.src = "/analytics.js?v=20261113a";
    s.async = true;
    s.setAttribute("data-docstoc-analytics", "1");
    document.body.appendChild(s);
  }

  /** Called once consent is granted — either at load time (already accepted) or from the
   *  Accept button mid-session. analytics.js is already loaded either way; this just triggers
   *  its consent-gated half (Clarity + event tracking) without re-injecting the script tag. */
  function onConsentGranted() {
    loadClarity();
    if (typeof window.docstocInitAnalytics === "function") window.docstocInitAnalytics();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".docstoc-cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:16px 20px;background:var(--ink,#1a1a1a);color:var(--white,#fff);box-shadow:0 -4px 24px rgba(0,0,0,.18);font-family:Inter,sans-serif;font-size:14px;line-height:1.5}" +
      ".docstoc-cookie-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}" +
      ".docstoc-cookie-inner p{margin:0;flex:1;min-width:220px;color:color-mix(in srgb,var(--white,#fff) 88%,transparent)}" +
      ".docstoc-cookie-inner a{color:var(--accent,#c45c26);font-weight:600;text-decoration:none}" +
      ".docstoc-cookie-inner a:hover{text-decoration:underline}" +
      ".docstoc-cookie-actions{display:flex;gap:10px;flex-shrink:0}" +
      ".docstoc-cookie-btn{font-family:Inter,sans-serif;font-size:13px;font-weight:600;padding:10px 16px;border-radius:4px;border:1.5px solid transparent;cursor:pointer}" +
      ".docstoc-cookie-accept{background:var(--accent,#c45c26);color:var(--white,#fff);border-color:var(--accent,#c45c26)}" +
      ".docstoc-cookie-decline{background:transparent;color:var(--white,#fff);border-color:color-mix(in srgb,var(--white,#fff) 35%,transparent)}";
    document.head.appendChild(style);
  }

  function showBanner() {
    injectStyles();
    var banner = document.createElement("div");
    banner.className = "docstoc-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "true");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<div class="docstoc-cookie-inner">' +
      '<p>We use cookies for anonymous analytics to improve docstoc. See our <a href="/privacy">Privacy policy</a>.</p>' +
      '<div class="docstoc-cookie-actions">' +
      '<button type="button" class="docstoc-cookie-btn docstoc-cookie-decline">Decline</button>' +
      '<button type="button" class="docstoc-cookie-btn docstoc-cookie-accept">Accept</button>' +
      "</div></div>";
    document.body.appendChild(banner);
    var acceptBtn = banner.querySelector(".docstoc-cookie-accept");
    if (acceptBtn && acceptBtn.focus) acceptBtn.focus();
    banner.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setConsent("declined");
        banner.remove();
      }
    });

    banner.querySelector(".docstoc-cookie-accept").addEventListener("click", function () {
      setConsent("accepted");
      banner.remove();
      onConsentGranted();
    });
    banner.querySelector(".docstoc-cookie-decline").addEventListener("click", function () {
      setConsent("declined");
      banner.remove();
    });
  }

  var consent = getConsent();
  loadAnalytics();
  if (consent === "accepted") {
    onConsentGranted();
  } else if (!consent) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showBanner);
    } else {
      showBanner();
    }
  }
})();
