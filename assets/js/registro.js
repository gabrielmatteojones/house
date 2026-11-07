(async () => {
  const reg = await Portal.load("registro", []);
  const giochi = await Portal.load("giochi", []);
  const lez = await Portal.load("lezioni", []);

  const DRAFT = "gj-portale:registro-bozza";
  let draft = null, tick = null;

  $("#gameslist").innerHTML = giochi.map(g => g.nome).sort().map(n => `<option value="${esc(n)}">`).join("");
  const tags = Portal.chips($("#l_giochi"));

  /* ---------- Lezione in corso ---------- */
  const pad = n => String(n).padStart(2, "0");
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

  const persist = () => {
    if (!draft) return;
    draft.titolo = $("#l_titolo").value;
    draft.descrizione = $("#l_desc").value;
    draft.giochi = tags.values();
    draft.presenti = Number($("#l_pres").value) || 0;
    draft.note = $("#l_note").value;
    localStorage.setItem(DRAFT, JSON.stringify(draft));
  };

  const show = on => {
    $("#live").hidden = !on;
    $("#startbar").hidden = on;
    clearInterval(tick);
    if (on) { tick = setInterval(() => { $("#timer").textContent = clock(Date.now() - draft.start); }, 1000); $("#timer").textContent = clock(Date.now() - draft.start); }
  };

  const start = (pre = {}) => {
    draft = { start: Date.now(), titolo: "", descrizione: "", giochi: [], presenti: 0, note: "", ...pre };
    $("#l_titolo").value = draft.titolo;
    $("#l_desc").value = draft.descrizione;
    tags.set(draft.giochi);
    $("#l_pres").value = draft.presenti;
    $("#l_note").value = draft.note;
    persist();
    show(true);
    $("#l_titolo").focus();
  };

  const end = async () => {
    persist();
    const s = new Date(draft.start), e = new Date();
    const entry = {
      id: Portal.uid(),
      titolo: draft.titolo.trim() || `Lezione del ${fmtDate(isoDate(s))}`,
      data: isoDate(s), inizio: hhmm(s), fine: hhmm(e),
      durata: Math.max(1, Math.round((e - s) / 60000)),
      descrizione: draft.descrizione.trim(), giochi: tags.get(),
      presenti: draft.presenti, note: draft.note.trim(), lezioneId: draft.lezioneId || ""
    };
    await Portal.upsert("registro", entry);
    localStorage.removeItem(DRAFT);
    draft = null;
    show(false);
    render();
    Portal.toast("Lezione salvata nel registro");
  };

  $("#start").onclick = () => start();
  $("#end").onclick = end;
  $("#discard").onclick = () => {
    if (!confirm("Annullare la lezione in corso? Quello che hai scritto andrà perso.")) return;
    localStorage.removeItem(DRAFT);
    draft = null;
    show(false);
  };
  $("#live").addEventListener("input", persist);
  $("#live").addEventListener("chips", persist);
  $("#minus").onclick = () => { const i = $("#l_pres"); i.value = Math.max(0, (Number(i.value) || 0) - 1); persist(); };
  $("#plus").onclick = () => { const i = $("#l_pres"); i.value = (Number(i.value) || 0) + 1; persist(); };

  /* ---------- Inserimento e modifica manuali ---------- */
  const edit = async (item) => {
    const isNew = !item;
    const base = item || { id: Portal.uid(), data: isoDate(new Date()), presenti: 0 };
    const res = await Portal.form({
      title: isNew ? "Lezione già svolta" : "Modifica lezione",
      values: { ...base, giochi: (base.giochi || []).join(", ") },
      onDelete: !isNew,
      fields: [
        { name: "titolo", label: "Titolo", required: true },
        { name: "data", label: "Data", type: "date", required: true, half: true },
        { name: "presenti", label: "Presenti", type: "number", min: 0, half: true },
        { name: "inizio", label: "Inizio", type: "time", half: true },
        { name: "fine", label: "Fine", type: "time", half: true },
        { name: "giochi", label: "Gioco o attività", list: giochi.map(g => g.nome).sort(), hint: "Più voci separate da virgola." },
        { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 },
        { name: "note", label: "Note", type: "textarea", rows: 3 }
      ]
    });
    if (!res) return;
    if (res.__delete) { await Portal.remove("registro", base.id); Portal.toast("Lezione eliminata"); return render(); }
    let durata = base.durata || 0;
    if (res.inizio && res.fine) {
      const [h1, m1] = res.inizio.split(":").map(Number), [h2, m2] = res.fine.split(":").map(Number);
      durata = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
    }
    await Portal.upsert("registro", { ...base, ...res, presenti: Number(res.presenti) || 0, durata, giochi: res.giochi.split(",").map(s => s.trim()).filter(Boolean) });
    render();
  };
  $("#manual").onclick = () => edit(null);

  /* ---------- Storico ---------- */
  const render = () => {
    const q = $("#q").value.toLowerCase().trim();
    const items = reg
      .filter(r => !q || [r.titolo, r.descrizione, r.note, (r.giochi || []).join(" ")].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.data + (b.inizio || "")).localeCompare(a.data + (a.inizio || "")));

    const minutes = reg.reduce((s, r) => s + (r.durata || 0), 0);
    const withPres = reg.filter(r => r.presenti > 0);
    const avg = withPres.length ? (withPres.reduce((s, r) => s + r.presenti, 0) / withPres.length).toFixed(1).replace(".", ",") : "0";
    $("#stats").innerHTML = reg.length
      ? [["Lezioni", reg.length, "registrate"], ["Ore", (minutes / 60).toFixed(1).replace(".", ","), "di lezione"], ["Presenti", avg, "in media"]]
        .map(([n, v, s]) => `<div class="stat"><b>${v}</b><span>${n}</span><small>${s}</small></div>`).join("")
      : "";

    $("#none").hidden = reg.length > 0;
    let html = "", month = "";
    items.forEach(r => {
      const mk = r.data.slice(0, 7);
      if (mk !== month) { month = mk; html += `<h2 class="month-title">${fmtDate(mk + "-01", { month: "long", year: "numeric" })}</h2>`; }
      html += `<article class="entry"><div class="date"><b>${Number(r.data.slice(8))}</b><span>${fmtDate(r.data, { month: "short" })}</span></div>
        <div class="body"><h3>${esc(r.titolo)}</h3>
        <p class="meta">${r.inizio ? esc(r.inizio) + (r.fine ? "–" + esc(r.fine) : "") + ", " : ""}${r.durata || 0} min, ${r.presenti || 0} presenti</p>
        ${(r.giochi || []).length ? `<div class="row-chips">${r.giochi.map(g => `<span class="chip">${esc(g)}</span>`).join("")}</div>` : ""}
        ${r.descrizione ? `<p>${esc(r.descrizione)}</p>` : ""}
        ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}</div>
        <button class="btn ghost sm" data-id="${r.id}">Modifica</button></article>`;
    });
    $("#list").innerHTML = html;
  };

  $("#q").addEventListener("input", render);
  $("#list").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) edit(reg.find(r => r.id === b.dataset.id)); });

  /* ---------- Avvio ---------- */
  render();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DRAFT)); } catch { /* nessuna bozza */ }
  const params = new URLSearchParams(location.search);

  if (saved && saved.start) {
    draft = saved;
    $("#l_titolo").value = draft.titolo || "";
    $("#l_desc").value = draft.descrizione || "";
    tags.set(draft.giochi || []);
    $("#l_pres").value = draft.presenti || 0;
    $("#l_note").value = draft.note || "";
    show(true);
    if (params.has("avvia")) Portal.toast("Hai già una lezione in corso: la riprendo");
  } else if (params.has("avvia")) {
    const pre = {};
    const l = lez.find(x => x.id === params.get("lezione"));
    if (l) Object.assign(pre, { titolo: l.titolo, descrizione: l.descrizione || "", giochi: l.gioco ? [l.gioco] : [], lezioneId: l.id });
    if (params.get("gioco")) pre.giochi = [...new Set([...(pre.giochi || []), params.get("gioco")])];
    start(pre);
  }
  if (params.has("avvia")) history.replaceState(null, "", location.pathname);
})();
