/* Plugin Materiali didattici: pagina /materiali/
   Dati: collezioni "classi" e "materiali" (sincronizzate come tutto il resto, incluse nel backup).
   Un materiale può puntare a un file o a un documento del Drive, a un link, oppure essere solo una nota. */
(async () => {
  if (document.body.dataset.page !== "/materiali/") return;
  ["classi", "materiali"].forEach(n => { if (!Portal.COLLECTIONS.includes(n)) Portal.COLLECTIONS.push(n); });

  const classi = await Portal.load("classi", []);
  const materiali = await Portal.load("materiali", []);
  const files = await Portal.load("file", []);
  const docs = await Portal.load("documenti", []);

  const st = { classe: "", q: "", arg: "", stato: "" };   // classe: "" = tutte, "__none" = senza classe, altrimenti id
  const now = () => new Date().toISOString();
  const byName = (a, b) => a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });
  const cname = id => (classi.find(c => c.id === id) || {}).nome || "";
  const realClass = () => st.classe && st.classe !== "__none" ? st.classe : "";

  /* A cosa punta un materiale */
  const resolve = m => {
    const d = m.drive || "";
    if (d.startsWith("file:")) { const f = files.find(x => x.id === d.slice(5)); return f && !f.cestino ? { kind: "file", meta: f } : { kind: "missing" }; }
    if (d.startsWith("doc:")) { const x = docs.find(y => y.id === d.slice(4)); return x && !x.cestino ? { kind: "doc", meta: x } : { kind: "missing" }; }
    return m.url ? { kind: "link" } : { kind: "nota" };
  };
  const label = r => r.kind === "file" ? (r.meta.nome.includes(".") ? r.meta.nome.split(".").pop() : "file").toUpperCase().slice(0, 4)
    : ({ doc: "DOC", link: "LINK", nota: "NOTA", missing: "?" })[r.kind];

  const visible = () => {
    const q = st.q.toLowerCase().trim(), cid = realClass();
    return materiali.filter(m => {
      if (st.classe === "__none" && m.classi.length) return false;
      if (cid && !m.classi.includes(cid)) return false;
      if (cid && st.stato === "da" && (m.usato || {})[cid]) return false;
      if (cid && st.stato === "fatto" && !(m.usato || {})[cid]) return false;
      if (st.arg && m.argomento !== st.arg) return false;
      if (q && !([m.titolo, m.argomento, (m.tags || []).join(" "), m.note, m.classi.map(cname).join(" ")].join(" ").toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (b.agg || "").localeCompare(a.agg || ""));
  };

  /* ---------- Disegno ---------- */
  function drawSide() {
    const rows = [`<li><button class="mt-cl-btn${st.classe === "" ? " on" : ""}" data-c="" type="button">Tutte <span>${materiali.length}</span></button></li>`];
    [...classi].sort((a, b) => byName(a.nome, b.nome)).forEach(c => {
      rows.push(`<li><button class="mt-cl-btn${st.classe === c.id ? " on" : ""}" data-c="${esc(c.id)}" type="button">${esc(c.nome)} <span>${materiali.filter(m => m.classi.includes(c.id)).length}</span></button>
        <button class="icon-btn" data-edit="${esc(c.id)}" type="button" aria-label="Modifica ${esc(c.nome)}">✎</button></li>`);
    });
    const none = materiali.filter(m => !m.classi.length).length;
    if (none) rows.push(`<li><button class="mt-cl-btn${st.classe === "__none" ? " on" : ""}" data-c="__none" type="button">Senza classe <span>${none}</span></button></li>`);
    $("#mt-classes").innerHTML = rows.join("");
  }

  function drawChips() {
    const cid = realClass(), box = $("#mt-stato");
    box.hidden = !cid;
    if (cid) box.innerHTML = [["", "Tutti"], ["da", "Da svolgere"], ["fatto", "Già svolti"]]
      .map(([v, l]) => `<button class="chip-btn${st.stato === v ? " on" : ""}" data-s="${v}" type="button">${l}</button>`).join("");
    const args = [...new Set(materiali.map(m => m.argomento).filter(Boolean))].sort(byName);
    $("#mt-args").innerHTML = args.map(a => `<button class="chip-btn${st.arg === a ? " on" : ""}" data-a="${esc(a)}" type="button">${esc(a)}</button>`).join("");
  }

  function card(m) {
    const r = resolve(m), cid = realClass();
    const done = m.classi.map(id => {
      const d = (m.usato || {})[id];
      return `<button class="${d ? "ok" : ""}" data-act="usato" data-c="${esc(id)}" type="button" title="${d ? "Svolto il " + esc(fmtDate(d)) + " (clic per togliere)" : "Segna come svolto oggi"}">${esc(cname(id))}${d ? " ✓ " + esc(fmtDate(d, { day: "numeric", month: "short" })) : ""}</button>`;
    }).join("");
    return `<article class="card mt-card" data-id="${esc(m.id)}"><div class="inner">
      <div class="mt-pills"><span class="mt-pill${r.kind === "missing" ? " miss" : ""}">${esc(label(r))}</span>${m.argomento ? `<span class="mt-pill arg">${esc(m.argomento)}</span>` : ""}</div>
      <h3>${esc(m.titolo)}</h3>
      ${r.kind === "missing" ? `<p class="muted">Il file o documento collegato non è più nel Drive.</p>` : ""}
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
      ${(m.tags || []).length ? `<div class="mt-tag">${m.tags.map(t => "#" + esc(t)).join(" ")}</div>` : ""}
      ${done ? `<div class="mt-done">${done}</div>` : `<div class="mt-tag">Nessuna classe assegnata</div>`}
      <div class="foot">
        ${r.kind === "nota" || r.kind === "missing" ? "" : `<button class="btn sm" data-act="apri" type="button">${r.kind === "doc" ? "Apri in Drive" : "Apri"}</button>`}
        <span class="sp"></span>
        <button class="btn ghost sm" data-act="mod" type="button">Modifica</button>
      </div></div></article>`;
  }

  function render() {
    drawSide(); drawChips();
    const list = visible();
    $("#mt-grid").innerHTML = list.map(card).join("");
    const none = $("#mt-none");
    none.hidden = list.length > 0;
    if (!list.length) none.innerHTML = materiali.length
      ? "<h3>Nessun materiale</h3>Nessun risultato con questi filtri."
      : "<h3>Nessun materiale</h3>Crea una classe, poi aggiungi il primo materiale con «Nuovo materiale».";
  }

  /* ---------- Classi ---------- */
  async function editClass(c, isNew) {
    const res = await Portal.form({
      title: isNew ? "Nuova classe" : "Modifica classe", submit: isNew ? "Crea" : "Salva", onDelete: !isNew, values: c,
      fields: [{ name: "nome", label: "Nome", required: true, placeholder: "es. 2A, Corso serale, Laboratorio" },
               { name: "note", label: "Note", type: "textarea", rows: 3, hint: "Sede, orario, materia… (facoltativo)" }]
    });
    if (!res) return;
    if (res.__delete) {
      classi.splice(classi.indexOf(c), 1);
      materiali.forEach(m => { m.classi = m.classi.filter(id => id !== c.id); if (m.usato) delete m.usato[c.id]; });
      await Portal.save("classi", classi); await Portal.save("materiali", materiali);
      if (st.classe === c.id) st.classe = "";
      Portal.toast("Classe eliminata"); return render();
    }
    Object.assign(c, { nome: res.nome, note: res.note });
    await Portal.upsert("classi", c);
    render();
  }

  /* ---------- Materiali ---------- */
  async function editMat(m, isNew) {
    const args = [...new Set(materiali.map(x => x.argomento).filter(Boolean))].sort(byName);
    const drive = [["", "— Nessuno —"],
      ...files.filter(f => !f.cestino).sort((a, b) => byName(a.nome, b.nome)).map(f => ["file:" + f.id, "File · " + f.nome]),
      ...docs.filter(d => !d.cestino).sort((a, b) => byName(a.titolo || "", b.titolo || "")).map(d => ["doc:" + d.id, "Documento · " + (d.titolo || "Senza titolo")])];
    const sorted = [...classi].sort((a, b) => byName(a.nome, b.nome));
    const values = { titolo: m.titolo, argomento: m.argomento, tags: (m.tags || []).join(", "), drive: m.drive, url: m.url, note: m.note };
    sorted.forEach(c => { values["c_" + c.id] = m.classi.includes(c.id) || (isNew && st.classe === c.id); });
    const fields = [
      { name: "titolo", label: "Titolo", required: true },
      { name: "argomento", label: "Argomento", half: true, list: args },
      { name: "tags", label: "Etichette", half: true, hint: "Separate da virgola" },
      { name: "drive", label: "File o documento del Drive", type: "select", options: drive, hint: "Per un file nuovo caricalo prima nel Drive." },
      { name: "url", label: "Oppure un link esterno", type: "text", placeholder: "https://…", hint: "Se scegli un elemento del Drive, il link viene ignorato." },
      ...sorted.map(c => ({ name: "c_" + c.id, label: c.nome, type: "checkbox", checkLabel: "Classe " + c.nome })),
      { name: "note", label: "Note", type: "textarea", rows: 3 }
    ];
    const res = await Portal.form({ title: isNew ? "Nuovo materiale" : "Modifica materiale", fields, values, submit: isNew ? "Aggiungi" : "Salva", onDelete: !isNew });
    if (!res) return;
    if (res.__delete) { materiali.splice(materiali.indexOf(m), 1); await Portal.save("materiali", materiali); Portal.toast("Materiale eliminato"); return render(); }
    const cls = sorted.filter(c => res["c_" + c.id]).map(c => c.id);
    m.usato = Object.fromEntries(Object.entries(m.usato || {}).filter(([id]) => cls.includes(id)));
    Object.assign(m, {
      titolo: res.titolo, argomento: res.argomento, tags: res.tags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean),
      drive: res.drive, url: res.drive ? "" : normUrl(res.url), note: res.note, classi: cls, agg: now()
    });
    if (isNew) { m.creato = m.agg; materiali.push(m); }
    await Portal.save("materiali", materiali);
    render();
  }

  async function openMat(m) {
    const r = resolve(m);
    if (r.kind === "link") return void window.open(safeUrl(m.url), "_blank", "noopener");
    if (r.kind === "doc") { location.href = "/drive/#" + (r.meta.cartella ? "c/" + r.meta.cartella : "mio"); return; }
    if (r.kind !== "file") return;
    try {
      if (typeof Viewers === "undefined") await Portal.script("/assets/js/viewers.js");
      Viewers.open(r.meta, { getBlob: () => Portal.blobs.get(r.meta), onClose: () => {} });
    } catch (err) { Portal.toast(err.message || "Impossibile aprire il file"); }
  }

  /* ---------- Eventi ---------- */
  $("#mt-classes").addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) return editClass(classi.find(c => c.id === ed.dataset.edit), false);
    const b = e.target.closest("[data-c]");
    if (b) { st.classe = b.dataset.c; st.stato = ""; render(); }
  });
  $("#mt-newclass").onclick = () => editClass({ id: Portal.uid(), nome: "", note: "" }, true);
  $("#mt-new").onclick = () => editMat({ id: Portal.uid(), titolo: "", argomento: "", tags: [], drive: "", url: "", note: "", classi: [], usato: {} }, true);
  $("#mt-q").addEventListener("input", e => { st.q = e.target.value; render(); });
  $("#mt-stato").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) { st.stato = b.dataset.s; render(); } });
  $("#mt-args").addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b) { st.arg = st.arg === b.dataset.a ? "" : b.dataset.a; render(); } });
  $("#mt-grid").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const m = materiali.find(x => x.id === b.closest("[data-id]").dataset.id);
    if (b.dataset.act === "apri") return openMat(m);
    if (b.dataset.act === "mod") return editMat(m, false);
    if (b.dataset.act === "usato") {
      const c = b.dataset.c;
      m.usato ||= {};
      if (m.usato[c]) delete m.usato[c]; else m.usato[c] = isoDate(new Date());
      await Portal.upsert("materiali", m);
      render();
    }
  });

  // Dati vecchi o incompleti: garantisce i campi che il resto del codice si aspetta
  materiali.forEach(m => { m.classi ||= []; m.tags ||= []; m.usato ||= {}; });
  render();
})();
