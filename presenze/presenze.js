/* Presenze in rete · pagina del portale
   Le registrazioni passano da una coda locale: se la rete manca restano nel browser
   e partono da sole appena torna. Usa le funzioni comuni di core.js ($, $$, esc, Portal…).

   Novità rispetto alla prima versione
   · velocità: dati indicizzati una volta sola, disegno a blocchi (solo ciò che cambia), scaricamento dei mesi
     senza richieste doppie e con precaricamento dei mesi vicini, resoconto PDF caricato solo al clic;
   · funzioni: ora di entrata/uscita a mano, orario previsto con saldo ore e barra di avanzamento,
     vista calendario, assenze anche su più giorni, avviso per i turni dimenticati aperti, annulla eliminazione,
     ricerca, note rapide, copia di sicurezza JSON, scorciatoie da tastiera, timer nel titolo della scheda. */
(async () => {
  const LS_CODA = "gj-presenze:coda";     // modifiche non ancora inviate: id -> registrazione
  const LS_CACHE = "gj-presenze:cache";   // ultima copia ricevuta dal server: mese -> [registrazioni]
  const LS_RES = "gj-presenze:resoconto"; // orario previsto e dati del resoconto (condivisi con il PDF)
  const LS_VISTA = "gj-presenze:vista";
  const LUOGHI_BASE = ["Scuola", "Oratorio", "Attività extrascolastica"];
  const ORARIO_BASE = { entrata: "08:40", uscita: "16:40", uscitaVen: "13:40" };

  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota piena */ } };

  /* ---------- Piccoli strumenti ---------- */
  const pad = n => String(n).padStart(2, "0");
  const meseDi = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const spostaMese = (m, n) => { const [y, mo] = m.split("-").map(Number); return meseDi(new Date(y, mo - 1 + n, 1)); };
  const etichettaMese = m => fmtDate(m + "-01", { month: "long", year: "numeric" });
  const adesso = () => new Date().toISOString();
  const perInput = iso => { const d = new Date(iso); return `${isoDate(d)}T${hhmm(d)}`; };
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const minuti = r => Math.max(0, Math.round(((r.uscita ? Date.parse(r.uscita) : Date.now()) - Date.parse(r.entrata)) / 60000));
  const durata = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`;
  const ore = m => (m / 60).toFixed(1).replace(".", ",");
  const segno = m => (m > 0 ? "+" : m < 0 ? "−" : "") + durata(Math.abs(m));
  const jsonOk = r => r.ok && (r.headers.get("content-type") || "").includes("json");
  const hmMin = hm => { const [h, m] = String(hm).split(":").map(Number); return h * 60 + (m || 0); };
  const minDelGiorno = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
  const dowDi = iso => new Date(iso + "T12:00:00").getDay();           // 0 = domenica
  const aggiungiGiorni = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDate(d); };
  const lunedi = iso => aggiungiGiorni(iso, -((dowDi(iso) + 6) % 7));
  const alle = (iso, hm) => new Date(`${iso}T${hm}`);                  // ora locale di quel giorno
  const isAss = r => !!r.uscita && (/assenz/i.test(r.note || "") || minuti(r) === 0);
  const giornoLungo = iso => fmtDate(iso, { weekday: "long", day: "numeric", month: "long" });
  const set = (el, html) => { if (el && el._h !== html) { el.innerHTML = html; el._h = html; } };   // niente riscritture inutili
  const txt = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const titoloOrig = document.title;

  /* ---------- Stato ---------- */
  let coda = leggi(LS_CODA, {});
  let cache = leggi(LS_CACHE, {});
  let remoto = null;                       // null = non verificato, true = Netlify, false = solo browser
  let mese = meseDi(new Date());
  let scelto = "";
  let ultimoMin = -1;                      // ultimo minuto disegnato nel timer/titolo
  let mostrato = "";                       // id del turno di cui il campo nota è già compilato
  let vista = leggi(LS_VISTA, "elenco") === "calendario" ? "calendario" : "elenco";
  const conf = await Portal.load("presenze-config", { luoghi: LUOGHI_BASE });
  if (!Array.isArray(conf.luoghi) || !conf.luoghi.length) conf.luoghi = [...LUOGHI_BASE];

  const orario = () => ({ ...ORARIO_BASE, ...Object.fromEntries(Object.entries(leggi(LS_RES, {})).filter(([k]) => k in ORARIO_BASE)) });
  /** Minuti previsti per un giorno (lun–gio uscita, ven uscitaVen, weekend 0). */
  const previsti = iso => {
    const o = orario(), w = dowDi(iso);
    if (w === 0 || w === 6) return 0;
    return Math.max(0, hmMin(w === 5 ? o.uscitaVen : o.uscita) - hmMin(o.entrata));
  };

  /* ---------- Dati: server + coda locale, indicizzati una volta sola ---------- */
  let memo = null;
  const bump = () => { memo = null; };
  const dati = () => {
    if (memo) return memo;
    const m = new Map();
    const metti = r => { const o = m.get(r.id); if (!o || r.modificato >= o.modificato) m.set(r.id, r); };
    Object.values(cache).forEach(l => l.forEach(metti));
    Object.values(coda).forEach(metti);
    const tutte = [...m.values()].filter(r => !r.eliminato).sort((a, b) => b.entrata.localeCompare(a.entrata));
    const perMese = new Map(), perGiorno = new Map();
    tutte.forEach(r => {
      const mo = r.data.slice(0, 7);
      (perMese.get(mo) || perMese.set(mo, []).get(mo)).push(r);
      (perGiorno.get(r.data) || perGiorno.set(r.data, []).get(r.data)).push(r);
    });
    const luoghi = [...new Set([...conf.luoghi, ...tutte.map(r => r.luogo)])];
    return (memo = { tutte, perMese, perGiorno, luoghi, aperto: tutte.find(r => !r.uscita) || null });
  };
  const tutte = () => dati().tutte;
  const delMese = mo => dati().perMese.get(mo) || [];
  const delGiorno = g => dati().perGiorno.get(g) || [];
  const aperto = () => dati().aperto;
  const luoghiTutti = () => dati().luoghi;

  /* Scaricamento: una sola richiesta alla volta per mese, niente ripetizioni a raffica */
  const inVolo = new Map(), fresco = new Map();
  function scarica(mo, forza) {
    if (inVolo.has(mo)) return inVolo.get(mo);
    if (!forza && Date.now() - (fresco.get(mo) || 0) < 20000) return Promise.resolve(true);
    const p = (async () => {
      try {
        const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
        if (!jsonOk(r)) throw new Error("api");
        const nuovo = (await r.json()).registrazioni || [];
        remoto = true;
        fresco.set(mo, Date.now());
        if (JSON.stringify(cache[mo]) !== JSON.stringify(nuovo)) { cache[mo] = nuovo; scrivi(LS_CACHE, cache); bump(); }
        return true;
      } catch { if (remoto === null) remoto = false; return false; }
      finally { inVolo.delete(mo); }
    })();
    inVolo.set(mo, p);
    return p;
  }
  const mesiVicini = () => { const oggi = meseDi(new Date()); return [...new Set([mese, oggi, spostaMese(oggi, -1)])]; };

  let invio = false, timerInvio = 0;
  const pianifica = () => { clearTimeout(timerInvio); timerInvio = setTimeout(invia, 250); };
  async function invia() {
    const ids = Object.keys(coda);
    if (!ids.length || invio || remoto === false) return;
    invio = true;
    try {
      const spediti = ids.map(id => coda[id]);
      const r = await fetch("/api/presenze", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ registrazioni: spediti }) });
      if (!jsonOk(r)) throw new Error("api");
      const d = await r.json();
      const chiusi = new Set([...(d.accettate || []), ...(d.rifiutate || []).map(x => x.id)]);
      // Una registrazione ritoccata mentre partiva resta in coda per il prossimo invio
      spediti.forEach(s => { if (chiusi.has(s.id) && coda[s.id] && coda[s.id].modificato === s.modificato) delete coda[s.id]; });
      scrivi(LS_CODA, coda);
      bump();
      if ((d.rifiutate || []).length) Portal.toast(`Registrazione rifiutata dal server: ${d.rifiutate[0].motivo}`);
      await Promise.all(mesiVicini().map(m => scarica(m, true)));
    } catch { /* senza rete: resta in coda e riprova più tardi */ }
    invio = false;
    render();
  }

  const salva = rec => { coda[rec.id] = rec; scrivi(LS_CODA, coda); bump(); ultimoMin = -1; render(); pianifica(); };

  /* ---------- Disegno ---------- */
  let programmato = false;
  const render = () => {
    if (programmato) return;
    programmato = true;
    queueMicrotask(() => { programmato = false; disegnaTutto(); });
  };
  function disegnaTutto() { disegnaBadge(); disegnaStato(); disegnaStat(); disegnaLista(); }

  function disegnaStato() {
    const n = Object.keys(coda).length, el = $("#sync");
    if (el) {
      txt(el, remoto === false ? "Solo su questo browser" : n ? `${n} in attesa di invio` : "Sincronizzato");
      el.dataset.ok = remoto !== false && !n ? "1" : "0";
    }
    txt($("#pr-queue"), n ? `${n} presenz${n === 1 ? "a" : "e"} in attesa di invio da questa pagina.` : "");
  }

  const noteFrequenti = () => {
    const c = new Map();
    tutte().slice(0, 120).forEach(r => { const n = (r.note || "").trim(); if (n && !/assenz/i.test(n) && n.length <= 40) c.set(n, (c.get(n) || 0) + 1); });
    const top = [...c.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 4);
    return top.length >= 2 ? top : [...new Set([...top, "Uscita anticipata", "Sostituzione"])].slice(0, 3);
  };

  function disegnaBadge() {
    const o = aperto(), oggi = isoDate(new Date());
    $("#pr-idle").hidden = !!o;
    $("#pr-live").hidden = !o;
    $("#pr-badge").classList.toggle("on", !!o);

    // Avviso: turno rimasto aperto da un altro giorno
    const al = $("#pr-alert");
    if (o && o.data !== oggi) {
      const prev = previsti(o.data), u = prev ? alle(o.data, orario()[dowDi(o.data) === 5 ? "uscitaVen" : "uscita"]) : null;
      const puoChiudere = u && u > new Date(o.entrata);
      set(al, `<div><strong>Turno rimasto aperto.</strong> Sei entrato in «${esc(o.luogo)}» ${esc(giornoLungo(o.data))} alle ${hhmm(new Date(o.entrata))} e non risulta l'uscita.</div>
        <div class="pr-alert-btns">${puoChiudere ? `<button class="btn sm" type="button" data-act="chiudi-previsto">Chiudi alle ${hhmm(u)}</button>` : ""}<button class="btn ghost sm" type="button" data-act="correggi">Correggi orari</button></div>`);
      al.hidden = false;
    } else al.hidden = true;

    if (o) {
      txt($("#pr-live-luogo"), o.luogo);
      const quando = o.data === oggi ? "oggi" : giornoLungo(o.data);
      txt($("#pr-live-since"), `Entrato alle ${hhmm(new Date(o.entrata))}, ${quando}.`);
      if (mostrato !== o.id) { $("#pr-note").value = o.note || ""; mostrato = o.id; $("#pr-out-time").value = ""; }
      set($("#pr-quick"), noteFrequenti().map(n => `<button type="button" class="chip-btn sm" data-nota="${esc(n)}">${esc(n)}</button>`).join(""));
      disegnaTick();
    } else {
      mostrato = "";
      disegnaTick();   // ripristina il titolo della scheda
      const lista = conf.luoghi;
      if (!lista.includes(scelto)) scelto = (tutte()[0] || {}).luogo;
      if (!lista.includes(scelto)) scelto = lista[0] || "";
      set($("#pr-luoghi"), lista.map(n => `<button type="button" class="chip-btn" role="radio" aria-checked="${n === scelto}" data-l="${esc(n)}">${esc(n)}</button>`).join(""));
    }
  }

  /* Parte che cambia ogni secondo: solo testo e barra, nient'altro */
  function disegnaTick() {
    const o = aperto();
    if (!o) { if (document.title !== titoloOrig) document.title = titoloOrig; ultimoMin = -1; return; }
    const trascorso = Date.now() - Date.parse(o.entrata);
    txt($("#pr-timer"), clock(trascorso));
    const mm = Math.floor(trascorso / 60000);
    if (mm !== ultimoMin) {
      ultimoMin = mm;
      document.title = `● ${pad(Math.floor(mm / 60))}:${pad(mm % 60)} · ${o.luogo} — ${titoloOrig}`;
      const oggi = isoDate(new Date()), prev = previsti(oggi), box = $("#pr-progress");
      if (o.data === oggi && prev > 0) {
        const fatti = delGiorno(oggi).reduce((s, r) => s + (isAss(r) ? 0 : minuti(r)), 0), manca = prev - fatti;
        box.hidden = false;
        $("#pr-progress-fill").style.width = Math.min(100, Math.round(100 * fatti / prev)) + "%";
        box.classList.toggle("done", manca <= 0);
        txt($("#pr-progress-txt"), manca > 0
          ? `${durata(fatti)} di ${durata(prev)} · mancano ${durata(manca)}, orario completato alle ${hhmm(new Date(Date.now() + manca * 60000))}`
          : `Orario previsto completato · ${durata(-manca)} in più`);
      } else box.hidden = true;
    }
  }

  function datiMese(mo, filtroLuogo) {
    const oggi = isoDate(new Date()), E = hmMin(orario().entrata);
    const righe = delMese(mo).filter(r => !filtroLuogo || r.luogo === filtroLuogo);
    let tot = 0, saldo = 0, ritGiorni = 0, ritMin = 0, assGiorni = 0, giorni = 0;
    const primo = new Map();   // giorno -> primo turno "vero" (per il ritardo)
    const perG = new Map();
    righe.forEach(r => (perG.get(r.data) || perG.set(r.data, []).get(r.data)).push(r));
    perG.forEach((ts, g) => {
      ts.sort((a, b) => a.entrata.localeCompare(b.entrata));
      const veri = ts.filter(r => !isAss(r));
      const lavorati = veri.reduce((s, r) => s + minuti(r), 0);
      tot += lavorati;
      if (!veri.length) { assGiorni++; if (g !== oggi) saldo -= previsti(g); return; }
      giorni++;
      primo.set(veri[0].id, 1);
      const ritardo = minDelGiorno(veri[0].entrata) - E;
      if (previsti(g) > 0 && ritardo > 0) { ritGiorni++; ritMin += ritardo; }
      if (!veri.some(r => !r.uscita)) saldo += lavorati - previsti(g);   // oggi, finché sei dentro, non conta
    });
    return { righe, tot, saldo, ritGiorni, ritMin, assGiorni, giorni, primo, E };
  }

  function disegnaStat() {
    const oggi = isoDate(new Date()), lun = lunedi(oggi);
    const minOggi = delGiorno(oggi).reduce((s, r) => s + (isAss(r) ? 0 : minuti(r)), 0);
    let minSett = 0, prevSett = 0;
    for (let i = 0; i < 7; i++) { const g = aggiungiGiorni(lun, i); prevSett += previsti(g); minSett += delGiorno(g).reduce((s, r) => s + (isAss(r) ? 0 : minuti(r)), 0); }
    const dm = datiMese(mese, "");
    const pOggi = previsti(oggi);
    const barra = (v, max) => max > 0 ? `<div class="pr-mini"><i style="width:${Math.min(100, Math.round(100 * v / max))}%"></i></div>` : "";
    const cls = n => n > 0 ? "pos" : n < 0 ? "neg" : "";
    const nomeMese = etichettaMese(mese).replace(/ \d{4}$/, "");
    set($("#pr-stats"), [
      `<div class="pr-stat"><span>Oggi</span><b>${ore(minOggi)}<u>h</u></b>${barra(minOggi, pOggi)}<small>${pOggi ? `su ${ore(pOggi)} h previste` : "giorno senza orario previsto"}</small></div>`,
      `<div class="pr-stat"><span>Settimana</span><b>${ore(minSett)}<u>h</u></b>${barra(minSett, prevSett)}<small>su ${ore(prevSett)} h previste</small></div>`,
      `<div class="pr-stat"><span style="text-transform:capitalize">${esc(nomeMese)}</span><b>${ore(dm.tot)}<u>h</u></b><small>${dm.giorni} giornat${dm.giorni === 1 ? "a" : "e"} · saldo <em class="${cls(dm.saldo)}">${dm.giorni || dm.assGiorni ? segno(dm.saldo) : "—"}</em></small></div>`,
      `<div class="pr-stat"><span>Ritardi e assenze</span><b>${dm.ritGiorni}<u>rit.</u> ${dm.assGiorni}<u>ass.</u></b><small>${dm.ritGiorni ? `ritardo totale ${durata(dm.ritMin)}` : "nessun ritardo nel mese"}</small></div>`
    ].join(""));
  }

  function disegnaLista() {
    const oggi = isoDate(new Date());
    txt($("#pr-month"), etichettaMese(mese));
    $("#pr-next").disabled = mese >= meseDi(new Date());
    $("#pr-today").hidden = mese === meseDi(new Date());
    $("#pr-v-list").setAttribute("aria-pressed", vista === "elenco");
    $("#pr-v-cal").setAttribute("aria-pressed", vista === "calendario");

    const sel = $("#pr-filter"), filtro = sel.value, lt = luoghiTutti();
    set(sel, `<option value="">Tutti i luoghi</option>` + lt.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(""));
    sel.value = lt.includes(filtro) ? filtro : "";

    const q = $("#pr-search").value.trim().toLowerCase();
    const dm = datiMese(mese, sel.value);
    const viste = q ? dm.righe.filter(r => `${r.luogo} ${r.note || ""}`.toLowerCase().includes(q)) : dm.righe;

    $("#pr-none").hidden = viste.length > 0 || vista === "calendario";
    txt($("#pr-none-txt"), q || sel.value ? "Nessuna presenza corrisponde ai filtri." : "Per questo mese non c'è ancora nessuna entrata registrata.");

    if (vista === "calendario") {
      $("#pr-tablewrap").hidden = true;
      $("#pr-cal").hidden = false;
      disegnaCalendario(dm);
    } else {
      $("#pr-cal").hidden = true;
      $("#pr-tablewrap").hidden = viste.length === 0;
      disegnaRighe(viste, dm, oggi);
    }

    const perLuogo = {};
    dm.righe.forEach(r => { if (!isAss(r)) perLuogo[r.luogo] = (perLuogo[r.luogo] || 0) + minuti(r); });
    const voci = Object.entries(perLuogo).sort((a, b) => b[1] - a[1]), max = voci.length ? voci[0][1] : 1, somma = voci.reduce((s, v) => s + v[1], 0) || 1;
    $("#pr-totals-panel").hidden = !voci.length;
    set($("#pr-totals"), voci.map(([n, m]) => `<li><span class="n">${esc(n)}</span><span class="b"><i style="width:${Math.max(3, Math.round(100 * m / max))}%"></i></span><time>${durata(m)} <small>${Math.round(100 * m / somma)}%</small></time></li>`).join(""));
  }

  function disegnaRighe(viste, dm, oggi) {
    const perGiorno = {};
    viste.forEach(r => { perGiorno[r.data] = (perGiorno[r.data] || 0) + (isAss(r) ? 0 : minuti(r)); });
    let html = "", giorno = "";
    for (const r of viste) {
      if (r.data !== giorno) {
        giorno = r.data;
        const prev = previsti(giorno), d = perGiorno[giorno];
        const diff = prev && giorno !== oggi ? d - prev : null;
        html += `<tr class="pr-day"><td colspan="6">${esc(giornoLungo(giorno))}<span>${durata(d)}${diff ? ` <em class="${diff > 0 ? "pos" : "neg"}">${segno(diff)}</em>` : ""}</span></td></tr>`;
      }
      const m = minuti(r), ass = isAss(r);
      const dimenticato = !r.uscita && r.data !== oggi;
      const rit = dm.primo.has(r.id) ? minDelGiorno(r.entrata) - dm.E : 0;
      const tag = [
        ass ? `<span class="pr-tag abs">Assenza</span>` : "",
        dimenticato ? `<span class="pr-tag warn">Uscita mancante</span>` : "",
        r.uscita && !ass && m > 16 * 60 ? `<span class="pr-tag warn">Controlla</span>` : "",
        rit > 0 && previsti(r.data) > 0 ? `<span class="pr-tag late">Ritardo ${rit} min</span>` : "",
        r.fonte === "offline" ? `<span class="pr-tag">Offline</span>` : r.fonte === "manuale" ? `<span class="pr-tag">A mano</span>` : "",
        r.id in coda ? `<span class="pr-tag wait">In attesa</span>` : ""
      ].join("");
      html += `<tr${ass ? ` class="is-abs"` : ""}><td class="luogo" data-l="Luogo">${esc(r.luogo)}${tag}</td>
        <td class="num" data-l="Entrata">${ass ? "—" : hhmm(new Date(r.entrata))}</td>
        <td class="num" data-l="Uscita">${ass ? "—" : r.uscita ? hhmm(new Date(r.uscita)) : `<span class="pr-tag live">In corso</span>`}</td>
        <td class="num" data-l="Durata">${ass ? "—" : durata(m)}</td>
        <td class="nota" data-l="Nota" title="${esc(r.note || "")}">${esc(r.note || "")}</td>
        <td class="act"><button class="btn ghost sm" type="button" data-id="${esc(r.id)}">Modifica</button></td></tr>`;
    }
    set($("#pr-rows"), html);
  }

  function disegnaCalendario(dm) {
    const oggi = isoDate(new Date()), [y, mo] = mese.split("-").map(Number);
    const nd = new Date(y, mo, 0).getDate(), off = (dowDi(`${mese}-01`) + 6) % 7;
    const perG = new Map();
    dm.righe.forEach(r => (perG.get(r.data) || perG.set(r.data, []).get(r.data)).push(r));
    let html = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => `<div class="h">${g}</div>`).join("") + `<span></span>`.repeat(off);
    for (let d = 1; d <= nd; d++) {
      const g = `${mese}-${pad(d)}`, ts = perG.get(g) || [], w = dowDi(g), we = w === 0 || w === 6;
      const veri = ts.filter(r => !isAss(r)), m = veri.reduce((s, r) => s + minuti(r), 0);
      let c = "", info = "", sr = "";
      if (ts.length && !veri.length) { c = "abs"; info = "Assente"; sr = "assenza"; }
      else if (veri.length) {
        const prima = [...veri].sort((a, b) => a.entrata.localeCompare(b.entrata))[0];
        const rit = !we && minDelGiorno(prima.entrata) - dm.E > 0;
        c = veri.some(r => !r.uscita) ? "open" : rit ? "late" : "ok";
        info = `${ore(m)} h`; sr = `${durata(m)}${rit ? ", in ritardo" : ""}`;
      }
      const sub = veri.length ? `<small>${hhmm(new Date(veri[veri.length - 1].entrata))}</small>` : "";
      html += `<button type="button" class="d ${c}${we ? " we" : ""}${g === oggi ? " today" : ""}${g > oggi ? " fut" : ""}" data-g="${g}" aria-label="${esc(giornoLungo(g))}${sr ? ", " + sr : ", nessuna presenza"}"><span class="n">${d}</span>${info ? `<b>${info}</b>` : ""}${sub}</button>`;
    }
    set($("#pr-cal"), html + `<p class="pr-legend"><i class="ok"></i>presente <i class="late"></i>in ritardo <i class="abs"></i>assente <i class="open"></i>in corso — tocca un giorno per aggiungere o modificare</p>`);
  }

  /* ---------- Timbrare ---------- */
  $("#pr-luoghi").addEventListener("click", e => {
    const b = e.target.closest("[data-l]");
    if (!b) return;
    scelto = b.dataset.l;
    $$("#pr-luoghi [data-l]").forEach(x => x.setAttribute("aria-checked", x === b));
  });

  /** Ora scelta nel campo ora (o adesso). Restituisce null e avvisa se non ha senso. */
  const oraScelta = (campo, giorno) => {
    const v = campo.value;
    if (!v) return new Date();
    const t = alle(giorno, v);
    if (isNaN(t)) { Portal.toast("Ora non valida"); return null; }
    if (t.getTime() > Date.now() + 60000) { Portal.toast("L'ora è nel futuro"); return null; }
    return t;
  };

  $("#pr-in").onclick = () => {
    if (aperto()) return;
    if (!scelto) return Portal.toast("Aggiungi prima un luogo");
    const oggi = isoDate(new Date()), t = oraScelta($("#pr-in-time"), oggi);
    if (!t) return;
    salva({ id: Portal.uid(), luogo: scelto, data: isoDate(t), entrata: t.toISOString(), uscita: null, note: "", fonte: "web", dispositivo: "portale", modificato: adesso() });
    $("#pr-in-time").value = "";
    Portal.toast(`Entrata registrata alle ${hhmm(t)}`);
  };

  $("#pr-out").onclick = () => {
    const o = aperto();
    if (!o) return;
    const t = oraScelta($("#pr-out-time"), o.data);
    if (!t) return;
    if (t < new Date(o.entrata)) return Portal.toast("L'uscita deve essere dopo l'entrata");
    salva({ ...o, uscita: t.toISOString(), note: $("#pr-note").value.trim() || o.note || "", modificato: adesso() });
    $("#pr-out-time").value = "";
    Portal.toast(`Uscita registrata alle ${hhmm(t)}`);
  };

  $("#pr-note").addEventListener("change", () => {
    const o = aperto();
    if (o && (o.note || "") !== $("#pr-note").value.trim()) salva({ ...o, note: $("#pr-note").value.trim(), modificato: adesso() });
  });
  $("#pr-quick").addEventListener("click", e => {
    const b = e.target.closest("[data-nota]");
    if (!b) return;
    $("#pr-note").value = b.dataset.nota;
    $("#pr-note").dispatchEvent(new Event("change"));
  });

  $("#pr-alert").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"), o = aperto();
    if (!b || !o) return;
    if (b.dataset.act === "correggi") return scheda(o);
    const u = alle(o.data, orario()[dowDi(o.data) === 5 ? "uscitaVen" : "uscita"]);
    salva({ ...o, uscita: u.toISOString(), modificato: adesso() });
    Portal.toast(`Turno chiuso alle ${hhmm(u)}`);
  });

  /* ---------- Annulla ---------- */
  let snackTimer = 0;
  function annulla(messaggio, azione) {
    let s = $("#pr-snack");
    if (!s) { s = document.createElement("div"); s.id = "pr-snack"; s.className = "pr-snack"; s.setAttribute("role", "status"); document.body.append(s); }
    s.innerHTML = `<span></span><button type="button">Annulla</button>`;
    s.firstChild.textContent = messaggio;
    s.hidden = false;
    s.lastChild.onclick = () => { s.hidden = true; clearTimeout(snackTimer); azione(); };
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => { s.hidden = true; }, 7000);
  }

  /* ---------- Modifica e inserimento a mano ---------- */
  const sovrapposto = (id, e, u) => {
    const fine = u ? u.getTime() : Date.now();
    return tutte().find(r => r.id !== id && !isAss(r) && Date.parse(r.entrata) < fine && (r.uscita ? Date.parse(r.uscita) : Date.now()) > e.getTime());
  };

  async function scheda(rec, preset) {
    const nuova = !rec;
    const base = rec || { id: Portal.uid(), luogo: scelto || conf.luoghi[0] || "", entrata: (preset && preset.entrata) || adesso(), uscita: (preset && preset.uscita) || null, note: "", fonte: "manuale" };
    let v = { luogo: base.luogo, entrata: perInput(base.entrata), uscita: base.uscita ? perInput(base.uscita) : "", note: base.note || "" };
    for (;;) {
      const res = await Portal.form({
        title: nuova ? "Aggiungi una presenza" : "Modifica presenza",
        values: v, onDelete: !nuova,
        fields: [
          { name: "luogo", label: "Luogo", required: true, list: luoghiTutti() },
          { name: "entrata", label: "Entrata", type: "datetime-local", required: true, half: true },
          { name: "uscita", label: "Uscita", type: "datetime-local", half: true, hint: "Lascia vuoto se sei ancora dentro." },
          { name: "note", label: "Note", type: "textarea", rows: 3 }
        ]
      });
      if (!res) return;
      if (res.__delete) {
        salva({ ...base, eliminato: true, modificato: adesso() });
        annulla("Presenza eliminata", () => salva({ ...base, modificato: adesso() }));
        return;
      }
      v = res;
      const e = new Date(res.entrata), u = res.uscita ? new Date(res.uscita) : null;
      if (isNaN(e)) { Portal.toast("Entrata non valida"); continue; }
      if (u && (isNaN(u) || u < e)) { Portal.toast("L'uscita deve essere dopo l'entrata"); continue; }
      const altro = aperto();
      if (!u && altro && altro.id !== base.id) { Portal.toast("Hai già un turno aperto: chiudilo prima"); continue; }
      const urto = !/assenz/i.test(res.note || "") && (!u || u > e) && sovrapposto(base.id, e, u);
      if (urto) { Portal.toast(`Si sovrappone a un altro turno (${urto.luogo}, ${hhmm(new Date(urto.entrata))})`); continue; }

      const next = { ...base, luogo: res.luogo.trim(), data: isoDate(e), entrata: e.toISOString(), uscita: u ? u.toISOString() : null, note: res.note, modificato: adesso() };
      if (!nuova) {   // se il turno cambia mese, il server deve sapere da dove arriva
        const origine = base.precedente || base.data;
        if (origine.slice(0, 7) !== next.data.slice(0, 7)) next.precedente = origine; else delete next.precedente;
      }
      if (!conf.luoghi.includes(next.luogo)) { conf.luoghi.push(next.luogo); Portal.save("presenze-config", conf); }
      salva(next);
      return;
    }
  }
  const presetGiorno = g => {
    const o = orario(), passato = g < isoDate(new Date());
    return { entrata: alle(g, o.entrata).toISOString(), uscita: passato && previsti(g) ? alle(g, dowDi(g) === 5 ? o.uscitaVen : o.uscita).toISOString() : null };
  };
  $("#pr-add").onclick = () => scheda(null, vista === "calendario" || mese !== meseDi(new Date()) ? presetGiorno(mese === meseDi(new Date()) ? isoDate(new Date()) : `${mese}-01`) : null);
  $("#pr-rows").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (b) scheda(tutte().find(r => r.id === b.dataset.id));
  });
  $("#pr-cal").addEventListener("click", e => {
    const b = e.target.closest("[data-g]");
    if (!b) return;
    const g = b.dataset.g, ts = delGiorno(g);
    if (!ts.length) scheda(null, presetGiorno(g));
    else if (ts.length === 1) scheda(ts[0]);
    else { vista = "elenco"; scrivi(LS_VISTA, vista); $("#pr-search").value = ""; render(); Portal.toast(`${ts.length} turni quel giorno: scegli quello da modificare`); }
  });

  $("#pr-edit-luoghi").onclick = async () => {
    const res = await Portal.form({
      title: "Luoghi del badge",
      values: { luoghi: conf.luoghi.join("\n") },
      fields: [{ name: "luoghi", label: "Un luogo per riga", type: "textarea", rows: 7, hint: "Compaiono anche nel badge offline, alla prossima sincronizzazione." }]
    });
    if (!res) return;
    const l = [...new Set(res.luoghi.split("\n").map(s => s.trim()).filter(Boolean))];
    if (!l.length) return Portal.toast("Serve almeno un luogo");
    conf.luoghi = l;
    await Portal.save("presenze-config", conf);
    bump(); render();
  };

  /* ---------- Assenze (anche su più giorni) ---------- */
  $("#pr-absence").onclick = async () => {
    const oggi = isoDate(new Date());
    const res = await Portal.form({
      title: "Segna un'assenza",
      submit: "Segna",
      values: { dal: oggi, al: oggi, luogo: scelto || conf.luoghi[0] || "", motivo: "" },
      fields: [
        { name: "dal", label: "Dal", type: "date", required: true, half: true },
        { name: "al", label: "Al", type: "date", required: true, half: true, hint: "Sabato e domenica sono saltati." },
        { name: "luogo", label: "Luogo", required: true, list: luoghiTutti() },
        { name: "motivo", label: "Motivo (facoltativo)", placeholder: "Es. malattia, permesso, sciopero" }
      ]
    });
    if (!res) return;
    if (res.dal > res.al) return Portal.toast("La data iniziale è dopo quella finale");
    const giorni = [];
    for (let g = res.dal; g <= res.al && giorni.length < 93; g = aggiungiGiorni(g, 1)) { const w = dowDi(g); if (w !== 0 && w !== 6) giorni.push(g); }
    const liberi = giorni.filter(g => !delGiorno(g).length);
    if (!liberi.length) return Portal.toast(giorni.length ? "In quei giorni c'è già una presenza registrata" : "Nel periodo ci sono solo sabati e domeniche");
    const nota = res.motivo.trim() ? `Assenza: ${res.motivo.trim()}` : "Assenza";
    const t = adesso(), nuove = liberi.map(g => { const e = alle(g, orario().entrata).toISOString(); return { id: Portal.uid(), luogo: res.luogo.trim(), data: g, entrata: e, uscita: e, note: nota, fonte: "manuale", dispositivo: "portale", modificato: t }; });
    nuove.forEach(r => { coda[r.id] = r; });
    scrivi(LS_CODA, coda); bump(); render(); pianifica();
    const saltati = giorni.length - liberi.length;
    annulla(`${liberi.length} giorn${liberi.length === 1 ? "o" : "i"} di assenza segnat${liberi.length === 1 ? "o" : "i"}${saltati ? ` (${saltati} già con presenze, saltat${saltati === 1 ? "o" : "i"})` : ""}`, () => {
      const q = adesso();
      nuove.forEach(r => { coda[r.id] = { ...r, eliminato: true, modificato: q }; });
      scrivi(LS_CODA, coda); bump(); render(); pianifica();
    });
  };

  /* ---------- Orario previsto ---------- */
  $("#pr-hours").onclick = async () => {
    const res = await Portal.form({
      title: "Orario previsto",
      values: orario(),
      fields: [
        { name: "entrata", label: "Entrata", type: "time", required: true, half: true },
        { name: "uscita", label: "Uscita (lun–gio)", type: "time", required: true, half: true },
        { name: "uscitaVen", label: "Uscita (venerdì)", type: "time", required: true, half: true, hint: "Serve per saldo ore, ritardi e uscita prevista." }
      ]
    });
    if (!res) return;
    if (hmMin(res.uscita) <= hmMin(res.entrata) || hmMin(res.uscitaVen) <= hmMin(res.entrata)) return Portal.toast("L'uscita deve essere dopo l'entrata");
    scrivi(LS_RES, { ...leggi(LS_RES, {}), entrata: res.entrata, uscita: res.uscita, uscitaVen: res.uscitaVen });
    ultimoMin = -1; render();
  };

  /* ---------- Mese, vista, filtri, esportazione ---------- */
  const vaiA = async m => {
    mese = m; render();
    await scarica(m);
    render();
    (window.requestIdleCallback || setTimeout)(() => { [spostaMese(m, -1), spostaMese(m, 1)].filter(x => x <= meseDi(new Date())).forEach(x => scarica(x).then(() => render())); });
  };
  $("#pr-prev").onclick = () => vaiA(spostaMese(mese, -1));
  $("#pr-next").onclick = () => { if (mese < meseDi(new Date())) vaiA(spostaMese(mese, 1)); };
  $("#pr-today").onclick = () => vaiA(meseDi(new Date()));
  $("#pr-filter").addEventListener("change", render);
  let timerRicerca = 0;
  $("#pr-search").addEventListener("input", () => { clearTimeout(timerRicerca); timerRicerca = setTimeout(render, 120); });
  const cambiaVista = v => { vista = v; scrivi(LS_VISTA, v); render(); };
  $("#pr-v-list").onclick = () => cambiaVista("elenco");
  $("#pr-v-cal").onclick = () => cambiaVista("calendario");

  const righeFiltrate = () => {
    const f = $("#pr-filter").value, q = $("#pr-search").value.trim().toLowerCase();
    return delMese(mese).filter(r => (!f || r.luogo === f) && (!q || `${r.luogo} ${r.note || ""}`.toLowerCase().includes(q))).reverse();
  };

  $("#pr-csv").onclick = () => {
    const righe = righeFiltrate();
    if (!righe.length) return Portal.toast("Niente da esportare");
    const cella = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const tot = righe.reduce((s, r) => s + (isAss(r) ? 0 : minuti(r)), 0);
    const csv = ["Data;Luogo;Entrata;Uscita;Minuti;Durata;Note"].concat(righe.map(r => [
      r.data, r.luogo, hhmm(new Date(r.entrata)), r.uscita ? hhmm(new Date(r.uscita)) : "", minuti(r), r.uscita ? durata(minuti(r)) : "in corso", r.note || ""
    ].map(cella).join(";")), [["Totale", "", "", "", tot, durata(tot) + ` (${ore(tot)} ore)`, ""].map(cella).join(";")]).join("\r\n");
    Portal.download(`presenze-${mese}.csv`, new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  };

  $("#pr-copy").onclick = async () => {
    const dm = datiMese(mese, ""), nome = etichettaMese(mese);
    if (!dm.righe.length) return Portal.toast("Niente da copiare");
    const t = `${nome[0].toUpperCase() + nome.slice(1)}: ${dm.giorni} giornate, ${ore(dm.tot)} ore (${durata(dm.tot)}), saldo ${segno(dm.saldo)}, ${dm.ritGiorni} ritardi (${durata(dm.ritMin)}), ${dm.assGiorni} assenze.`;
    try { await navigator.clipboard.writeText(t); Portal.toast("Riepilogo copiato"); } catch { Portal.toast(t); }
  };

  $("#pr-json").onclick = () => {
    const tutti = tutte().map(r => ({ ...r }));
    if (!tutti.length) return Portal.toast("Niente da salvare");
    Portal.download(`presenze-copia-${isoDate(new Date())}.json`, new Blob([JSON.stringify({ versione: 1, registrazioni: tutti }, null, 1)], { type: "application/json" }));
  };
  $("#pr-import").onclick = () => $("#pr-import-file").click();
  $("#pr-import-file").addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()), lista = Array.isArray(j) ? j : j.registrazioni;
      if (!Array.isArray(lista)) throw new Error();
      const esistenti = new Map(tutte().map(r => [r.id, r]));
      const valida = r => r && typeof r.id === "string" && typeof r.luogo === "string" && /^\d{4}-\d\d-\d\d$/.test(r.data) && !isNaN(Date.parse(r.entrata)) && (r.uscita == null || !isNaN(Date.parse(r.uscita)));
      let nuove = 0, saltate = 0;
      const t = adesso();
      lista.forEach(r => {
        if (!valida(r)) { saltate++; return; }
        const o = esistenti.get(r.id);
        if (o && o.luogo === r.luogo && o.entrata === r.entrata && (o.uscita || null) === (r.uscita || null) && (o.note || "") === (r.note || "")) return;
        coda[r.id] = { ...r, uscita: r.uscita || null, eliminato: r.eliminato || undefined, modificato: t }; nuove++;
      });
      if (nuove) { scrivi(LS_CODA, coda); bump(); render(); pianifica(); }
      Portal.toast(nuove ? `Importate ${nuove} presenze${saltate ? `, ${saltate} non valide ignorate` : ""}` : saltate ? "Nessuna presenza valida nel file" : "Nessuna novità: è già tutto qui");
    } catch { Portal.toast("File non valido"); }
  });

  /* ---------- Resoconto PDF: lo script pesante si carica solo al clic ---------- */
  let promessaReport = null;
  const caricaReport = () => promessaReport ||= new Promise((ok, no) => {
    if (window.PresenzeResoconto) return ok();
    const s = document.createElement("script");
    s.src = "/presenze/presenze-report.js";
    s.onload = ok;
    s.onerror = () => { promessaReport = null; no(new Error("Impossibile caricare il resoconto, riprova")); };
    document.head.append(s);
  });
  $("#pr-report").onclick = async () => {
    try { await caricaReport(); await window.PresenzeResoconto.avvia(); } catch (e) { Portal.toast(e.message || "Impossibile creare il resoconto"); }
  };
  (window.requestIdleCallback || (f => setTimeout(f, 3000)))(() => {   // lo prepara in anticipo, senza rallentare l'apertura
    if (document.querySelector('link[rel=prefetch][href$="presenze-report.js"]')) return;
    const l = document.createElement("link"); l.rel = "prefetch"; l.href = "/presenze/presenze-report.js"; l.as = "script"; document.head.append(l);
  });

  /* ---------- Badge offline ---------- */
  $("#pr-download").onclick = async () => {
    try {
      const r = await fetch("/presenze/badge-offline.html", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const testo = (await r.text()).split("__PORTAL_URL__").join(location.origin);
      Portal.download("presenze-in-rete.html", new Blob([testo], { type: "text/html;charset=utf-8" }));
    } catch { Portal.toast("Download non riuscito, riprova"); }
  };

  /* ---------- Scorciatoie da tastiera ---------- */
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const a = document.activeElement, tag = a ? a.tagName : "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (a && a.isContentEditable) || document.querySelector("dialog[open], [role=dialog], .modal")) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); $("#pr-add").click(); }
    else if (k === "arrowleft") $("#pr-prev").click();
    else if (k === "arrowright") $("#pr-next").click();
    else if (k === "t") $("#pr-today").click();
    else if (k === "v") cambiaVista(vista === "elenco" ? "calendario" : "elenco");
    else if (k === "/") { e.preventDefault(); $("#pr-search").focus(); }
  });

  /* ---------- Avvio ---------- */
  disegnaTutto();
  await Promise.all(mesiVicini().map(m => scarica(m)));
  render();
  invia();

  // Un tic al secondo solo se c'è un turno aperto e la scheda è visibile
  setInterval(() => { if (!document.hidden && aperto()) disegnaTick(); }, 1000);
  // Ogni minuto: aggiorna cifre (un turno aperto cresce) e riprova a spedire
  setInterval(() => { if (!document.hidden) render(); if (Object.keys(coda).length) invia(); }, 60000);
  window.addEventListener("online", invia);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    ultimoMin = -1; render(); invia();
    scarica(mese, true).then(ok => ok && render());
  });
  // Altra scheda del browser: tieni allineato
  window.addEventListener("storage", e => {
    if (e.key === LS_CODA) coda = leggi(LS_CODA, {});
    else if (e.key === LS_CACHE) cache = leggi(LS_CACHE, {});
    else return;
    bump(); render();
  });
})();
