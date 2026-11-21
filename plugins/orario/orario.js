/* Plugin Orario di scuola: pagina /orario/
   Dati: collezione "orario" (sincronizzata come tutto il resto, inclusa nel backup).
   Lun–Gio: 08:40–16:40, 7 ore da 60', pausa pranzo 12:40–13:40.
   Venerdì: 08:40–13:40, 5 ore da 60', nessuna pausa. */
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
  const find = (g, r) => orario.find(x => x.giorno === g && x.riga === r);
  const hue = s => { let h = 0; for (const ch of (s || "").toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const byName = (a, b) => a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });
  const sub = e => [e.classe, e.aula && "aula " + e.aula].filter(Boolean).join(" · ");

  /* Giorno e ora attuali (1 = lunedì … 5 = venerdì, 0 = weekend) */
  const adesso = () => {
    const d = new Date(), js = d.getDay();
    return { g: js >= 1 && js <= 5 ? js : 0, min: d.getHours() * 60 + d.getMinutes() };
  };
  const isNow = (g, r) => {
    const n = adesso(), s = slot(g, r);
    return n.g === g && s.tipo !== "fuori" && n.min >= minuti(s.da) && n.min < minuti(s.a);
  };

  /* ---------- Disegno ---------- */
  function drawGrid() {
    const n = adesso(), out = [`<div></div>`];
    GIORNI.forEach((nome, i) => out.push(`<div class="or-head${n.g === i + 1 ? " today" : ""}">${nome}<small>${orarioGiorno(i + 1)}</small></div>`));
    for (let r = 0; r < RIGHE; r++) {
      const ref = slot(1, r);
      out.push(`<div class="or-time">${ref.da}–${ref.a}</div>`);
      for (let g = 1; g <= 5; g++) {
        const s = slot(g, r), e = find(g, r);
        if (s.tipo === "fuori") { out.push(`<div class="or-cell or-off" aria-hidden="true"></div>`); continue; }
        if (s.tipo === "pausa") { out.push(`<div class="or-cell or-pausa">Pausa pranzo</div>`); continue; }
        const aria = `${GIORNI[g - 1]}, ${s.ora}ª ora, ${s.da}–${s.a}`;
        if (!e) { out.push(`<button class="or-cell" data-g="${g}" data-r="${r}" type="button" aria-label="Aggiungi: ${aria}"><span class="plus">+</span></button>`); continue; }
        const dim = st.classe && e.classe !== st.classe;
        out.push(`<button class="or-cell full${dim ? " dim" : ""}${isNow(g, r) ? " now" : ""}" style="--h:${hue(e.materia)}" data-g="${g}" data-r="${r}" type="button" aria-label="${esc(e.materia)}, ${aria}">
          <b>${esc(e.materia)}</b>${sub(e) ? `<small>${esc(sub(e))}</small>` : ""}</button>`);
      }
    }
    $("#or-grid").innerHTML = out.join("");
  }

  function drawToday() {
    const n = adesso(), g = n.g || 1;
    $("#or-today-title").textContent = n.g ? "Oggi" : GIORNI[0];
    $("#or-today-sub").textContent = n.g ? `${GIORNI[g - 1]} · ${orarioGiorno(g)}` : `Oggi non c'è scuola · prossimo giorno · ${orarioGiorno(1)}`;
    const rows = [];
    for (let r = 0; r < RIGHE; r++) {
      const s = slot(g, r);
      if (s.tipo === "fuori") continue;
      const t = `<span class="or-t">${s.da}<br>${s.a}</span>`;
      if (s.tipo === "pausa") { rows.push(`<li class="pausa">${t}<span>Pausa pranzo</span></li>`); continue; }
      const e = find(g, r);
      if (!e) { rows.push(`<li class="free">${t}<span>${s.ora}ª ora · libera</span></li>`); continue; }
      rows.push(`<li class="lez${isNow(g, r) ? " now" : ""}" style="--h:${hue(e.materia)}">${t}<span><b>${esc(e.materia)}</b>${sub(e) ? `<small>${esc(sub(e))}</small>` : ""}</span></li>`);
    }
    $("#or-today").innerHTML = rows.join("");
  }

  function drawMeta() {
    let tot = 0, fatte = 0;
    for (let g = 1; g <= 5; g++) for (let r = 0; r < RIGHE; r++) if (slot(g, r).tipo === "lezione") { tot++; if (find(g, r)) fatte++; }
    $("#or-summary").textContent = `${tot} ore scolastiche a settimana · ${fatte} compilate`;
    const usate = [...new Set(orario.map(e => e.classe).filter(Boolean))].sort(byName), box = $("#or-classi");
    if (st.classe && !usate.includes(st.classe)) st.classe = "";
    box.hidden = usate.length < 2;
    box.innerHTML = usate.map(c => `<button class="chip-btn${st.classe === c ? " on" : ""}" data-cl="${esc(c)}" type="button">${esc(c)}</button>`).join("");
  }

  const render = () => { drawGrid(); drawToday(); drawMeta(); };

  /* ---------- Modifica ---------- */
  async function edit(g, r) {
    const s = slot(g, r), cur = find(g, r), isNew = !cur;
    const e = cur || { id: Portal.uid(), giorno: g, riga: r, materia: "", classe: "", aula: "", note: "" };
    const materie = [...new Set(orario.map(x => x.materia).filter(Boolean))].sort(byName);
    const cls = [...new Set([...classi.map(c => c.nome), ...orario.map(x => x.classe)].filter(Boolean))].sort(byName);
    const res = await Portal.form({
      title: `${GIORNI[g - 1]} · ${s.ora}ª ora (${s.da}–${s.a})`, submit: isNew ? "Aggiungi" : "Salva", onDelete: !isNew, values: e,
      fields: [
        { name: "materia", label: "Materia", required: true, list: materie },
        { name: "classe", label: "Classe", half: true, list: cls, placeholder: "es. 2A" },
        { name: "aula", label: "Aula", half: true, placeholder: "es. 12, Lab. info" },
        { name: "note", label: "Note", type: "textarea", rows: 2 }
      ]
    });
    if (!res) return;
    if (res.__delete) { orario.splice(orario.indexOf(e), 1); await Portal.save("orario", orario); Portal.toast("Ora rimossa"); return render(); }
    Object.assign(e, { materia: res.materia.trim(), classe: (res.classe || "").trim(), aula: (res.aula || "").trim(), note: res.note || "" });
    if (isNew) orario.push(e);
    await Portal.save("orario", orario);
    render();
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
  $("#or-clear").onclick = async () => {
    if (!orario.length) return Portal.toast("L'orario è già vuoto");
    if (!confirm("Svuotare tutto l'orario? L'operazione non si può annullare.")) return;
    orario.length = 0;
    await Portal.save("orario", orario);
    Portal.toast("Orario svuotato");
    render();
  };

  // Dati vecchi o incompleti: garantisce i tipi che il resto del codice si aspetta
  orario.forEach(e => { e.giorno = +e.giorno; e.riga = +e.riga; });
  render();
  setInterval(render, 60000);   // aggiorna l'evidenziazione dell'ora corrente
})();
