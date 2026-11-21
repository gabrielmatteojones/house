/* Plugin Orario di scuola: pagina /orario/
   Dati: collezione "orario" (sincronizzata come tutto il resto, inclusa nel backup).
   Lun–Gio: 08:40–16:40, 7 ore da 60', pausa pranzo 12:40–13:40.
   Venerdì: 08:40–13:40, 5 ore da 60', nessuna pausa.
   Ogni voce può durare più ore consecutive (campo "ore"), senza attraversare la pausa pranzo.
   L'export Excel (.xlsx) è generato nel browser, senza librerie esterne. */
(async () => {
  if (document.body.dataset.page !== "/orario/") return;
  if (!Portal.COLLECTIONS.includes("orario")) Portal.COLLECTIONS.push("orario");

  const orario = await Portal.load("orario", []);
  const classi = await Portal.load("classi", []);   // opzionale: nomi suggeriti (plugin Materiali)

  const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];
  const FASCE = ["08:40", "09:40", "10:40", "11:40", "12:40", "13:40", "14:40", "15:40", "16:40"];
  const RIGHE = FASCE.length - 1;
  const st = { classe: "" };

  /* Com'è fatta una casella: lezione, pausa pranzo o fuori orario */
  const slot = (g, r) => {
    const da = FASCE[r], a = FASCE[r + 1];
    if (g === 5) return r <= 4 ? { tipo: "lezione", ora: r + 1, da, a } : { tipo: "fuori", da, a };
    if (r === 4) return { tipo: "pausa", da, a };
    return { tipo: "lezione", ora: r < 4 ? r + 1 : r, da, a };
  };
  const orarioGiorno = g => g === 5 ? "08:40–13:40" : "08:40–16:40";
  const minuti = h => { const [H, M] = h.split(":").map(Number); return H * 60 + M; };
  const hue = s => { let h = 0; for (const ch of (s || "").toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const byName = (a, b) => a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });
  const sub = e => [e.classe, e.aula && "aula " + e.aula].filter(Boolean).join(" · ");

  /* Voci che durano più ore */
  const ore = e => Math.max(1, Math.floor(+e.ore) || 1);
  const copre = (g, r) => orario.find(x => x.giorno === g && x.riga <= r && r < x.riga + ore(x));
  const maxOre = (g, r, e) => {
    let n = 0;
    for (let k = r; k < RIGHE; k++) {
      if (slot(g, k).tipo !== "lezione") break;
      const c = copre(g, k);
      if (c && c !== e) break;
      n++;
    }
    return n;
  };
  const oraLabel = (g, r, n) => n > 1 ? `${slot(g, r).ora}ª–${slot(g, r + n - 1).ora}ª ora` : `${slot(g, r).ora}ª ora`;

  /* Giorno e ora attuali (1 = lunedì … 5 = venerdì, 0 = weekend) */
  const adesso = () => {
    const d = new Date(), js = d.getDay();
    return { g: js >= 1 && js <= 5 ? js : 0, min: d.getHours() * 60 + d.getMinutes() };
  };
  const isNow = (g, r, n = 1) => {
    const t = adesso();
    return t.g === g && t.min >= minuti(slot(g, r).da) && t.min < minuti(slot(g, r + n - 1).a);
  };
  const pos = (g, r, n = 1) => `grid-column:${g + 1};grid-row:${r + 2}${n > 1 ? " / span " + n : ""}`;

  /* ---------- Disegno ---------- */
  function drawGrid() {
    const t = adesso(), out = [];
    GIORNI.forEach((nome, i) => out.push(`<div class="or-head${t.g === i + 1 ? " today" : ""}" style="grid-column:${i + 2};grid-row:1">${nome}<small>${orarioGiorno(i + 1)}</small></div>`));
    for (let r = 0; r < RIGHE; r++) {
      const ref = slot(1, r);
      out.push(`<div class="or-time" style="grid-column:1;grid-row:${r + 2}">${ref.da}–${ref.a}</div>`);
      for (let g = 1; g <= 5; g++) {
        const s = slot(g, r);
        if (s.tipo === "fuori") { out.push(`<div class="or-cell or-off" style="${pos(g, r)}" aria-hidden="true"></div>`); continue; }
        if (s.tipo === "pausa") { out.push(`<div class="or-cell or-pausa" style="${pos(g, r)}">Pausa pranzo</div>`); continue; }
        const e = copre(g, r);
        if (e && e.riga !== r) continue;   // casella già coperta da una voce di più ore
        if (!e) { out.push(`<button class="or-cell" style="${pos(g, r)}" data-g="${g}" data-r="${r}" type="button" aria-label="Aggiungi: ${GIORNI[g - 1]}, ${s.ora}ª ora, ${s.da}–${s.a}"><span class="plus">+</span></button>`); continue; }
        const n = Math.min(ore(e), maxOre(g, r, e)), dim = st.classe && e.classe !== st.classe;
        out.push(`<button class="or-cell full${dim ? " dim" : ""}${isNow(g, r, n) ? " now" : ""}" style="${pos(g, r, n)};--h:${hue(e.materia)}" data-g="${g}" data-r="${r}" type="button" aria-label="${esc(e.materia)}, ${GIORNI[g - 1]}, ${oraLabel(g, r, n)}">
          <b>${esc(e.materia)}</b>${sub(e) ? `<small>${esc(sub(e))}</small>` : ""}${n > 1 ? `<small>${n} ore · ${slot(g, r).da}–${slot(g, r + n - 1).a}</small>` : ""}</button>`);
      }
    }
    $("#or-grid").innerHTML = out.join("");
  }

  function drawToday() {
    const t = adesso(), g = t.g || 1;
    $("#or-today-title").textContent = t.g ? "Oggi" : GIORNI[0];
    $("#or-today-sub").textContent = t.g ? `${GIORNI[g - 1]} · ${orarioGiorno(g)}` : `Oggi non c'è scuola · prossimo giorno · ${orarioGiorno(1)}`;
    const rows = [];
    for (let r = 0; r < RIGHE; r++) {
      const s = slot(g, r);
      if (s.tipo === "fuori") continue;
      if (s.tipo === "pausa") { rows.push(`<li class="pausa"><span class="or-t">${s.da}<br>${s.a}</span><span>Pausa pranzo</span></li>`); continue; }
      const e = copre(g, r);
      if (e && e.riga !== r) continue;
      if (!e) { rows.push(`<li class="free"><span class="or-t">${s.da}<br>${s.a}</span><span>${s.ora}ª ora · libera</span></li>`); continue; }
      const n = Math.min(ore(e), maxOre(g, r, e));
      rows.push(`<li class="lez${isNow(g, r, n) ? " now" : ""}" style="--h:${hue(e.materia)}"><span class="or-t">${s.da}<br>${slot(g, r + n - 1).a}</span><span><b>${esc(e.materia)}</b>${sub(e) ? `<small>${esc(sub(e))}</small>` : ""}${n > 1 ? `<small class="or-ore">${oraLabel(g, r, n)}</small>` : ""}</span></li>`);
    }
    $("#or-today").innerHTML = rows.join("");
  }

  function drawMeta() {
    let tot = 0, fatte = 0;
    for (let g = 1; g <= 5; g++) for (let r = 0; r < RIGHE; r++) if (slot(g, r).tipo === "lezione") { tot++; if (copre(g, r)) fatte++; }
    $("#or-summary").textContent = `${tot} ore scolastiche a settimana · ${fatte} compilate`;
    const usate = [...new Set(orario.map(e => e.classe).filter(Boolean))].sort(byName), box = $("#or-classi");
    if (st.classe && !usate.includes(st.classe)) st.classe = "";
    box.hidden = usate.length < 2;
    box.innerHTML = usate.map(c => `<button class="chip-btn${st.classe === c ? " on" : ""}" data-cl="${esc(c)}" type="button">${esc(c)}</button>`).join("");
  }

  const render = () => { drawGrid(); drawToday(); drawMeta(); };

  /* ---------- Modifica ---------- */
  async function edit(g, r) {
    const s = slot(g, r), cur = copre(g, r), isNew = !cur;
    const e = cur || { id: Portal.uid(), giorno: g, riga: r, ore: 1, materia: "", classe: "", aula: "", note: "" };
    const materie = [...new Set(orario.map(x => x.materia).filter(Boolean))].sort(byName);
    const cls = [...new Set([...classi.map(c => c.nome), ...orario.map(x => x.classe)].filter(Boolean))].sort(byName);
    const max = Math.max(1, maxOre(g, r, cur));
    const durate = Array.from({ length: max }, (_, i) => [String(i + 1), i === 0 ? `1 ora (${s.da}–${s.a})` : `${i + 1} ore (${s.da}–${FASCE[r + i + 1]})`]);
    const res = await Portal.form({
      title: `${GIORNI[g - 1]} · ${s.ora}ª ora (${s.da}–${s.a})`, submit: isNew ? "Aggiungi" : "Salva", onDelete: !isNew,
      values: { ...e, ore: String(Math.min(ore(e), max)) },
      fields: [
        { name: "materia", label: "Materia", required: true, list: materie },
        { name: "classe", label: "Classe", half: true, list: cls, placeholder: "es. 2A" },
        { name: "aula", label: "Aula", half: true, placeholder: "es. 12, Lab. info" },
        { name: "ore", label: "Durata", type: "select", options: durate, hint: "Per un docente che resta più ore consecutive. Non si può superare la pausa pranzo né una voce già inserita." },
        { name: "note", label: "Note", type: "textarea", rows: 2 }
      ]
    });
    if (!res) return;
    if (res.__delete) { orario.splice(orario.indexOf(e), 1); await Portal.save("orario", orario); Portal.toast("Voce rimossa"); return render(); }
    Object.assign(e, { materia: res.materia.trim(), classe: (res.classe || "").trim(), aula: (res.aula || "").trim(), note: res.note || "", ore: Math.min(Math.max(1, +res.ore || 1), max) });
    if (isNew) orario.push(e);
    await Portal.save("orario", orario);
    render();
  }

  /* ---------- Export Excel (.xlsx senza librerie) ---------- */
  const xe = s => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const col = i => String.fromCharCode(65 + i);
  const hslHex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
    return (f(0) + f(8) + f(4)).toUpperCase();
  };
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zip(files) {   // archivio ZIP "store" (senza compressione), sufficiente per un xlsx piccolo
    const enc = new TextEncoder(), parts = [], cen = [], d = new Date();
    const dt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const [name, str] of files) {
      const nb = enc.encode(name), data = enc.encode(str), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const size = cen.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function buildXlsx() {
    /* Stili: 0 base · 1 intestazione · 2 orario · 3 pausa · 4 fuori orario · 5 cella con bordo · 6+ una per materia */
    const subjStyle = new Map(), fills = [];
    const styleOf = m => {
      const k = (m || "").toLowerCase();
      if (!subjStyle.has(k)) { subjStyle.set(k, 6 + fills.length); fills.push(hslHex(hue(m), 60, 88)); }
      return subjStyle.get(k);
    };
    const txt = (ref, s, v) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
    const num = (ref, s, v) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    const blank = (ref, s) => `<c r="${ref}" s="${s}"/>`;

    /* Foglio 1: griglia settimanale */
    const rows = [], merges = [];
    rows.push(`<row r="1" ht="34" customHeight="1">${txt("A1", 1, "Orario")}${GIORNI.map((n, i) => txt(col(i + 1) + 1, 1, n + "\n" + orarioGiorno(i + 1))).join("")}</row>`);
    for (let r = 0; r < RIGHE; r++) {
      const R = r + 2, ref = slot(1, r), cells = [txt("A" + R, 2, `${ref.da}–${ref.a}`)];
      for (let g = 1; g <= 5; g++) {
        const a = col(g) + R, s = slot(g, r);
        if (s.tipo === "fuori") { cells.push(blank(a, 4)); continue; }
        if (s.tipo === "pausa") { cells.push(txt(a, 3, "Pausa pranzo")); continue; }
        const e = copre(g, r);
        if (!e) { cells.push(blank(a, 5)); continue; }
        const n = Math.min(ore(e), maxOre(g, r, e)), sid = styleOf(e.materia);
        if (e.riga !== r) { cells.push(blank(a, sid)); continue; }
        const det = [sub(e), n > 1 ? `${n} ore` : ""].filter(Boolean).join(" · ");
        cells.push(`<c r="${a}" s="${sid}" t="inlineStr"><is><r><rPr><b/><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${xe(e.materia)}</t></r>${det ? `<r><rPr><sz val="10"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${xe("\n" + det)}</t></r>` : ""}</is></c>`);
        if (n > 1) merges.push(`${a}:${col(g)}${R + n - 1}`);
      }
      rows.push(`<row r="${R}" ht="42" customHeight="1">${cells.join("")}</row>`);
    }
    const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="6" width="24" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;

    /* Foglio 2: elenco filtrabile */
    const lista = [...orario].sort((a, b) => a.giorno - b.giorno || a.riga - b.riga);
    const head = ["Giorno", "Dalle", "Alle", "Ore", "Materia", "Classe", "Aula", "Note"];
    const rows2 = [`<row r="1">${head.map((h, i) => txt(col(i) + 1, 1, h)).join("")}</row>`];
    lista.forEach((e, i) => {
      const R = i + 2, n = Math.min(ore(e), maxOre(e.giorno, e.riga, e));
      rows2.push(`<row r="${R}">${[GIORNI[e.giorno - 1], slot(e.giorno, e.riga).da, slot(e.giorno, e.riga + n - 1).a].map((v, k) => txt(col(k) + R, 5, v)).join("")}${num("D" + R, 5, n)}${[e.materia, e.classe, e.aula, e.note].map((v, k) => txt(col(k + 4) + R, 5, v)).join("")}</row>`);
    });
    const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="4" width="8" customWidth="1"/><col min="5" max="5" width="26" customWidth="1"/><col min="6" max="7" width="14" customWidth="1"/><col min="8" max="8" width="40" customWidth="1"/></cols><sheetData>${rows2.join("")}</sheetData><autoFilter ref="A1:H${Math.max(2, lista.length + 1)}"/></worksheet>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts>
<fills count="${5 + fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7E2D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>${fills.map(h => `<fill><patternFill patternType="solid"><fgColor rgb="FF${h}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${6 + fills.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>${fills.map((_, i) => `<xf numFmtId="0" fontId="0" fillId="${5 + i}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>`).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    const NS = "http://schemas.openxmlformats.org/", R = NS + "officeDocument/2006/relationships", PR = NS + "package/2006/relationships";
    return zip([
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${R}"><sheets><sheet name="Orario" sheetId="1" r:id="rId1"/><sheet name="Elenco" sheetId="2" r:id="rId2"/></sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", styles],
      ["xl/worksheets/sheet1.xml", sheet1],
      ["xl/worksheets/sheet2.xml", sheet2]
    ]);
  }

  function scaricaExcel() {
    try {
      const url = URL.createObjectURL(buildXlsx()), a = document.createElement("a");
      a.href = url; a.download = "orario-scolastico.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      Portal.toast("File Excel scaricato");
    } catch (err) { Portal.toast(err.message || "Impossibile creare il file Excel"); }
  }

  /* ---------- Eventi ---------- */
  $("#or-grid").addEventListener("click", e => {
    const b = e.target.closest("[data-g]");
    if (b) edit(+b.dataset.g, +b.dataset.r);
  });
  $("#or-classi").addEventListener("click", e => {
    const b = e.target.closest("[data-cl]");
    if (b) { st.classe = st.classe === b.dataset.cl ? "" : b.dataset.cl; render(); }
  });
  $("#or-xlsx").onclick = scaricaExcel;
  $("#or-clear").onclick = async () => {
    if (!orario.length) return Portal.toast("L'orario è già vuoto");
    if (!confirm("Svuotare tutto l'orario? L'operazione non si può annullare.")) return;
    orario.length = 0;
    await Portal.save("orario", orario);
    Portal.toast("Orario svuotato");
    render();
  };

  // Dati vecchi o incompleti: garantisce i tipi che il resto del codice si aspetta
  const fino = (g, r) => { let n = 0; while (r + n < RIGHE && slot(g, r + n).tipo === "lezione") n++; return n; };
  orario.forEach(e => { e.giorno = +e.giorno; e.riga = +e.riga; e.ore = Math.max(1, Math.min(ore(e), fino(e.giorno, e.riga))); });
  render();
  setInterval(render, 60000);   // aggiorna l'evidenziazione dell'ora corrente
})();
