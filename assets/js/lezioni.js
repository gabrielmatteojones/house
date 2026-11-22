(async () => {
  const lez = await Portal.load("lezioni", []);
  const giochi = await Portal.load("giochi", []);
  let cur = new Date();
  cur.setDate(1);

  const byTime = (a, b) => (a.data + (a.inizio || "")).localeCompare(b.data + (b.inizio || ""));

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
      const ev = lez.filter(l => l.data === key).sort(byTime);
      cells += `<div class="day${d.getMonth() !== m ? " out" : ""}${key === today ? " today" : ""}" data-date="${key}">
        <span class="num">${d.getDate()}</span>
        ${ev.slice(0, 3).map(l => `<button class="ev" data-id="${l.id}" title="${esc(l.titolo)}"><b>${esc(l.inizio || "")}</b>${esc(l.titolo)}</button>`).join("")}
        ${ev.length > 3 ? `<span class="more">altre ${ev.length - 3}</span>` : ""}</div>`;
    }
    $("#cal").innerHTML = dows + cells;

    const up = lez.filter(l => l.data >= today).sort(byTime).slice(0, 8);
    $("#upcoming").innerHTML = up.map(l => `<li><time>${fmtDate(l.data, { day: "numeric", month: "short" })}</time>
      <span><a href="#" data-id="${l.id}">${esc(l.titolo)}</a><br><small class="muted">${esc(l.inizio || "")}${l.fine ? "–" + esc(l.fine) : ""}${l.luogo ? ", " + esc(l.luogo) : ""}${l.gioco ? ", " + esc(l.gioco) : ""}</small></span></li>`).join("")
      || `<li class="muted">Nessun appuntamento in programma.</li>`;
  };

  const open = async (item, isNew) => {
    const fields = [
      { name: "titolo", label: "Titolo", required: true },
      { name: "data", label: "Data", type: "date", required: true, half: true },
      { name: "luogo", label: "Luogo", half: true },
      { name: "inizio", label: "Inizio", type: "time", half: true },
      { name: "fine", label: "Fine", type: "time", half: true },
      { name: "gioco", label: "Gioco o attività previsti", list: giochi.map(g => g.nome).sort() },
      { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 }
    ];
    if (isNew) fields.push({ name: "ripeti", label: "Ripeti ogni settimana per altre", type: "number", min: 0, hint: "Numero di settimane. Lascia 0 per una lezione singola." });

    const res = await Portal.form({
      title: isNew ? "Nuova lezione" : "Modifica lezione", fields, values: item,
      onDelete: !isNew, extra: isNew ? [] : [{ label: "Avvia lezione", value: "avvia" }]
    });
    if (!res) return;
    if (res.__delete) { await Portal.remove("lezioni", item.id); Portal.toast("Lezione eliminata"); return render(); }

    const { ripeti = 0, __extra, ...data } = res;
    if (isNew) {
      for (let i = 0; i <= (Number(ripeti) || 0); i++) {
        const d = new Date(data.data + "T12:00:00");
        d.setDate(d.getDate() + 7 * i);
        lez.push({ ...item, ...data, id: i === 0 ? item.id : Portal.uid(), data: isoDate(d) });
      }
      await Portal.save("lezioni", lez);
      Portal.toast(ripeti > 0 ? `Aggiunte ${Number(ripeti) + 1} lezioni` : "Lezione aggiunta");
    } else {
      await Portal.upsert("lezioni", { ...item, ...data });
    }
    if (__extra === "avvia") { location.href = `/registro/?avvia=1&lezione=${encodeURIComponent(item.id)}`; return; }
    render();
  };

  $("#prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); render(); };
  $("#next").onclick = () => { cur.setMonth(cur.getMonth() + 1); render(); };
  $("#today-btn").onclick = () => { cur = new Date(); cur.setDate(1); render(); };
  $("#add").onclick = () => open({ id: Portal.uid(), data: isoDate(new Date()), ripeti: 0 }, true);

  $("#cal").addEventListener("click", e => {
    const ev = e.target.closest(".ev");
    if (ev) return open(lez.find(l => l.id === ev.dataset.id), false);
    const day = e.target.closest(".day");
    if (day) open({ id: Portal.uid(), data: day.dataset.date, ripeti: 0 }, true);
  });
  $("#upcoming").addEventListener("click", e => {
    const a = e.target.closest("a[data-id]");
    if (a) { e.preventDefault(); open(lez.find(l => l.id === a.dataset.id), false); }
  });
  render();
})();
