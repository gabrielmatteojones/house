/* Presenze in rete · «Scarica resoconto»
   Caricato solo quando serve (al clic su «Scarica resoconto»), così la pagina si apre più in fretta.
   Genera un PDF (scritto qui, senza librerie esterne) con la carta intestata del portale:
   presentazione, indice, presenze, assenze, ritardi, riepilogo, sintesi mensile, calendari
   e una pagina di dettaglio per ogni settimana. */
(() => {
  const LS_CACHE = "gj-presenze:cache", LS_CODA = "gj-presenze:coda", LS_RES = "gj-presenze:resoconto";
  const TEMPLATE = "/assets/js/CartaIntestata.docx";
  const W = 7655;                               // larghezza utile del testo sulla carta intestata (twip)
  const BLUE = "3D6E99", PALE = "EEF3F8", LINE = "C5D0DD", TOT = "DCE6F0";

  const pad = n => String(n).padStart(2, "0");
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const xml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toMin = hm => { const [h, m] = String(hm).split(":").map(Number); return h * 60 + (m || 0); };
  const hmOf = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Orari e formati (sempre in ora di Roma, come fa il server) ---------- */
  const fmtRome = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  const romeMin = iso => { const p = Object.fromEntries(fmtRome.formatToParts(new Date(iso)).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
  const minuti = r => Math.max(0, Math.round((Date.parse(r.uscita) - Date.parse(r.entrata)) / 60000));
  const dow = iso => new Date(iso + "T12:00:00Z").getUTCDay();   // 0 = domenica, 5 = venerdì
  const dIt = (iso, o) => new Date(iso + "T12:00:00Z").toLocaleDateString("it-IT", { timeZone: "UTC", ...o });
  const dLunga = iso => dIt(iso, { day: "numeric", month: "long", year: "numeric" });
  const dBreve = iso => cap(dIt(iso, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }));
  const ore = m => `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
  const dec = m => (m / 60).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (a, b) => b ? (100 * a / b).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %" : "—";
  const giorni = n => `${n} ${n === 1 ? "giorno" : "giorni"}`;

  /* ---------- Calcolo ---------- */
  function compute(recs, cfg) {
    const E = toMin(cfg.entrata), U1 = toMin(cfg.uscita), U5 = toMin(cfg.uscitaVen);
    const perGiorno = new Map();
    let aperti = 0;
    recs.forEach(r => {
      if (!r.uscita) { aperti++; return; }
      if (!perGiorno.has(r.data)) perGiorno.set(r.data, []);
      perGiorno.get(r.data).push(r);
    });
    const pres = [], assenze = [], ritardi = [];
    const giorniPres = new Set();
    [...perGiorno.keys()].sort().forEach(giorno => {
      const turni = perGiorno.get(giorno).sort((a, b) => a.entrata.localeCompare(b.entrata));
      const assente = r => /assenz/i.test(r.note || "") || minuti(r) === 0;
      const veri = turni.filter(r => !assente(r));
      if (!veri.length) {
        const previste = Math.max(0, (dow(giorno) === 5 ? U5 : U1) - E);
        assenze.push({ data: giorno, min: previste, note: [...new Set(turni.map(r => r.note).filter(Boolean))].join("; ") });
        return;
      }
      giorniPres.add(giorno);
      veri.forEach(r => pres.push({ data: giorno, luogo: r.luogo, entrata: romeMin(r.entrata), uscita: romeMin(r.uscita), min: minuti(r), note: r.note || "" }));
      const prima = romeMin(veri[0].entrata);
      if (prima > E) ritardi.push({ data: giorno, prevista: E, effettiva: prima, min: prima - E });
    });
    const sum = (l, k = "min") => l.reduce((s, x) => s + x[k], 0);
    const t = { presMin: sum(pres), presGiorni: giorniPres.size, ritMin: sum(ritardi), ritGiorni: ritardi.length, assMin: sum(assenze), assGiorni: assenze.length, aperti };
    t.previste = t.presMin + t.ritMin + t.assMin;
    return { pres, assenze, ritardi, t, E, U1, U5 };
  }

  /* ---------- Scrittore PDF (senza librerie) ---------- */
  const PW = 595.28, PH = 841.89, X0 = 176, XW = 377, XR = X0 + XW, Y0 = 132, YB = 762;
  const GRY = "555555", AMB = "E3A33A", RED = "C0504D", OKF = "E3EEF8", LATE = "FBEFD5", ABSF = "F8DADA", WKND = "F1F1F1";
  const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const WX = { "«": 556, "»": 556, "·": 278, "’": 222, "‘": 222, "“": 333, "”": 333, "–": 556, "—": 1000, "…": 1000, "‹": 333, "›": 333, "°": 400 };
  const WIN = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "‹": 0x8B, "›": 0x9B };
  const wch = (ch, b) => {
    const k = ch.charCodeAt(0), t = b ? WB : WR;
    if (k >= 32 && k <= 126) return t[k - 32];
    if (WX[ch]) return WX[ch];
    const k2 = ch.normalize("NFD").charCodeAt(0);
    return k2 >= 32 && k2 <= 126 ? t[k2 - 32] : 556;
  };
  const tw = (s, sz, b) => { let w = 0; for (const ch of String(s)) w += wch(ch, b); return w * sz / 1000; };
  const hex = s => { let o = ""; for (const ch of String(s)) { const k = ch.charCodeAt(0), v = WIN[ch] ?? (k < 256 ? k : 63); o += v.toString(16).padStart(2, "0"); } return o; };
  const rgbOf = h => { const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (v / 255).toFixed(3)).join(" "); };
  const n2 = v => (+v).toFixed(2);
  const fit = (s, w, sz, b) => { s = String(s); if (tw(s, sz, b) <= w) return s; while (s.length > 1 && tw(s + "…", sz, b) > w) s = s.slice(0, -1); return s + "…"; };
  const brev = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
  const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const deflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());

  function Layout(cfg, hasLogo) {
    const pages = [];
    let ops = null, y = Y0;
    const font = o => o.b ? "F2" : o.i ? "F3" : "F1";

    function text(s, x, yy, o = {}) {
      const sz = o.sz || 10, w = tw(s, sz, o.b);
      if (o.al === "r") x -= w; else if (o.al === "c") x -= w / 2;
      ops.push(`BT /${font(o)} ${n2(sz)} Tf ${rgbOf(o.color || "000000")} rg ${n2(x)} ${n2(PH - yy)} Td <${hex(s)}> Tj ET`);
    }
    const rect = (x, yy, w, h, fill, stroke) => {
      if (fill) ops.push(`${rgbOf(fill)} rg ${n2(x)} ${n2(PH - yy - h)} ${n2(w)} ${n2(h)} re f`);
      if (stroke) ops.push(`${rgbOf(stroke)} RG 0.5 w ${n2(x)} ${n2(PH - yy - h)} ${n2(w)} ${n2(h)} re S`);
    };
    const line = (x1, y1, x2, y2, color, w) => ops.push(`${rgbOf(color || LINE)} RG ${w || 0.6} w ${n2(x1)} ${n2(PH - y1)} m ${n2(x2)} ${n2(PH - y2)} l S`);

    function head() {
      if (hasLogo) ops.push(`q 118 0 0 118 24 ${n2(PH - 30 - 118)} cm /Im1 Do Q`);
      text("GABRIEL JONES", X0, 52, { b: true, sz: 11 });
      ["Fontanafredda (PN)", "Tel. 0434 733808", "Email: -@joneshouse.it"].forEach((s, i) => text(s, X0 + 3, 66 + i * 12, { sz: 9.5 }));
      line(166, Y0 - 8, 166, 782, BLUE, 0.8);
    }
    function page() { ops = []; pages.push(ops); y = Y0; head(); return pages.length; }
    const need = h => { if (y + h > YB) page(); };

    /* testo a capo con parti in grassetto: segs = stringa oppure [[testo, {b, color}], ...] */
    function wrap(segs, w, o) {
      const sz = o.sz || 10, words = [];
      (Array.isArray(segs) ? segs : [segs]).forEach(p => {
        const [t, so] = typeof p === "string" ? [p, {}] : p;
        String(t).split(/( +)/).forEach(tok => { if (tok) words.push({ t: tok, b: so.b ?? o.b, color: so.color || o.color, i: o.i }); });
      });
      const lines = [];
      let cur = [], cw = 0;
      words.forEach(wd => {
        const ww = tw(wd.t, sz, wd.b), sp = /^ +$/.test(wd.t);
        if (!sp && cw + ww > w && cur.length) { lines.push(cur); cur = []; cw = 0; }
        if (sp && !cur.length) return;
        cur.push({ ...wd, w: ww }); cw += ww;
      });
      if (cur.length) lines.push(cur);
      return lines;
    }
    function P(segs, o = {}) {
      const x = o.x ?? X0, w = o.w ?? XW, sz = o.sz || 10, lh = o.lh || sz * 1.5;
      y += o.before || 0;
      const lines = wrap(segs, w, o);
      lines.forEach(ln => {
        need(lh);
        let cx = x;
        if (o.al === "c") cx = x + (w - ln.reduce((a, p) => a + p.w, 0)) / 2;
        ln.forEach(p => { text(p.t, cx, y + sz, { sz, b: p.b, i: p.i, color: p.color }); cx += p.w; });
        y += lh;
      });
      y += o.after ?? 6;
    }
    const sp = n => { y += n; };
    function H1(t) {
      need(60);
      text(t, X0, y + 15, { b: true, sz: 15, color: BLUE });
      y += 24; line(X0, y, XR, y, BLUE, 1); y += 14;
    }
    const H2 = t => { need(40); y += 6; text(t, X0, y + 10, { b: true, sz: 10.5, color: BLUE }); y += 20; };

    function table(cols, headRow, rows, o = {}) {
      const k = XW / cols.reduce((a, b) => a + b, 0);
      cols = cols.map(c => c * k);
      const rh = o.rh || 18, sz = o.sz || 8.5, al = o.al || [];
      const drawRow = (cells, kind, i) => {
        let x = X0, used = 0;
        const fill = kind === "head" ? BLUE : kind === "tot" ? TOT : i % 2 ? PALE : null;
        cells.forEach(c => {
          c = c !== null && typeof c === "object" ? c : { t: c };
          const span = c.span || 1, w = cols.slice(used, used + span).reduce((a, b) => a + b, 0), a = c.al || al[used] || "l";
          used += span;
          rect(x, y, w, rh, fill, LINE);
          const bold = kind !== "body" || c.b, s = fit(c.t, w - 10, sz, bold);
          const ty = y + rh / 2 + sz * 0.35, tc = kind === "head" ? "FFFFFF" : undefined;
          if (a === "r") text(s, x + w - 5, ty, { sz, b: bold, color: tc, al: "r" });
          else if (a === "c") text(s, x + w / 2, ty, { sz, b: bold, color: tc, al: "c" });
          else text(s, x + 5, ty, { sz, b: bold, color: tc });
          x += w;
        });
        y += rh;
      };
      need(rh * 3);
      drawRow(headRow, "head", 0);
      rows.forEach((r, i) => { if (y + rh > YB) { page(); drawRow(headRow, "head", 0); } drawRow(r, "body", i); });
      (o.totals || []).forEach(r => { if (y + rh > YB) { page(); drawRow(headRow, "head", 0); } drawRow(r, "tot", 0); });
      y += 10;
    }

    /* Grafico a barre impilate: effettuate / ritardo / assenza (minuti) */
    function bars(items, o = {}) {
      const h = o.h || 130, padL = 30, cw = XW - padL, top = y + 12;
      const max = Math.max(60, ...items.map(i => i.a + i.b + i.c));
      const step = [60, 120, 180, 240, 300, 600, 1200, 1800, 2400, 3000, 6000, 12000, 24000].find(v => v >= max / 5) || 24000, top2 = Math.ceil(max / step) * step;
      need(h + 50);
      const t0 = y + 12, base = t0 + h;
      for (let v = 0; v <= top2; v += step) {
        const yy = base - h * v / top2;
        line(X0 + padL, yy, XR, yy, "E3E8EE", 0.4);
        text(`${v / 60} h`, X0 + padL - 4, yy + 2.5, { sz: 7, color: GRY, al: "r" });
      }
      const slot = cw / items.length, bw = Math.min(34, slot * 0.55);
      items.forEach((it, i) => {
        const cx = X0 + padL + slot * i + slot / 2;
        let yy = base;
        [[it.a, BLUE], [it.b, AMB], [it.c, RED]].forEach(([m, col]) => {
          if (m <= 0) return;
          const hh = h * m / top2; yy -= hh; rect(cx - bw / 2, yy, bw, hh, col);
        });
        if (it.a > 0) text(brev(it.a), cx, yy - 3, { sz: 7, color: "333333", al: "c" });
        text(it.l, cx, base + 11, { sz: 7.5, color: GRY, al: "c" });
      });
      line(X0 + padL, base, XR, base, "8A97A6", 0.8);
      y = base + 22;
      let lx = X0 + padL;
      [["Ore effettuate", BLUE], ["Ritardo", AMB], ["Assenza", RED]].forEach(([l, col]) => { rect(lx, y - 7, 8, 8, col); text(l, lx + 12, y, { sz: 7.5, color: GRY }); lx += 20 + tw(l, 7.5); });
      y += 16;
    }

    function finish(quando) {
      const N = pages.length;
      pages.forEach((p, i) => {
        ops = p;
        line(X0, 784, XR, 784, LINE, 0.5);
        const f = wrap(`Documento realizzato dall’ufficio di Gabriel Jones destinato a ${cfg.destinatario} con l’oggetto ${cfg.oggetto}`, XW, { sz: 7.5, i: true });
        f.slice(0, 2).forEach((ln, j) => { let cx = X0; ln.forEach(pp => { text(pp.t, cx, 795 + j * 9.5, { sz: 7.5, i: true, color: GRY }); cx += pp.w; }); });
        text(`Pagina ${i + 1} di ${N}`, XR, 822, { sz: 7.5, color: GRY, al: "r" });
      });
    }
    return { pages, page, use: i => { ops = pages[i]; }, setY: v => { y = v; }, getY: () => y, text, rect, line, P, sp, H1, H2, table, bars, need, finish, wrap };
  }

  async function pdfFile(pages, logo) {
    const enc = new TextEncoder(), chunks = [], off = [];
    let len = 0;
    const put = x => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (id, dict, stream) => {
      off[id] = len;
      if (stream) { put(`${id} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`); put(stream); put("\nendstream\nendobj\n"); }
      else put(`${id} 0 obj\n${dict}\nendobj\n`);
    };
    put(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    const first = logo ? 8 : 6, ids = pages.map((_, i) => first + 2 * i);
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map(i => `${i + 1} 0 R`).join(" ")}] >>`);
    ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"].forEach((f, i) => obj(3 + i, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    if (logo) {
      obj(6, `/Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 7 0 R`, await deflate(logo.rgb));
      obj(7, `/Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, await deflate(logo.alpha));
    }
    const res = `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${logo ? " /XObject << /Im1 6 0 R >>" : ""} >>`;
    for (let i = 0; i < pages.length; i++) {
      obj(ids[i], "/Filter /FlateDecode", await deflate(enc.encode(pages[i].join("\n"))));
      obj(ids[i] + 1, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] ${res} /Contents ${ids[i]} 0 R >>`);
    }
    const total = ids[ids.length - 1] + 2, xref = len;
    put(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) put(`${String(off[i]).padStart(10, "0")} 00000 n \n`);
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  /* Il logo della carta intestata si legge dal modello Word (è un archivio ZIP) */
  function readZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Modello non valido");
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = [];
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      out.push({ name, method, data: u8.subarray(start, start + csize) });
      p += 46 + nl + el + cl;
    }
    return out;
  }
  async function inflate(b) {
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function caricaLogo(buf) {
    try {
      const f = readZip(buf).find(x => x.name === "word/media/image1.png");
      if (!f) return null;
      const png = f.method === 0 ? f.data : await inflate(f.data);
      const bmp = await createImageBitmap(new Blob([png], { type: "image/png" }));
      const S = 360, cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const cx = cv.getContext("2d");
      cx.drawImage(bmp, 0, 0, S, S);
      const px = cx.getImageData(0, 0, S, S).data, rgb = new Uint8Array(S * S * 3), alpha = new Uint8Array(S * S);
      for (let i = 0; i < S * S; i++) { rgb[3 * i] = px[4 * i]; rgb[3 * i + 1] = px[4 * i + 1]; rgb[3 * i + 2] = px[4 * i + 2]; alpha[i] = px[4 * i + 3]; }
      return { w: S, h: S, rgb, alpha };
    } catch { return null; }   // senza logo il documento esce comunque
  }

  /* ---------- Contenuto del resoconto ---------- */
  async function buildPdf(recs, cfg, logo, quando) {
    const c = compute(recs, cfg);
    const { pres, assenze, ritardi, t, E, U1, U5 } = c;
    const D = Layout(cfg, !!logo);
    const multi = new Set(pres.map(r => r.luogo)).size > 1;
    const luogoTxt = cfg.luogo ? `«${cfg.luogo}»` : "tutti i luoghi di lavoro registrati";
    const prevDay = g => Math.max(0, (dow(g) === 5 ? U5 : U1) - E);
    const toc = [];
    const sezione = titolo => { D.page(); toc.push([titolo, D.pages.length]); D.H1(titolo); };

    /* mappa giorno per giorno */
    const dm = new Map();
    pres.forEach(r => {
      let x = dm.get(r.data);
      if (!x) dm.set(r.data, x = { st: "P", ent: r.entrata, usc: r.uscita, min: 0, rit: 0, ass: 0, note: [] });
      x.ent = Math.min(x.ent, r.entrata); x.usc = Math.max(x.usc, r.uscita); x.min += r.min;
      if (r.note && !x.note.includes(r.note)) x.note.push(r.note);
    });
    assenze.forEach(a => dm.set(a.data, { st: "A", min: 0, rit: 0, ass: a.min, note: a.note ? [a.note] : [] }));
    ritardi.forEach(r => { const x = dm.get(r.data); if (x) x.rit = r.min; });

    /* Pagina 1 · presentazione */
    D.page();
    D.text("Resoconto delle presenze", X0, Y0 + 22, { b: true, sz: 22, color: BLUE });
    D.text(`Dal ${dLunga(cfg.dal)} al ${dLunga(cfg.al)}`, X0, Y0 + 44, { sz: 12, color: GRY });
    D.line(X0, Y0 + 54, XR, Y0 + 54, BLUE, 1);
    D.setY(Y0 + 72);
    D.P(["Il presente resoconto documenta, giorno per giorno, la presenza di Gabriel Jones presso ", [luogoTxt, { b: true }], ` nel periodo compreso tra il ${dLunga(cfg.dal)} e il ${dLunga(cfg.al)}. Il documento è destinato a `, [cfg.destinatario, { b: true }], " e ha per oggetto ", [`«${cfg.oggetto}»`, { b: true }], "."], { lh: 16, after: 14 });

    D.H2("Dati generali");
    D.table([110, 267], ["Voce", "Dettaglio"], [
      ["Persona", "Gabriel Jones"],
      ["Luogo", cfg.luogo || "Tutti i luoghi registrati"],
      ["Periodo", `${dLunga(cfg.dal)} – ${dLunga(cfg.al)}`],
      ["Destinatario", cfg.destinatario],
      ["Oggetto", cfg.oggetto],
      ["Orario di riferimento", `Entrata ${hmOf(E)} · uscita ${hmOf(U1)} (lun–gio) e ${hmOf(U5)} (ven)`],
      ["Documento generato il", quando]
    ], { rh: 20 });

    D.H2("In sintesi");
    const cards = [[String(t.presGiorni), "giornate di presenza"], [brev(t.presMin), "ore effettuate"], [brev(t.ritMin), `di ritardo (${giorni(t.ritGiorni)})`], [brev(t.assMin), `di assenza (${giorni(t.assGiorni)})`]];
    const cwid = (XW - 3 * 8) / 4;
    D.need(70);
    const cy = D.getY();
    cards.forEach(([v, l], i) => {
      const x = X0 + i * (cwid + 8);
      D.rect(x, cy, cwid, 58, PALE, LINE);
      D.text(v, x + cwid / 2, cy + 26, { b: true, sz: 15, color: BLUE, al: "c" });
      D.text(l, x + cwid / 2, cy + 42, { sz: 7.5, color: GRY, al: "c" });
    });
    D.setY(cy + 74);
    D.P(["Nel periodo la presenza è stata del ", [pct(t.presMin, t.previste), { b: true }], " delle ore previste; l'assenza complessiva, tra ritardi e assenze, è stata del ", [pct(t.ritMin + t.assMin, t.previste), { b: true }], "."], { lh: 16 });
    D.P("Il resoconto prosegue con l'indice e i criteri di calcolo, poi con le tabelle riepilogative, i calendari mensili e il dettaglio di ogni settimana.", { lh: 16, color: GRY });

    /* Pagina 2 · segnaposto (indice e criteri si scrivono alla fine) */
    D.page();

    /* 1. Presenze */
    sezione("1. Elenco delle giornate di presenza");
    if (pres.length) {
      D.P([`Giornate di presenza: `, [String(t.presGiorni), { b: true }], ` · Turni registrati: `, [String(pres.length), { b: true }], ` · Ore effettuate: `, [`${ore(t.presMin)} (${dec(t.presMin)} ore)`, { b: true }], "."], { lh: 15, after: 10 });
      const cols = multi ? [105, 70, 50, 50, 65, 100] : [120, 55, 55, 75, 140];
      const head = multi ? ["Data", "Luogo", "Entrata", "Uscita", "Ore", "Note"] : ["Data", "Entrata", "Uscita", "Ore", "Note"];
      const rows = pres.map(r => (multi ? [dBreve(r.data), r.luogo] : [dBreve(r.data)]).concat([hmOf(r.entrata), hmOf(r.uscita), ore(r.min), r.note]));
      D.table(cols, head, rows, { rh: 21, totals: [multi ? [{ t: "Totale", span: 4 }, ore(t.presMin), ""] : [{ t: "Totale", span: 3 }, ore(t.presMin), ""]] });
    } else D.P("Nel periodo non risultano giornate di presenza.");

    /* 2. Assenze */
    sezione("2. Resoconto delle assenze");
    if (assenze.length) {
      D.P(["Giornate di assenza: ", [String(t.assGiorni), { b: true }], " · Totale ore di assenza: ", [`${ore(t.assMin)} (${dec(t.assMin)} ore)`, { b: true }], ". Per ogni giornata si contano le ore previste dall'orario di riferimento."], { lh: 15, after: 10 });
      D.table([140, 110, 127], ["Data", "Ore di assenza", "Note"], assenze.map(a => [dBreve(a.data), ore(a.min), a.note]), { rh: 21, totals: [[{ t: `Totale · ${giorni(t.assGiorni)}` }, ore(t.assMin), `${dec(t.assMin)} ore`]] });
    } else D.P("Nel periodo non sono registrate assenze.");

    /* 3. Ritardi */
    sezione("3. Resoconto dei ritardi");
    if (ritardi.length) {
      D.P(["Giorni con ritardo: ", [String(t.ritGiorni), { b: true }], " · Totale ritardi: ", [`${ore(t.ritMin)} (${dec(t.ritMin)} ore)`, { b: true }], ". Il ritardo è la differenza tra l'entrata prevista e la prima entrata registrata."], { lh: 15, after: 10 });
      D.table([105, 75, 75, 70, 52], ["Data", "Prevista", "Effettiva", "Ritardo", "Ore"], ritardi.map(r => [dBreve(r.data), hmOf(r.prevista), hmOf(r.effettiva), ore(r.min), dec(r.min)]), { rh: 21, totals: [[{ t: `Totale · ${giorni(t.ritGiorni)}`, span: 3 }, ore(t.ritMin), dec(t.ritMin)]] });
    } else D.P("Nel periodo non sono registrati ritardi.");

    /* 4. Riepilogo */
    sezione("4. Riepilogo: presenza, ritardi e assenze");
    D.P("La tabella mette a confronto le ore effettuate con quelle perse per ritardi e assenze. Le percentuali sono calcolate sulle ore previste complessive.", { lh: 15, after: 10 });
    const r4 = (n, m, g) => [n, ore(m), dec(m), g, pct(m, t.previste)];
    D.table([130, 72, 55, 45, 75], ["Voce", "Ore", "Ore dec.", "Giorni", "% sul previsto"], [r4("Presenza", t.presMin, String(t.presGiorni)), r4("Ritardi", t.ritMin, String(t.ritGiorni)), r4("Assenze", t.assMin, String(t.assGiorni))], {
      rh: 22, al: ["l", "r", "r", "r", "r"],
      totals: [
        ["Ore previste complessive", ore(t.previste), dec(t.previste), String(t.presGiorni + t.assGiorni), pct(t.previste, t.previste)],
        ["Assenza complessiva", ore(t.ritMin + t.assMin), dec(t.ritMin + t.assMin), String(t.ritGiorni + t.assGiorni), pct(t.ritMin + t.assMin, t.previste)]
      ]
    });
    D.P("Nella colonna dei giorni, l'assenza complessiva somma i giorni con ritardo e i giorni di assenza.", { lh: 15, color: GRY, sz: 9 });
    if (t.aperti) D.P(`Nota: ${t.aperti === 1 ? "un turno ancora aperto non è stato conteggiato" : t.aperti + " turni ancora aperti non sono stati conteggiati"}, perché privo dell'orario di uscita.`, { i: true, sz: 9, color: GRY });

    /* 5. Mese per mese */
    const mesi = new Map();
    [...dm.keys()].sort().forEach(g => {
      const k = g.slice(0, 7), x = dm.get(g);
      if (!mesi.has(k)) mesi.set(k, { pg: 0, pm: 0, rg: 0, rm: 0, ag: 0, am: 0 });
      const m = mesi.get(k);
      if (x.st === "P") { m.pg++; m.pm += x.min; if (x.rit) { m.rg++; m.rm += x.rit; } } else { m.ag++; m.am += x.ass; }
    });
    const nomeMese = k => cap(new Date(k + "-15T12:00:00Z").toLocaleDateString("it-IT", { timeZone: "UTC", month: "long", year: "numeric" }));
    sezione("5. Sintesi mese per mese");
    D.P("Per ciascun mese sono riportate le giornate di presenza, le ore effettuate, i ritardi, le assenze e la percentuale di assenza complessiva sulle ore previste del mese.", { lh: 15, after: 10 });
    const mrows = [...mesi].map(([k, m]) => { const pv = m.pm + m.rm + m.am; return [nomeMese(k), String(m.pg), ore(m.pm), String(m.rg), brev(m.rm), String(m.ag), brev(m.am), pct(m.rm + m.am, pv)]; });
    D.table([70, 34, 66, 30, 42, 32, 42, 52], ["Mese", "Giorni", "Ore", "Rit.", "Ore rit.", "Ass.", "Ore ass.", "% assenza"], mrows, {
      rh: 22, sz: 8, al: ["l", "r", "r", "r", "r", "r", "r", "r"],
      totals: [["Totale", String(t.presGiorni), ore(t.presMin), String(t.ritGiorni), brev(t.ritMin), String(t.assGiorni), brev(t.assMin), pct(t.ritMin + t.assMin, t.previste)]]
    });
    D.H2("Ore effettuate, ritardi e assenze per mese");
    D.bars([...mesi].map(([k, m]) => ({ l: nomeMese(k).split(" ")[0].slice(0, 3), a: m.pm, b: m.rm, c: m.am })), { h: 150 });

    /* 6. Calendari mensili */
    sezione("6. Calendari mensili");
    D.P("Ogni calendario mostra, giorno per giorno, lo stato della presenza: in azzurro i giorni di presenza, in giallo quelli con ritardo, in rosso le assenze.", { lh: 15 });
    let first6 = true;
    [...mesi.keys()].forEach(k => {
      if (!first6) { D.page(); }
      first6 = false;
      D.H2(nomeMese(k));
      const [yy, mm] = k.split("-").map(Number), start = `${k}-01`, nd = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      const off0 = (dow(start) + 6) % 7, cw = XW / 7, chh = 66;
      const gy = D.getY();
      ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].forEach((g, i) => { D.rect(X0 + i * cw, gy, cw, 18, BLUE, LINE); D.text(g, X0 + i * cw + cw / 2, gy + 12.5, { b: true, sz: 8.5, color: "FFFFFF", al: "c" }); });
      const rowsN = Math.ceil((off0 + nd) / 7);
      for (let d = 1; d <= nd; d++) {
        const iso = `${k}-${pad(d)}`, idx = off0 + d - 1, col = idx % 7, rw = Math.floor(idx / 7), x = X0 + col * cw, yv = gy + 18 + rw * chh, v = dm.get(iso), inP = iso >= cfg.dal && iso <= cfg.al;
        const fill = v ? (v.st === "A" ? ABSF : v.rit ? LATE : OKF) : col >= 5 ? WKND : null;
        D.rect(x, yv, cw, chh, fill, LINE);
        D.text(String(d), x + 4, yv + 10, { sz: 7.5, color: inP ? GRY : "BBBBBB", b: true });
        if (v && v.st === "P") {
          D.text(ore(v.min), x + cw / 2, yv + 33, { b: true, sz: 8.5, al: "c" });
          D.text(`${hmOf(v.ent)}–${hmOf(v.usc)}`, x + cw / 2, yv + 45, { sz: 6.5, color: GRY, al: "c" });
          if (v.rit) D.text(`rit. ${brev(v.rit)}`, x + cw / 2, yv + 56, { sz: 6.5, color: "9A6A12", al: "c" });
        } else if (v) D.text("Assente", x + cw / 2, yv + 36, { b: true, sz: 8.5, color: "9A3B38", al: "c" });
      }
      D.setY(gy + 18 + rowsN * chh + 14);
      const m = mesi.get(k);
      D.P([`${nomeMese(k)}: `, [`${m.pg} ${m.pg === 1 ? "giornata" : "giornate"} di presenza`, { b: true }], ` per ${ore(m.pm)}; ${giorni(m.rg)} con ritardo (${brev(m.rm)}) e ${giorni(m.ag)} di assenza (${brev(m.am)}).`], { lh: 15, sz: 9.5 });
    });

    /* 7. Settimana per settimana */
    const lun0 = addDays(cfg.dal, -((dow(cfg.dal) + 6) % 7));
    const sett = [];
    for (let l = lun0; l <= cfg.al && sett.length < 160; l = addDays(l, 7)) sett.push(l);
    sezione("7. Dettaglio settimana per settimana");
    D.P(`Nelle pagine che seguono, una per ogni settimana, sono elencati i singoli giorni con entrata, uscita, ore effettuate, ritardo e assenza. Le settimane comprese nel periodo sono ${sett.length}.`, { lh: 15 });
    sett.forEach((lun, si) => {
      D.page();
      const dom = addDays(lun, 6);
      D.text(`Settimana ${si + 1} di ${sett.length}`, X0, D.getY() + 16, { b: true, sz: 15, color: BLUE });
      D.setY(D.getY() + 24);
      D.line(X0, D.getY(), XR, D.getY(), BLUE, 1);
      D.setY(D.getY() + 6);
      D.P(`Da lunedì ${dLunga(lun)} a domenica ${dLunga(dom)}`, { color: GRY, after: 10 });
      const giorniW = [];
      for (let i = 0; i < 7; i++) { const g = addDays(lun, i); if (g < cfg.dal || g > cfg.al) continue; if (i < 5 || dm.has(g)) giorniW.push(g); }
      const sw = { pm: 0, rm: 0, am: 0, pg: 0, rg: 0, ag: 0 };
      const rows = giorniW.map(g => {
        const v = dm.get(g);
        if (!v) return [dBreve(g), "—", "—", "—", "—", "—", "Nessun dato"];
        if (v.st === "A") { sw.am += v.ass; sw.ag++; return [dBreve(g), "—", "—", "—", "—", brev(v.ass), "Assente"]; }
        sw.pm += v.min; sw.pg++; if (v.rit) { sw.rm += v.rit; sw.rg++; }
        return [dBreve(g), hmOf(v.ent), hmOf(v.usc), ore(v.min), v.rit ? brev(v.rit) : "—", "—", v.rit ? "In ritardo" : "Presente"];
      });
      D.table([82, 40, 40, 56, 42, 44, 73], ["Giorno", "Entrata", "Uscita", "Ore", "Ritardo", "Assenza", "Stato"], rows, {
        rh: 22, sz: 8, al: ["l", "c", "c", "r", "r", "r", "l"],
        totals: [[{ t: "Totale settimana", span: 3 }, ore(sw.pm), sw.rm ? brev(sw.rm) : "—", sw.am ? brev(sw.am) : "—", ""]]
      });
      const pv = sw.pm + sw.rm + sw.am;
      if (pv) D.P(["In questa settimana la presenza è stata del ", [pct(sw.pm, pv), { b: true }], ` delle ore previste: ${sw.pg} ${sw.pg === 1 ? "giornata" : "giornate"} di presenza, ${giorni(sw.rg)} con ritardo e ${giorni(sw.ag)} di assenza.`], { lh: 15, sz: 9.5, after: 12 });
      else D.P("Per questa settimana non risultano presenze né assenze registrate.", { lh: 15, sz: 9.5, after: 12 });
      if (pv) D.H2("Ore per giorno");
      if (pv) D.bars(giorniW.map(g => { const v = dm.get(g); return { l: cap(dIt(g, { weekday: "short" })) + " " + g.slice(8), a: v && v.st === "P" ? v.min : 0, b: v ? v.rit : 0, c: v && v.st === "A" ? v.ass : 0 }; }), { h: 120 });
      const note = giorniW.flatMap(g => { const v = dm.get(g); return v && v.note.length ? [[g, v.note.join("; ")]] : []; });
      if (note.length) {
        D.H2("Note della settimana");
        note.forEach(([g, n]) => D.P([[dBreve(g) + ": ", { b: true }], n], { lh: 14, sz: 9, after: 3 }));
      }
    });

    /* Pagina 2 · indice e criteri di calcolo */
    D.use(1);
    D.setY(Y0);
    D.text("Indice", X0, Y0 + 15, { b: true, sz: 15, color: BLUE });
    D.line(X0, Y0 + 24, XR, Y0 + 24, BLUE, 1);
    let iy = Y0 + 44;
    toc.forEach(([tt, pg]) => {
      D.text(tt, X0, iy, { sz: 10.5 });
      D.text(String(pg), XR, iy, { sz: 10.5, b: true, al: "r" });
      const x1 = X0 + tw(tt, 10.5) + 6, x2 = XR - tw(String(pg), 10.5, true) - 6;
      for (let x = x1; x < x2; x += 4) D.text(".", x, iy, { sz: 10.5, color: "999999" });
      iy += 21;
    });
    D.setY(iy + 14);
    D.H2("Criteri di calcolo");
    const crit = (a, b) => D.P([[a + " ", { b: true }], b], { lh: 15, after: 8, sz: 10 });
    crit("Orario di riferimento.", `Entrata prevista alle ${hmOf(E)}; uscita prevista alle ${hmOf(U1)} dal lunedì al giovedì e alle ${hmOf(U5)} il venerdì. Da qui derivano le ore previste per ogni giornata.`);
    crit("Presenza.", "Tempo trascorso tra l'entrata e l'uscita; se in un giorno ci sono più turni, le ore si sommano.");
    crit("Ritardo.", "Entrata dopo l'orario previsto, misurata sulla prima entrata del giorno.");
    crit("Assenza.", "Giornata con la nota «Assenza» o con durata pari a zero; vale come ore di assenza le ore previste per quel giorno.");
    crit("Percentuale di assenza.", "Somma di ritardi e assenze rapportata alle ore previste complessive, cioè presenza, ritardi e assenze insieme.");
    D.P("Le ore sono indicate in ore e minuti.", { i: true, sz: 9, color: GRY });

    D.finish();
    return { blob: await pdfFile(D.pages, logo), c, pagine: D.pages.length };
  }

  /* ---------- Dati: server + cache + coda locale (come la pagina) ---------- */
  async function carica(cfg) {
    const mesi = [];
    for (let [y, m] = cfg.dal.split("-").map(Number); `${y}-${pad(m)}` <= cfg.al.slice(0, 7) && mesi.length < 36; m === 12 ? (y++, m = 1) : m++) mesi.push(`${y}-${pad(m)}`);
    const mappa = new Map();
    const metti = r => { const o = mappa.get(r.id); if (!o || r.modificato >= o.modificato) mappa.set(r.id, r); };
    Object.values(leggi(LS_CACHE, {})).forEach(l => l.forEach(metti));
    await Promise.all(mesi.map(async mo => {
      try {
        const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
        if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return;
        ((await r.json()).registrazioni || []).forEach(metti);
      } catch { /* senza rete: vale la copia locale */ }
    }));
    Object.values(leggi(LS_CODA, {})).forEach(metti);
    return [...mappa.values()].filter(r => !r.eliminato && r.data >= cfg.dal && r.data <= cfg.al && (!cfg.luogo || r.luogo === cfg.luogo));
  }

  async function avvia() {
    const oggi = new Date(), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const annoScol = oggi.getMonth() >= 8 ? oggi.getFullYear() : oggi.getFullYear() - 1;
    const salvato = leggi(LS_RES, {});
    const conf = await Portal.load("presenze-config", { luoghi: [] });
    const luoghi = [...new Set([...(conf.luoghi || []), ...Object.values(leggi(LS_CACHE, {})).flat().map(r => r.luogo)])];
    const res = await Portal.form({
      title: "Scarica resoconto",
      submit: "Scarica",
      values: { dal: `${annoScol}-09-01`, al: iso(oggi), luogo: salvato.luogo ?? (luoghi.includes("Scuola") ? "Scuola" : ""), destinatario: salvato.destinatario || "", oggetto: salvato.oggetto || "Resoconto delle presenze", entrata: salvato.entrata || "08:40", uscita: salvato.uscita || "16:40", uscitaVen: salvato.uscitaVen || "13:40" },
      fields: [
        { name: "dal", label: "Dal", type: "date", required: true, half: true },
        { name: "al", label: "Al", type: "date", required: true, half: true },
        { name: "luogo", label: "Luogo", type: "select", options: [["", "Tutti i luoghi"], ...luoghi.map(l => [l, l])] },
        { name: "destinatario", label: "Destinatario del documento", required: true, placeholder: "Es. Dirigente scolastico" },
        { name: "oggetto", label: "Oggetto", required: true },
        { name: "entrata", label: "Entrata prevista", type: "time", required: true, half: true },
        { name: "uscita", label: "Uscita prevista (lun–gio)", type: "time", required: true, half: true },
        { name: "uscitaVen", label: "Uscita prevista (venerdì)", type: "time", required: true, half: true, hint: "Servono per calcolare ritardi e ore di assenza." }
      ]
    });
    if (!res) return;
    if (res.dal > res.al) return Portal.toast("La data iniziale è dopo quella finale");
    try { localStorage.setItem(LS_RES, JSON.stringify({ luogo: res.luogo, destinatario: res.destinatario, oggetto: res.oggetto, entrata: res.entrata, uscita: res.uscita, uscitaVen: res.uscitaVen })); } catch { /* quota */ }
    const btn = $("#pr-report");
    btn.disabled = true;
    try {
      const [recs, tpl] = await Promise.all([carica(res), fetch(TEMPLATE, { cache: "no-store" }).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)]);
      if (!recs.length) return Portal.toast("Nessuna presenza nel periodo scelto");
      const quando = `${dLunga(iso(oggi))} alle ${pad(oggi.getHours())}:${pad(oggi.getMinutes())}`;
      const logo = tpl ? await caricaLogo(tpl) : null;
      const { blob } = await buildPdf(recs, res, logo, quando);
      Portal.download(`resoconto-presenze-${res.dal}_${res.al}.pdf`, blob);
      Portal.toast("Resoconto PDF scaricato");
    } catch (e) { Portal.toast(e.message || "Impossibile creare il resoconto"); }
    finally { btn.disabled = false; }
  }

  window.PresenzeResoconto = { compute, buildPdf, caricaLogo, avvia };
})();
