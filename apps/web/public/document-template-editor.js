/**
 * Online editor + print-to-PDF for /document-templates/* pages.
 * Body is editable; docstoc.io footer is fixed on screen and in PDF output.
 */
(function () {
  var box = document.querySelector(".tpl-editor");
  if (!box) return;

  var slug = box.getAttribute("data-slug") || "template";
  var editor = box.querySelector(".tpl-doc-editor");
  if (!editor) return;

  var storageKey = "docstoc-tpl:" + slug;
  var originalHtml = editor.innerHTML;

  try {
    var saved = localStorage.getItem(storageKey);
    if (saved) editor.innerHTML = saved;
  } catch (_e) {}

  editor.addEventListener("input", function () {
    try {
      localStorage.setItem(storageKey, editor.innerHTML);
    } catch (_e) {}
  });

  var footer = box.querySelector(".tpl-doc-footer");
  if (footer) {
    footer.setAttribute("contenteditable", "false");
    footer.addEventListener("keydown", function (e) {
      e.preventDefault();
    });
    footer.addEventListener("paste", function (e) {
      e.preventDefault();
    });
  }

  // The hero and the editor toolbar both carry a "Download PDF" button; both print the edited sheet.
  document.querySelectorAll(".btn-download-pdf").forEach(function (pdfBtn) {
    pdfBtn.addEventListener("click", function () {
      document.body.classList.add("tpl-printing");
      window.print();
      window.addEventListener(
        "afterprint",
        function cleanup() {
          document.body.classList.remove("tpl-printing");
          window.removeEventListener("afterprint", cleanup);
        },
        { once: true }
      );
    });
  });

  var resetBtn = box.querySelector(".btn-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!window.confirm("Reset this template to the original wording? Your edits will be lost.")) return;
      editor.innerHTML = originalHtml;
      try {
        localStorage.removeItem(storageKey);
      } catch (_e) {}
    });
  }

  box.querySelectorAll(".btn-copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var encoded = btn.getAttribute("data-copy");
      var text = encoded ? decodeURIComponent(encoded) : editor.innerText;
      var label = btn.getAttribute("data-copy-label") || "Copy template";
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () {
          btn.textContent = label;
        }, 1500);
      });
    });
  });
})();
