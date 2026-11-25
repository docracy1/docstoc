/**
 * Word (.docx) export for /document-templates/* at build time (owner decision 25.11.2026: "word/docx" is the third
 * most searched modifier on the template pages). Writes minimal OOXML from the same Markdown the page and the PDF
 * use, zipped with node:zlib, so the build needs no new dependency. Output is byte-for-byte reproducible (fixed zip
 * timestamps, fixed document dates), so a rebuild does not churn the committed files.
 *
 * Markdown subset, as in generate-free-templates.mjs: # / ## / ### headings, paragraphs (one line = one line break),
 * "- " bullets, "- [ ]" / "- [x]" checkboxes, "1. " numbered lines, | tables |, --- rules, **bold**, *italic*,
 * [text](url) links as text. [Placeholders] are highlighted in the template so they are easy to find in Word.
 */
import { deflateRawSync } from "node:zlib";

/* ---------------- zip (store + deflate, no data descriptors) ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1 January 2026, 00:00 in MS-DOS format: fixed so the same input always gives the same bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** @param {{name: string, data: string}[]} files */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.from(f.data, "utf8");
    const packed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ---------------- Markdown → WordprocessingML ---------------- */

function xmlEscape(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function run(text, { bold = false, italic = false, highlight = false } = {}) {
  if (!text) return "";
  const props = [bold ? "<w:b/>" : "", italic ? "<w:i/>" : "", highlight ? '<w:highlight w:val="yellow"/>' : ""].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

/** Inline Markdown to runs: **bold**, *italic*, [text](url) as text, [placeholders] highlighted. */
export function inlineRuns(text, { highlightPlaceholders = false, bold = false, italic = false } = {}) {
  const out = [];
  const re = /\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)\*(?![*\w])|\[([^\]]+)\]\(([^)]+)\)|(\[[^\]]+\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(run(text.slice(last, m.index), { bold, italic }));
    if (m[1] !== undefined) out.push(inlineRuns(m[1], { highlightPlaceholders, bold: true, italic }));
    else if (m[2] !== undefined) out.push(inlineRuns(m[2], { highlightPlaceholders, bold, italic: true }));
    else if (m[3] !== undefined) out.push(run(m[3], { bold, italic }));
    else out.push(run(m[5], { bold, italic, highlight: highlightPlaceholders }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(run(text.slice(last), { bold, italic }));
  return out.join("");
}

const BREAK = "<w:r><w:br/></w:r>";

function para(runs, { style = "", indent = 0, hanging = 0, keepNext = false, border = false } = {}) {
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    keepNext ? "<w:keepNext/>" : "",
    border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>' : "",
    indent ? `<w:ind w:left="${indent}" w:hanging="${hanging}"/>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
}

const TEXT_WIDTH = 9360; // Letter, 1-inch margins, in twentieths of a point

function table(rows, opts) {
  const cols = Math.max(...rows.map((r) => r.length));
  const w = Math.floor(TEXT_WIDTH / cols);
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join("");
  const body = rows
    .map((cells, ri) => {
      const header = ri === 0;
      const tcs = Array.from({ length: cols }, (_, ci) => {
        const shade = header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F4F8"/>' : "";
        const runs = inlineRuns(cells[ci] ?? "", { ...opts, bold: header });
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr>${para(runs, { style: "TableText" })}</w:tc>`;
      }).join("");
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${tcs}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>${para("", { style: "Spacer" })}`;
}

/** Body XML (the children of <w:body>) for one Markdown document. */
export function markdownToBodyXml(md, opts = {}) {
  const out = [];
  let paragraph = [];
  let rows = [];
  const flushParagraph = () => {
    if (paragraph.length) out.push(para(paragraph.map((l) => inlineRuns(l, opts)).join(BREAK)));
    paragraph = [];
  };
  const flushTable = () => {
    if (rows.length) out.push(table(rows, opts));
    rows = [];
  };
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (!t) {
      flushParagraph();
      flushTable();
      continue;
    }
    if (t.startsWith("|")) {
      flushParagraph();
      const cells = t
        .split("|")
        .map((c) => c.trim())
        .filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
      if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
      continue;
    }
    flushTable();
    let m;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flushParagraph();
      const style = ["Title", "Heading1", "Heading2"][m[1].length - 1];
      out.push(para(inlineRuns(m[2], opts), { style, keepNext: true }));
    } else if (t === "---") {
      flushParagraph();
      out.push(para("", { border: true }));
    } else if ((m = t.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
      flushParagraph();
      const box = m[1] === " " ? "☐" : "☒";
      out.push(para(run(`${box}\t`) + inlineRuns(m[2], opts), { indent: 360, hanging: 360 }));
    } else if ((m = t.match(/^[-*]\s+(.*)$/))) {
      flushParagraph();
      out.push(para(run("•\t") + inlineRuns(m[1], opts), { indent: 360, hanging: 360 }));
    } else if ((m = t.match(/^(\d+)\.\s+(.*)$/))) {
      flushParagraph();
      out.push(para(run(`${m[1]}.\t`) + inlineRuns(m[2], opts), { indent: 360, hanging: 360 }));
    } else {
      paragraph.push(t);
    }
  }
  flushParagraph();
  flushTable();
  return out.join("\n");
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1B3155"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1B3155"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1B3155"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="12"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="6B7A90"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D5DBE6"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * A complete .docx for one Markdown document.
 * @param {string} markdown
 * @param {{title: string, footer?: string, highlightPlaceholders?: boolean}} meta
 * @returns {Buffer}
 */
export function markdownToDocx(markdown, { title, footer = "docstoc.io", highlightPlaceholders = false }) {
  const body = markdownToBodyXml(markdown, { highlightPlaceholders });
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
${body}
<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}>${para(run(footer), { style: "Footer" })}</w:ftr>`;
  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>docstoc.io</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>docstoc.io</Application></Properties>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: STYLES },
    { name: "word/footer1.xml", data: footerXml },
  ]);
}
