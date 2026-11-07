(async () => {
  const items = await Portal.load("utili", Portal.SEED_UTILI);

  const edit = async (item) => {
    const isNew = !item;
    const cats = [...new Set(items.map(i => i.categoria).filter(Boolean))];
    const res = await Portal.form({
      title: isNew ? "Aggiungi accesso" : "Modifica accesso",
      values: item || {},
      onDelete: !isNew,
      fields: [
        { name: "nome", label: "Nome", required: true, placeholder: "Es. Zoho Mail" },
        { name: "url", label: "Indirizzo", type: "url", required: true, placeholder: "https://…" },
        { name: "categoria", label: "Gruppo", list: cats, placeholder: "Es. Posta", hint: "Gli accessi dello stesso gruppo stanno insieme." }
      ]
    });
    if (!res) return;
    if (res.__delete) await Portal.remove("utili", item.id);
    else await Portal.upsert("utili", { ...(item || {}), id: item ? item.id : Portal.uid(), nome: res.nome, url: normUrl(res.url), categoria: res.categoria || "Generale" });
    render();
  };

  const render = () => {
    const box = $("#groups");
    if (!items.length) {
      box.innerHTML = `<div class="empty"><h3>Nessun accesso</h3>Aggiungi i servizi che apri ogni giorno.</div>`;
      return;
    }
    const groups = {};
    items.forEach(i => (groups[i.categoria || "Generale"] ||= []).push(i));
    box.innerHTML = Object.entries(groups).map(([g, list]) => `<section class="group"><h2>${esc(g)}</h2><div class="tiles">${list.map(i => `
      <div class="tile">
        <a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener"><img src="${esc(favicon(i.url))}" alt="" width="36" height="36"><span><b>${esc(i.nome)}</b><small>${esc(host(i.url))}</small></span></a>
        <button class="icon-btn edit" data-id="${i.id}" aria-label="Modifica ${esc(i.nome)}">✎</button>
      </div>`).join("")}</div></section>`).join("");
  };

  $("#add").onclick = () => edit(null);
  $("#groups").addEventListener("click", e => {
    const b = e.target.closest(".edit");
    if (b) edit(items.find(i => i.id === b.dataset.id));
  });
  render();
})();
