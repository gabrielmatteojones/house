/* Jones Calendar · interfaccia. Usa core.js (Portal, esc, $, …) e calendar-lib.js (CalLib). */
(() => {
  const L = CalLib;
  const HH = 48; // altezza di un'ora nella griglia, in px (deve coincidere con --hh)
  const COLORI = [["navy", "Blu"], ["red", "Rosso"], ["green", "Verde"], ["amber", "Ambra"], ["violet", "Viola"], ["teal", "Turchese"]];
  const RIPETI = [["no", "Non si ripete"], ["giornaliera", "Ogni giorno"], ["settimanale", "Ogni settimana"], ["mensile", "Ogni mese"], ["annuale", "Ogni anno"]];
  /* Livelli del calendario: ognuno si accende e si spegne. Lezioni, timbrature e orario arrivano da altre parti del portale e qui si leggono soltanto. */
  const LIVELLI = [["eventi", "Eventi", "navy"], ["lezioni", "Lezioni", "violet"], ["timbrature", "Timbrature", "teal"], ["orario", "Orario di scuola", "amber"], ["fest", "Festività", "red"]];
  const FASCE = ["08:40", "09:40", "10:40", "11:40", "12:40", "13:40", "14:40", "15:40", "16:40"];   // come in plugins/orario
  const LS_PCACHE = "gj-presenze:cache", LS_PCODA = "gj-presenze:coda";
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const VISTE = ["giorno", "settimana", "mese", "agenda"];
  const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  const LS = "gj-cal:";
  const ls = { get: k => { try { return localStorage.getItem(LS + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(LS + k, v); } catch { /* non disponibile */ } } };
  const piccolo = () => matchMedia("(max-width:760px)").matches;

  const oggi = () => isoDate(new Date());
  const S = {
    eventi: [],
    vista: VISTE.includes(ls.get("vista")) ? ls.get("vista") : (piccolo() ? "agenda" : "mese"),
    cur: oggi(),
    q: "",
    lezioni: [], giochi: [], orario: [], virt: {},
    presCache: {}, presCoda: {}, presFatti: new Set(),
    liv: Object.fromEntries(LIVELLI.map(l => [l[0], ls.get("liv-" + l[0]) !== "0"])),
    get fest() { return this.liv.fest; }
  };

  const view = $("#c-view");
  const fmt = (iso, o) => L.D(iso).toLocaleDateString("it-IT", o);

  /* ---------- Dati ---------- */
  const mesiDi = (da, a) => { const m = []; for (let d = da.slice(0, 7); d <= a.slice(0, 7);) { m.push(d); d = isoDate(new Date(+d.slice(0, 4), +d.slice(5, 7), 1, 12)).slice(0, 7); } return m; };
  const presenze = () => {
    const m = new Map();
    const metti = r => { const o = m.get(r.id); if (!o || r.modificato >= o.modificato) m.set(r.id, r); };
    Object.values(S.presCache).forEach(l => l.forEach(metti));
    Object.values(S.presCoda).forEach(metti);
    return [...m.values()].filter(r => !r.eliminato && r.entrata);
  };
  async function serviMesi(mesi) {   // scarica in silenzio i mesi che mancano, poi ridisegna
    const mancano = mesi.filter(mo => !S.presFatti.has(mo));
    if (!mancano.length) return;
    mancano.forEach(mo => S.presFatti.add(mo));
    let nuovi = false;
    await Promise.all(mancano.map(async mo => {
      try {
        const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
        if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw 0;
        S.presCache[mo] = (await r.json()).registrazioni || []; nuovi = true;
      } catch { /* senza rete restano i dati già in cache */ }
    }));
    if (nuovi && S.liv.timbrature) disegna();
  }
  const durataTxt = ms => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };

  /* Eventi «virtuali» presi da lezioni, timbrature e orario: stessa forma degli eventi, con ro = da dove vengono */
  function virtuali(da, a) {
    S.virt = {};
    const out = [], add = ev => { S.virt[ev.id] = ev; out.push(ev); };
    const largo = L.diffDays(da, a) > 120;   // nella ricerca su anni interi niente orario e timbrature
    if (S.liv.lezioni) S.lezioni.filter(l => l.data >= da && l.data <= a).forEach(l => add({
      id: "lez:" + l.id, ro: "lezione", rid: l.id, titolo: l.titolo, data: l.data, tutto: !l.inizio, inizio: l.inizio || "", fine: l.fine || "",
      luogo: l.luogo || "", note: l.descrizione || "", colore: "violet", ripeti: "no" }));
    if (S.liv.timbrature && !largo) {
      serviMesi(mesiDi(da, a));
      presenze().forEach(r => {
        const e = new Date(r.entrata), d = isoDate(e);
        if (d < da || d > a) return;
        const u = r.uscita ? new Date(r.uscita) : null;
        const fine = u ? (isoDate(u) === d ? hhmm(u) : "23:59") : (d === oggi() ? hhmm(new Date()) : "");
        add({ id: "tim:" + r.id, ro: "timbrata", titolo: `${r.luogo || "Timbrata"}${u ? "" : " · in corso"}`, data: d, tutto: false, inizio: hhmm(e), fine: fine > hhmm(e) ? fine : "",
          luogo: "", note: "", colore: "teal", ripeti: "no",
          dettaglio: `${r.luogo}: ${hhmm(e)}${u ? "–" + hhmm(u) + " · " + durataTxt(u - e) : " · in corso"}${r.note ? " · " + r.note : ""}` });
      });
    }
    if (S.liv.orario && !largo && S.orario.length) {
      const fest = L.festivita(da, a);
      for (let d = da; d <= a; d = L.addDays(d, 1)) {
        const dow = L.D(d).getDay();
        if (dow < 1 || dow > 5 || fest[d]) continue;
        S.orario.filter(e => +e.giorno === dow && FASCE[e.riga] && FASCE[e.riga + Math.max(1, +e.ore || 1)]).forEach(e => add({
          id: `ori:${e.giorno}:${e.riga}:${d}`, ro: "orario", titolo: e.materia || "Lezione", data: d, tutto: false, inizio: FASCE[e.riga], fine: FASCE[e.riga + Math.max(1, +e.ore || 1)],
          luogo: [e.classe, e.aula && "aula " + e.aula].filter(Boolean).join(" · "), note: "", colore: "amber", ripeti: "no" }));
      }
    }
    return out;
  }
  const visibili = (da, a) => {
    const q = S.q.trim().toLowerCase();
    const tutti = (S.liv.eventi ? S.eventi : []).concat(virtuali(da, a));
    return q ? tutti.filter(e => [e.titolo, e.luogo, e.note].join(" ").toLowerCase().includes(q)) : tutti;
  };
  const colore = e => (COLORI.some(c => c[0] === e.colore) ? e.colore : "navy");
  const ora = e => (e.tutto || !e.inizio ? "" : e.inizio);

  /* ---------- Intestazione e navigazione ---------- */
  function titolo() {
    if (S.vista === "mese") return fmt(S.cur, { month: "long", year: "numeric" });
    if (S.vista === "giorno") return fmt(S.cur, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (S.vista === "agenda") return S.q.trim() ? "Risultati della ricerca" : "Prossimi eventi";
    const a = L.weekStart(S.cur), b = L.addDays(a, 6);
    const da = L.D(a), db = L.D(b);
    if (da.getMonth() === db.getMonth()) return `${da.getDate()} – ${db.getDate()} ${fmt(b, { month: "long", year: "numeric" })}`;
    if (da.getFullYear() === db.getFullYear()) return `${da.getDate()} ${fmt(a, { month: "short" })} – ${db.getDate()} ${fmt(b, { month: "short", year: "numeric" })}`;
    return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  function sposta(dir) {
    const d = L.D(S.cur);
    if (S.vista === "giorno") S.cur = L.addDays(S.cur, dir);
    else if (S.vista === "settimana") S.cur = L.addDays(S.cur, 7 * dir);
    else if (S.vista === "agenda") S.cur = L.addDays(S.cur, 30 * dir);
    else S.cur = isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1, 12));
    disegna();
  }

  function vai(vista, giorno) {
    if (giorno) S.cur = giorno;
    if (vista) { S.vista = vista; ls.set("vista", vista); }
    disegna();
  }

  /* ---------- Pezzi di HTML ---------- */
  const chip = (o, solido = false) => {
    const e = o.ev, t = ora(e);
    return `<button type="button" class="jev${solido ? " solid" : ""}${e.ro ? " ro" : ""}" style="--c:var(--c-${colore(e)})" data-id="${esc(e.id)}" data-d="${o.data}" title="${esc(e.titolo)}${t ? " · " + t : ""}${e.luogo ? " · " + esc(e.luogo) : ""}">${t ? `<i>${t}</i>` : ""}<span>${esc(e.titolo)}</span></button>`;
  };
  const festLabel = (f, d) => (f[d] ? `<em class="fe" title="${esc(f[d])}">${esc(f[d])}</em>` : "");

  /* ---------- Vista mese ---------- */
  function vistaMese() {
    const d = L.D(S.cur), y = d.getFullYear(), m = d.getMonth();
    const primo = isoDate(new Date(y, m, 1, 12)), ultimo = isoDate(new Date(y, m + 1, 0, 12));
    const da = L.weekStart(primo), a = L.addDays(L.weekStart(ultimo), 6);
    const map = L.perGiorno(visibili(da, a), da, a), fest = S.fest ? L.festivita(da, a) : {};
    const MAX = 3, t = oggi();
    let h = `<div class="mg">${GIORNI.map(g => `<div class="wd">${g}</div>`).join("")}`;
    for (let day = da, i = 0; day <= a; day = L.addDays(day, 1), i++) {
      const dd = L.D(day), list = map[day] || [], fuori = dd.getMonth() !== m, we = i % 7 > 4;
      h += `<div class="cell${fuori ? " out" : ""}${day === t ? " today" : ""}${we ? " we" : ""}" data-day="${day}">
        <div class="cn"><b>${dd.getDate()}</b>${dd.getDate() === 1 ? `<small class="mo">${fmt(day, { month: "short" })}</small>` : ""}${festLabel(fest, day)}</div>
        <div class="evs">${list.slice(0, MAX).map(o => chip(o, L.giornaliero(o))).join("")}${list.length > MAX ? `<button type="button" class="jmore" data-go="${day}">+${list.length - MAX} altri</button>` : ""}</div>
      </div>`;
    }
    return h + "</div>";
  }

  /* ---------- Vista giorno / settimana ---------- */
  function disponi(occ) {
    const voci = occ.map(o => { const s = L.minutes(o.ev.inizio) ?? 0; let e = L.minutes(o.ev.fine); if (e == null || e <= s) e = s + 60; return { o, s, e: Math.max(e, s + 30) }; })
      .sort((a, b) => a.s - b.s || b.e - a.e);
    const out = []; let gruppo = [], fineGruppo = -1;
    const chiudi = () => { const col = []; gruppo.forEach(v => { let c = col.findIndex(f => f <= v.s); if (c < 0) { c = col.length; col.push(0); } col[c] = v.e; v.col = c; }); gruppo.forEach(v => { v.cols = col.length; out.push(v); }); gruppo = []; };
    voci.forEach(v => { if (gruppo.length && v.s >= fineGruppo) { chiudi(); fineGruppo = -1; } gruppo.push(v); fineGruppo = Math.max(fineGruppo, v.e); });
    if (gruppo.length) chiudi();
    return out;
  }

  function vistaGriglia(giorni) {
    const da = giorni[0], a = giorni[giorni.length - 1], n = giorni.length, t = oggi();
    const map = L.perGiorno(visibili(da, a), da, a), fest = S.fest ? L.festivita(da, a) : {};
    const intestaz = giorni.map(d => `<button type="button" class="th${d === t ? " today" : ""}" data-go="${d}" title="Apri il giorno"><span>${GIORNI[(L.D(d).getDay() + 6) % 7]}</span><b>${L.D(d).getDate()}</b></button>`).join("");
    const tuttoGiorno = giorni.map(d => `<div class="ad" data-day="${d}">${festLabel(fest, d)}${(map[d] || []).filter(L.giornaliero).map(o => chip(o, true)).join("")}</div>`).join("");
    const ore = Array.from({ length: 24 }, (_, i) => `<div class="hr">${String(i).padStart(2, "0")}:00</div>`).join("");
    const colonne = giorni.map(d => {
      const eventi = disponi((map[d] || []).filter(o => !L.giornaliero(o)));
      const blocchi = eventi.map(v => {
        const e = v.o.ev, top = v.s / 60 * HH, alt = Math.max((v.e - v.s) / 60 * HH - 2, 18);
        return `<button type="button" class="te${e.ro ? " ro" : ""}" style="--c:var(--c-${colore(e)});top:${top}px;height:${alt}px;left:calc(${v.col / v.cols * 100}% + 1px);width:calc(${100 / v.cols}% - 3px)" data-id="${esc(e.id)}" data-d="${v.o.data}" title="${esc(e.titolo)}"><b>${esc(e.titolo)}</b><small>${esc(e.inizio || "")}${e.fine ? "–" + esc(e.fine) : ""}${e.luogo ? " · " + esc(e.luogo) : ""}</small></button>`;
      }).join("");
      return `<div class="dc${d === t ? " today" : ""}" data-day="${d}">${blocchi}${d === t ? `<div class="now" style="top:${minutiOra() / 60 * HH}px"></div>` : ""}</div>`;
    }).join("");
    return `<div class="tg-scroll" id="tg"><div class="tg-in" style="--n:${n}">
      <div class="tg-top"><div class="tg-row"><div></div>${intestaz}</div><div class="tg-row"><div class="ad-l">tutto il giorno</div>${tuttoGiorno}</div></div>
      <div class="tg-body"><div class="hrs">${ore}</div>${colonne}</div></div></div>`;
  }
  const minutiOra = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  /* ---------- Agenda ---------- */
  function vistaAgenda() {
    const cerca = !!S.q.trim();
    const da = cerca ? L.addDays(oggi(), -365) : S.cur, a = cerca ? L.addDays(oggi(), 730) : L.addDays(S.cur, 90);
    const map = L.perGiorno(visibili(da, a), da, a), fest = S.fest && !cerca ? L.festivita(da, a) : {};
    const giorni = [...new Set([...Object.keys(map), ...Object.keys(fest).filter(d => d >= da && d <= a)])].sort();
    if (!giorni.length) return `<div class="cal-empty"><h3>${cerca ? "Nessun risultato" : "Nessun evento"}</h3><p>${cerca ? "Prova con un'altra parola." : "Nei prossimi 90 giorni non c'è niente in programma."}</p><button class="btn" type="button" data-new>Nuovo evento</button></div>`;
    const t = oggi();
    return giorni.map(d => {
      const items = (map[d] || []).map(o => {
        const e = o.ev, quando = e.tutto || !e.inizio ? (o.fine > o.data ? `fino al ${fmt(o.fine, { day: "numeric", month: "short" })}` : "Tutto il giorno") : `${e.inizio}${e.fine ? " – " + e.fine : ""}`;
        return `<button type="button" class="ag-it${e.ro ? " ro" : ""}" style="--c:var(--c-${colore(e)})" data-id="${esc(e.id)}" data-d="${o.data}"><span class="t">${esc(quando)}${e.ripeti && e.ripeti !== "no" ? " ↻" : ""}</span><span><b>${esc(e.titolo)}</b>${e.luogo ? `<small>${esc(e.luogo)}</small>` : ""}${e.ro ? `<small class="src">${{ lezione: "Lezione", timbrata: "Timbratura", orario: "Orario di scuola" }[e.ro]}</small>` : ""}</span></button>`;
      }).join("");
      return `<div class="ag-day${d === t ? " today" : ""}"><div class="ag-d">${fmt(d, { weekday: "short", day: "numeric" })}<small>${fmt(d, { month: "long", year: "numeric" })}</small></div><div class="ag-items">${fest[d] ? `<div class="ag-fe">${esc(fest[d])}</div>` : ""}${items}</div></div>`;
    }).join("");
  }

  /* ---------- Disegno ---------- */
  function disegna() {
    $("#c-title").textContent = titolo();
    $$("#c-views button").forEach(b => b.classList.toggle("on", b.dataset.v === S.vista));
    if (S.vista === "mese") view.innerHTML = vistaMese();
    else if (S.vista === "giorno") view.innerHTML = vistaGriglia([S.cur]);
    else if (S.vista === "settimana") { const a = L.weekStart(S.cur); view.innerHTML = vistaGriglia(Array.from({ length: 7 }, (_, i) => L.addDays(a, i))); }
    else view.innerHTML = vistaAgenda();
    const tg = $("#tg");
    if (tg) { // parte dalle 7 del mattino, o un'ora prima di adesso se c'è il giorno di oggi
      const giorni = $$(".dc", tg).map(c => c.dataset.day);
      const ore = giorni.includes(oggi()) ? Math.max(0, Math.min(minutiOra() / 60 - 1, 16)) : 7;
      tg.scrollTop = Math.max(0, ore * HH - 10);
    }
  }

  /* ---------- Creazione e modifica ---------- */
  const campi = () => [
    { name: "titolo", label: "Titolo", required: true, placeholder: "Es. Riunione, compleanno, visita…" },
    { name: "data", label: "Data", type: "date", required: true, half: true },
    { name: "dataFine", label: "Fino al (se dura più giorni)", type: "date", half: true },
    { name: "tutto", label: "Tutto il giorno", type: "checkbox", checkLabel: "Tutto il giorno (senza orario)" },
    { name: "inizio", label: "Dalle", type: "time", half: true },
    { name: "fine", label: "Alle", type: "time", half: true },
    { name: "luogo", label: "Luogo", placeholder: "Facoltativo" },
    { name: "colore", label: "Colore", type: "select", options: COLORI, half: true },
    { name: "ripeti", label: "Ripetizione", type: "select", options: RIPETI, half: true },
    { name: "fineRipeti", label: "Ripeti fino al", type: "date", hint: "Facoltativo. Vuoto = senza scadenza." },
    { name: "note", label: "Note", type: "textarea", rows: 4 }
  ];

  async function modifica(ev, { data, ora: h, occ } = {}) {
    const nuovo = !ev;
    let valori = ev ? { ...ev } : {
      titolo: "", data: data || S.cur, dataFine: "", tutto: false, inizio: h || "09:00",
      fine: h ? `${String((+h.slice(0, 2) + 1) % 24).padStart(2, "0")}:${h.slice(3)}` : "10:00",
      luogo: "", colore: "navy", ripeti: "no", fineRipeti: "", note: ""
    };
    if (ev && ev.tutto) valori.tutto = true;
    for (;;) {
      const extra = !nuovo && ev.ripeti !== "no" && occ ? [{ label: "Salta solo questa data", value: "salta" }] : [];
      const r = await Portal.form({ title: nuovo ? "Nuovo evento" : "Modifica evento", fields: campi(), values: valori, submit: "Salva", onDelete: !nuovo, extra });
      if (!r) return;
      if (r.__delete) { await Portal.remove("calendario", ev.id); Portal.toast("Evento eliminato"); return disegna(); }
      if (r.__extra === "salta") { ev.eccezioni = [...new Set([...(ev.eccezioni || []), occ])]; await Portal.upsert("calendario", ev); Portal.toast("Data saltata"); return disegna(); }
      valori = { ...valori, ...r };
      const errore = validazione(r);
      if (errore) { Portal.toast(errore); continue; }
      const tutto = !!r.tutto;
      const salvato = {
        ...(ev || {}), id: ev ? ev.id : Portal.uid(), titolo: r.titolo, data: r.data,
        dataFine: r.dataFine && r.dataFine > r.data ? r.dataFine : "",
        tutto, inizio: tutto ? "" : r.inizio, fine: tutto ? "" : r.fine,
        luogo: r.luogo, note: r.note, colore: r.colore, ripeti: r.ripeti,
        fineRipeti: r.ripeti === "no" ? "" : r.fineRipeti, eccezioni: ev ? ev.eccezioni || [] : []
      };
      await Portal.upsert("calendario", salvato);
      Portal.toast(nuovo ? "Evento creato" : "Evento salvato");
      S.cur = r.data;
      return disegna();
    }
  }

  function validazione(r) {
    if (!r.titolo) return "Scrivi un titolo.";
    if (!r.data) return "Scegli la data.";
    if (r.dataFine && r.dataFine < r.data) return "La data di fine è prima dell'inizio.";
    if (!r.tutto) {
      if (!r.inizio) return "Indica l'ora di inizio, oppure scegli «Tutto il giorno».";
      const unGiorno = !r.dataFine || r.dataFine === r.data;
      if (unGiorno && r.fine && r.fine <= r.inizio) return "L'ora di fine deve essere dopo l'inizio.";
    }
    if (r.ripeti !== "no" && r.fineRipeti && r.fineRipeti < r.data) return "La ripetizione finisce prima dell'inizio dell'evento.";
    return "";
  }

  const trova = id => S.virt[id] || S.eventi.find(e => e.id === id);

  /* ---------- Elementi che vengono da altre sezioni ---------- */
  function apri(x) {
    if (x.ro === "lezione") return modificaLezione(S.lezioni.find(l => l.id === x.rid), false);
    if (x.ro === "timbrata") return Portal.toast(x.dettaglio);
    Portal.toast(`${x.titolo} · ${x.inizio}–${x.fine}${x.luogo ? " · " + x.luogo : ""}. Si modifica da «Modifica orario».`);
  }

  async function modificaLezione(item, isNew) {
    if (!item) return;
    const campiL = [
      { name: "titolo", label: "Titolo", required: true },
      { name: "data", label: "Data", type: "date", required: true, half: true },
      { name: "luogo", label: "Luogo", half: true },
      { name: "inizio", label: "Inizio", type: "time", half: true },
      { name: "fine", label: "Fine", type: "time", half: true },
      { name: "gioco", label: "Gioco o attività previsti", list: S.giochi.map(g => g.nome).sort() },
      { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 }
    ];
    if (isNew) campiL.push({ name: "ripeti", label: "Ripeti ogni settimana per altre", type: "number", min: 0, hint: "Numero di settimane. Lascia 0 per una lezione singola." });
    const res = await Portal.form({ title: isNew ? "Nuova lezione" : "Modifica lezione", fields: campiL, values: item, onDelete: !isNew, extra: isNew ? [] : [{ label: "Avvia lezione", value: "avvia" }] });
    if (!res) return;
    if (res.__delete) { await Portal.remove("lezioni", item.id); Portal.toast("Lezione eliminata"); return disegna(); }
    const { ripeti = 0, __extra, ...data } = res;
    if (isNew) {
      for (let i = 0; i <= (Number(ripeti) || 0); i++) S.lezioni.push({ ...item, ...data, id: i === 0 ? item.id : Portal.uid(), data: L.addDays(data.data, 7 * i) });
      await Portal.save("lezioni", S.lezioni);
      Portal.toast(ripeti > 0 ? `Aggiunte ${Number(ripeti) + 1} lezioni` : "Lezione aggiunta");
    } else await Portal.upsert("lezioni", { ...item, ...data });
    if (__extra === "avvia") { location.href = `/registro/?avvia=1&lezione=${encodeURIComponent(item.id)}`; return; }
    S.cur = data.data;
    if (!S.liv.lezioni) { S.liv.lezioni = true; ls.set("liv-lezioni", "1"); disegnaLivelli(); }
    disegna();
  }
  const nuovaLezione = data => modificaLezione({ id: Portal.uid(), data: data || S.cur, ripeti: 0 }, true);

  /* ---------- Livelli ---------- */
  function disegnaLivelli() {
    $("#c-liv").innerHTML = LIVELLI.map(([k, n, c]) => `<label class="liv" style="--c:var(--c-${c})"><input type="checkbox" data-liv="${k}"${S.liv[k] ? " checked" : ""}><i></i>${n}</label>`).join("")
      + `<span class="sp"></span><a class="liv-link" href="/orario/">Modifica orario</a><a class="liv-link" href="/presenze/">Presenze</a>`;
  }

  /* ---------- Clic sul calendario ---------- */
  view.addEventListener("click", e => {
    const ev = e.target.closest("[data-id]");
    if (ev) { const x = trova(ev.dataset.id); if (x) { if (x.ro) apri(x); else modifica(x, { occ: ev.dataset.d }); } return; }
    const go = e.target.closest("[data-go]");
    if (go) return vai("giorno", go.dataset.go);
    if (e.target.closest("[data-new]")) return modifica(null);
    const dc = e.target.closest(".dc");
    if (dc) { // clic su un'ora vuota della griglia
      const y = e.clientY - dc.getBoundingClientRect().top;
      const mezzore = Math.floor(y / (HH / 2)), hh = String(Math.floor(mezzore / 2)).padStart(2, "0"), mm = mezzore % 2 ? "30" : "00";
      return modifica(null, { data: dc.dataset.day, ora: `${hh}:${mm}` });
    }
    const cella = e.target.closest("[data-day]");
    if (cella) { if (piccolo() && S.vista === "mese") return vai("giorno", cella.dataset.day); return modifica(null, { data: cella.dataset.day }); }
  });

  /* ---------- Comandi ---------- */
  $("#c-today").onclick = () => { S.cur = oggi(); disegna(); };
  $("#c-prev").onclick = () => sposta(-1);
  $("#c-next").onclick = () => sposta(1);
  $("#c-views").onclick = e => { const b = e.target.closest("button[data-v]"); if (b) vai(b.dataset.v); };
  $$("[data-new]").forEach(b => b.addEventListener("click", () => modifica(null)));
  $("#c-liv").onchange = e => { const k = e.target.dataset.liv; if (!k) return; S.liv[k] = e.target.checked; ls.set("liv-" + k, S.liv[k] ? "1" : "0"); disegna(); };
  $("#c-newlez").onclick = () => nuovaLezione();
  let timerRicerca;
  $("#c-q").oninput = e => { clearTimeout(timerRicerca); timerRicerca = setTimeout(() => { S.q = e.target.value; if (S.q.trim() && S.vista !== "agenda") { S.vista = "agenda"; } disegna(); }, 180); };

  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); modifica(null); }
    else if (k === "l") nuovaLezione();
    else if (k === "t") { S.cur = oggi(); disegna(); }
    else if (k === "arrowleft") sposta(-1);
    else if (k === "arrowright") sposta(1);
    else if (k === "g") vai("giorno");
    else if (k === "s") vai("settimana");
    else if (k === "m") vai("mese");
    else if (k === "a") vai("agenda");
    else if (k === "/") { e.preventDefault(); $("#c-q").focus(); }
  });

  /* ---------- Esporta / importa ---------- */
  $("#c-export").onclick = () => {
    if (!S.eventi.length) return Portal.toast("Non ci sono eventi da esportare.");
    Portal.download(`calendario-jones-${oggi()}.ics`, new Blob([L.inICS(S.eventi)], { type: "text/calendar;charset=utf-8" }));
  };
  $("#c-import").onclick = () => $("#c-file").click();
  $("#c-file").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const { eventi, approssimati } = L.daICS(await f.text());
      const noti = new Set(S.eventi.map(x => x.uid).filter(Boolean));
      const nuovi = eventi.filter(x => !(x.uid && noti.has(x.uid)));
      if (!eventi.length) return Portal.toast("Nel file non ho trovato eventi.");
      if (!nuovi.length) return Portal.toast("Questi eventi ci sono già.");
      const nota = approssimati ? `\n\n${approssimati} evento/i hanno regole di ripetizione più complesse (es. «lunedì e mercoledì»): verranno importati con una ripetizione semplificata.` : "";
      if (!confirm(`Importare ${nuovi.length} eventi da «${f.name}»?${nota}`)) return;
      for (const x of nuovi) S.eventi.push({ ...x, id: Portal.uid() });
      await Portal.save("calendario", S.eventi);
      Portal.toast(`${nuovi.length} eventi importati`);
      disegna();
    } catch { Portal.toast("Non riesco a leggere questo file."); }
  };


  /* ---------- Migrazione della vecchia «Agenda personale» nel Calendario ---------- */
  async function migraAgenda() {
    try {
      const vecchi = await Portal.load("agenda", []);
      if (!Array.isArray(vecchi) || !vecchi.length) return;
      const CAT = { personale: ["navy", "Personale"], famiglia: ["green", "Famiglia"], salute: ["teal", "Salute"], lavoro: ["violet", "Lavoro"], scadenza: ["red", "Scadenza"], altro: ["navy", "Altro"] };
      const RIP = { sett: "settimanale", mese: "mensile", anno: "annuale" };
      const ids = new Set(S.eventi.map(e => e.id));
      const nuovi = vecchi.filter(v => v && v.id && v.titolo && v.data && !ids.has(v.id)).map(v => {
        const [colore, nome] = CAT[v.categoria] || CAT.altro;
        const tutto = !!v.tutto || !v.inizio;
        return {
          id: v.id, titolo: v.titolo, data: v.data, dataFine: "", tutto,
          inizio: tutto ? "" : v.inizio, fine: tutto ? "" : (v.fine || ""),
          luogo: v.luogo || "", colore, ripeti: RIP[v.ripeti] || "no", fineRipeti: "", eccezioni: [],
          note: [v.note, v.categoria && v.categoria !== "personale" ? "Categoria: " + nome : ""].filter(Boolean).join("\n")
        };
      });
      S.eventi.push(...nuovi);
      await Portal.save("calendario", S.eventi);
      await Portal.save("agenda-migrata", vecchi);   // copia di sicurezza dei dati originali
      await Portal.save("agenda", []);
      if (nuovi.length) Portal.toast(nuovi.length + " impegni dell'Agenda spostati nel Calendario");
    } catch { /* si ritenta al prossimo caricamento */ }
  }

  /* ---------- Avvio ---------- */
  setInterval(() => { // la linea rossa dell'ora attuale
    $$(".now").forEach(n => { n.style.top = minutiOra() / 60 * HH + "px"; });
  }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) $$(".now").forEach(n => { n.style.top = minutiOra() / 60 * HH + "px"; }); });

  (async () => {
    view.innerHTML = `<div class="cal-empty"><p>Carico il calendario…</p></div>`;
    if (!Portal.COLLECTIONS.includes("orario")) Portal.COLLECTIONS.push("orario");
    S.eventi = await Portal.load("calendario", []);
    if (!Array.isArray(S.eventi)) S.eventi = [];
    S.lezioni = await Portal.load("lezioni", []);
    S.giochi = await Portal.load("giochi", []);
    S.orario = await Portal.load("orario", []);
    S.presCache = leggi(LS_PCACHE, {}); S.presCoda = leggi(LS_PCODA, {});
    await migraAgenda();
    disegnaLivelli();
    disegna();
  })();
})();
