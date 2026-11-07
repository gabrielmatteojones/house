(async () => {
  const giochi = await Portal.load("giochi", []);
  let onlyFav = false;

  const fields = () => [
    { name: "nome", label: "Nome del gioco", required: true },
    { name: "categoria", label: "Categoria", list: [...new Set(giochi.map(g => g.categoria).filter(Boolean))], half: true, placeholder: "Es. Cooperativo" },
    { name: "eta", label: "Età", half: true, placeholder: "Es. 8-12" },
    { name: "durata", label: "Durata (minuti)", type: "number", min: 0, half: true },
    { name: "giocatori", label: "Giocatori", half: true, placeholder: "Es. 4-20" },
    { name: "materiali", label: "Materiali", placeholder: "Es. palla, gessetti, cronometro" },
    { name: "descrizione", label: "Descrizione breve", type: "textarea", rows: 2 },
    { name: "regole", label: "Come si gioca", type: "textarea", rows: 5 },
    {
      name: "url", label: "Link di riferimento", type: "url",
      action: { label: "Compila dal link", run: async v => { const m = await Portal.meta(v); return { nome: m.title, descrizione: (m.description || "").slice(0, 300) }; } }
    },
    { name: "preferito", label: "Preferito", type: "checkbox", checkLabel: "Segna tra i preferiti" }
  ];

  const open = async (item, isNew) => {
    const res = await Portal.form({ title: isNew ? "Nuovo gioco" : "Modifica gioco", fields: fields(), values: item, onDelete: !isNew });
    if (!res) return;
    if (res.__delete) await Portal.remove("giochi", item.id);
    else await Portal.upsert("giochi", { ...item, ...res, url: res.url ? normUrl(res.url) : "" });
    render();
  };

  const render = () => {
    const q = $("#q").value.toLowerCase().trim(), fc = $("#fcat").value;
    const cats = [...new Set(giochi.map(g => g.categoria).filter(Boolean))].sort();
    $("#fcat").innerHTML = `<option value="">Tutte le categorie</option>` + cats.map(c => `<option${c === fc ? " selected" : ""}>${esc(c)}</option>`).join("");
    $("#ffav").classList.toggle("on", onlyFav);
    const items = giochi
      .filter(g => (!fc || g.categoria === fc) && (!onlyFav || g.preferito) && (!q || [g.nome, g.descrizione, g.materiali, g.categoria, g.regole].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "it"));
    $("#none").hidden = giochi.length > 0;
    $("#count").textContent = giochi.length ? `${items.length} di ${giochi.length} giochi` : "";
    $("#grid").innerHTML = items.map(g => `<article class="card"><div class="inner">
      <div style="display:flex;align-items:flex-start;gap:8px"><h3 style="flex:1">${esc(g.nome)}</h3><button class="star${g.preferito ? " on" : ""}" data-fav="${g.id}" aria-label="Preferito" aria-pressed="${!!g.preferito}">★</button></div>
      <div class="meta">${g.categoria ? `<span class="badge navy">${esc(g.categoria)}</span>` : ""}${g.eta ? `<span class="chip">${esc(g.eta)} anni</span>` : ""}${g.durata ? `<span class="chip">${g.durata} min</span>` : ""}${g.giocatori ? `<span class="chip">${esc(g.giocatori)} giocatori</span>` : ""}</div>
      ${g.descrizione ? `<p>${esc(g.descrizione)}</p>` : ""}
      ${g.materiali ? `<p><b>Materiali:</b> ${esc(g.materiali)}</p>` : ""}
      <div class="foot"><a class="btn sm" href="/registro/?avvia=1&gioco=${encodeURIComponent(g.nome)}">Usa in lezione</a><span class="sp"></span>${g.url ? `<a class="icon-btn" href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener" aria-label="Apri il link">↗</a>` : ""}<button class="icon-btn" data-id="${g.id}" aria-label="Modifica">✎</button></div>
    </div></article>`).join("");
  };

  $("#add").onclick = () => open({ id: Portal.uid() }, true);
  $("#q").addEventListener("input", render);
  $("#fcat").addEventListener("change", render);
  $("#ffav").onclick = () => { onlyFav = !onlyFav; render(); };
  $("#grid").addEventListener("click", async e => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { const g = giochi.find(x => x.id === fav.dataset.fav); g.preferito = !g.preferito; await Portal.save("giochi", giochi); return render(); }
    const b = e.target.closest("button[data-id]");
    if (b) open(giochi.find(g => g.id === b.dataset.id), false);
  });
  render();
})();
