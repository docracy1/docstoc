/**
 * Shared calculators for /tools/* pages.
 * Late payment interest + chase savings / cash unlocked estimates.
 */
(function () {
  function money(n, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return (currency || "USD") + " " + n.toFixed(2);
    }
  }

  function daysBetween(a, b) {
    const ms = Date.parse(b) - Date.parse(a);
    if (!Number.isFinite(ms)) return 0;
    return Math.max(0, Math.round(ms / 86400000));
  }

  function bindLatePayment(root) {
    const amountEl = root.querySelector("[data-lp-amount]");
    const overdueEl = root.querySelector("[data-lp-overdue]");
    const paidEl = root.querySelector("[data-lp-paid]");
    const rateEl = root.querySelector("[data-lp-rate]");
    const feeEl = root.querySelector("[data-lp-fee]");
    const currencyEl = root.querySelector("[data-lp-currency]");
    const outDays = root.querySelector("[data-lp-out-days]");
    const outInterest = root.querySelector("[data-lp-out-interest]");
    const outFee = root.querySelector("[data-lp-out-fee]");
    const outTotal = root.querySelector("[data-lp-out-total]");
    const outRateLabel = root.querySelector("[data-lp-rate-label]");

    function recalc() {
      const amount = Math.max(0, Number(amountEl.value) || 0);
      const rate = Math.max(0, Number(rateEl.value) || 0);
      const feePct = Math.max(0, Number(feeEl.value) || 0);
      const currency = (currencyEl && currencyEl.value) || "USD";
      const overdue = overdueEl.value;
      const paid = paidEl.value || new Date().toISOString().slice(0, 10);
      const days = daysBetween(overdue, paid);
      const interest = amount * (rate / 100) * (days / 365);
      const fee = amount * (feePct / 100);
      const total = amount + interest + fee;
      if (outRateLabel) outRateLabel.textContent = rate.toFixed(1) + "%";
      if (outDays) outDays.textContent = String(days);
      if (outInterest) outInterest.textContent = money(interest, currency);
      if (outFee) outFee.textContent = money(fee, currency);
      if (outTotal) outTotal.textContent = money(total, currency);
    }

    [amountEl, overdueEl, paidEl, rateEl, feeEl, currencyEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    if (!overdueEl.value) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      overdueEl.value = d.toISOString().slice(0, 10);
    }
    if (!paidEl.value) paidEl.value = new Date().toISOString().slice(0, 10);
    recalc();
  }

  function bindSavings(root) {
    const arEl = root.querySelector("[data-sv-ar]");
    const dsoEl = root.querySelector("[data-sv-dso]");
    const reduceEl = root.querySelector("[data-sv-reduce]");
    const hoursEl = root.querySelector("[data-sv-hours]");
    const wageEl = root.querySelector("[data-sv-wage]");
    const currencyEl = root.querySelector("[data-sv-currency]");
    const outCash = root.querySelector("[data-sv-out-cash]");
    const outCashPanel = root.querySelector("[data-sv-out-cash-panel]");
    const outHours = root.querySelector("[data-sv-out-hours]");
    const outTimeCost = root.querySelector("[data-sv-out-timecost]");
    const outRoi = root.querySelector("[data-sv-out-roi]");
    const outReduceLabel = root.querySelector("[data-sv-reduce-label]");
    const PRO_ANNUAL = 14.99 * 12;

    function recalc() {
      const ar = Math.max(0, Number(arEl.value) || 0);
      const dso = Math.max(1, Number(dsoEl.value) || 45);
      const reduce = Math.min(dso - 1, Math.max(0, Number(reduceEl.value) || 0));
      const hoursWeek = Math.max(0, Number(hoursEl.value) || 0);
      const wage = Math.max(0, Number(wageEl.value) || 0);
      const currency = (currencyEl && currencyEl.value) || "USD";
      const daily = ar / dso;
      const cashUnlocked = daily * reduce;
      const hoursYear = hoursWeek * 52 * 0.5;
      const timeCost = hoursYear * wage;
      const totalBenefit = cashUnlocked + timeCost;
      const roi = PRO_ANNUAL > 0 ? ((totalBenefit - PRO_ANNUAL) / PRO_ANNUAL) * 100 : 0;
      if (outReduceLabel) outReduceLabel.textContent = String(reduce);
      const cashText = money(cashUnlocked, currency);
      if (outCash) outCash.textContent = cashText;
      if (outCashPanel) outCashPanel.textContent = cashText;
      if (outHours) outHours.textContent = Math.round(hoursYear).toLocaleString() + " hrs/yr";
      if (outTimeCost) outTimeCost.textContent = money(timeCost, currency);
      if (outRoi) outRoi.textContent = roi >= 0 ? Math.round(roi).toLocaleString() + "%" : "—";
    }

    [arEl, dsoEl, reduceEl, hoursEl, wageEl, currencyEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    recalc();
  }

  function bindSslExpiry(root) {
    const issuedEl = root.querySelector("[data-ssl-issued]");
    const validityEl = root.querySelector("[data-ssl-validity]");
    const outExpiry = root.querySelector("[data-ssl-out-expiry]");
    const outRemainingPanel = root.querySelector("[data-ssl-out-remaining-panel]");

    function recalc() {
      const issued = issuedEl.value;
      const validityDays = Number(validityEl.value) || 90;
      if (!issued) {
        if (outExpiry) outExpiry.textContent = "—";
        if (outRemainingPanel) outRemainingPanel.textContent = "—";
        return;
      }
      const issuedDate = new Date(issued + "T00:00:00Z");
      const expiryDate = new Date(issuedDate.getTime() + validityDays * 86400000);
      const today = new Date();
      const remainingDays = Math.round((expiryDate.getTime() - today.getTime()) / 86400000);
      if (outExpiry) {
        outExpiry.textContent = expiryDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
      if (outRemainingPanel) {
        outRemainingPanel.textContent =
          remainingDays < 0
            ? Math.abs(remainingDays) + " days ago (expired)"
            : remainingDays + " days";
      }
    }

    [issuedEl, validityEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    if (!issuedEl.value) issuedEl.value = new Date().toISOString().slice(0, 10);
    recalc();
  }

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function parseUtcTime(raw) {
    // UTCTime YYMMDDHHMMSSZ or GeneralizedTime YYYYMMDDHHMMSSZ
    const s = raw.replace(/Z$/i, "");
    let y, mo, d;
    if (s.length === 12) {
      y = 2000 + Number(s.slice(0, 2));
      mo = Number(s.slice(2, 4));
      d = Number(s.slice(4, 6));
    } else if (s.length === 14) {
      y = Number(s.slice(0, 4));
      mo = Number(s.slice(4, 6));
      d = Number(s.slice(6, 8));
    } else return null;
    if (!y || !mo || !d) return null;
    return new Date(Date.UTC(y, mo - 1, d));
  }

  function tryParseCertDates(buffer) {
    try {
      const latin = new TextDecoder("latin1").decode(buffer);
      let bytes = new Uint8Array(buffer);
      const pem = latin.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
      if (pem) {
        const b64 = pem[1].replace(/\s+/g, "");
        const bin = atob(b64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      }
      const scan = new TextDecoder("latin1").decode(bytes);
      const matches = [...scan.matchAll(/([0-9]{12}Z|[0-9]{14}Z)/g)].map((m) => m[1]);
      if (matches.length < 2) return null;
      const notBefore = parseUtcTime(matches[0]);
      const notAfter = parseUtcTime(matches[1]);
      if (!notBefore || !notAfter || !(notAfter > notBefore)) return null;
      const days = Math.max(1, Math.round((notAfter - notBefore) / 86400000));
      return {
        issued: notBefore.toISOString().slice(0, 10),
        days,
      };
    } catch {
      return null;
    }
  }

  function bindHashChecker(drop) {
    const scope = document.querySelector(".tool-sell-main") || document;
    const input = drop.querySelector("[data-hash-input]");
    const out = scope.querySelector("[data-hash-out]");
    const outValue = scope.querySelector("[data-hash-value]");
    const outMeta = scope.querySelector("[data-hash-meta]");
    const outNext = scope.querySelector("[data-hash-next]");
    const copyBtn = scope.querySelector("[data-hash-copy]");
    if (!drop || !input) return;
    const intent = drop.getAttribute("data-drop-intent") || "hash";

    async function handleFile(file) {
      if (!file) return;
      if (outValue) outValue.textContent = "Computing…";
      if (out) out.hidden = false;
      if (outNext) {
        outNext.hidden = true;
        outNext.textContent = "";
      }
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hex = bufferToHex(digest);
      if (outValue) outValue.textContent = hex;
      if (outMeta) outMeta.textContent = `${file.name} · ${formatBytes(file.size)} · SHA-256`;
      const title = drop.querySelector(".tool-circle-title");
      const sub = drop.querySelector(".tool-circle-sub");
      if (title) title.textContent = "Hash ready";
      if (sub) sub.textContent = hex.slice(0, 12) + "…" + hex.slice(-8);

      if (intent === "ssl") {
        const parsed = tryParseCertDates(buffer);
        const issuedEl = scope.querySelector("[data-ssl-issued]");
        const validityEl = scope.querySelector("[data-ssl-validity]");
        if (parsed && issuedEl) {
          issuedEl.value = parsed.issued;
          if (validityEl) {
            const opt = [...validityEl.options].find((o) => Number(o.value) === parsed.days);
            if (opt) validityEl.value = String(parsed.days);
            else {
              // closest common option or custom via selecting 90 and noting
              validityEl.value = parsed.days <= 120 ? "90" : parsed.days <= 400 ? "398" : "365";
            }
            issuedEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (outNext) {
            outNext.hidden = false;
            outNext.textContent =
              "Read certificate dates from the file — check the calculator below (validity snapped to a common period if needed). Exact span ≈ " +
              parsed.days +
              " days.";
          }
          if (title) title.textContent = "Expiry set";
          if (sub) {
            const expEl = scope.querySelector("[data-ssl-out-expiry]");
            sub.textContent = expEl && expEl.textContent !== "—" ? "Expires " + expEl.textContent : parsed.days + " day validity";
          }
          const calc = scope.querySelector("[data-calc='ssl-expiry']");
          if (calc) {
            calc.scrollIntoView({ behavior: "smooth", block: "nearest" });
            const results = calc.querySelector(".tool-results");
            if (results) {
              results.classList.add("is-flash");
              setTimeout(() => results.classList.remove("is-flash"), 900);
            }
          }
        } else if (outNext) {
          outNext.hidden = false;
          outNext.textContent =
            "Fingerprint ready. If this wasn’t a readable .pem/.crt, enter the issue date manually below.";
        }
      } else if (outNext) {
        outNext.hidden = false;
        outNext.innerHTML = 'Fingerprint ready. <a href="/app/certificates">Save as a free certificate →</a>';
      }

      if (out) out.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Native file input covers the circle (.tool-circle-file). Avoid programmatic
    // input.click() on a 1×1 hidden control — browsers often block the picker.
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => handleFile(input.files && input.files[0]));
    function onDragOver(e) {
      e.preventDefault();
      drop.classList.add("is-drag");
    }
    function onDragLeave() {
      drop.classList.remove("is-drag");
    }
    function onDrop(e) {
      e.preventDefault();
      drop.classList.remove("is-drag");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    }
    [drop, input].forEach((el) => {
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("dragleave", onDragLeave);
      el.addEventListener("drop", onDrop);
    });
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = outValue && outValue.textContent;
        if (!text || text === "Computing…") return;
        navigator.clipboard.writeText(text).then(() => {
          const original = copyBtn.textContent;
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = original), 1500);
        });
      });
    }
  }

  function parseTrustId(raw) {
    const s = (raw || "").trim();
    if (!s) return "";
    try {
      const u = new URL(s, "https://docstoc.io");
      const m = u.pathname.match(/\/trust\/([^/?#]+)/i);
      if (m) return decodeURIComponent(m[1]);
    } catch {
      /* not a URL */
    }
    return s.replace(/^\/+/, "").split(/[/?#]/)[0];
  }

  function bindTrustBadge(root) {
    const input = root.querySelector("[data-trust-id]");
    const lookupBtn = root.querySelector("[data-trust-lookup]");
    const copyBtn = root.querySelector("[data-trust-copy-embed]");
    const outName = root.querySelector("[data-trust-out-name]");
    const outDomain = root.querySelector("[data-trust-out-domain]");
    const outStatus = root.querySelector("[data-trust-out-status]");
    const outSince = root.querySelector("[data-trust-out-since]");
    const outNote = root.querySelector("[data-trust-out-note]");
    const badge =
      root.querySelector("[data-trust-badge-preview]") ||
      document.querySelector("[data-trust-badge-preview]");
    const embedBox = root.querySelector("[data-trust-embed]");
    const linkWrap = root.querySelector("[data-trust-profile-link-wrap]");
    const link = root.querySelector("[data-trust-profile-link]");
    if (!input || !lookupBtn) return;

    const lockSvg =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

    function statusLabel(status) {
      if (status === "active") return "SSL active";
      if (status === "expiring") return "SSL renewal due";
      if (status === "expired") return "SSL expired";
      return "No verified domain";
    }

    function setDemoBadge(label) {
      if (badge) badge.innerHTML = lockSvg + " " + label;
    }

    async function lookup() {
      const id = parseTrustId(input.value);
      if (!id) {
        if (outNote) outNote.textContent = "Enter an account ID or a full /trust/… URL.";
        return;
      }
      if (outNote) outNote.textContent = "Looking up…";
      if (copyBtn) copyBtn.hidden = true;
      if (embedBox) embedBox.hidden = true;
      if (linkWrap) linkWrap.hidden = true;

      try {
        const res = await fetch("/api/trust/public/" + encodeURIComponent(id));
        if (res.status === 404) {
          if (outName) outName.textContent = "—";
          if (outDomain) outDomain.textContent = "—";
          if (outStatus) outStatus.textContent = "—";
          if (outSince) outSince.textContent = "—";
          if (outNote)
            outNote.textContent =
              "No trust profile found for that ID — the domain may not be verified yet.";
          setDemoBadge("Domain-verified via docstoc");
          return;
        }
        if (!res.ok) throw new Error("lookup failed");
        const profile = await res.json();
        const since =
          profile.verifiedSince &&
          new Date(profile.verifiedSince).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        const label =
          profile.otsStatus === "confirmed" && profile.verifiedSince
            ? "Domain-verified since " + profile.verifiedSince.slice(0, 10)
            : "Domain-verified via docstoc";
        if (outName) outName.textContent = profile.workspaceName || "—";
        if (outDomain) outDomain.textContent = profile.domain || "—";
        if (outStatus) outStatus.textContent = statusLabel(profile.domainStatus);
        if (outSince) outSince.textContent = since || "—";
        setDemoBadge(label);
        const origin = window.location.origin;
        const profileUrl = origin + "/trust/" + encodeURIComponent(id);
        const embed =
          '<script src="' +
          origin +
          "/api/trust/badge/" +
          encodeURIComponent(id) +
          '.js" async></' +
          "script>";
        if (embedBox) {
          embedBox.textContent = embed;
          embedBox.hidden = false;
        }
        if (link) link.href = profileUrl;
        if (linkWrap) linkWrap.hidden = false;
        if (copyBtn) {
          copyBtn.hidden = false;
          copyBtn.dataset.embed = embed;
        }
        if (outNote) {
          outNote.textContent =
            profile.domainStatus === "active"
              ? "Live public profile loaded. Copy the embed snippet to put this badge on a site."
              : "Profile found, but the domain is not currently active — the live badge script only serves when SSL is active.";
        }
      } catch {
        if (outNote) outNote.textContent = "Lookup failed — try again in a moment.";
      }
    }

    lookupBtn.addEventListener("click", lookup);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        lookup();
      }
    });
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = copyBtn.dataset.embed;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          const original = copyBtn.textContent;
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = original), 1500);
        });
      });
    }

    const params = new URLSearchParams(window.location.search);
    const q = params.get("id") || params.get("account");
    if (q) {
      input.value = q;
      lookup();
    }
  }

  function bindInvoicePreview(root) {
    const itemsEl = root.querySelector("[data-inv-items]");
    const addBtn = root.querySelector("[data-inv-add]");
    const clientEl = root.querySelector("[data-inv-client]");
    const currencyEl = root.querySelector("[data-inv-currency]");
    const taxEl = root.querySelector("[data-inv-tax]");
    const outClient = root.querySelector("[data-inv-out-client]");
    const outSub = root.querySelector("[data-inv-out-subtotal]");
    const outTax = root.querySelector("[data-inv-out-tax]");
    const outTotalPanel = root.querySelector("[data-inv-out-total-panel]");
    if (!itemsEl) return;

    function lineHtml() {
      return (
        '<div class="tool-line-item">' +
        '<div class="tool-field"><label>Description</label><input data-inv-desc type="text" value="" placeholder="Line item" /></div>' +
        '<div class="tool-field"><label>Qty</label><input data-inv-qty type="number" min="0" step="1" value="1" /></div>' +
        '<div class="tool-field"><label>Price</label><input data-inv-price type="number" min="0" step="0.01" value="0" /></div>' +
        '<button type="button" data-inv-remove aria-label="Remove line">✕</button>' +
        "</div>"
      );
    }

    function bindRow(row) {
      row.querySelectorAll("input").forEach((el) => {
        el.addEventListener("input", recalc);
        el.addEventListener("change", recalc);
      });
      const remove = row.querySelector("[data-inv-remove]");
      if (remove) {
        remove.addEventListener("click", () => {
          const rows = itemsEl.querySelectorAll(".tool-line-item");
          if (rows.length <= 1) return;
          row.remove();
          recalc();
        });
      }
    }

    function recalc() {
      const currency = (currencyEl && currencyEl.value) || "USD";
      const taxRate = Math.max(0, Number(taxEl && taxEl.value) || 0);
      let subtotal = 0;
      itemsEl.querySelectorAll(".tool-line-item").forEach((row) => {
        const qty = Math.max(0, Number(row.querySelector("[data-inv-qty]").value) || 0);
        const price = Math.max(0, Number(row.querySelector("[data-inv-price]").value) || 0);
        subtotal += qty * price;
      });
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;
      if (outClient) outClient.textContent = (clientEl && clientEl.value.trim()) || "—";
      if (outSub) outSub.textContent = money(subtotal, currency);
      if (outTax) outTax.textContent = money(taxAmount, currency);
      const totalText = money(total, currency);
      if (outTotalPanel) outTotalPanel.textContent = totalText;
    }

    itemsEl.querySelectorAll(".tool-line-item").forEach(bindRow);
    [clientEl, currencyEl, taxEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        itemsEl.insertAdjacentHTML("beforeend", lineHtml());
        bindRow(itemsEl.lastElementChild);
        recalc();
      });
    }
    recalc();
  }

  function flash(el) {
    if (!el) return;
    el.classList.add("is-flash");
    setTimeout(() => el.classList.remove("is-flash"), 900);
  }

  function scrollFocus(selector, focusSelector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const headerOffset = 96;
    const top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    flash(el);
    flash(el.querySelector(".tool-panel") || el);
    flash(el.querySelector(".tool-results"));
    const focusEl = focusSelector
      ? el.querySelector(focusSelector) || document.querySelector(focusSelector)
      : null;
    if (focusEl && typeof focusEl.focus === "function") {
      setTimeout(() => {
        try {
          focusEl.focus({ preventScroll: true });
          if (typeof focusEl.select === "function") focusEl.select();
        } catch (_) {
          focusEl.focus();
        }
      }, 320);
    }
  }

  function bindToolAction(circle) {
    const action = circle.getAttribute("data-tool-action");
    const input = circle.querySelector("[data-tool-input]");
    if (!action) return;

    if (action === "index") {
      const go = (e) => {
        if (e) e.preventDefault();
        scrollFocus("#tool-list");
      };
      circle.addEventListener("click", go);
      circle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
      return;
    }

    if (action === "invoice") {
      const go = (e) => {
        if (e) e.preventDefault();
        scrollFocus("#invoice-builder", "[data-inv-client]");
      };
      circle.addEventListener("click", go);
      circle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
      return;
    }

    if (action === "chase") {
      const go = (e) => {
        if (e) e.preventDefault();
        scrollFocus("#chase-calc", "[data-lp-amount]");
      };
      circle.addEventListener("click", go);
      circle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
      return;
    }

    if (action === "templates" && input) {
      const cards = [...document.querySelectorAll(".finder-card")];
      const note = document.querySelector("[data-template-filter-note]");
      function filter() {
        const q = (input.value || "").trim().toLowerCase();
        let shown = 0;
        cards.forEach((card) => {
          const hay =
            ((card.getAttribute("data-finder-tags") || "") + " " + (card.textContent || "")).toLowerCase();
          const match = !q || hay.includes(q) || q.split(/\s+/).every((w) => hay.includes(w));
          card.classList.toggle("is-hidden", !match);
          if (match) shown += 1;
        });
        if (note) {
          if (!q) {
            note.hidden = true;
            note.textContent = "";
          } else {
            note.hidden = false;
            note.textContent =
              shown === 0
                ? "No matches in common situations — try Browse all templates, or submit your own."
                : shown + " situation" + (shown === 1 ? "" : "s") + " matched.";
          }
        }
      }
      input.addEventListener("input", filter);
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        filter();
        const visible = cards.filter((c) => !c.classList.contains("is-hidden"));
        if (visible.length === 1) {
          window.location.href = visible[0].href;
          return;
        }
        const section = document.querySelector("#situations");
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
        if (visible.length === 0) {
          window.location.href =
            "/document-templates/" +
            (input.value.trim() ? "?q=" + encodeURIComponent(input.value.trim()) : "");
        }
      });
      return;
    }

    if (action === "trust" && input) {
      function runLookup() {
        const dest = document.querySelector("[data-trust-id]");
        const btn = document.querySelector("[data-trust-lookup]");
        if (dest) dest.value = input.value.trim();
        scrollFocus("[data-calc='trust-badge']", "[data-trust-id]");
        if (btn) btn.click();
      }
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runLookup();
        }
      });
      circle.addEventListener("click", (e) => {
        if (e.target === input || e.target.closest("a")) return;
        input.focus();
      });
    }
  }

  function bindEmbedCopy(btn) {
    const targetSel = btn.getAttribute("data-copy-embed");
    const target = targetSel && document.querySelector(targetSel);
    if (!target) return;
    btn.addEventListener("click", () => {
      target.hidden = false;
      const text = target.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = original;
        }, 1600);
      });
    });
  }

  function safeBind(fn, el) {
    try {
      fn(el);
    } catch (err) {
      console.error("[tools-calc]", err);
    }
  }
  document.querySelectorAll("[data-copy-embed]").forEach((el) => safeBind(bindEmbedCopy, el));
  document.querySelectorAll("[data-calc='late-payment']").forEach((el) => safeBind(bindLatePayment, el));
  document.querySelectorAll("[data-calc='chase-savings']").forEach((el) => safeBind(bindSavings, el));
  document.querySelectorAll("[data-calc='ssl-expiry']").forEach((el) => safeBind(bindSslExpiry, el));
  document.querySelectorAll("[data-hash-drop]").forEach((el) => safeBind(bindHashChecker, el));
  document.querySelectorAll("[data-calc='trust-badge']").forEach((el) => safeBind(bindTrustBadge, el));
  document.querySelectorAll("[data-calc='invoice-preview']").forEach((el) => safeBind(bindInvoicePreview, el));
  document.querySelectorAll("[data-tool-action]").forEach((el) => safeBind(bindToolAction, el));
})();
