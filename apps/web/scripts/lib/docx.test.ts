import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without types
import { markdownToDocx } from "./docx.mjs";

/** Reads every entry of a zip from its central directory. */
function unzip(buf: Buffer): Record<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i += 1) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    p += 46 + nameLen;
  }
  return out;
}

const MD = `# Payment Request

**Requested by:** [Name] · **Date:** [Date]
**Payable to:** A & B "Co"

## Details
| Item | Amount |
|------|--------|
| Parts | $3,420.00 |

- [x] Invoice attached
- [ ] Quote attached
1. First
- Bullet

---
*Small print.*`;

describe("markdownToDocx", () => {
  const files = unzip(markdownToDocx(MD, { title: "Payment Request", highlightPlaceholders: true }));
  const doc = files["word/document.xml"];

  it("writes a complete Word package", () => {
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/footer1.xml", "word/_rels/document.xml.rels", "docProps/core.xml"]) {
      expect(files[part], part).toBeTruthy();
    }
    expect(files["docProps/core.xml"]).toContain("<dc:title>Payment Request</dc:title>");
    expect(files["word/footer1.xml"]).toContain("docstoc.io");
  });

  it("maps headings, tables, lists, checkboxes and rules", () => {
    expect(doc).toContain('<w:pStyle w:val="Title"/>');
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain("<w:tbl>");
    expect(doc).toContain("$3,420.00");
    expect(doc).toContain("☒\t");
    expect(doc).toContain("☐\t");
    expect(doc).toContain("1.\t");
    expect(doc).toContain("•\t");
    expect(doc).toContain("<w:pBdr>");
    expect(doc).toContain("<w:br/>");
  });

  it("escapes XML, keeps bold and italics, highlights placeholders", () => {
    expect(doc).toContain("A &amp; B &quot;Co&quot;");
    expect(doc).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">Requested by:<\/w:t>/);
    expect(doc).toMatch(/<w:i\/><\/w:rPr><w:t xml:space="preserve">Small print\.<\/w:t>/);
    expect(doc).toMatch(/<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">\[Name\]<\/w:t>/);
    expect(doc).not.toContain("**");
  });

  it("is reproducible byte for byte", () => {
    expect(markdownToDocx(MD, { title: "X" }).equals(markdownToDocx(MD, { title: "X" }))).toBe(true);
  });
});
