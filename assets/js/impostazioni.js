/* Jones House · Impostazioni: orari previsti per luogo + aspetto (tema).
   Orari: collezione «presenze-config» -> luoghi, orari (stessi dati di Timbra e Presenze).
   Aspetto: collezione «tema» (vedi theme.js). */
(async () => {
  /* ---------- Schede ---------- */
  const tabs = $$(".st-tabs [data-tab]");
  const vai = nome => {
    tabs.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === nome));
    $("#pane-orari").hidden = nome !== "orari";
    $("#pane-aspetto").hidden = nome !== "aspetto";
    history.replaceState(null, "", nome === "orari" ? location.pathname : "#" + nome);
  };
  tabs.forEach(b => b.addEventListener("click", () => vai(b.dataset.tab)));
  if (location.hash === "#aspetto") vai("aspetto");

  /* ======================= ORARI E LUOGHI ======================= */
  const LUOGHI_BASE = ["Scuola", "Oratorio", "Attività extrascolastica"];
  const conf = await Portal.load("presenze-config", { luoghi: LUOGHI_BASE });
  if (!Array.isArray(conf.luoghi) || !conf.luoghi.length) conf.luoghi = [...LUOGHI_BASE];
  Orari.assicura(conf);
  let sporco = false;
  const segna = v => { sporco = v; $("#st-orari-state").textContent = v ? "Modifiche non salvate" : ""; };

  const slotHtml = (l, d, i, f) => `<span class="st-slot">
      <input type="time" value="${esc(f.da)}" data-l="${esc(l)}" data-d="${d}" data-i="${i}" data-k="da" aria-label="Dalle, ${esc(Orari.GIORNI[d])}">–
      <input type="time" value="${esc(f.a)}" data-l="${esc(l)}" data-d="${d}" data-i="${i}" data-k="a" aria-label="Alle, ${esc(Orari.GIORNI[d])}">
      <button type="button" data-del="${i}" data-l="${esc(l)}" data-d="${d}" aria-label="Togli questa fascia">×</button></span>`;

  function disegna() {
    $("#st-places").innerHTML = conf.luoghi.map(l => {
      const o = conf.orari[l];
      const giorni = Orari.ORDINE.map(d => {
        const f = (o.giorni && o.giorni[d]) || [];
        return `<div class="st-day"><b>${Orari.GIORNI[d]}</b>
          <div class="st-slots">${f.length ? f.map((x, i) => slotHtml(l, d, i, x)).join("") : `<span class="st-off">Non previsto</span>`}</div>
          <button class="btn ghost sm" type="button" data-add="${d}" data-l="${esc(l)}">+ fascia</button></div>`;
      }).join("");
      return `<section class="panel st-place" data-luogo="${esc(l)}">
        <header><h3>${esc(l)}</h3><span class="sp"></span>
          <label class="st-switch"><input type="checkbox" data-prev="${esc(l)}" ${o.previsto ? "checked" : ""}><i></i><span>Ha orari previsti</span></label>
          <button class="icon-btn" type="button" data-rm="${esc(l)}" title="Togli questo luogo dall'elenco" aria-label="Togli ${esc(l)}">Rimuovi</button></header>
        ${o.previsto
          ? `<div class="st-week">${giorni}<div class="st-tools">
               <button class="btn ghost sm" type="button" data-copia="${esc(l)}">Copia il lunedì su Mar–Ven</button>
               <button class="btn ghost sm" type="button" data-svuota="${esc(l)}">Svuota la settimana</button></div></div>`
          : `<p class="st-none">Nessun orario previsto: in questo luogo si timbra liberamente e il portale non mostra fasce.</p>`}
      </section>`;
    }).join("");
  }
  disegna();

  const lista = $("#st-places");
  lista.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.prev !== undefined) {
      const o = conf.orari[t.dataset.prev];
      o.previsto = t.checked;
      // acceso per la prima volta: parte da un orario ragionevole, da correggere
      if (t.checked && !Object.values(o.giorni || {}).some(a => a && a.length)) { o.giorni = {}; [1, 2, 3, 4, 5].forEach(d => o.giorni[d] = [{ da: "09:00", a: "17:00" }]); }
      segna(true); disegna();
    } else if (t.dataset.k) {
      const f = conf.orari[t.dataset.l].giorni[t.dataset.d][+t.dataset.i];
      f[t.dataset.k] = t.value; segna(true);
    }
  });
  lista.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const l = b.dataset.l, o = l && conf.orari[l];
    if (b.dataset.add !== undefined) {
      const d = b.dataset.add; o.giorni[d] = o.giorni[d] || [];
      const ult = o.giorni[d][o.giorni[d].length - 1];
      o.giorni[d].push(ult ? { da: ult.a, a: ult.a } : { da: "09:00", a: "13:00" });
      segna(true); disegna();
    } else if (b.dataset.del !== undefined) {
      o.giorni[b.dataset.d].splice(+b.dataset.del, 1); segna(true); disegna();
    } else if (b.dataset.copia) {
      const o2 = conf.orari[b.dataset.copia];
      [2, 3, 4, 5].forEach(d => o2.giorni[d] = structuredClone((o2.giorni[1]) || []));
      segna(true); disegna(); Portal.toast("Lunedì copiato su martedì–venerdì");
    } else if (b.dataset.svuota) {
      conf.orari[b.dataset.svuota].giorni = {}; segna(true); disegna();
    } else if (b.dataset.rm) {
      if (conf.luoghi.length <= 1) return Portal.toast("Deve restare almeno un luogo");
      if (!confirm(`Togliere «${b.dataset.rm}» dall'elenco dei luoghi? Le presenze già registrate restano.`)) return;
      conf.luoghi = conf.luoghi.filter(x => x !== b.dataset.rm); delete conf.orari[b.dataset.rm];
      segna(true); disegna();
    }
  });
  $("#st-add").addEventListener("submit", e => {
    e.preventDefault();
    const n = $("#st-new").value.trim();
    if (!n) return;
    if (conf.luoghi.some(x => x.toLowerCase() === n.toLowerCase())) return Portal.toast("Questo luogo c'è già");
    conf.luoghi.push(n); Orari.assicura(conf); $("#st-new").value = "";
    segna(true); disegna();
    lista.lastElementChild.scrollIntoView({ block: "center" });
  });
  $("#st-orari-save").addEventListener("click", async () => {
    for (const l of conf.luoghi) {
      const o = conf.orari[l]; if (!o.previsto) continue;
      for (const d of Orari.ORDINE) for (const f of (o.giorni[d] || [])) {
        if (!f.da || !f.a || Orari.min(f.a) <= Orari.min(f.da)) return Portal.toast(`${l}, ${Orari.GIORNI[d]}: la fascia deve finire dopo l'inizio`);
      }
      // niente fasce sovrapposte nello stesso giorno
      for (const d of Orari.ORDINE) {
        const f = [...(o.giorni[d] || [])].sort((x, y) => Orari.min(x.da) - Orari.min(y.da));
        for (let i = 1; i < f.length; i++) if (Orari.min(f[i].da) < Orari.min(f[i - 1].a)) return Portal.toast(`${l}, ${Orari.GIORNI[d]}: due fasce si sovrappongono`);
      }
    }
    await Portal.save("presenze-config", conf);
    segna(false); Portal.toast("Orari salvati");
  });
  window.addEventListener("beforeunload", e => { if (sporco) { e.preventDefault(); e.returnValue = ""; } });

  /* ============================ ASPETTO ============================ */
  const saved = await Portal.load("tema", {});
  let tema = { ...Tema.BASE, ...saved, colori: { ...Tema.BASE.colori, ...(saved.colori || {}) } };
  delete tema.aggiornato;
  const campiColore = [["primario", "Colore principale", "testi, intestazioni, riquadro in cima"], ["accento", "Colore d'accento", "pulsanti, evidenziazioni"], ["sfondo", "Sfondo della pagina", "il fondo dietro le schede"]];
  const swatch = c => `<span class="st-sw"><i style="background:${c.primario}"></i><i style="background:${c.accento}"></i><i style="background:${c.sfondo}"></i></span>`;

  function disegnaTema() {
    const sel = (a, b) => a === b ? "true" : "false";
    $("#st-theme").innerHTML = `
      <div class="st-group"><h3>Tavolozze</h3><div class="st-presets">${Object.entries(Tema.PRESETS).map(([k, p]) =>
        `<button type="button" class="st-preset" data-preset="${k}" aria-pressed="${sel(tema.preset, k)}">${swatch(p)}${esc(p.nome)}</button>`).join("")}</div></div>
      <div class="st-group"><h3>Colori su misura</h3><div class="st-colors">${campiColore.map(([k, n, h]) =>
        `<label><input type="color" data-colore="${k}" value="${tema.colori[k]}"><span>${n}<small>${h}</small></span></label>`).join("")}</div></div>
      <div class="st-group"><h3>Caratteri</h3><div class="st-choice">${Object.entries(Tema.FONTS).map(([k, f]) =>
        `<button type="button" data-font="${k}" aria-pressed="${sel(tema.font, k)}"><b style="font-family:${f.head.replace(/"/g, "'")}">${esc(f.nome)}</b><span>${esc(f.esempio)}</span></button>`).join("")}</div></div>
      <div class="st-group"><h3>Forma di schede e pulsanti</h3><div class="st-choice">${Object.entries(Tema.RAGGI).map(([k, r]) =>
        `<button type="button" data-raggio="${k}" aria-pressed="${sel(tema.raggio, k)}"><b>${r.nome}</b><span>angoli ${k === "netto" ? "quasi vivi" : k === "medio" ? "leggeri" : "molto arrotondati"}</span></button>`).join("")}</div></div>
      <div class="st-group"><h3>Intestazione (la barra in alto)</h3><div class="st-choice">${Object.entries(Tema.HEADERS).map(([k, n]) =>
        `<button type="button" data-header="${k}" aria-pressed="${sel(tema.header, k)}"><b>${n}</b><span>${{ classico: "logo al centro, menu ai lati", sinistra: "logo e menu a sinistra", compatto: "una riga bassa, senza fascia", scuro: "fondo del colore principale", minimo: "barra sottile, logo semplice" }[k]}</span></button>`).join("")}</div></div>
      <div class="st-group"><h3>Riquadro in cima alla pagina</h3><div class="st-choice">${Object.entries(Tema.HEROS).map(([k, n]) =>
        `<button type="button" data-hero="${k}" aria-pressed="${sel(tema.hero, k)}"><b>${n}</b></button>`).join("")}</div></div>`;
  }
  const anteprima = () => Tema.applica(tema);
  disegnaTema();

  $("#st-theme").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.preset) { tema.preset = b.dataset.preset; tema.colori = { ...Tema.PRESETS[b.dataset.preset] }; delete tema.colori.nome; }
    else if (b.dataset.font) tema.font = b.dataset.font;
    else if (b.dataset.raggio) tema.raggio = b.dataset.raggio;
    else if (b.dataset.hero) tema.hero = b.dataset.hero;
    else if (b.dataset.header) tema.header = b.dataset.header;
    else return;
    anteprima(); disegnaTema();
  });
  $("#st-theme").addEventListener("input", e => {
    const c = e.target.dataset.colore; if (!c) return;
    tema.colori[c] = e.target.value; tema.preset = "personalizzato";
    anteprima();
  });
  $("#st-theme").addEventListener("change", e => { if (e.target.dataset.colore) disegnaTema(); });
  $("#st-theme-save").addEventListener("click", async () => { await Tema.salva(tema); Portal.toast("Aspetto salvato"); });
  $("#st-reset").addEventListener("click", () => { tema = structuredClone(Tema.BASE); anteprima(); disegnaTema(); });
})();
