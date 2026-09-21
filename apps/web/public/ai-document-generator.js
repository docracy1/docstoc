/**
 * AI Document Generator — /tools/ai-document-generator.
 * Talks to /api/ai-document-generator/{config,generate}. Turnstile is rendered explicitly (not the
 * implicit cf-turnstile auto-scan) because the site key only arrives after an async /config fetch.
 */
(function () {
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineMd(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>');
  }

  /** Small subset of the same markdown docstoc's templates use — headers, bold/italic, tables,
   *  lists, hr, paragraphs. Mirrors the build-time markdownToHtml() in generate-free-templates.mjs. */
  function markdownToHtml(md) {
    var lines = md.split("\n");
    var out = [];
    var inTable = false;
    var tableRowIndex = 0;
    var inList = false;
    var paragraph = [];

    function flushParagraph() {
      if (paragraph.length) {
        out.push("<p>" + inlineMd(paragraph.join(" ")) + "</p>");
        paragraph = [];
      }
    }
    function closeTable() {
      if (inTable) {
        out.push("</table>");
        inTable = false;
        tableRowIndex = 0;
      }
    }
    function closeList() {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (!trimmed) {
        flushParagraph();
        closeTable();
        closeList();
        continue;
      }
      if (trimmed.indexOf("|") === 0) {
        flushParagraph();
        closeList();
        var cells = trimmed
          .split("|")
          .map(function (c) {
            return c.trim();
          })
          .filter(function (c, idx, arr) {
            return !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === "");
          });
        if (cells.every(function (c) { return /^-+$/.test(c); })) continue;
        if (!inTable) {
          out.push("<table>");
          inTable = true;
        }
        var tag = tableRowIndex === 0 ? "th" : "td";
        out.push(
          "<tr>" +
            cells.map(function (c) { return "<" + tag + ">" + inlineMd(c) + "</" + tag + ">"; }).join("") +
            "</tr>"
        );
        tableRowIndex += 1;
        continue;
      }
      if (trimmed !== "---" && /^[-*]\s+/.test(trimmed)) {
        flushParagraph();
        closeTable();
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push("<li>" + inlineMd(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      closeTable();
      closeList();
      if (trimmed.indexOf("# ") === 0) {
        flushParagraph();
        out.push("<h1>" + inlineMd(trimmed.slice(2)) + "</h1>");
      } else if (trimmed.indexOf("## ") === 0) {
        flushParagraph();
        out.push("<h2>" + inlineMd(trimmed.slice(3)) + "</h2>");
      } else if (trimmed.indexOf("### ") === 0) {
        flushParagraph();
        out.push("<h3>" + inlineMd(trimmed.slice(4)) + "</h3>");
      } else if (trimmed === "---") {
        flushParagraph();
        out.push("<hr>");
      } else {
        paragraph.push(trimmed);
      }
    }
    flushParagraph();
    closeTable();
    closeList();
    return out.join("\n");
  }

  function waitForTurnstile(cb, triesLeft) {
    if (window.turnstile) return cb(window.turnstile);
    if (triesLeft <= 0) return cb(null);
    setTimeout(function () {
      waitForTurnstile(cb, triesLeft - 1);
    }, 150);
  }

  function init() {
    var root = document.querySelector("[data-docgen]");
    if (!root) return;

    var descEl = root.querySelector("[data-docgen-description]");
    var submitBtn = root.querySelector("[data-docgen-submit]");
    var errorEl = root.querySelector("[data-docgen-error]");
    var turnstileEl = root.querySelector("[data-docgen-turnstile]");
    var placeholderEl = document.querySelector("[data-docgen-placeholder]");
    var outputEl = document.querySelector("[data-docgen-output]");
    var metaEl = document.querySelector("[data-docgen-meta]");
    var bodyEl = document.querySelector("[data-docgen-body]");
    var ctaEl = document.querySelector("[data-docgen-cta]");
    if (!descEl || !submitBtn) return;

    // Category-specific next step beats one generic "save documents" link for every result —
    // pair the free draft with whichever paid capability is actually relevant to what was just
    // generated. Finance docs (invoices, late-fee notices, etc.) point at chasing; everything
    // else points at the tamper-evident certificate, since "prove what you sent" applies broadly.
    function ctaFor(category) {
      if (!category) {
        return { text: "Save documents in docstoc →", href: "/app/login?start=1", source: "tool_ai_docgen_result_generic" };
      }
      if (category === "Finance") {
        return {
          text: "Turn this into a tracked invoice chase →",
          href: "/app/login?start=1",
          source: "tool_ai_docgen_result_finance",
        };
      }
      return {
        text: "Get a tamper-evident certificate for this document →",
        href: "/app/login?start=1",
        source: "tool_ai_docgen_result_certificate",
      };
    }

    function renderCta(category) {
      if (!ctaEl) return;
      var cta = ctaFor(category);
      ctaEl.innerHTML =
        '<a class="nav-cta" href="' +
        cta.href +
        '" data-cta data-cta-source="' +
        cta.source +
        '">' +
        cta.text +
        "</a>";
      ctaEl.hidden = false;
    }

    var widgetId = null;
    var turnstileRequired = false;

    fetch("/api/ai-document-generator/config")
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        turnstileRequired = Boolean(cfg.turnstileRequired);
        if (!cfg.turnstileSiteKey) return;
        waitForTurnstile(function (turnstile) {
          if (!turnstile || !turnstileEl) return;
          widgetId = turnstile.render(turnstileEl, { sitekey: cfg.turnstileSiteKey });
        }, 20);
      })
      .catch(function () {});

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
    function clearError() {
      if (!errorEl) return;
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    submitBtn.addEventListener("click", function () {
      clearError();
      var description = (descEl.value || "").trim();
      if (description.length < 8) {
        showError("Add a bit more detail about what you need.");
        return;
      }

      var token = widgetId && window.turnstile ? window.turnstile.getResponse(widgetId) : "";
      if (turnstileRequired && !token) {
        showError("Complete the security check above and try again.");
        return;
      }

      submitBtn.disabled = true;
      var originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Generating…";

      fetch("/api/ai-document-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description, turnstileToken: token || undefined }),
      })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, data: data };
          });
        })
        .then(function (res) {
          if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
          if (!res.ok) {
            showError(res.data.error || "Could not generate the document. Try again.");
            return;
          }
          if (bodyEl) bodyEl.innerHTML = markdownToHtml(res.data.bodyMarkdown || "");
          if (metaEl) {
            metaEl.textContent = res.data.matchedTemplateName
              ? "Based on the closest matching docstoc template: " + res.data.matchedTemplateName
              : "Written from general best practice — no closely matching template found.";
          }
          renderCta(res.data.matchedTemplateCategory);
          if (placeholderEl) placeholderEl.hidden = true;
          if (outputEl) {
            outputEl.hidden = false;
            outputEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        })
        .catch(function () {
          if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
          showError("Could not generate the document. Try again in a moment.");
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
