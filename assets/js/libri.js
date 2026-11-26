/* Jones House · Catalogo online (OPAC) — ricerca semplice/avanzata, faccette, elenco/copertine, scheda bibliografica, prestiti */
(async () => {
  const libri = await Portal.load("libri", []);
  const STATI = ["Disponibile", "In prestito", "Da leggere", "Letto"];
  let lastBib = libri.length ? libri[libri.length - 1].biblioteca || "" : "";

  /* ---------- utilità ---------- */
  const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const soggetti = l => String(l.soggetti || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const decennio = l => { const a = parseInt(l.anno, 10); return a > 0 ? Math.floor(a / 10) * 10 : null; };
  const oggi = () => new Date().toISOString().slice(0, 10);
  const scaduto = l => l.stato === "In prestito" && l.scadenza && l.scadenza < oggi();
  const statoOpac = l => l.stato === "In prestito" ? (scaduto(l) ? "Scaduto" : "In prestito") : (l.stato || "Disponibile");
  const dot = l => ({ "Disponibile": "ok", "In prestito": "out", "Scaduto": "late", "Da leggere": "wait", "Letto": "done" }[statoOpac(l)] || "ok");
  const it = iso => iso ? fmtDate(iso, { day: "numeric", month: "short", year: "numeric" }) : "";

  /* ---------- stato della ricerca ---------- */
  const S = { mode: "semplice", q: "", campo: "tutto", adv: {}, sort: "rilevanza", per: 20, page: 1, vista: "lista", f: {} };
  try { const u = JSON.parse(localStorage.getItem("gj-opac-ui") || "{}"); if (u.vista) S.vista = u.vista; if (u.per) S.per = u.per; } catch { /* predefiniti */ }
  const saveUi = () => { try { localStorage.setItem("gj-opac-ui", JSON.stringify({ vista: S.vista, per: S.per })); } catch { /* niente */ } };

  const FACETS = [
    ["stato", "Disponibilità", l => [statoOpac(l)]],
    ["biblioteca", "Biblioteca", l => l.biblioteca ? [l.biblioteca] : []],
    ["autore", "Autore", l => l.autore ? [l.autore] : []],
    ["soggetto", "Soggetto", l => soggetti(l)],
    ["decennio", "Anno di pubblicazione", l => decennio(l) ? [decennio(l) + "–" + (decennio(l) + 9)] : []],
    ["editore", "Editore", l => l.editore ? [l.editore] : []]
  ];

  /* ---------- ricerca ---------- */
  const campiTesto = { titolo: l => l.titolo, autore: l => l.autore, soggetti: l => l.soggetti, isbn: l => (l.isbn || "").replace(/-/g, ""), editore: l => l.editore, tutto: l => [l.titolo, l.autore, l.soggetti, (l.isbn || "").replace(/-/g, ""), l.editore, l.descrizione, l.collocazione].join(" ") };
  const terms = q => norm(q).replace(/-/g, "").split(/\s+/).filter(Boolean);
  const contiene = (hay, ts) => { const h = norm(hay); return ts.every(t => h.includes(t)); };

  const matchQuery = l => {
    if (S.mode === "semplice") return !S.q.trim() || contiene(campiTesto[S.campo](l), terms(S.q));
    const a = S.adv;
    for (const k of ["titolo", "autore", "soggetti", "isbn", "editore"]) if (a[k] && !contiene(campiTesto[k](l), terms(a[k]))) return false;
    const an = parseInt(l.anno, 10) || 0;
    if (a.da && an < +a.da) return false;
    if (a.a && (!an || an > +a.a)) return false;
    if (a.bib && l.biblioteca !== a.bib) return false;
    return true;
  };
  const matchFacet = (l, skip) => FACETS.every(([k, , get]) => k === skip || !S.f[k] || get(l).includes(S.f[k]));
  const risultati = skip => libri.filter(l => matchQuery(l) && matchFacet(l, skip));

  const rilevanza = l => {
    if (S.mode !== "semplice" || !S.q.trim()) return 0;
    const ts = terms(S.q), t = norm(l.titolo), a = norm(l.autore);
    let r = 0;
    ts.forEach(x => { if (t.startsWith(x)) r += 6; else if (t.includes(x)) r += 4; if (a.includes(x)) r += 3; if (norm(l.soggetti).includes(x)) r += 2; });
    return r;
  };
  const cmpTit = (a, b) => (a.titolo || "").localeCompare(b.titolo || "", "it");
  const ordina = arr => {
    const s = S.sort;
    return arr.sort((a, b) =>
      s === "titolo" ? cmpTit(a, b) :
      s === "autore" ? (a.autore || "￿").localeCompare(b.autore || "￿", "it") || cmpTit(a, b) :
      s === "anno-desc" ? (parseInt(b.anno, 10) || 0) - (parseInt(a.anno, 10) || 0) || cmpTit(a, b) :
      s === "anno-asc" ? (parseInt(a.anno, 10) || 9999) - (parseInt(b.anno, 10) || 9999) || cmpTit(a, b) :
      s === "aggiunto" ? (b.aggiunto || "").localeCompare(a.aggiunto || "") :
      rilevanza(b) - rilevanza(a) || cmpTit(a, b));
  };

  /* ---------- disegno ---------- */
  const cover = (l, cls = "") => l.copertina
    ? `<img class="${cls}" src="${esc(safeUrl(l.copertina))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="nocover ${cls}">${esc(l.titolo)}</div>`;
  const avail = l => `<span class="av av-${dot(l)}"><i></i>${esc(statoOpac(l))}</span>`;

  const riga = l => `<article class="op-rec" data-id="${l.id}">
    <button class="op-cov" data-open="${l.id}" aria-label="Apri la scheda di ${esc(l.titolo)}">${cover(l)}</button>
    <div class="op-main">
      <h3><a href="#" data-open="${l.id}">${esc(l.titolo || "Senza titolo")}</a></h3>
      <p class="op-au">${l.autore ? `<a href="#" data-facet="autore" data-v="${esc(l.autore)}">${esc(l.autore)}</a>` : "<i>Autore non indicato</i>"}</p>
      <p class="op-pub">${[l.editore, l.anno].filter(Boolean).map(esc).join(", ")}${l.pagine ? ` · ${esc(l.pagine)} p.` : ""}</p>
      <dl class="op-meta">
        ${l.isbn ? `<div><dt>ISBN</dt><dd>${esc(l.isbn)}</dd></div>` : ""}
        ${l.collocazione ? `<div><dt>Collocazione</dt><dd>${esc(l.collocazione)}</dd></div>` : ""}
        ${l.biblioteca ? `<div><dt>Biblioteca</dt><dd>${esc(l.biblioteca)}</dd></div>` : ""}
      </dl>
      ${soggetti(l).length ? `<p class="op-sub">${soggetti(l).slice(0, 4).map(s => `<a href="#" data-facet="soggetto" data-v="${esc(s)}">${esc(s)}</a>`).join("")}</p>` : ""}
    </div>
    <div class="op-side">${avail(l)}${l.stato === "In prestito" && l.scadenza ? `<small>${scaduto(l) ? "Scaduto il" : "Rientro entro il"} ${esc(it(l.scadenza))}${l.prestatoA ? `<br>a ${esc(l.prestatoA)}` : ""}</small>` : ""}
      <button class="btn ghost sm" data-open="${l.id}">Scheda</button></div>
  </article>`;

  const cella = l => `<button class="op-tile" data-open="${l.id}"><div class="op-tc">${cover(l)}</div><b>${esc(l.titolo)}</b><small>${esc(l.autore || "Autore non indicato")}</small>${avail(l)}</button>`;

  const kpi = () => {
    const n = libri.length, out = libri.filter(l => l.stato === "In prestito").length, late = libri.filter(scaduto).length;
    const bibs = new Set(libri.map(l => l.biblioteca).filter(Boolean)).size;
    $("#op-kpi").innerHTML = [[n, "Titoli in catalogo"], [libri.filter(l => !l.stato || l.stato === "Disponibile").length, "Disponibili"], [out, "In prestito"], [late, "Prestiti scaduti", late ? "warn" : ""], [bibs || 1, bibs === 1 ? "Biblioteca" : "Biblioteche"]]
      .map(([v, t, c = ""]) => `<div class="kp ${c}"><b>${v}</b><span>${t}</span></div>`).join("");
  };

  const facets = () => {
    const html = FACETS.map(([k, titolo, get]) => {
      const base = risultati(k), cnt = new Map();
      base.forEach(l => get(l).forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1)));
      let voci = [...cnt.entries()];
      voci = k === "decennio" ? voci.sort((a, b) => b[0].localeCompare(a[0])) : voci.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"));
      if (k === "stato") voci.sort((a, b) => ["Disponibile", "In prestito", "Scaduto", "Da leggere", "Letto"].indexOf(a[0]) - ["Disponibile", "In prestito", "Scaduto", "Da leggere", "Letto"].indexOf(b[0]));
      if (S.f[k] && !cnt.has(S.f[k])) voci.unshift([S.f[k], 0]);
      if (!voci.length) return "";
      const tutte = voci.length, mostra = k === "stato" || k === "biblioteca" ? voci : voci.slice(0, 8);
      return `<details class="fc" open><summary>${titolo}</summary><ul>${mostra.map(([v, n]) =>
        `<li><button type="button" data-facet="${k}" data-v="${esc(v)}" class="${S.f[k] === v ? "on" : ""}"><span>${esc(v)}</span><i>${n}</i></button></li>`).join("")}</ul>${tutte > mostra.length ? `<small class="muted">+ altri ${tutte - mostra.length} (restringi la ricerca)</small>` : ""}</details>`;
    }).join("");
    $("#op-facets").innerHTML = `<h2>Raffina la ricerca</h2>` + (html || `<p class="muted">Nessun filtro disponibile.</p>`);
  };

  const render = () => {
    kpi();
    const tutti = ordina(risultati());
    const per = S.per, pagine = Math.max(1, Math.ceil(tutti.length / per));
    S.page = Math.min(S.page, pagine);
    const da = (S.page - 1) * per, fetta = tutti.slice(da, da + per);

    const ricerca = S.mode === "semplice" ? S.q.trim() : Object.values(S.adv).filter(Boolean).length ? "ricerca avanzata" : "";
    $("#op-count").innerHTML = libri.length
      ? (tutti.length ? `<b>${da + 1}–${da + fetta.length}</b> di <b>${tutti.length}</b> ${tutti.length === 1 ? "risultato" : "risultati"}${ricerca ? ` per <em>${esc(ricerca)}</em>` : ""}` : `Nessun risultato${ricerca ? ` per <em>${esc(ricerca)}</em>` : ""}`)
      : "";

    $("#op-chosen").innerHTML = Object.entries(S.f).filter(([, v]) => v).map(([k, v]) => `<button class="op-chip" data-unfacet="${k}">${esc(FACETS.find(f => f[0] === k)[1])}: <b>${esc(v)}</b> ×</button>`).join("");

    const vuoto = $("#op-none");
    vuoto.hidden = tutti.length > 0;
    if (!tutti.length) vuoto.innerHTML = libri.length
      ? `<h3>Nessun risultato</h3>Prova con meno parole, controlla l'ortografia o togli qualche filtro.<br><button class="btn ghost sm" id="op-clear" style="margin-top:14px">Azzera la ricerca</button>`
      : `<h3>Il catalogo è vuoto</h3>Apri «+ Catalogazione» e incolla il link o l'ISBN di un libro per cominciare.`;

    $("#op-list").className = S.vista === "copertine" ? "op-tiles" : "op-recs";
    $("#op-list").innerHTML = fetta.map(S.vista === "copertine" ? cella : riga).join("");
    $$(".jseg [data-vista]").forEach(b => b.setAttribute("aria-pressed", b.dataset.vista === S.vista));

    const pg = [];
    if (pagine > 1) {
      const add = (n, t = n, cls = "") => pg.push(`<button type="button" class="${cls}" data-page="${n}"${n === S.page ? ' aria-current="page"' : ""}>${t}</button>`);
      add(S.page - 1, "‹ Precedente", S.page === 1 ? "dis" : "");
      const set = new Set([1, pagine, S.page - 1, S.page, S.page + 1]);
      let prev = 0;
      [...set].filter(n => n >= 1 && n <= pagine).sort((a, b) => a - b).forEach(n => { if (n - prev > 1) pg.push("<span>…</span>"); add(n, n, n === S.page ? "on" : ""); prev = n; });
      add(S.page + 1, "Successiva ›", S.page === pagine ? "dis" : "");
    }
    $("#op-pager").innerHTML = pg.join("");
    facets();
  };

  /* ---------- scheda bibliografica ---------- */
  const dlg = document.createElement("dialog");
  dlg.className = "modal op-dlg";
  document.body.append(dlg);
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

  const citazione = l => [l.autore, l.titolo, [l.editore, l.anno].filter(Boolean).join(", "), l.isbn ? "ISBN " + l.isbn : ""].filter(Boolean).join(". ") + ".";

  const scheda = id => {
    const l = libri.find(x => x.id === id);
    if (!l) return;
    const riga = (k, v) => v ? `<tr><th scope="row">${k}</th><td>${v}</td></tr>` : "";
    const sub = soggetti(l).map(s => `<a href="#" data-facet="soggetto" data-v="${esc(s)}">${esc(s)}</a>`).join(" · ");
    dlg.innerHTML = `<div class="op-card">
      <header><div><small>Scheda bibliografica</small><h2>${esc(l.titolo || "Senza titolo")}</h2>${l.autore ? `<p class="op-au">${esc(l.autore)}</p>` : ""}</div><button class="x" data-close aria-label="Chiudi">×</button></header>
      <div class="op-card-body">
        <div class="op-card-cov">${cover(l)}</div>
        <div class="op-card-info">
          <table class="op-tab"><tbody>
            ${riga("Titolo", esc(l.titolo))}${riga("Autore", esc(l.autore))}
            ${riga("Pubblicazione", [l.editore, l.anno].filter(Boolean).map(esc).join(", "))}
            ${riga("Descrizione fisica", l.pagine ? esc(l.pagine) + " pagine" : "")}
            ${riga("ISBN", esc(l.isbn))}${riga("Lingua", esc(l.lingua))}${riga("Soggetti", sub)}
            ${riga("Abstract", esc(l.descrizione))}${riga("Note", esc(l.note))}
            ${riga("Fonte", l.url ? `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(host(l.url) || l.url)}</a>` : "")}
          </tbody></table>
          <h3>Copie e disponibilità</h3>
          <table class="op-copies"><thead><tr><th>Biblioteca</th><th>Collocazione</th><th>Stato</th><th>Note di prestito</th></tr></thead>
            <tbody><tr><td>${esc(l.biblioteca || "—")}</td><td>${esc(l.collocazione || "—")}</td><td>${avail(l)}</td>
            <td>${l.stato === "In prestito" ? `${l.prestatoA ? "A " + esc(l.prestatoA) + "<br>" : ""}${l.scadenza ? (scaduto(l) ? "<b>Scaduto il " : "Entro il ") + esc(it(l.scadenza)) + (scaduto(l) ? "</b>" : "") : "Senza scadenza"}` : "—"}</td></tr></tbody></table>
        </div>
      </div>
      <footer>
        ${l.stato === "In prestito" ? `<button class="btn go" data-act="rientro" data-id="${l.id}">Registra il rientro</button>` : `<button class="btn go" data-act="presta" data-id="${l.id}">Presta</button>`}
        <button class="btn ghost" data-act="modifica" data-id="${l.id}">Modifica scheda</button>
        <button class="btn ghost" data-act="cita" data-id="${l.id}">Copia citazione</button>
        <button class="btn ghost" data-act="stampa" data-id="${l.id}">Stampa</button>
        <span class="sp"></span><button class="btn ghost" data-close>Chiudi</button>
      </footer></div>`;
    if (!dlg.open) dlg.showModal();
  };

  /* ---------- modifica / prestito ---------- */
  const fill = m => ({ url: m.url, titolo: m.title, autore: m.author, isbn: m.isbn, editore: m.publisher, anno: m.year, pagine: m.pages, copertina: m.cover, descrizione: m.description });
  const fields = () => [
    { name: "url", label: "Link del libro", type: "url", autorun: true, hint: "Negozio online, catalogo o scheda del libro. Premi «Estrai info» per compilare i campi.", action: { label: "Estrai info", run: async v => fill(await Portal.meta(v)) } },
    { name: "titolo", label: "Titolo", required: true },
    { name: "autore", label: "Autore" },
    { name: "isbn", label: "ISBN", half: true },
    { name: "anno", label: "Anno", type: "number", min: 0, half: true },
    { name: "editore", label: "Editore", half: true },
    { name: "pagine", label: "Pagine", type: "number", min: 0, half: true },
    { name: "soggetti", label: "Soggetti (separati da virgola)", hint: "Es.: Storia, Biografie, Narrativa italiana. Servono per il filtro «Soggetto».", half: true },
    { name: "lingua", label: "Lingua", half: true },
    { name: "copertina", label: "Copertina (indirizzo immagine)", type: "url" },
    { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 },
    { name: "biblioteca", label: "Biblioteca o amministrazione", list: [...new Set(libri.map(l => l.biblioteca).filter(Boolean))], half: true },
    { name: "collocazione", label: "Collocazione (scaffale)", half: true },
    { name: "stato", label: "Stato", type: "select", options: STATI, half: true },
    { name: "note", label: "Note", type: "textarea", rows: 2 }
  ];

  const modifica = async (item, isNew) => {
    const res = await Portal.form({ title: isNew ? "Nuovo libro" : "Modifica scheda", fields: fields(), values: item, onDelete: !isNew, submit: isNew ? "Aggiungi al catalogo" : "Salva" });
    if (!res) return;
    if (res.__delete) { await Portal.remove("libri", item.id); Portal.toast("Libro eliminato"); }
    else {
      const next = { ...item, ...res, url: res.url ? normUrl(res.url) : "" };
      if (isNew && next.isbn && libri.some(l => l.isbn && l.isbn === next.isbn) && !confirm("Un libro con questo ISBN è già in catalogo. Aggiungerlo comunque?")) return;
      lastBib = next.biblioteca || lastBib;
      await Portal.upsert("libri", next);
      if (isNew) { Portal.toast("Libro aggiunto"); }
    }
    render();
  };

  const presta = async l => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    const res = await Portal.form({
      title: "Registra un prestito", submit: "Presta", values: { prestatoA: l.prestatoA || "", scadenza: l.scadenza || d.toISOString().slice(0, 10) },
      fields: [{ name: "prestatoA", label: "A chi lo presti", required: true }, { name: "scadenza", label: "Da restituire entro", type: "date" }]
    });
    if (!res) return;
    Object.assign(l, { stato: "In prestito", prestatoA: res.prestatoA, scadenza: res.scadenza || "", dataPrestito: oggi() });
    await Portal.upsert("libri", l);
    Portal.toast("Prestito registrato");
    render(); scheda(l.id);
  };
  const rientro = async l => {
    Object.assign(l, { stato: "Disponibile", prestatoA: "", scadenza: "", dataPrestito: "" });
    await Portal.upsert("libri", l);
    Portal.toast("Rientro registrato");
    render(); scheda(l.id);
  };

  const stampa = l => {
    const w = window.open("", "_blank");
    if (!w) { Portal.toast("Consenti le finestre popup per stampare"); return; }
    const r = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "";
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(l.titolo)}</title><style>body{font:15px/1.5 Georgia,serif;max-width:700px;margin:40px auto;color:#000}h1{font:800 30px Arial Narrow,Arial,sans-serif;text-transform:uppercase;border-bottom:6px solid #ffd400;padding-bottom:8px}th{text-align:left;width:160px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding:6px 0}td{padding:6px 0;border-bottom:1px solid #ddd}table{width:100%;border-collapse:collapse}small{font-family:Arial,sans-serif;color:#555}</style>
      <small>Jones House · Catalogo online</small><h1>${esc(l.titolo)}</h1><table>${r("Autore", l.autore)}${r("Pubblicazione", [l.editore, l.anno].filter(Boolean).join(", "))}${r("Pagine", l.pagine)}${r("ISBN", l.isbn)}${r("Soggetti", l.soggetti)}${r("Biblioteca", l.biblioteca)}${r("Collocazione", l.collocazione)}${r("Stato", statoOpac(l))}${r("Abstract", l.descrizione)}</table><script>onload=()=>print()<\/script>`);
    w.document.close();
  };

  /* ---------- eventi ---------- */
  const vai = () => { S.page = 1; render(); };
  const impostaModo = m => {
    S.mode = m;
    $$(".op-tabs [data-mode]").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === m));
    $("#op-simple").hidden = m !== "semplice";
    $("#op-adv").hidden = m !== "avanzata";
  };
  $$(".op-tabs [data-mode]").forEach(b => b.onclick = () => { impostaModo(b.dataset.mode); vai(); });
  $("#op-simple").onsubmit = e => { e.preventDefault(); S.q = $("#op-q").value; S.campo = $("#op-campo").value; vai(); };
  $("#op-q").addEventListener("input", () => { S.q = $("#op-q").value; S.campo = $("#op-campo").value; vai(); });
  $("#op-campo").onchange = () => { S.campo = $("#op-campo").value; vai(); };
  $("#op-reset").onclick = () => { S.q = ""; S.f = {}; $("#op-q").value = ""; $("#op-campo").value = "tutto"; S.campo = "tutto"; vai(); };
  $("#op-adv").onsubmit = e => {
    e.preventDefault();
    S.adv = { titolo: $("#a-titolo").value, autore: $("#a-autore").value, soggetti: $("#a-soggetti").value, isbn: $("#a-isbn").value, editore: $("#a-editore").value, da: $("#a-da").value, a: $("#a-a").value, bib: $("#a-bib").value };
    vai();
  };
  $("#op-adv-reset").onclick = () => { $("#op-adv").reset(); S.adv = {}; S.f = {}; vai(); };
  const bibOpts = () => { const b = [...new Set(libri.map(l => l.biblioteca).filter(Boolean))].sort(); $("#a-bib").innerHTML = `<option value="">Tutte</option>` + b.map(x => `<option>${esc(x)}</option>`).join(""); };
  bibOpts();

  $("#op-sort").onchange = e => { S.sort = e.target.value; vai(); };
  $("#op-per").value = String(S.per);
  $("#op-per").onchange = e => { S.per = +e.target.value; saveUi(); vai(); };
  $$(".jseg [data-vista]").forEach(b => b.onclick = () => { S.vista = b.dataset.vista; saveUi(); render(); });

  document.addEventListener("click", e => {
    const f = e.target.closest("[data-facet]");
    if (f) { e.preventDefault(); const k = f.dataset.facet; S.f[k] = S.f[k] === f.dataset.v ? "" : f.dataset.v; if (dlg.open) dlg.close(); vai(); scrollTo({ top: $(".op-body").offsetTop - 120 }); return; }
    const u = e.target.closest("[data-unfacet]");
    if (u) { S.f[u.dataset.unfacet] = ""; vai(); return; }
    const o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); scheda(o.dataset.open); return; }
    const p = e.target.closest("[data-page]");
    if (p && !p.classList.contains("dis")) { S.page = +p.dataset.page; render(); scrollTo({ top: $(".op-body").offsetTop - 120 }); return; }
    if (e.target.id === "op-clear") { S.q = ""; S.adv = {}; S.f = {}; $("#op-q").value = ""; $("#op-adv").reset(); vai(); return; }
    if (e.target.closest("[data-close]")) { dlg.close(); return; }
    const a = e.target.closest("[data-act]");
    if (a && dlg.contains(a)) {
      const l = libri.find(x => x.id === a.dataset.id);
      if (!l) return;
      if (a.dataset.act === "modifica") { dlg.close(); modifica(l, false); }
      if (a.dataset.act === "presta") presta(l);
      if (a.dataset.act === "rientro") rientro(l);
      if (a.dataset.act === "stampa") stampa(l);
      if (a.dataset.act === "cita") { navigator.clipboard.writeText(citazione(l)).then(() => Portal.toast("Citazione copiata"), () => Portal.toast(citazione(l))); }
    }
  });
  $("#op-list").addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.outerHTML = `<div class="nocover">${esc(e.target.closest("[data-open]")?.getAttribute("aria-label")?.replace("Apri la scheda di ", "") || "")}</div>`; }, true);

  /* catalogazione */
  $("#op-add-toggle").onclick = e => { const h = $("#op-new").hidden = !$("#op-new").hidden; e.currentTarget.setAttribute("aria-expanded", String(!h)); if (!h) $("#op-link").focus(); };
  $("#op-manual").onclick = () => modifica({ id: Portal.uid(), biblioteca: lastBib, stato: "Disponibile", aggiunto: new Date().toISOString() }, true).then(bibOpts);
  $("#op-new").onsubmit = async e => {
    e.preventDefault();
    const input = $("#op-link"), btn = $("button[type=submit]", e.target), v = input.value.trim();
    if (!v) return;
    btn.disabled = true; btn.textContent = "Leggo…";
    const isIsbn = /^[0-9Xx-]{10,17}$/.test(v);
    let item = { id: Portal.uid(), url: isIsbn ? "" : normUrl(v), isbn: isIsbn ? v : "", biblioteca: lastBib, stato: "Disponibile", aggiunto: new Date().toISOString() };
    try { item = { ...item, ...fill(await Portal.meta(v)), biblioteca: lastBib, stato: "Disponibile" }; }
    catch (err) { Portal.toast(err.message + ". Compila a mano i dati."); }
    btn.disabled = false; btn.textContent = "Cataloga";
    input.value = "";
    await modifica(item, true);
    bibOpts();
  };

  render();
})();
