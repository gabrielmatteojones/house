/* Timbra · solo entrata e uscita. Stessa coda locale e stessi dati della pagina Presenze. */
(async () => {
  const LS_CODA = "gj-presenze:coda", LS_CACHE = "gj-presenze:cache";
  const LUOGHI_BASE = ["Scuola", "Oratorio", "Attività extrascolastica"];
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const pad = n => String(n).padStart(2, "0");
  const meseDi = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const jsonOk = r => r.ok && (r.headers.get("content-type") || "").includes("json");

  let coda = leggi(LS_CODA, {}), cache = leggi(LS_CACHE, {}), remoto = null, scelto = "";
  const conf = await Portal.load("presenze-config", { luoghi: LUOGHI_BASE });
  if (!Array.isArray(conf.luoghi) || !conf.luoghi.length) conf.luoghi = [...LUOGHI_BASE];

  const tutte = () => {
    const m = new Map();
    const metti = r => { const o = m.get(r.id); if (!o || r.modificato >= o.modificato) m.set(r.id, r); };
    Object.values(cache).forEach(l => l.forEach(metti));
    Object.values(coda).forEach(metti);
    return [...m.values()].filter(r => !r.eliminato).sort((a, b) => b.entrata.localeCompare(a.entrata));
  };
  const aperto = () => tutte().find(r => !r.uscita) || null;

  async function scarica(mo) {
    try {
      const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
      if (!jsonOk(r)) throw 0;
      cache[mo] = (await r.json()).registrazioni || [];
      remoto = true; scrivi(LS_CACHE, cache);
    } catch { if (remoto === null) remoto = false; }
  }
  let invio = false;
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
      await scarica(meseDi(new Date()));
    } catch {}
    invio = false; disegna();
  }
  const salva = rec => { coda[rec.id] = rec; scrivi(LS_CODA, coda); disegna(); invia(); };

  function disegna() {
    const o = aperto(), n = Object.keys(coda).length, el = $("#sync");
    $("#pr-idle").hidden = !!o;
    $("#pr-live").hidden = !o;
    $("#pr-badge").classList.toggle("on", !!o);
    if (el) {
      el.textContent = remoto === false ? "Solo su questo browser" : n ? `${n} in attesa di invio` : "Sincronizzato";
      el.dataset.ok = remoto !== false && !n ? "1" : "0";
    }
    if (o) {
      $("#pr-live-luogo").textContent = o.luogo;
      const oggi = isoDate(new Date());
      $("#pr-live-since").textContent = `Entrato alle ${hhmm(new Date(o.entrata))}, ${o.data === oggi ? "oggi" : fmtDate(o.data, { weekday: "long", day: "numeric", month: "long" })}.` + (o.data !== oggi ? " Turno aperto da un altro giorno: correggi l'orario dall'elenco." : "");
      $("#pr-timer").textContent = clock(Date.now() - Date.parse(o.entrata));
    } else {
      const lista = conf.luoghi;
      if (!lista.includes(scelto)) scelto = (tutte()[0] || {}).luogo;
      if (!lista.includes(scelto)) scelto = lista[0] || "";
      $("#pr-luoghi").innerHTML = lista.map(l => `<button type="button" class="chip-btn" role="radio" aria-checked="${l === scelto}" data-l="${esc(l)}">${esc(l)}</button>`).join("");
    }
  }

  $("#pr-luoghi").addEventListener("click", e => {
    const b = e.target.closest("[data-l]");
    if (!b) return;
    scelto = b.dataset.l;
    $$("#pr-luoghi [data-l]").forEach(x => x.setAttribute("aria-checked", x === b));
  });
  $("#pr-in").onclick = () => {
    if (aperto()) return;
    if (!scelto) return Portal.toast("Aggiungi prima un luogo dalla pagina Presenze");
    const t = new Date();
    salva({ id: Portal.uid(), luogo: scelto, data: isoDate(t), entrata: t.toISOString(), uscita: null, note: "", fonte: "web", dispositivo: "portale", modificato: t.toISOString() });
    Portal.toast(`Entrata registrata alle ${hhmm(t)}`);
  };
  $("#pr-out").onclick = () => {
    const o = aperto();
    if (!o) return;
    const t = new Date(Math.max(Date.now(), Date.parse(o.entrata)));
    salva({ ...o, uscita: t.toISOString(), modificato: t.toISOString() });
    Portal.toast(`Uscita registrata alle ${hhmm(t)}`);
  };

  disegna();
  const oggi = new Date();
  await Promise.all([meseDi(oggi), meseDi(new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1))].map(scarica));
  disegna(); invia();
  setInterval(() => { const o = aperto(); if (o && !document.hidden) $("#pr-timer").textContent = clock(Date.now() - Date.parse(o.entrata)); }, 1000);
  setInterval(() => { if (Object.keys(coda).length) invia(); }, 60000);
  window.addEventListener("online", invia);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { scarica(meseDi(new Date())).then(disegna); invia(); } });
  window.addEventListener("storage", e => { if (e.key === LS_CODA) coda = leggi(LS_CODA, {}); else if (e.key === LS_CACHE) cache = leggi(LS_CACHE, {}); else return; disegna(); });
})();
