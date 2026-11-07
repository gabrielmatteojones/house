(async () => {
  const links = await Portal.load("link", []);
  let tag = "";

  const tagsOf = l => (l.tag || "").split(",").map(t => t.trim()).filter(Boolean);
  const fill = m => ({ url: m.url, titolo: m.title, descrizione: (m.description || "").slice(0, 300), immagine: m.cover });

  const fields = [
    { name: "url", label: "Indirizzo", type: "url", required: true, autorun: true, action: { label: "Leggi dal link", run: async v => fill(await Portal.meta(v)) } },
    { name: "titolo", label: "Titolo", required: true },
    { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 },
    { name: "immagine", label: "Immagine (indirizzo)", type: "url" },
    { name: "tag", label: "Etichette", hint: "Separate da virgola, ad esempio: giochi, idee, da leggere" }
  ];

  const edit = async (item) => {
    const res = await Portal.form({ title: "Modifica link", fields, values: item, onDelete: true });
    if (!res) return;
    if (res.__delete) await Portal.remove("link", item.id);
    else await Portal.upsert("link", { ...item, ...res, url: normUrl(res.url) });
    render();
  };

  const render = () => {
    const q = $("#q").value.toLowerCase();
    const all = [...new Set(links.flatMap(tagsOf))].sort();
    if (tag && !all.includes(tag)) tag = "";
    $("#tags").innerHTML = all.length ? [`<button class="chip-btn${tag ? "" : " on"}" data-tag="">Tutti</button>`, ...all.map(t => `<button class="chip-btn${t === tag ? " on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`)].join("") : "";
    const items = links.filter(l => (!tag || tagsOf(l).includes(tag)) && (!q || [l.titolo, l.descrizione, l.url, l.tag].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (b.salvato || "").localeCompare(a.salvato || ""));
    $("#none").hidden = links.length > 0;
    $("#grid").innerHTML = items.map(l => `<article class="card">
      <div class="thumb"${l.immagine ? ` style="background-image:url('${esc(safeUrl(l.immagine))}')"` : ""}>${l.immagine ? "" : `<img src="${esc(favicon(l.url))}" alt="">`}</div>
      <div class="inner">
        <h3><a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.titolo)}</a></h3>
        ${l.descrizione ? `<p>${esc(l.descrizione)}</p>` : ""}
        ${tagsOf(l).length ? `<div class="meta">${tagsOf(l).map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="foot"><span>${esc(host(l.url))}</span><span class="sp"></span><button class="icon-btn" data-id="${l.id}" aria-label="Modifica">✎</button></div>
      </div></article>`).join("");
  };

  $("#quick").onsubmit = async e => {
    e.preventDefault();
    const input = $("#qin"), btn = $("button", e.target);
    const url = normUrl(input.value);
    btn.disabled = true;
    btn.textContent = "Leggo…";
    let item = { id: Portal.uid(), url, titolo: host(url) || url, descrizione: "", immagine: "", tag: "", salvato: new Date().toISOString() };
    try { item = { ...item, ...fill(await Portal.meta(url)) }; }
    catch (err) { Portal.toast(err.message + ". Salvato solo l'indirizzo."); }
    if (links.some(l => l.url === item.url)) Portal.toast("Questo link era già salvato");
    await Portal.upsert("link", item);
    input.value = "";
    btn.disabled = false;
    btn.textContent = "Salva link";
    render();
  };

  $("#q").addEventListener("input", render);
  $("#tags").addEventListener("click", e => { const b = e.target.closest("[data-tag]"); if (b) { tag = b.dataset.tag; render(); } });
  $("#grid").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) edit(links.find(l => l.id === b.dataset.id)); });
  render();
})();
