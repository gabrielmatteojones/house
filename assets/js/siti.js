(async () => {
  const siti = await Portal.load("siti", []);
  const KEY = "gj-portale:siti-ui";
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* default */ }
  ui.mode = ui.mode || "scheda";
  const saveUi = () => localStorage.setItem(KEY, JSON.stringify(ui));

  const fields = [
    { name: "nome", label: "Nome del sito", required: true, placeholder: "Es. Playbook" },
    { name: "url", label: "Indirizzo dell'amministrazione", type: "url", required: true, placeholder: "https://…/admin" }
  ];

  const card = (s, single) => `<article class="frame-card${single ? " single" : ""}" data-id="${s.id}">
    <header><strong>${esc(s.nome)}</strong><small>${esc(host(s.url))}</small><span class="sp"></span>
      <button class="icon-btn" data-act="reload" title="Ricarica" aria-label="Ricarica">↻</button>
      <a class="icon-btn" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" title="Apri in una nuova scheda" aria-label="Apri in una nuova scheda">↗</a>
      <button class="icon-btn" data-act="full" title="Schermo intero" aria-label="Schermo intero">⤢</button>
      <button class="icon-btn" data-act="edit" title="Modifica" aria-label="Modifica">✎</button>
    </header>
    <iframe src="${esc(safeUrl(s.url))}" loading="lazy" allow="clipboard-read; clipboard-write; fullscreen" referrerpolicy="no-referrer-when-downgrade" title="${esc(s.nome)}"></iframe>
  </article>`;

  const render = () => {
    const tabs = $("#tabs"), stage = $("#stage");
    $("#none").hidden = siti.length > 0;
    $$("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === ui.mode));
    tabs.hidden = ui.mode === "mosaico";
    if (!siti.length) { tabs.innerHTML = ""; stage.innerHTML = ""; return; }
    if (!siti.some(s => s.id === ui.sel)) ui.sel = siti[0].id;
    tabs.innerHTML = siti.map(s => `<button class="tab${s.id === ui.sel ? " on" : ""}" data-id="${s.id}"><img src="${esc(favicon(s.url))}" alt="" width="16" height="16">${esc(s.nome)}</button>`).join("");
    stage.innerHTML = ui.mode === "mosaico"
      ? `<div class="mosaic">${siti.map(s => card(s, false)).join("")}</div>`
      : card(siti.find(s => s.id === ui.sel), true);
  };

  const edit = async (site) => {
    const isNew = !site;
    const res = await Portal.form({ title: isNew ? "Aggiungi sito" : "Modifica sito", fields, values: site || {}, onDelete: !isNew });
    if (!res) return;
    if (res.__delete) { await Portal.remove("siti", site.id); Portal.toast("Sito rimosso"); }
    else {
      const item = { ...(site || {}), id: site ? site.id : Portal.uid(), nome: res.nome, url: normUrl(res.url) };
      await Portal.upsert("siti", item);
      ui.sel = item.id;
      saveUi();
    }
    render();
  };

  $("#add").onclick = () => edit(null);
  $("#tabs").addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (t) { ui.sel = t.dataset.id; saveUi(); render(); }
  });
  $$("[data-mode]").forEach(b => b.addEventListener("click", () => { ui.mode = b.dataset.mode; saveUi(); render(); }));
  $("#stage").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const c = b.closest(".frame-card"), f = $("iframe", c);
    if (b.dataset.act === "reload") f.src = f.src;
    if (b.dataset.act === "full") c.requestFullscreen && c.requestFullscreen();
    if (b.dataset.act === "edit") edit(siti.find(s => s.id === c.dataset.id));
  });

  render();
})();
