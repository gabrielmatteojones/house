/* Jones House · esportazione in Word (.docx)
   Converte l'HTML dell'editor in un vero file Word, con carta intestata su ogni pagina. */
const DocxExport = (() => {
  const NAVY = "101C4D", RED = "D3121B", MUTED = "5D668A", LINE = "C9CDE0";
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN_X = 1304;          // A4, in twip
  const CONTENT_W = PAGE_W - 2 * MARGIN_X;                        // 9298
  const HEAD_FONT = "Arial Narrow", BODY_FONT = "Georgia";

  const ensure = async () => {
    if (!globalThis.docx && typeof Portal !== "undefined") await Portal.script("/assets/vendor/docx.iife.js");
    if (!globalThis.docx) throw new Error("Libreria Word non disponibile");
    return globalThis.docx;
  };

  /* Il marchio (quadrato blu con sigla e barra rossa), disegnato su canvas */
  const markPng = async nome => {
    try {
      if (typeof document === "undefined") return null;
      const c = document.createElement("canvas");
      const ctx = c.getContext && c.getContext("2d");
      if (!ctx) return null;
      c.width = c.height = 220;
      if (document.fonts && document.fonts.load) { try { await document.fonts.load('800 100px "Barlow Condensed"'); } catch { /* font di riserva */ } }
      const r = 28;
      ctx.fillStyle = "#101c4d";
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.arcTo(220, 0, 220, 220, r); ctx.arcTo(220, 220, 0, 220, r); ctx.arcTo(0, 220, 0, 0, r); ctx.arcTo(0, 0, 220, 0, r);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d3121b";
      ctx.fillRect(40, 160, 140, 20);
      ctx.fillStyle = "#fdf5ee";
      ctx.font = '800 122px "Barlow Condensed","Arial Narrow",Arial,sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(Letterhead.initials(nome), 110, 134);
      const blob = await new Promise(res => c.toBlob(res, "image/png"));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } catch { return null; }
  };

  /* ---------- HTML dell'editor -> elementi Word ---------- */
  function convert(d, html, parse) {
    const { Paragraph, TextRun, ExternalHyperlink, AlignmentType, HeadingLevel, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } = d;
    const doc = parse(html || "");
    const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "LI", "TABLE", "HR", "PRE"]);
    const hasBlock = n => [...n.children].some(c => BLOCK.has(c.tagName));
    let olInstance = 0;

    const alignOf = n => {
      const a = ((n.style && n.style.textAlign) || (n.getAttribute && n.getAttribute("align")) || "").toLowerCase();
      return a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : undefined;
    };

    const runs = (node, f = {}) => {
      const out = [];
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/[\r\n\t ]+/g, " ");
          if (t) out.push(new TextRun({ text: t, bold: f.b || undefined, italics: f.i || undefined, underline: f.u ? {} : undefined, strike: f.s || undefined, color: f.color, font: f.font, subScript: f.sub || undefined, superScript: f.sup || undefined }));
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.tagName, g = { ...f }, st = n.style || {};
        if (tag === "BR") { out.push(new TextRun({ break: 1 })); return; }
        if (tag === "B" || tag === "STRONG" || st.fontWeight === "bold" || +st.fontWeight >= 600) g.b = true;
        if (tag === "I" || tag === "EM" || st.fontStyle === "italic") g.i = true;
        if (tag === "U" || /underline/.test(st.textDecoration || "")) g.u = true;
        if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(st.textDecoration || "")) g.s = true;
        if (tag === "SUB") g.sub = true;
        if (tag === "SUP") g.sup = true;
        if (tag === "CODE") g.font = "Courier New";
        if (tag === "A") {
          const href = n.getAttribute("href") || "";
          const inner = runs(n, { ...g, u: true, color: "0563C1" });
          if (/^(https?:|mailto:)/i.test(href) && inner.length) { out.push(new ExternalHyperlink({ link: href, children: inner })); return; }
          out.push(...inner);
          return;
        }
        out.push(...runs(n, g));
      });
      return out;
    };

    const para = (children, ctx = {}, extra = {}) => new Paragraph({
      children,
      alignment: ctx.align,
      spacing: { after: 140, line: 320 },
      ...(ctx.quote ? { indent: { left: 480 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 12 } } } : {}),
      ...extra
    });

    const onlyBreak = n => n.childNodes.length === 1 && n.firstChild.nodeName === "BR";
    const wrapOf = nodes => { const w = doc.createElement("div"); nodes.forEach(c => w.append(c.cloneNode(true))); return w; };

    const list = (n, ctx, level) => {
      const out = [], ordered = n.tagName === "OL", instance = ordered ? ++olInstance : 0;
      [...n.children].forEach(li => {
        if (li.tagName !== "LI") return;
        const inline = [], nested = [];
        li.childNodes.forEach(c => (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL") ? nested : inline).push(c));
        out.push(new Paragraph({
          children: runs(wrapOf(inline), ctx.f),
          alignment: alignOf(li),
          numbering: { reference: ordered ? "num" : "bul", level: Math.min(level, 5), instance },
          spacing: { after: 60, line: 320 }
        }));
        nested.forEach(l => out.push(...list(l, ctx, level + 1)));
      });
      return out;
    };

    const table = t => {
      const rows = [...t.rows];
      if (!rows.length) return [];
      const cols = Math.max(1, ...rows.map(r => r.cells.length));
      const w = Math.floor(CONTENT_W / cols);
      const b = { style: BorderStyle.SINGLE, size: 4, color: LINE };
      const borders = { top: b, bottom: b, left: b, right: b };
      return [new Table({
        width: { size: w * cols, type: WidthType.DXA },
        columnWidths: Array(cols).fill(w),
        rows: rows.map(r => {
          const cells = [...r.cells];
          while (cells.length < cols) cells.push(null);
          return new TableRow({
            children: cells.map(c => {
              const kids = c ? blocks(c, {}) : [];
              return new TableCell({
                width: { size: w, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                borders,
                shading: c && c.tagName === "TH" ? { type: ShadingType.CLEAR, fill: "EEF0F7", color: "auto" } : undefined,
                children: kids.length ? kids : [new Paragraph("")]
              });
            })
          });
        })
      }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    };

    function blocks(container, ctx = {}) {
      const out = [];
      let buf = [];
      const flush = () => {
        if (!buf.length) return;
        const w = wrapOf(buf);
        buf = [];
        if (w.textContent.trim() || w.querySelector("br")) out.push(para(runs(w, ctx.f), ctx));
      };
      container.childNodes.forEach(n => {
        if (n.nodeType === 3) { buf.push(n); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (!BLOCK.has(tag)) { buf.push(n); return; }
        flush();
        const c = { ...ctx, align: alignOf(n) || ctx.align };
        if (/^H[1-6]$/.test(tag)) {
          const lvl = tag === "H1" || tag === "H2" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
          out.push(new Paragraph({ heading: lvl, alignment: c.align, children: runs(n, c.f) }));
        } else if (tag === "UL" || tag === "OL") out.push(...list(n, c, 0));
        else if (tag === "BLOCKQUOTE") out.push(...blocks(n, { ...c, quote: true, f: { ...(c.f || {}), i: true, color: MUTED } }));
        else if (tag === "TABLE") out.push(...table(n));
        else if (tag === "HR") out.push(new Paragraph({ spacing: { before: 120, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } }, children: [] }));
        else if (tag === "PRE") out.push(para(n.textContent.split("\n").map((l, i) => new TextRun({ text: l, font: "Courier New", size: 20, break: i ? 1 : undefined })), c));
        else if (hasBlock(n)) out.push(...blocks(n, c));
        else out.push(onlyBreak(n) ? para([], c) : para(runs(n, c.f), c));
      });
      flush();
      return out;
    }

    return blocks(doc.body || doc);
  }

  /* ---------- Intestazione e piè di pagina ---------- */
  function buildHeader(d, s, png) {
    const { Header, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign } = d;
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const cellBorders = { top: none, bottom: none, left: none, right: none };
    const lines = Letterhead.contactLines(s);
    const wMark = 900, wName = 5000, wContact = CONTENT_W - wMark - wName;
    const cell = (w, children, align) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 60, left: 0, right: 0 }, children });

    const markCell = cell(wMark, [new Paragraph({
      children: png ? [new ImageRun({ type: "png", data: png, transformation: { width: 46, height: 46 }, altText: { title: s.nome, description: "Logo", name: "logo" } })] : []
    })]);
    const nameKids = [new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: s.nome.toUpperCase(), bold: true, font: HEAD_FONT, size: 60, color: NAVY, characterSpacing: 10 })] })];
    if (s.sottotitolo) nameKids.push(new Paragraph({ spacing: { before: 40, after: 0 }, children: [new TextRun({ text: s.sottotitolo.toUpperCase(), bold: true, font: HEAD_FONT, size: 17, color: RED, characterSpacing: 40 })] }));
    const contactKids = lines.length
      ? lines.map(l => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 252 }, children: [new TextRun({ text: l.t, bold: l.b || undefined, size: l.b ? 19 : 17, color: l.b ? NAVY : MUTED })] }))
      : [new Paragraph("")];

    return new Header({
      children: [
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [wMark, wName, wContact],
          borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
          rows: [new TableRow({ children: [markCell, cell(wName, nameKids), cell(wContact, contactKids)] })]
        }),
        new Paragraph({ spacing: { before: 0, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: NAVY, space: 1 } }, children: [new TextRun({ text: "", size: 4 })] })
      ]
    });
  }

  function buildFooter(d, s) {
    const { Footer, Paragraph, TextRun, BorderStyle, AlignmentType, PageNumber } = d;
    const text = Letterhead.footText(s);
    return new Footer({
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 }, border: { top: { style: BorderStyle.SINGLE, size: 14, color: NAVY, space: 6 } }, children: [new TextRun({ text, size: 16, color: MUTED })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ children: ["Pagina ", PageNumber.CURRENT, " di ", PageNumber.TOTAL_PAGES], size: 15, color: MUTED })] })
      ]
    });
  }

  /* ---------- Documento completo ---------- */
  const heading = (id, name, size, before, level) => ({
    id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
    run: { font: HEAD_FONT, size, bold: true, color: NAVY },
    paragraph: { spacing: { before, after: 100 }, keepNext: true, outlineLevel: level }
  });

  async function make({ titolo, html, carta, png: pngOverride }, parse) {
    const d = await ensure();
    parse = parse || (h => new DOMParser().parseFromString(h, "text/html"));
    const { Document, Packer, LevelFormat, AlignmentType } = d;
    const body = convert(d, html, parse);
    if (!body.length) body.push(new d.Paragraph(""));

    const bulletLevels = [0, 1, 2, 3, 4, 5].map(i => ({ level: i, format: LevelFormat.BULLET, text: ["•", "–", "•", "–", "•", "–"][i], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540 + i * 360, hanging: 270 } } } }));
    const numLevels = [0, 1, 2, 3, 4, 5].map(i => ({ level: i, format: i % 2 ? LevelFormat.LOWER_LETTER : LevelFormat.DECIMAL, text: `%${i + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540 + i * 360, hanging: 360 } } } }));

    const section = {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: carta ? 2300 : 1440, bottom: carta ? 1700 : 1440, left: MARGIN_X, right: MARGIN_X, header: 560, footer: 500 } } },
      children: body
    };
    if (carta) {
      const png = pngOverride || await markPng(carta.nome);
      section.headers = { default: buildHeader(d, carta, png) };
      section.footers = { default: buildFooter(d, carta) };
    }

    const document_ = new Document({
      creator: (carta && carta.mittente) || "Jones House",
      title: titolo || "Documento",
      styles: {
        default: { document: { run: { font: BODY_FONT, size: 22 } } },
        paragraphStyles: [heading("Heading1", "Heading 1", 40, 320, 0), heading("Heading2", "Heading 2", 30, 260, 1)]
      },
      numbering: { config: [{ reference: "bul", levels: bulletLevels }, { reference: "num", levels: numLevels }] },
      sections: [section]
    });
    return Packer.toBlob ? Packer.toBlob(document_) : new Blob([await Packer.toBuffer(document_)]);
  }

  return { make, convert, ensure };
})();
