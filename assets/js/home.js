(async () => {
  const [libri, giochi, docs, link, siti, lez, reg, utili] = await Promise.all([
    Portal.load("libri"), Portal.load("giochi"), Portal.load("documenti"), Portal.load("link"),
    Portal.load("siti"), Portal.load("lezioni"), Portal.load("registro"), Portal.load("utili", Portal.SEED_UTILI)
  ]);

  const h = new Date().getHours();
  $("#page-title").textContent = `${h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera"}, Gabriel`;

  const today = isoDate(new Date());
  const next = lez.filter(l => l.data >= today).sort((a, b) => (a.data + (a.inizio || "")).localeCompare(b.data + (b.inizio || "")));

  const stats = [
    ["Documenti", docs.length, "/documenti/", "salvati"],
    ["Siti", siti.length, "/siti/", "collegati"],
    ["Libri", libri.length, "/libri/", "in catalogo"],
    ["Giochi", giochi.length, "/giochi/", "nella raccolta"],
    ["Link", link.length, "/link/", "salvati"],
    ["Lezioni", next.length, "/calendario/", "in programma"],
    ["Registro", reg.length, "/registro/", "lezioni registrate"]
  ];
  $("#stats").innerHTML = stats.map(([n, v, u, s]) => `<a class="stat" href="${u}"><b>${v}</b><span>${n}</span><small>${s}</small></a>`).join("");

  $("#next").innerHTML = next.slice(0, 5).map(l => `<li><time>${fmtDate(l.data, { day: "numeric", month: "short" })}</time><span><a href="/calendario/">${esc(l.titolo)}</a><br><small class="muted">${esc(l.inizio || "")}${l.luogo ? ", " + esc(l.luogo) : ""}</small></span></li>`).join("")
    || `<li class="muted">Nessuna lezione in programma. <a href="/calendario/">Apri il calendario</a></li>`;

  const recent = [...reg].sort((a, b) => (b.data + (b.inizio || "")).localeCompare(a.data + (a.inizio || ""))).slice(0, 5);
  $("#recent").innerHTML = recent.map(r => `<li><time>${fmtDate(r.data, { day: "numeric", month: "short" })}</time><span><a href="/registro/">${esc(r.titolo)}</a><br><small class="muted">${r.durata || 0} min, ${r.presenti || 0} presenti</small></span></li>`).join("")
    || `<li class="muted">Ancora nessuna lezione. <a href="/registro/?avvia=1">Avvia la prima</a></li>`;

  $("#quick").innerHTML = utili.map(u => `<div class="tile"><a href="${esc(safeUrl(u.url))}" target="_blank" rel="noopener"><img src="${esc(favicon(u.url))}" alt="" width="36" height="36"><span><b>${esc(u.nome)}</b><small>${esc(host(u.url))}</small></span></a></div>`).join("")
    || `<p class="muted">Nessun accesso salvato. <a href="/accessi/">Aggiungine uno</a></p>`;

  $("#export").onclick = () => Portal.exportAll();
  $("#import").onclick = () => $("#file").click();
  $("#file").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm("Il ripristino sostituisce i dati attuali con quelli del file. Continuare?")) return;
    try { await Portal.importAll(f); Portal.toast("Backup ripristinato"); setTimeout(() => location.reload(), 900); }
    catch (err) { Portal.toast(err.message || "File non valido"); }
  };
})();
