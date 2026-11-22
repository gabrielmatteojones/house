/* Documenti · editor con carta intestata.
   «Scarica Word» riscrive il modello /assets/js/CartaIntestata.docx (archivio ZIP) con il testo scritto qui;
   «Scarica PDF» stampa la pagina da un iframe pulito, con la carta intestata su ogni pagina. Nessuna libreria esterna. */
(() => {
  const TEMPLATE = "/assets/js/CartaIntestata.docx", K = "gj-documenti";
  const $ = id => document.getElementById(id), ed = $("dc-ed");
  const xml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = m => window.Portal && Portal.toast ? Portal.toast(m) : console.log(m);
  const oggi = () => new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  let tplBuf = null;
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* ok */ }

  /* ---------- Editor ---------- */
  const cmd = (k, v) => { ed.focus(); document.execCommand(k, false, v ?? null); upd(); };
  [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].forEach(n => $("dc-size").add(new Option(n + " pt", n, n === 11, n === 11)));
  document.querySelectorAll("[data-cmd]").forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => cmd(b.dataset.cmd); });
  document.querySelectorAll("[data-color]").forEach(i => i.oninput = () => cmd(i.dataset.color, i.value));
  $("dc-blk").onchange = e => cmd("formatBlock", e.target.value);
  $("dc-font").onchange = e => cmd("fontName", e.target.value);
  $("dc-size").onchange = e => {
    ed.focus(); document.execCommand("fontSize", false, 7);
    ed.querySelectorAll("font[size='7']").forEach(f => { const s = document.createElement("span"); s.style.fontSize = e.target.value + "pt"; s.innerHTML = f.innerHTML; f.replaceWith(s); });
    upd();
  };
  $("dc-tbl").onclick = () => { const r = +prompt("Righe", 3), k = +prompt("Colonne", 3); if (r && k) cmd("insertHTML", "<table>" + ("<tr>" + "<td>&nbsp;</td>".repeat(k) + "</tr>").repeat(r) + "</table><p><br></p>"); };
  $("dc-link").onclick = () => { const u = prompt("Indirizzo del collegamento", "https://"); if (u) cmd("createLink", u); };
  $("dc-pb").onclick = () => cmd("insertHTML", '<div style="break-after:page"></div><p><br></p>');
  $("dc-date").onclick = () => cmd("insertText", oggi());
  $("dc-new").onclick = () => { if (ed.innerText.trim() && !confirm("Iniziare un nuovo documento? Quello attuale andrà perso.")) return; ed.innerHTML = ""; $("dc-nome").value = "Documento senza titolo"; upd(); };

  const MOD = (d, o) => ({
    l: `<p>Fontanafredda, ${oggi()}</p><p><br></p><p><b>Oggetto: ${o}</b></p><p><br></p><p>Gentile ${d},</p><p>con la presente desidero …</p><p>Resto a disposizione per ogni chiarimento e porgo cordiali saluti.</p><p><br></p><p>Gabriel Jones</p>`,
    r: `<h1>${o}</h1><p>Fontanafredda, ${oggi()}</p><h2>1. Premessa</h2><p>…</p><h2>2. Attività svolte</h2><ul><li>…</li></ul><h2>3. Conclusioni</h2><p>…</p>`,
    v: `<h1>Verbale</h1><p>Data: ${oggi()}</p><p>Presenti: …</p><h2>Ordine del giorno</h2><ol><li>…</li></ol><h2>Svolgimento</h2><p>…</p><h2>Decisioni</h2><p>…</p>`,
    c: `<h1>Comunicazione</h1><p>Fontanafredda, ${oggi()}</p><p>A: ${d}</p><p><b>${o}</b></p><p>Si comunica che …</p>`
  });
  document.querySelectorAll("[data-mod]").forEach(b => b.onclick = () => {
    if (ed.innerText.trim() && !confirm("Sostituire il testo attuale con il modello?")) return;
    ed.innerHTML = MOD(xml($("dc-dest").value), xml($("dc-ogg").value))[b.dataset.mod]; upd();
  });

  function upd() {
    const t = ed.innerText.trim();
    $("dc-nw").textContent = t ? t.split(/\s+/).length : 0; $("dc-nc").textContent = t.length;
    $("dc-np").textContent = Math.max(1, Math.ceil((document.querySelector(".dc-page").offsetHeight - 3) / 1122.5));
    document.querySelectorAll("[data-cmd]").forEach(b => { try { b.classList.toggle("on", document.queryCommandState(b.dataset.cmd) && !/undo|redo|insert|indent|outdent/.test(b.dataset.cmd)); } catch { /* ok */ } });
    try { localStorage.setItem(K, JSON.stringify({ h: ed.innerHTML, n: $("dc-nome").value, d: $("dc-dest").value, o: $("dc-ogg").value })); } catch { /* quota */ }
  }
  const campi = () => { $("dc-fd").textContent = $("dc-dest").value; $("dc-fo").textContent = $("dc-ogg").value; document.title = $("dc-nome").value + " · Documenti"; upd(); };
  ["dc-nome", "dc-dest", "dc-ogg"].forEach(i => $(i).oninput = campi);
  ed.addEventListener("input", upd);
  document.addEventListener("selectionchange", () => { if (ed.contains(getSelection().anchorNode)) upd(); });
  try { const s = JSON.parse(localStorage.getItem(K)); if (s) { ed.innerHTML = s.h; $("dc-nome").value = s.n; $("dc-dest").value = s.d; $("dc-ogg").value = s.o; } } catch { /* ok */ }
  campi();

  /* ---------- PDF: stampa da un iframe pulito ---------- */
  $("dc-pdf").onclick = () => {
    const pg = document.querySelector(".dc-page").cloneNode(true);
    pg.querySelector("#dc-ed").removeAttribute("contenteditable");
    pg.querySelector(".dc-fx").innerHTML = pg.querySelector(".dc-fd").innerHTML;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open(); d.write(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>${xml($("dc-nome").value)}</title><link rel="stylesheet" href="/documenti/documenti.css"></head><body class="dc-iframe">${pg.outerHTML}</body></html>`); d.close();
    let fatto = false;
    const go = () => { if (fatto) return; fatto = true; f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 3000); };
    d.querySelector("link").onload = () => setTimeout(go, 150); setTimeout(go, 2500);
  };

  /* ---------- Word: HTML dell'editor → paragrafi del modello ---------- */
  const hx = v => { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(v || ""); return m && !/,\s*0\)$/.test(v) ? [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, "0")).join("").toUpperCase() : ""; };
  const rp = s => { const f = xml(s.f || "Arial"); return `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${s.b ? "<w:b/><w:bCs/>" : ""}${s.i ? "<w:i/><w:iCs/>" : ""}${s.s ? "<w:strike/>" : ""}${s.c ? `<w:color w:val="${s.c}"/>` : ""}<w:sz w:val="${s.sz || 22}"/><w:szCs w:val="${s.sz || 22}"/>${s.u ? '<w:u w:val="single"/>' : ""}${s.h ? `<w:shd w:val="clear" w:color="auto" w:fill="${s.h}"/>` : ""}${s.v ? `<w:vertAlign w:val="${s.v}"/>` : ""}</w:rPr>`; };
  function runs(n, s) {
    let o = "";
    n.childNodes.forEach(k => {
      if (k.nodeType === 3) { if (k.nodeValue) o += `<w:r>${rp(s)}<w:t xml:space="preserve">${xml(k.nodeValue)}</w:t></w:r>`; return; }
      if (k.nodeType !== 1) return;
      const t = k.tagName, st = { ...s }, y = k.style;
      if (t === "BR") { o += "<w:r><w:br/></w:r>"; return; }
      if (/^(B|STRONG)$/.test(t)) st.b = 1; if (/^(I|EM)$/.test(t)) st.i = 1; if (t === "U") st.u = 1; if (/^(S|STRIKE|DEL)$/.test(t)) st.s = 1;
      if (t === "SUB") st.v = "subscript"; if (t === "SUP") st.v = "superscript"; if (t === "A") { st.u = 1; st.c = "0563C1"; }
      if (t === "FONT") { if (k.color) st.c = hx(k.color) || k.color.replace("#", "").toUpperCase(); if (k.face) st.f = k.face.split(",")[0]; }
      if (y.fontWeight === "bold" || +y.fontWeight >= 600) st.b = 1; if (y.fontStyle === "italic") st.i = 1;
      if (/underline/.test(y.textDecoration + y.textDecorationLine)) st.u = 1;
      if (/pt$/.test(y.fontSize)) st.sz = Math.round(parseFloat(y.fontSize) * 2);
      if (y.color) st.c = hx(y.color) || st.c; if (y.backgroundColor) st.h = hx(y.backgroundColor) || st.h;
      if (y.fontFamily) st.f = y.fontFamily.split(",")[0].replace(/["']/g, "");
      o += runs(k, st);
    });
    return o;
  }
  const jc = el => ({ center: "center", right: "right", justify: "both" }[el.style && el.style.textAlign] || "");
  const ppr = o => `<w:pPr>${o.k ? "<w:keepNext/>" : ""}${o.bd ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>' : ""}<w:spacing w:before="${o.bf || 0}" w:after="${o.af ?? 120}" w:line="276" w:lineRule="auto"/><w:ind w:left="${o.l || 0}"${o.h ? ` w:hanging="${o.h}"` : ""}/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>`;
  const P = (el, o = {}, s = {}, pre = "") => `<w:p>${ppr({ ...o, jc: jc(el) })}${pre}${runs(el, s)}</w:p>`;
  const BLK = /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|HR|PRE)$/;
  const hasBlk = el => [...el.childNodes].some(k => k.nodeType === 1 && BLK.test(k.tagName));
  function table(t) {
    const rows = [...t.rows], nc = Math.max(...rows.map(r => r.cells.length)), w = Math.floor(7655 / nc);
    const bd = ["top", "left", "bottom", "right", "insideH", "insideV"].map(x => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="7655" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${w}"/>`.repeat(nc)}</w:tblGrid>${rows.map(r => `<w:tr>${[...r.cells].map(c => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${hasBlk(c) ? blocks(c) : P(c, { af: 0 })}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  }
  function blocks(root) {
    let o = "", buf = [];
    const flush = () => { if (buf.some(n => n.nodeType === 1 || n.nodeValue.trim())) o += P({ childNodes: buf, style: {} }); buf = []; };
    root.childNodes.forEach(k => {
      if (k.nodeType !== 1 || !BLK.test(k.tagName)) { if (k.nodeType === 3 || (k.nodeType === 1 && k.tagName !== "IMG")) buf.push(k); return; }
      flush();
      const t = k.tagName;
      if (/^H[1-6]$/.test(t)) o += P(k, { bf: 200, af: 100, k: 1 }, { b: 1, c: "3D6E99", sz: { H1: 40, H2: 30 }[t] || 24 });
      else if (t === "UL" || t === "OL") [...k.children].forEach((li, i) => { o += P(li, { l: 500, h: 300, af: 60 }, {}, `<w:r>${rp({})}<w:t>${t === "UL" ? "•" : i + 1 + "."}</w:t></w:r><w:r><w:tab/></w:r>`); });
      else if (t === "BLOCKQUOTE") o += P(k, { l: 600 }, { i: 1 });
      else if (t === "TABLE") o += table(k);
      else if (t === "HR") o += `<w:p>${ppr({ bd: 1 })}</w:p>`;
      else if (/break-after|page-break-after/.test(k.getAttribute("style") || "")) o += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else o += hasBlk(k) ? blocks(k) : P(k);
    });
    flush();
    return o;
  }

  /* ---------- Archivio ZIP (il file Word è uno ZIP) ---------- */
  const td = new TextDecoder(), te = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function readZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Il modello della carta intestata non è un file Word valido");
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Modello non leggibile");
      const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      out.push({ name, method, crc, usize, data: u8.subarray(start, start + csize) });
      p += 46 + nl + el + cl;
    }
    return out;
  }
  async function inflate(b) {
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const testo = async f => f.method === 0 ? td.decode(f.data) : td.decode(await inflate(f.data));
  function writeZip(files) {
    const parts = [], central = [];
    let off = 0;
    files.forEach(f => {
      const name = te.encode(f.name), data = f.text !== undefined ? te.encode(f.text) : f.data;
      const method = f.text !== undefined ? 0 : f.method, crc = f.text !== undefined ? crc32(data) : f.crc, usize = f.text !== undefined ? data.length : f.usize;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x0021, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, usize, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x0021, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, usize, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((s, x) => s + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }


  async function build() {
    const files = readZip(tplBuf);
    const doc = files.find(f => f.name === "word/document.xml"), foot = files.find(f => f.name === "word/footer1.xml");
    if (!doc || !foot) throw new Error("Il modello della carta intestata non contiene i file attesi");
    const d = await testo(doc), f = await testo(foot);
    const a = d.indexOf("<w:body>") + 8, b = d.lastIndexOf("<w:sectPr");
    if (a < 8 || b < 0) throw new Error("Modello della carta intestata non riconosciuto");
    doc.text = d.slice(0, a) + (blocks(ed) || "<w:p/>") + d.slice(b);
    foot.text = f.split("NomeDestinatario").join(xml($("dc-dest").value)).split("TitoloCentrale").join(xml($("dc-ogg").value));
    return writeZip(files);
  }
  $("dc-word").onclick = async () => {
    try {
      if (!tplBuf) throw new Error("Carta intestata non trovata");
      const blob = await build(), nome = ($("dc-nome").value || "documento").replace(/[\\/:*?"<>|]+/g, "-") + ".docx";
      if (window.Portal && Portal.download) Portal.download(nome, blob);
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e3); }
      toast("Documento scaricato");
    } catch (e) { toast(e.message || "Impossibile creare il documento"); }
  };

  /* ---------- Carta intestata: logo letto dal modello ---------- */
  fetch(TEMPLATE, { cache: "no-store" }).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(async buf => {
    tplBuf = buf;
    const f = readZip(buf).find(x => x.name === "word/media/image1.png");
    if (!f) return;
    const png = f.method === 0 ? f.data : await inflate(f.data);
    const img = $("dc-logo"); img.src = URL.createObjectURL(new Blob([png], { type: "image/png" })); img.hidden = false;
  }).catch(() => toast("Carta intestata non trovata: il Word non si può creare"));
})();
