(async () => {
  const libri = await Portal.load("libri", []);
  const STATI = ["Disponibile", "In prestito", "Da leggere", "Letto"];
  let lastBib = libri.length ? libri[libri.length - 1].biblioteca || "" : "";

  const fill = m => ({
    url: m.url, titolo: m.title, autore: m.author, isbn: m.isbn, editore: m.publisher,
    anno: m.year, pagine: m.pages, copertina: m.cover, descrizione: m.description
  });

  const fields = () => [
    { name: "url", label: "Link del libro", type: "url", autorun: true, hint: "Negozio online, catalogo o scheda del libro. Premi «Estrai info» per compilare i campi.", action: { label: "Estrai info", run: async v => fill(await Portal.meta(v)) } },
    { name: "titolo", label: "Titolo", required: true },
    { name: "autore", label: "Autore" },
    { name: "isbn", label: "ISBN", half: true },
    { name: "anno", label: "Anno", type: "number", min: 0, half: true },
    { name: "editore", label: "Editore", half: true },
    { name: "pagine", label: "Pagine", type: "number", min: 0, half: true },
    { name: "copertina", label: "Copertina (indirizzo immagine)", type: "url" },
    { name: "descrizione", label: "Descrizione", type: "textarea", rows: 3 },
    { name: "biblioteca", label: "Biblioteca o amministrazione", list: [...new Set(libri.map(l => l.biblioteca).filter(Boolean))], half: true, hint: "Per tenere un unico catalogo di più realtà." },
    { name: "stato", label: "Stato", type: "select", options: STATI, half: true },
    { name: "note", label: "Note", type: "textarea", rows: 2 }
  ];

  const open = async (item, isNew) => {
    const res = await Portal.form({
      title: isNew ? "Nuovo libro" : "Scheda del libro",
      fields: fields(), values: item, onDelete: !isNew, submit: isNew ? "Aggiungi al catalogo" : "Salva"
    });
    if (!res) return;
    if (res.__delete) { await Portal.remove("libri", item.id); Portal.toast("Libro eliminato"); }
    else {
      const next = { ...item, ...res, url: res.url ? normUrl(res.url) : "" };
      if (isNew && next.isbn && libri.some(l => l.isbn && l.isbn === next.isbn) && !confirm("Un libro con questo ISBN è già in catalogo. Aggiungerlo comunque?")) return;
      lastBib = next.biblioteca || lastBib;
      await Portal.upsert("libri", next);
      if (isNew) Portal.toast("Libro aggiunto");
    }
    render();
  };

  const render = () => {
    const q = $("#q").value.toLowerCase().trim(), fb = $("#fbib").value, fs = $("#fst").value;
    const bibs = [...new Set(libri.map(l => l.biblioteca).filter(Boolean))].sort();
    $("#fbib").innerHTML = `<option value="">Tutte le biblioteche</option>` + bibs.map(b => `<option${b === fb ? " selected" : ""}>${esc(b)}</option>`).join("");
    $("#fst").innerHTML = `<option value="">Ogni stato</option>` + STATI.map(s => `<option${s === fs ? " selected" : ""}>${s}</option>`).join("");
    const items = libri
      .filter(l => (!fb || l.biblioteca === fb) && (!fs || l.stato === fs) && (!q || [l.titolo, l.autore, l.isbn, l.editore].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (a.titolo || "").localeCompare(b.titolo || "", "it"));
    $("#none").hidden = libri.length > 0;
    $("#count").textContent = libri.length ? `${items.length} di ${libri.length} libri` : "";
    $("#grid").innerHTML = items.map(l => `<button class="book" data-id="${l.id}">
      <div class="cover">${l.copertina ? `<img src="${esc(safeUrl(l.copertina))}" alt="${esc(l.titolo)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="nocover">${esc(l.titolo)}</div>`}
        ${l.stato && l.stato !== "Disponibile" ? `<span class="badge${l.stato === "In prestito" ? "" : " navy"}">${esc(l.stato)}</span>` : ""}</div>
      <b>${esc(l.titolo)}</b><small>${esc(l.autore || "Autore sconosciuto")}</small></button>`).join("");
  };

  // Se una copertina non si carica, mostra il titolo al suo posto
  $("#grid").addEventListener("error", e => {
    if (e.target.tagName === "IMG") e.target.outerHTML = `<div class="nocover">${esc(e.target.alt)}</div>`;
  }, true);
  $("#grid").addEventListener("click", e => { const b = e.target.closest(".book"); if (b) open(libri.find(l => l.id === b.dataset.id), false); });

  $("#quick").onsubmit = async e => {
    e.preventDefault();
    const input = $("#qin"), btn = $("button", e.target), v = input.value.trim();
    if (!v) return;
    btn.disabled = true;
    btn.textContent = "Leggo…";
    let item = { id: Portal.uid(), url: /^[0-9Xx-]{10,17}$/.test(v) ? "" : normUrl(v), isbn: /^[0-9Xx-]{10,17}$/.test(v) ? v : "", biblioteca: lastBib, stato: "Disponibile", aggiunto: new Date().toISOString() };
    try { item = { ...item, ...fill(await Portal.meta(v)), biblioteca: lastBib, stato: "Disponibile" }; }
    catch (err) { Portal.toast(err.message + ". Compila a mano i dati."); }
    btn.disabled = false;
    btn.textContent = "Aggiungi libro";
    input.value = "";
    await open(item, true);
  };

  ["input", "change"].forEach(ev => { $("#q").addEventListener(ev, render); $("#fbib").addEventListener(ev, render); $("#fst").addEventListener(ev, render); });
  render();
})();
