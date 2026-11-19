/* Presenze in rete · pagina del portale
   Le registrazioni passano da una coda locale: se la rete manca restano nel browser
   e partono da sole appena torna. Usa le funzioni comuni di core.js ($, esc, Portal…). */
(async () => {
  const LS_CODA = "gj-presenze:coda";     // modifiche non ancora inviate: id -> registrazione
  const LS_CACHE = "gj-presenze:cache";   // ultima copia ricevuta dal server: mese -> [registrazioni]
  const LUOGHI_BASE = ["Scuola", "Oratorio", "Attività extrascolastica"];

  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota piena */ } };

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
  const jsonOk = r => r.ok && (r.headers.get("content-type") || "").includes("json");

  let coda = leggi(LS_CODA, {});
  let cache = leggi(LS_CACHE, {});
  let remoto = null;                       // null = non verificato, true = Netlify, false = solo browser
  let mese = meseDi(new Date());
  let scelto = "";
  let mostrato = "";                       // id del turno di cui il campo nota è già compilato
  const conf = await Portal.load("presenze-config", { luoghi: LUOGHI_BASE });
  if (!Array.isArray(conf.luoghi) || !conf.luoghi.length) conf.luoghi = [...LUOGHI_BASE];

  /* ---------- Dati: server + coda locale ---------- */
  const tutte = () => {
    const m = new Map();
    const metti = r => { const o = m.get(r.id); if (!o || r.modificato >= o.modificato) m.set(r.id, r); };
    Object.values(cache).forEach(l => l.forEach(metti));
    Object.values(coda).forEach(metti);
    return [...m.values()].filter(r => !r.eliminato);
  };
  const delMese = mo => tutte().filter(r => r.data.slice(0, 7) === mo).sort((a, b) => b.entrata.localeCompare(a.entrata));
  const aperto = () => tutte().filter(r => !r.uscita).sort((a, b) => b.entrata.localeCompare(a.entrata))[0] || null;
  const luoghiTutti = () => [...new Set([...conf.luoghi, ...tutte().map(r => r.luogo)])];

  async function scarica(mo) {
    try {
      const r = await fetch(`/api/presenze?mese=${mo}`, { cache: "no-store" });
      if (!jsonOk(r)) throw new Error("api");
      cache[mo] = (await r.json()).registrazioni || [];
      remoto = true;
      scrivi(LS_CACHE, cache);
      return true;
    } catch { if (remoto === null) remoto = false; return false; }
  }

  let invio = false;
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
      if ((d.rifiutate || []).length) Portal.toast(`Registrazione rifiutata dal server: ${d.rifiutate[0].motivo}`);
      const oggi = meseDi(new Date());
      await Promise.all([...new Set([mese, oggi, spostaMese(oggi, -1)])].map(scarica));
    } catch { /* senza rete: resta in coda e riprova più tardi */ }
    invio = false;
    disegna();
  }

  const salva = rec => { coda[rec.id] = rec; scrivi(LS_CODA, coda); disegna(); invia(); };

  /* ---------- Disegno ---------- */
  const stato = () => {
    const n = Object.keys(coda).length;
    const el = $("#sync");
    if (el) {
      el.textContent = remoto === false ? "Solo su questo browser" : n ? `${n} in attesa di invio` : "Sincronizzato";
      el.dataset.ok = remoto !== false && !n ? "1" : "0";
    }
    $("#pr-queue").textContent = n ? `${n} presenz${n === 1 ? "a" : "e"} in attesa di invio da questa pagina.` : "";
  };

  function disegna() {
    const o = aperto();
    const oggi = isoDate(new Date());
    $("#pr-idle").hidden = !!o;
    $("#pr-live").hidden = !o;
    $("#pr-badge").classList.toggle("on", !!o);

    if (o) {
      $("#pr-live-luogo").textContent = o.luogo;
      const quando = o.data === oggi ? "oggi" : fmtDate(o.data, { weekday: "long", day: "numeric", month: "long" });
      $("#pr-live-since").textContent = `Entrato alle ${hhmm(new Date(o.entrata))}, ${quando}.` + (o.data !== oggi ? " Il turno è aperto da un altro giorno: se hai dimenticato di uscire, correggi l'orario dall'elenco." : "");
      $("#pr-timer").textContent = clock(Date.now() - Date.parse(o.entrata));
      if (mostrato !== o.id) { $("#pr-note").value = o.note || ""; mostrato = o.id; }
    } else {
      mostrato = "";
      const lista = conf.luoghi;
      if (!lista.includes(scelto)) scelto = (tutte().sort((a, b) => b.entrata.localeCompare(a.entrata))[0] || {}).luogo;
      if (!lista.includes(scelto)) scelto = lista[0] || "";
      $("#pr-luoghi").innerHTML = lista.map(n => `<button type="button" class="chip-btn" role="radio" aria-checked="${n === scelto}" data-l="${esc(n)}">${esc(n)}</button>`).join("");
    }

    // Elenco del mese
    $("#pr-month").textContent = etichettaMese(mese);
    $("#pr-next").disabled = mese >= meseDi(new Date());
    const sel = $("#pr-filter"), filtro = sel.value;
    sel.innerHTML = `<option value="">Tutti i luoghi</option>` + luoghiTutti().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    sel.value = luoghiTutti().includes(filtro) ? filtro : "";

    const delM = delMese(mese);
    const viste = delM.filter(r => !sel.value || r.luogo === sel.value);
    const inCoda = id => id in coda;

    let html = "", giorno = "";
    const perGiorno = {};
    viste.forEach(r => { perGiorno[r.data] = (perGiorno[r.data] || 0) + minuti(r); });
    viste.forEach(r => {
      if (r.data !== giorno) {
        giorno = r.data;
        html += `<tr class="pr-day"><td colspan="6">${fmtDate(giorno, { weekday: "long", day: "numeric", month: "long" })}<span>${durata(perGiorno[giorno])}</span></td></tr>`;
      }
      const lungo = !r.uscita ? r.data !== oggi : minuti(r) > 16 * 60;
      const tag = [
        !r.uscita && r.data !== oggi ? `<span class="pr-tag warn">Uscita mancante</span>` : "",
        r.uscita && lungo ? `<span class="pr-tag warn">Controlla</span>` : "",
        r.fonte === "offline" ? `<span class="pr-tag">Offline</span>` : r.fonte === "manuale" ? `<span class="pr-tag">A mano</span>` : "",
        inCoda(r.id) ? `<span class="pr-tag wait">In attesa</span>` : ""
      ].join("");
      html += `<tr><td class="luogo">${esc(r.luogo)}${tag}</td>
        <td class="num">${hhmm(new Date(r.entrata))}</td>
        <td class="num">${r.uscita ? hhmm(new Date(r.uscita)) : `<span class="pr-tag">In corso</span>`}</td>
        <td class="num">${durata(minuti(r))}</td>
        <td class="nota">${esc(r.note || "")}</td>
        <td class="act"><button class="btn ghost sm" type="button" data-id="${esc(r.id)}">Modifica</button></td></tr>`;
    });
    $("#pr-rows").innerHTML = html;
    $("#pr-none").hidden = viste.length > 0;
    $("#pr-tablewrap").hidden = viste.length === 0;

    // Riepiloghi
    const minOggi = tutte().filter(r => r.data === oggi).reduce((s, r) => s + minuti(r), 0);
    const minMese = delM.reduce((s, r) => s + minuti(r), 0);
    $("#pr-stats").innerHTML = [
      ["Oggi", ore(minOggi), "ore"],
      [etichettaMese(mese).replace(/ \d{4}$/, ""), ore(minMese), "ore nel mese"],
      ["Turni", delM.length, "nel mese"]
    ].map(([n, v, s]) => `<div class="stat"><b>${v}</b><span style="text-transform:capitalize">${n}</span><small>${s}</small></div>`).join("");

    const perLuogo = {};
    delM.forEach(r => { perLuogo[r.luogo] = (perLuogo[r.luogo] || 0) + minuti(r); });
    $("#pr-totals-panel").hidden = !delM.length;
    $("#pr-totals").innerHTML = Object.entries(perLuogo).sort((a, b) => b[1] - a[1])
      .map(([n, m]) => `<li><time>${durata(m)}</time><span>${esc(n)}</span></li>`).join("");

    stato();
  }

  /* ---------- Timbrare ---------- */
  $("#pr-luoghi").addEventListener("click", e => {
    const b = e.target.closest("[data-l]");
    if (!b) return;
    scelto = b.dataset.l;
    $$("#pr-luoghi [data-l]").forEach(x => x.setAttribute("aria-checked", x === b));
  });

  $("#pr-in").onclick = () => {
    if (aperto()) return;
    if (!scelto) return Portal.toast("Aggiungi prima un luogo");
    const t = new Date();
    salva({ id: Portal.uid(), luogo: scelto, data: isoDate(t), entrata: t.toISOString(), uscita: null, note: "", fonte: "web", dispositivo: "portale", modificato: t.toISOString() });
    Portal.toast(`Entrata registrata alle ${hhmm(t)}`);
  };

  $("#pr-out").onclick = () => {
    const o = aperto();
    if (!o) return;
    const t = new Date(Math.max(Date.now(), Date.parse(o.entrata)));
    salva({ ...o, uscita: t.toISOString(), note: $("#pr-note").value.trim() || o.note || "", modificato: t.toISOString() });
    Portal.toast(`Uscita registrata alle ${hhmm(t)}`);
  };

  $("#pr-note").addEventListener("change", () => {
    const o = aperto();
    if (o) salva({ ...o, note: $("#pr-note").value.trim(), modificato: adesso() });
  });

  /* ---------- Modifica e inserimento a mano ---------- */
  async function scheda(rec) {
    const nuova = !rec;
    const base = rec || { id: Portal.uid(), luogo: scelto || conf.luoghi[0] || "", entrata: adesso(), uscita: null, note: "", fonte: "manuale" };
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
      if (res.__delete) { salva({ ...base, eliminato: true, modificato: adesso() }); Portal.toast("Presenza eliminata"); return; }
      v = res;
      const e = new Date(res.entrata), u = res.uscita ? new Date(res.uscita) : null;
      if (isNaN(e)) { Portal.toast("Entrata non valida"); continue; }
      if (u && (isNaN(u) || u < e)) { Portal.toast("L'uscita deve essere dopo l'entrata"); continue; }
      const altro = aperto();
      if (!u && altro && altro.id !== base.id) { Portal.toast("Hai già un turno aperto: chiudilo prima"); continue; }

      const next = { ...base, luogo: res.luogo, data: isoDate(e), entrata: e.toISOString(), uscita: u ? u.toISOString() : null, note: res.note, modificato: adesso() };
      if (!nuova) {   // se il turno cambia mese, il server deve sapere da dove arriva
        const origine = base.precedente || base.data;
        if (origine.slice(0, 7) !== next.data.slice(0, 7)) next.precedente = origine; else delete next.precedente;
      }
      if (!conf.luoghi.includes(next.luogo)) { conf.luoghi.push(next.luogo); Portal.save("presenze-config", conf); }
      salva(next);
      return;
    }
  }
  $("#pr-add").onclick = () => scheda(null);
  $("#pr-rows").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (b) scheda(tutte().find(r => r.id === b.dataset.id));
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
    disegna();
  };

  /* ---------- Mese, filtro, esportazione ---------- */
  const vaiA = async m => { mese = m; disegna(); await scarica(m); disegna(); };
  $("#pr-prev").onclick = () => vaiA(spostaMese(mese, -1));
  $("#pr-next").onclick = () => vaiA(spostaMese(mese, 1));
  $("#pr-filter").addEventListener("change", disegna);

  $("#pr-csv").onclick = () => {
    const f = $("#pr-filter").value;
    const righe = delMese(mese).filter(r => !f || r.luogo === f).reverse();
    if (!righe.length) return Portal.toast("Niente da esportare");
    const cella = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = ["Data;Luogo;Entrata;Uscita;Minuti;Durata;Note"].concat(righe.map(r => [
      r.data, r.luogo, hhmm(new Date(r.entrata)), r.uscita ? hhmm(new Date(r.uscita)) : "", minuti(r), r.uscita ? durata(minuti(r)) : "in corso", r.note || ""
    ].map(cella).join(";"))).join("\r\n");
    Portal.download(`presenze-${mese}.csv`, new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  };

  /* ---------- Badge offline ---------- */
  $("#pr-download").onclick = async () => {
    try {
      const r = await fetch("/presenze/badge-offline.html", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const testo = (await r.text()).split("__PORTAL_URL__").join(location.origin);
      Portal.download("presenze-in-rete.html", new Blob([testo], { type: "text/html;charset=utf-8" }));
    } catch { Portal.toast("Download non riuscito, riprova"); }
  };

  /* ---------- Avvio ---------- */
  disegna();
  const oggiM = meseDi(new Date());
  await Promise.all([...new Set([mese, oggiM, spostaMese(oggiM, -1)])].map(scarica));
  disegna();
  invia();

  setInterval(() => { const o = aperto(); if (o) $("#pr-timer").textContent = clock(Date.now() - Date.parse(o.entrata)); }, 500);
  setInterval(() => { if (aperto()) disegna(); if (Object.keys(coda).length) invia(); }, 60000);
  window.addEventListener("online", invia);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) invia(); });
})();
