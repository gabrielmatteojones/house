/* Jones House · «Timbra»
   Piccolo pulsante nell'intestazione (su ogni pagina): apre una finestra che chiede in cosa entrare oppure,
   se sei già in servizio, per uscire. Stessa coda locale e stessi dati della pagina Presenze:
   se la rete manca la timbratura resta nel browser e parte da sola appena torna. */
const Timbra = (() => {
  const LS_CODA = "gj-presenze:coda", LS_CACHE = "gj-presenze:cache";
  const LUOGHI_BASE = ["Scuola", "Oratorio", "Attività extrascolastica"];
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota piena */ } };
  const pad = n => String(n).padStart(2, "0");
  const meseDi = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const jsonOk = r => r.ok && (r.headers.get("content-type") || "").includes("json");

  let coda = leggi(LS_CODA, {}), cache = leggi(LS_CACHE, {}), remoto = null, conf = null;
  let dlg = null, tick = 0, scaricato = false, invio = false;

  /* ---------- Dati ---------- */
  const tutte = () => {
    const m = new Map();
    const metti = r => { const o = m.get(r.id); if (!o || r.modificato >= o.modificato) m.set(r.id, r); };
    Object.values(cache).forEach(l => l.forEach(metti));
    Object.values(coda).forEach(metti);
    return [...m.values()].filter(r => !r.eliminato).sort((a, b) => b.entrata.localeCompare(a.entrata));
  };
  const aperto = () => tutte().find(r => !r.uscita) || null;

  const luoghi = async () => {
    if (!conf) {
      conf = await Portal.load("presenze-config", { luoghi: LUOGHI_BASE });
      if (!Array.isArray(conf.luoghi) || !conf.luoghi.length) conf.luoghi = [...LUOGHI_BASE];
      Orari.assicura(conf);
    }
    return conf.luoghi;
  };

  async function scarica(mo) {
    try {
      const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
      if (!jsonOk(r)) throw 0;
      cache[mo] = (await r.json()).registrazioni || [];
      remoto = true;
      scrivi(LS_CACHE, cache);
    } catch { if (remoto === null) remoto = false; }
  }
  const scaricaRecenti = () => {
    const oggi = new Date();
    return Promise.all([meseDi(oggi), meseDi(new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1))].map(scarica));
  };

  async function invia() {
    const ids = Object.keys(coda);
    if (!ids.length || invio || remoto === false) return;
    invio = true;
    try {
      const spediti = ids.map(i => coda[i]);
      const r = await fetch("/api/presenze", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ registrazioni: spediti }) });
      if (!jsonOk(r)) throw 0;
      const d = await r.json(), chiusi = new Set([...(d.accettate || []), ...(d.rifiutate || []).map(x => x.id)]);
      spediti.forEach(s => { if (chiusi.has(s.id) && coda[s.id] && coda[s.id].modificato === s.modificato) delete coda[s.id]; });
      scrivi(LS_CODA, coda);
      if ((d.rifiutate || []).length) Portal.toast(`Registrazione rifiutata dal server: ${d.rifiutate[0].motivo}`);
      await scaricaRecenti();
    } catch { /* senza rete resta in coda */ }
    invio = false;
    avvisa();
  }

  /** Dice alla pagina Presenze (se aperta) di rileggere i dati */
  const avvisa = () => { paintButton(); window.dispatchEvent(new CustomEvent("timbra:change")); if (dlg && dlg.open) draw(); };
  const salva = rec => { coda[rec.id] = rec; scrivi(LS_CODA, coda); avvisa(); invia(); };

  const entra = luogo => {
    if (aperto()) return;
    const t = new Date();
    salva({ id: Portal.uid(), luogo, data: isoDate(t), entrata: t.toISOString(), uscita: null, note: "", fonte: "web", dispositivo: "portale", modificato: t.toISOString() });
    Portal.toast(`Entrata in «${luogo}» registrata alle ${hhmm(t)}`);
  };
  const esci = nota => {
    const o = aperto();
    if (!o) return null;
    const t = new Date(Math.max(Date.now(), Date.parse(o.entrata)));
    salva({ ...o, uscita: t.toISOString(), note: nota || o.note || "", modificato: t.toISOString() });
    Portal.toast(`Uscita registrata alle ${hhmm(t)}`);
    return o;
  };

  /* ---------- Orologio + pulsante nell'intestazione (un solo oggetto) ---------- */
  // Fuori servizio: quadrante e ora, scritta «Timbra». In servizio: l'anello interno rosso conta i minuti del turno
  // e la scritta diventa luogo + durata. Un solo timer a 1 s aggiorna tutto.
  const GIORNO = d => d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
  const durata = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
  function paintButton() {
    const b = $("#timbra-btn");
    if (!b) return;
    const n = new Date(), o = aperto();
    const hm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    const sub = document.getElementById("ck-sub");
    b.classList.toggle("in-servizio", !!o);
    if (o) {
      const ms = Math.max(0, n - Date.parse(o.entrata));
      if (sub) sub.textContent = `${o.luogo} · ${durata(ms)}`;
      b.title = `In servizio: ${o.luogo}, dalle ${hhmm(new Date(o.entrata))}. Premi per uscire`;
      b.setAttribute("aria-label", `In servizio in ${o.luogo} da ${durata(ms)}. Premi per uscire o cambiare luogo`);
    } else {
      if (sub) sub.textContent = "Timbra";
      b.title = `${n.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${hm}. Premi per timbrare entrata o uscita`;
      b.setAttribute("aria-label", "Timbra entrata o uscita");
    }
  }

  /* ---------- Finestra ---------- */
  let cambia = false;   // dopo «Esci e cambia luogo» mostra subito la scelta
  function draw() {
    if (!dlg) return;
    const o = aperto(), n = Object.keys(coda).length;
    const sub = dlg.querySelector("[data-sub]"), body = dlg.querySelector("[data-body]"), st = dlg.querySelector("[data-state]");
    st.textContent = remoto === false ? "Solo su questo browser: la timbratura parte appena torna la rete." : n ? `${n} in attesa di invio` : "";
    dlg.querySelector("h2").textContent = o ? "Sei in servizio" : "Timbra";
    clearInterval(tick);
    if (o) {
      const oggi = isoDate(new Date());
      sub.textContent = "";
      body.innerHTML = `<div class="tb-live">
          <div class="tb-where"><span class="live-dot" aria-hidden="true"></span>${esc(o.luogo)}</div>
          <div class="timer" data-timer>${clock(Date.now() - Date.parse(o.entrata))}</div>
          <p class="muted" style="margin:0">Entrato alle ${hhmm(new Date(o.entrata))}, ${o.data === oggi ? "oggi" : esc(fmtDate(o.data, { weekday: "long", day: "numeric", month: "long" }))}.${o.data !== oggi ? " Turno aperto da un altro giorno: se serve correggi l'orario dalla pagina Presenze." : ""}</p>
        </div>
        <div class="field" style="padding:6px 26px 0"><label for="tb-nota">Nota (facoltativa)</label><input id="tb-nota" value="${esc(o.note || "")}" placeholder="Es. uscita anticipata, sostituzione…" autocomplete="off"></div>
        <div class="tb-actions"><button class="btn" type="button" data-esci>Esci</button><button class="btn ghost" type="button" data-cambia>Esci ed entra altrove</button></div>
        <p class="tb-prev" data-prev></p>
        <p class="tb-more"><a href="/presenze/">Vai all'elenco delle presenze</a></p>`;
      luoghi().then(() => { const p = dlg && dlg.querySelector("[data-prev]"); if (p) p.textContent = notaPrevista(o); });
      tick = setInterval(() => { const t = dlg.querySelector("[data-timer]"); if (t && !document.hidden) t.textContent = clock(Date.now() - Date.parse(o.entrata)); }, 1000);
    } else {
      sub.textContent = "In cosa entri?";
      const ultimo = (tutte()[0] || {}).luogo;
      luoghi().then(lista => {
        if (aperto() || !dlg) return;
        body.innerHTML = `<div class="tb-grid" role="group" aria-label="Luogo">${lista.map(l => {
            const f = Orari.fasce(conf, l), ora = Orari.inCorso(conf, l);
            const righe = [ora ? "è il suo orario" : "", f === null ? "" : f.length ? `oggi ${Orari.testo(f)}` : "oggi non previsto", l === ultimo ? "l'ultimo usato" : ""].filter(Boolean);
            const cls = [l === ultimo ? "tb-last" : "", ora ? "tb-now" : ""].filter(Boolean).join(" ");
            return `<button type="button" data-luogo="${esc(l)}"${cls ? ` class="${cls}"` : ""}>${esc(l)}${righe.map(r => `<small>${esc(r)}</small>`).join("")}</button>`;
          }).join("")}</div>
          <p class="tb-more"><a href="/registro/?avvia=1">Avvia una lezione nel registro</a> · <a href="/presenze/">Presenze</a></p>`;
        const first = body.querySelector(".tb-last") || body.querySelector("[data-luogo]");
        if (first && document.activeElement === document.body) first.focus();
      });
    }
  }

  /** Frase sugli orari previsti del luogo in cui sei in servizio */
  function notaPrevista(o) {
    const f = Orari.fasce(conf, o.luogo);
    if (f === null) return "";
    if (!f.length) return `Oggi non è un giorno con orari previsti in ${o.luogo}.`;
    const fine = Orari.min(f[f.length - 1].a), ora = new Date(), t = ora.getHours() * 60 + ora.getMinutes();
    const resto = fine - t;
    const extra = resto > 0 ? `, finisci alle ${f[f.length - 1].a} (tra ${Math.floor(resto / 60)}h ${pad(resto % 60)}m)` : `, sei oltre l'orario di ${-resto} min`;
    return `Orario previsto oggi: ${Orari.testo(f)}${extra}.`;
  }

  function make() {
    dlg = document.createElement("dialog");
    dlg.className = "modal tb-modal";
    dlg.innerHTML = `<form method="dialog" onsubmit="return false">
      <header><h2>Timbra</h2><button type="button" class="x" data-close aria-label="Chiudi">×</button></header>
      <p class="tb-sub" data-sub></p>
      <div data-body></div>
      <p class="tb-state" data-state aria-live="polite"></p></form>`;
    document.body.append(dlg);
    dlg.addEventListener("click", e => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const l = e.target.closest("[data-luogo]");
      if (l) { entra(l.dataset.luogo); return dlg.close(); }
      if (e.target.closest("[data-esci]")) { esci((dlg.querySelector("#tb-nota") || {}).value?.trim()); return dlg.close(); }
      if (e.target.closest("[data-cambia]")) { esci((dlg.querySelector("#tb-nota") || {}).value?.trim()); return; }   // ridisegna da sola: ora si sceglie dove entrare
    });
    dlg.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "tb-nota") { e.preventDefault(); dlg.querySelector("[data-esci]").click(); } });
    dlg.addEventListener("close", () => clearInterval(tick));
  }

  async function open() {
    if (!dlg) make();
    if (dlg.open) return;
    coda = leggi(LS_CODA, {}); cache = leggi(LS_CACHE, {});
    draw();
    dlg.showModal();
    // dati freschi dal server, poi ridisegna (potrebbe esserci un turno aperto da un altro dispositivo)
    if (!scaricato || remoto !== true) { await scaricaRecenti(); scaricato = true; }
    else scaricaRecenti();
    paintButton();
    if (dlg.open) draw();
    invia();
  }

  /* ---------- Avvio ---------- */
  document.addEventListener("click", e => { if (e.target.closest("#timbra-btn")) { e.preventDefault(); open(); } });
  window.addEventListener("online", invia);
  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "t" && e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); open(); }   // Alt+T
  });
  window.addEventListener("storage", e => {
    if (e.key === LS_CODA) coda = leggi(LS_CODA, {}); else if (e.key === LS_CACHE) cache = leggi(LS_CACHE, {}); else return;
    paintButton(); if (dlg && dlg.open) draw();
  });
  // Pagine che chiedono di aprire subito la finestra (?timbra=1, o la pagina «Timbra» dei segnalibri)
  const auto = new URLSearchParams(location.search).has("timbra");
  document.addEventListener("DOMContentLoaded", () => {
    paintButton();
    if (auto) { history.replaceState(null, "", location.pathname); open(); }
  });
  // Stato del pulsante già al primo disegno, e dati recenti in silenzio (solo se c'è qualcosa in coda o già in cache)
  if (document.readyState !== "loading") paintButton();
  setInterval(() => { if (Object.keys(coda).length && !document.hidden) invia(); }, 60000);
  setInterval(() => { if (!document.hidden) paintButton(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) paintButton(); });

  return { open, entra, esci, aperto, tutte };
})();
