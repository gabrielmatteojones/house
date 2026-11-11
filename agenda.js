(async () => {
  // Categorie e colori: modificali qui
  const CATS = {
    personale: { nome: "Personale", colore: "#101c4d" },
    famiglia:  { nome: "Famiglia",  colore: "#2e7d5b" },
    salute:    { nome: "Salute",    colore: "#0b7a8a" },
    lavoro:    { nome: "Lavoro",    colore: "#6a4c93" },
    scadenza:  { nome: "Scadenza",  colore: "#d3121b" },
    altro:     { nome: "Altro",     colore: "#6b7280" }
  };
  const REPS = [["", "Non si ripete"], ["sett", "Ogni settimana"], ["mese", "Ogni mese"], ["anno", "Ogni anno"]];

  const items = await Portal.load("agenda", []);
  let cur = new Date();
  cur.setDate(1);
  let filtro = "";

  const cat = e => CATS[e.categoria] || CATS.altro;
  const byTime = (a, b) => (a.inizio || "").localeCompare(b.inizio || "") || a.titolo.localeCompare(b.titolo);
  const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

  // L'impegno cade nel giorno indicato (data singola o ricorrenza)?
  const occurs = (e, key) => {
    if (filtro && e.categoria !== filtro) return false;
    if (e.data === key) return true;
    if (!e.ripeti || key < e.data) return false;
    if (e.ripeti === "sett") return dayDiff(e.data, key) % 7 === 0;
    if (e.ripeti === "mese") return e.data.slice(8) === key.slice(8);
    if (e.ripeti === "anno") return e.data.slice(5) === key.slice(5);
    return false;
  };
  const on = key => items.filter(e => occurs(e, key)).sort(byTime);
  const when = e => e.tutto ? "Tutto il giorno" : `${e.inizio || ""}${e.fine ? "–" + e.fine : ""}`;

  const renderChips = () => {
    $("#cats").innerHTML =
      `<button class="chip-btn${filtro ? "" : " on"}" data-cat="">Tutte</button>` +
      Object.entries(CATS).map(([k, c]) =>
        `<button class="chip-btn${filtro === k ? " on" : ""}" data-cat="${k}"><span class="dot" style="--c:${c.colore}"></span>${esc(c.nome)}</button>`).join("");
  };

  const render = () => {
    $("#month").textContent = cur.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const y = cur.getFullYear(), m = cur.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const total = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
    const today = isoDate(new Date());
    const dows = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => `<div class="dow">${d}</div>`).join("");

    let cells = "";
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m, 1 - offset + i), key = isoDate(d);
      const ev = on(key);
      cells += `<div class="day${d.getMonth() !== m ? " out" : ""}${key === today ? " today" : ""}" data-date="${key}">
        <span class="num">${d.getDate()}</span>
        ${ev.slice(0, 3).map(e => `<button class="ev p${e.ripeti ? " rep" : ""}" style="--c:${cat(e).colore}" data-id="${e.id}" title="${esc(e.titolo)}"><b>${e.tutto ? "" : esc(e.inizio || "")}</b>${esc(e.titolo)}</button>`).join("")}
        ${ev.length > 3 ? `<span class="more">altri ${ev.length - 3}</span>` : ""}</div>`;
    }
    $("#cal").innerHTML = dows + cells;

    // Prossimi impegni: i prossimi 10 nei 180 giorni a venire
    const up = [];
    for (let i = 0; i < 180 && up.length < 10; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const key = isoDate(d);
      on(key).forEach(e => up.push({ e, key }));
    }
    $("#upcoming").innerHTML = up.slice(0, 10).map(({ e, key }) => `<li><time>${fmtDate(key, { day: "numeric", month: "short" })}</time>
      <span><span class="dot" style="--c:${cat(e).colore}"></span><a href="#" data-id="${e.id}">${esc(e.titolo)}</a><br>
      <small class="muted">${esc(when(e))}${e.luogo ? ", " + esc(e.luogo) : ""}${e.ripeti ? ", si ripete" : ""}</small></span></li>`).join("")
      || `<li class="muted">Nessun impegno in programma.</li>`;
  };

  const open = async (item, isNew) => {
    const fields = [
      { name: "titolo", label: "Titolo", required: true },
      { name: "data", label: "Data", type: "date", required: true, half: true },
      { name: "categoria", label: "Categoria", type: "select", half: true, options: Object.entries(CATS).map(([k, c]) => [k, c.nome]) },
      { name: "tutto", label: "Tutto il giorno", type: "checkbox", checkLabel: "Tutto il giorno" },
      { name: "inizio", label: "Inizio", type: "time", half: true },
      { name: "fine", label: "Fine", type: "time", half: true },
      { name: "luogo", label: "Luogo" },
      { name: "ripeti", label: "Ripetizione", type: "select", options: REPS, hint: "Modificando o eliminando un impegno ricorrente cambia tutta la serie." },
      { name: "descrizione", label: "Note", type: "textarea", rows: 3 }
    ];
    const res = await Portal.form({ title: isNew ? "Nuovo impegno" : "Modifica impegno", fields, values: item, onDelete: !isNew });
    if (!res) return;
    if (res.__delete) { await Portal.remove("agenda", item.id); Portal.toast("Impegno eliminato"); return render(); }
    const data = { ...item, ...res };
    data.tutto = !!res.tutto;
    if (data.tutto) { data.inizio = ""; data.fine = ""; }
    await Portal.upsert("agenda", data);
    Portal.toast(isNew ? "Impegno aggiunto" : "Impegno aggiornato");
    render();
  };

  const blank = date => ({ id: Portal.uid(), data: date, categoria: "personale", ripeti: "", tutto: false });

  $("#prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); render(); };
  $("#next").onclick = () => { cur.setMonth(cur.getMonth() + 1); render(); };
  $("#today-btn").onclick = () => { cur = new Date(); cur.setDate(1); render(); };
  $("#add").onclick = () => open(blank(isoDate(new Date())), true);

  $("#cats").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    filtro = b.dataset.cat;
    renderChips();
    render();
  });
  $("#cal").addEventListener("click", e => {
    const ev = e.target.closest(".ev");
    if (ev) return open(items.find(x => x.id === ev.dataset.id), false);
    const day = e.target.closest(".day");
    if (day) open(blank(day.dataset.date), true);
  });
  $("#upcoming").addEventListener("click", e => {
    const a = e.target.closest("a[data-id]");
    if (a) { e.preventDefault(); open(items.find(x => x.id === a.dataset.id), false); }
  });

  renderChips();
  render();
})();
