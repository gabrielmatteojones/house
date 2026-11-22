/* Jones House · esportazione in Word (.docx)
   Converte l'HTML dell'editor in un vero file Word, con carta intestata su ogni pagina. */
const DocxExport = (() => {
  const NAVY = "101C4D", RED = "D3121B", MUTED = "5D668A", LINE = "C9CDE0";
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN_X = 1304;          // A4, in twip
  const CONTENT_W = PAGE_W - 2 * MARGIN_X;                        // 9298
  // Carta «Gabriel Jones»: come il modello Word, testo a 60 mm dal bordo sinistro e logo nella colonna a sinistra
  const G_MARGIN = { top: 2551, bottom: 1700, left: 3401, right: 850, header: 680, footer: 500 };
  const G_CONTENT_W = PAGE_W - G_MARGIN.left - G_MARGIN.right;    // 7655
  const G_BLUE = "3D6E99";
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
  function convert(d, html, parse, contentW = CONTENT_W) {
    const { Paragraph, TextRun, ExternalHyperlink, AlignmentType, HeadingLevel, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType, ImageRun, PageBreak } = d;
    const doc = parse(html || "");
    const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "LI", "TABLE", "HR", "PRE"]);
    const hasBlock = n => [...n.children].some(c => BLOCK.has(c.tagName));
    let olInstance = 0;

    /* Colori e misure CSS -> Word */
    const hex = c => {
      c = String(c || "").trim().toLowerCase();
      let m = c.match(/^#([0-9a-f]{6})$/); if (m) return m[1].toUpperCase();
      m = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/); if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
      m = c.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)$/);
      if (m) return (m[4] !== undefined && +m[4] === 0) ? "" : [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, "0")).join("").toUpperCase();
      return "";
    };
    const ptOf = v => { const m = String(v).match(/^([\d.]+)(pt|px)$/); return m ? (m[2] === "pt" ? +m[1] : +m[1] * 0.75) : 0; };
    const maxPx = contentW / 15;                                   // larghezza utile in pixel (1 px = 15 twip)
    const imageRun = n => {
      const m = String(n.getAttribute("src") || "").match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
      if (!m || typeof atob === "undefined") return null;
      try {
        const bin = atob(m[2]), data = Uint8Array.from(bin, ch => ch.charCodeAt(0));
        let w = +n.getAttribute("data-w") || +n.getAttribute("width") || 320, h = +n.getAttribute("data-h") || +n.getAttribute("height") || 0;
        if (!h) h = Math.round(w * 0.66);
        const k = Math.min(1, maxPx / w);
        return new ImageRun({ type: m[1].toLowerCase().replace("jpeg", "jpg"), data, transformation: { width: Math.round(w * k), height: Math.round(h * k) }, altText: { title: "Immagine", description: "Immagine", name: "img" } });
      } catch { return null; }
    };
    const isBreak = n => !!(n.classList && n.classList.contains("pb")) || /always|page/.test((n.style && (n.style.pageBreakAfter || n.style.breakAfter)) || "");

    const alignOf = n => {
      const a = ((n.style && n.style.textAlign) || (n.getAttribute && n.getAttribute("align")) || "").toLowerCase();
      return a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : undefined;
    };

    const runs = (node, f = {}) => {
      const out = [];
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/[\r\n\t ]+/g, " ");
          if (t) out.push(new TextRun({ text: t, bold: f.b || undefined, italics: f.i || undefined, underline: f.u ? {} : undefined, strike: f.s || undefined, color: f.color, font: f.font, size: f.size, shading: f.bg ? { type: ShadingType.CLEAR, fill: f.bg, color: "auto" } : undefined, subScript: f.sub || undefined, superScript: f.sup || undefined }));
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
        if (tag === "FONT") { if (n.getAttribute("color")) g.color = hex(n.getAttribute("color")) || g.color; if (n.getAttribute("face")) g.font = n.getAttribute("face").split(",")[0].replace(/["']/g, "").trim(); }
        if (st.color) g.color = hex(st.color) || g.color;
        if (st.backgroundColor) g.bg = hex(st.backgroundColor) || g.bg;
        if (st.fontFamily) g.font = st.fontFamily.split(",")[0].replace(/["']/g, "").trim() || g.font;
        if (st.fontSize) { const pt = ptOf(st.fontSize); if (pt) g.size = Math.round(pt * 2); }
        if (tag === "IMG") { const im = imageRun(n); if (im) out.push(im); return; }
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
      const w = Math.floor(contentW / cols);
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
        if (w.textContent.trim() || w.querySelector("br,img")) out.push(para(runs(w, ctx.f), ctx));
      };
      container.childNodes.forEach(n => {
        if (n.nodeType === 3) { buf.push(n); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (!BLOCK.has(tag)) { buf.push(n); return; }
        flush();
        if (isBreak(n)) { out.push(new Paragraph({ children: [new PageBreak()] })); return; }
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

  /* Modello «Gabriel Jones»: logo fluttuante a sinistra, nome e recapiti in alto, piè di pagina con destinatario e oggetto */
  function buildHeaderG(d, s, png) {
    const { Header, Paragraph, TextRun, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } = d;
    const kids = [];
    if (png) kids.push(new Paragraph({
      spacing: { after: 0 },
      children: [new ImageRun({
        type: "png", data: png, transformation: { width: 159, height: 159 },       // 42 mm
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 216000 },   // 6 mm
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 288000 },       // 8 mm
          wrap: { type: TextWrappingType.NONE }, behindDocument: true
        },
        altText: { title: s.nome, description: "Logo", name: "logo" }
      })]
    }));
    kids.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: s.nome.toUpperCase(), bold: true, font: "Arial", size: 22 })] }));
    Letterhead.contactLines(s).forEach(l => kids.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l.t, font: "Arial", size: 19 })] })));
    return new Header({ children: kids });
  }

  function buildFooterG(d, s) {
    const { Footer, Paragraph, TextRun } = d;
    return new Footer({ children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: Letterhead.footText(s), italics: true, font: "Arial", size: 16, color: "555555" })] })] });
  }

  /* Le immagini dell'editor diventano PNG con la misura reale, così Word le dimensiona bene (webp, svg, ecc. compresi) */
  async function prepImages(html, parse) {
    if (typeof Image === "undefined" || typeof document === "undefined" || !/<img/i.test(html || "")) return html;
    const doc = parse(html);
    await Promise.all([...doc.querySelectorAll("img")].map(async im => {
      const src = im.getAttribute("src") || "";
      if (!/^data:image\//i.test(src)) { im.remove(); return; }
      try {
        const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const k = Math.min(1, 1600 / Math.max(el.naturalWidth, el.naturalHeight));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(el.naturalWidth * k)); cv.height = Math.max(1, Math.round(el.naturalHeight * k));
        cv.getContext("2d").drawImage(el, 0, 0, cv.width, cv.height);
        const w = parseFloat(im.style.width) || +im.getAttribute("width") || el.naturalWidth;
        im.setAttribute("src", cv.toDataURL("image/png"));
        im.setAttribute("data-w", Math.round(w));
        im.setAttribute("data-h", Math.round(w * el.naturalHeight / el.naturalWidth));
      } catch { im.remove(); }
    }));
    return doc.body.innerHTML;
  }

  /* ---------- Documento completo ---------- */
  const heading = (id, name, size, before, level, gab) => ({
    id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
    run: { font: gab ? "Arial" : HEAD_FONT, size, bold: true, color: gab ? G_BLUE : NAVY },
    paragraph: { spacing: { before, after: 100 }, keepNext: true, outlineLevel: level }
  });

  async function make({ titolo, html, carta, png: pngOverride }, parse) {
    const d = await ensure();
    parse = parse || (h => new DOMParser().parseFromString(h, "text/html"));
    const { Document, Packer, LevelFormat, AlignmentType } = d;
    const gab = !!(carta && carta.modello === "gabriel");
    html = await prepImages(html, parse);
    const body = convert(d, html, parse, gab ? G_CONTENT_W : CONTENT_W);
    if (!body.length) body.push(new d.Paragraph(""));

    const bulletLevels = [0, 1, 2, 3, 4, 5].map(i => ({ level: i, format: LevelFormat.BULLET, text: ["•", "–", "•", "–", "•", "–"][i], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540 + i * 360, hanging: 270 } } } }));
    const numLevels = [0, 1, 2, 3, 4, 5].map(i => ({ level: i, format: i % 2 ? LevelFormat.LOWER_LETTER : LevelFormat.DECIMAL, text: `%${i + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540 + i * 360, hanging: 360 } } } }));

    const section = {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: gab ? G_MARGIN : { top: carta ? 2300 : 1440, bottom: carta ? 1700 : 1440, left: MARGIN_X, right: MARGIN_X, header: 560, footer: 500 } } },
      children: body
    };
    if (gab) {
      // filetto verticale a sinistra del testo, come nel modello
      section.properties.page.borders = {
        pageBorders: { display: d.PageBorderDisplay.ALL_PAGES, offsetFrom: d.PageBorderOffsetFrom.TEXT },
        pageBorderLeft: { style: d.BorderStyle.SINGLE, size: 4, color: G_BLUE, space: 10 }
      };
      let png = pngOverride;
      if (!png) { try { png = await Letterhead.logoBytes(); } catch { png = null; } }
      section.headers = { default: buildHeaderG(d, carta, png) };
      section.footers = { default: buildFooterG(d, carta) };
    } else if (carta) {
      const png = pngOverride || await markPng(carta.nome);
      section.headers = { default: buildHeader(d, carta, png) };
      section.footers = { default: buildFooter(d, carta) };
    }

    const document_ = new Document({
      creator: (carta && (carta.mittente || carta.nome)) || "Jones House",
      title: titolo || "Documento",
      styles: {
        default: { document: { run: { font: gab ? "Arial" : BODY_FONT, size: 22 } } },
        paragraphStyles: [heading("Heading1", "Heading 1", gab ? 32 : 40, 320, 0, gab), heading("Heading2", "Heading 2", gab ? 26 : 30, 260, 1, gab)]
      },
      numbering: { config: [{ reference: "bul", levels: bulletLevels }, { reference: "num", levels: numLevels }] },
      sections: [section]
    });
    return Packer.toBlob ? Packer.toBlob(document_) : new Blob([await Packer.toBuffer(document_)]);
  }

  return { make, convert, ensure };
})();
