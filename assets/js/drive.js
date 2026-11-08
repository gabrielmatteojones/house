/* Jones House · Drive */
(async () => {
  const [cartelle, files, docs] = await Promise.all([
    Portal.load("cartelle", []), Portal.load("file", []), Portal.load("documenti", [])
  ]);

  const UI_KEY = "gj-portale:drive-ui";
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { /* predefiniti */ }
  ui.mode = ui.mode === "list" ? "list" : "grid";
  ui.sort = ["nome", "mod", "size"].includes(ui.sort) ? ui.sort : "mod";
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* niente */ } };

  const st = { view: "mio", folder: "", q: "", type: "" };
  const MAX = 100 * 1024 * 1024;
  const DAY = 864e5;
  const plain = h => (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const shortDate = iso => iso ? fmtDate(iso.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : "";

  /* ---------- Modello ---------- */
  const byId = id => cartelle.find(c => c.id === id);
  const trashedAnc = p => { let g = 0; while (p && g++ < 60) { const f = byId(p); if (!f) return false; if (f.cestino) return true; p = f.parent; } return false; };
  const pathOf = id => { const out = []; let g = 0; while (id && g++ < 60) { const f = byId(id); if (!f) break; out.unshift(f); id = f.parent; } return out; };
  const okParent = p => (p && byId(p) ? p : "");

  const all = () => [
    ...cartelle.map(f => ({ kind: "folder", id: f.id, nome: f.nome, parent: okParent(f.parent), mod: f.aggiornato || f.creato || "", fav: f.preferito, trash: f.cestino, raw: f })),
    ...docs.map(d => ({ kind: "doc", id: d.id, nome: d.titolo || "Senza titolo", parent: okParent(d.cartella), mod: d.aggiornato || d.creato || "", size: 0, fav: d.preferito, trash: d.cestino, raw: d, type: "doc" })),
    ...files.map(f => ({ kind: "file", id: f.id, nome: f.nome, parent: okParent(f.cartella), mod: f.aggiornato || f.creato || "", size: f.size || 0, fav: f.preferito, trash: f.cestino, raw: f, type: Viewers.kindOf(f) }))
  ];
  const live = it => !it.trash && !trashedAnc(it.parent);

  const CAT = { docx: "documenti", doc: "documenti", text: "documenti", pdf: "pdf", pptx: "presentazioni", ppt: "presentazioni", image: "immagini" };
  const cat = it => it.kind === "folder" ? "cartelle" : it.kind === "doc" ? "documenti" : CAT[it.type] || "altro";
  const TYPES = [["", "Tutti"], ["cartelle", "Cartelle"], ["documenti", "Documenti"], ["pdf", "PDF"], ["presentazioni", "Presentazioni"], ["immagini", "Immagini"], ["altro", "Altro"]];

  const kindOfItem = it => it.kind === "folder" ? "folder" : it.kind === "doc" ? "doc" : it.type;
  const badgeOf = it => Viewers.badge(kindOfItem(it) === "doc" && it.kind === "file" ? "doc_" : kindOfItem(it));

  const cmpFor = key => ({
    nome: (a, b) => a.nome.localeCompare(b.nome, "it", { numeric: true, sensitivity: "base" }),
    mod: (a, b) => (b.mod || "").localeCompare(a.mod || ""),
    size: (a, b) => (b.size || 0) - (a.size || 0) || a.nome.localeCompare(b.nome, "it")
  })[key];

  function visible() {
    const q = st.q.trim().toLowerCase();
    let list = all();
    if (st.view === "cestino") list = list.filter(it => it.trash && !trashedAnc(it.parent));
    else {
      list = list.filter(live);
      if (st.view === "mio" && !q) list = list.filter(it => it.parent === st.folder);
      else if (st.view === "recenti") list = list.filter(it => it.kind !== "folder");
      else if (st.view === "preferiti") list = list.filter(it => it.fav);
    }
    if (q) list = list.filter(it => (it.nome + " " + (it.kind === "doc" ? plain(it.raw.html) : "")).toLowerCase().includes(q));
    if (st.type) list = list.filter(it => cat(it) === st.type);
    const cmp = cmpFor(st.view === "recenti" ? "mod" : ui.sort);
    list.sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || cmp(a, b));
    if (st.view === "recenti") list = list.slice(0, 60);
    return list;
  }

  /* ---------- Disegno ---------- */
  const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor"/></svg>`;
  const thumbCache = new Map();
  const thumbKey = it => it.id + "|" + (it.raw.aggiornato || "");

  const tbadge = it => { const [l, c] = badgeOf(it); return it.kind === "folder" ? `<span class="tbadge folder" style="--c:${c}">${FOLDER_SVG}</span>` : `<span class="tbadge" style="--c:${c}">${l}</span>`; };

  const meta = it => {
    if (st.view === "cestino" && it.trash) return `Eliminato il ${shortDate(it.trash)}`;
    const where = (st.q || st.view === "recenti" || st.view === "preferiti") && it.parent ? pathOf(it.parent).map(f => f.nome).join(" / ") + " · " : "";
    const bits = [shortDate(it.mod)];
    if (it.kind === "file") bits.push(Portal.fmtSize(it.size));
    return esc(where) + bits.filter(Boolean).join(" · ");
  };

  const thumbInner = it => {
    if (it.kind === "doc") return `<div class="snip">${esc(plain(it.raw.html).replace(/\s+/g, " ").trim().slice(0, 240)) || "<span class='muted'>Documento vuoto</span>"}</div>`;
    const c = thumbCache.get(thumbKey(it));
    if (c) return `<img src="${esc(c)}" alt="" loading="lazy">`;
    const [l, col] = badgeOf(it);
    return `<div class="big-badge" style="--c:${col}">${l}</div>`;
  };

  const star = it => it.fav ? `<span class="fav" title="Preferito" aria-label="Preferito">★</span>` : "";
  const menuBtn = it => `<button class="icon-btn dk" data-menu aria-label="Azioni per ${esc(it.nome)}">⋮</button>`;
  const attrs = it => `data-k="${it.kind}" data-id="${it.id}" tabindex="0" role="button" draggable="${st.view !== "cestino"}"`;

  const gridCard = it => it.kind === "folder"
    ? `<div class="dcard dfolder" ${attrs(it)}>${tbadge(it)}<b title="${esc(it.nome)}">${esc(it.nome)}</b>${star(it)}${menuBtn(it)}</div>`
    : `<div class="dcard" ${attrs(it)}>
        <div class="dthumb"${it.kind === "file" ? ` data-thumb="${it.id}"` : ""}>${thumbInner(it)}</div>
        <div class="dfoot">${tbadge(it)}<b title="${esc(it.nome)}">${esc(it.nome)}</b>${star(it)}${menuBtn(it)}</div>
        <small>${meta(it)}</small></div>`;

  const listRow = it => `<div class="drow" ${attrs(it)}>
      ${tbadge(it)}<span class="nm"><b title="${esc(it.nome)}">${esc(it.nome)}</b>${star(it)}</span>
      <span class="c-mod">${meta(it)}</span><span class="c-size">${it.kind === "file" ? Portal.fmtSize(it.size) : "—"}</span>${menuBtn(it)}</div>`;

  function paintSide() {
    $$("#sideNav button").forEach(b => b.classList.toggle("on", b.dataset.view === st.view));
    const trash = all().filter(it => it.trash && !trashedAnc(it.parent)).length;
    const tc = $("#trashCount");
    tc.hidden = !trash;
    tc.textContent = trash;
    const used = files.reduce((s, f) => s + (f.size || 0), 0) + docs.reduce((s, d) => s + (d.html || "").length, 0);
    $("#usedTxt").textContent = Portal.fmtSize(used) + " usati";
    $("#usedSub").textContent = `${files.filter(f => !f.cestino).length} file · ${docs.filter(d => !d.cestino).length} documenti · ${cartelle.filter(c => !c.cestino).length} cartelle`;
  }

  function paintCrumbs() {
    const c = $("#crumbs");
    if (st.q.trim()) c.innerHTML = `<span class="cr-now">Risultati per «${esc(st.q.trim())}»</span>`;
    else if (st.view === "mio") {
      const path = pathOf(st.folder);
      c.innerHTML = [`<button class="cr" data-crumb="" ${path.length ? "" : 'aria-current="page"'}>Il mio Drive</button>`,
        ...path.map((f, i) => `<span class="cr-sep" aria-hidden="true">›</span><button class="cr" data-crumb="${f.id}"${i === path.length - 1 ? ' aria-current="page"' : ""}>${esc(f.nome)}</button>`)].join("");
    } else c.innerHTML = `<span class="cr-now">${{ recenti: "Recenti", preferiti: "Preferiti", cestino: "Cestino" }[st.view]}</span>${st.view === "cestino" ? `<span class="muted cr-note">Gli elementi si eliminano da soli dopo 30 giorni</span>` : ""}`;
  }

  function paintTypes() {
    const show = st.view !== "cestino";
    $("#types").hidden = !show;
    $("#types").innerHTML = show ? TYPES.map(([v, l]) => `<button class="chip-btn${st.type === v ? " on" : ""}" data-type="${v}">${l}</button>`).join("") : "";
  }

  const EMPTY = {
    mio: ["Questa cartella è vuota", "Trascina qui dei file, oppure premi «Nuovo» per creare un documento o una cartella."],
    recenti: ["Ancora niente di recente", "Qui trovi gli ultimi documenti e file che hai aperto o modificato."],
    preferiti: ["Nessun preferito", "Dal menu ⋮ di un elemento scegli «Aggiungi ai preferiti» per averlo sempre a portata di mano."],
    cestino: ["Il cestino è vuoto", "Gli elementi eliminati restano qui per 30 giorni."],
    cerca: ["Nessun risultato", "Prova con un'altra parola o togli il filtro."]
  };

  function render() {
    paintSide();
    paintCrumbs();
    paintTypes();
    $$("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === ui.mode));
    $("#sort").value = ui.sort;
    $("#sort").hidden = st.view === "recenti";
    $("#emptyTrash").hidden = !(st.view === "cestino" && all().some(it => it.trash && !trashedAnc(it.parent)));
    const list = visible(), box = $("#items");
    const none = $("#none");
    none.hidden = list.length > 0;
    if (!list.length) {
      const [h, t] = (st.q.trim() || st.type) ? EMPTY.cerca : EMPTY[st.view];
      none.innerHTML = `<h3>${h}</h3>${t}`;
      box.innerHTML = "";
      return;
    }
    const folders = list.filter(i => i.kind === "folder"), rest = list.filter(i => i.kind !== "folder");
    if (ui.mode === "grid") {
      box.innerHTML = (folders.length ? `<h3 class="sec">Cartelle</h3><div class="dgrid folders">${folders.map(gridCard).join("")}</div>` : "") +
        (rest.length ? `<h3 class="sec">${folders.length ? "File e documenti" : "&nbsp;"}</h3><div class="dgrid">${rest.map(gridCard).join("")}</div>` : "");
    } else {
      box.innerHTML = `<div class="dlist"><div class="drow dhead"><span></span><span>Nome</span><span class="c-mod">Ultima modifica</span><span class="c-size">Dimensione</span><span></span></div>${list.map(listRow).join("")}</div>`;
    }
    if (ui.mode === "grid") $$("[data-thumb]", box).forEach(el => { const it = files.find(f => f.id === el.dataset.thumb); if (it && !thumbCache.has(thumbKey({ id: it.id, raw: it }))) thumbIO.observe(el); });
  }

  /* ---------- Miniature (immagini e prime pagine dei PDF) ---------- */
  const thumbQueue = [];
  let pumping = false;
  const thumbIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { thumbIO.unobserve(e.target); thumbQueue.push(e.target); pump(); } }), { rootMargin: "240px" });

  async function makeThumb(el) {
    const f = files.find(x => x.id === el.dataset.thumb);
    if (!f || f.size > 8 * 1024 * 1024) return;
    const kind = Viewers.kindOf(f), key = f.id + "|" + (f.aggiornato || "");
    if (kind !== "image" && kind !== "pdf") return;
    let url = thumbCache.get(key);
    if (!url) {
      const blob = await Portal.blobs.get(f);
      if (kind === "image") url = URL.createObjectURL(blob);
      else {
        await Portal.script("/assets/vendor/pdf.min.js");
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        try {
          const page = await pdf.getPage(1), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 340 / v1.width });
          const cv = document.createElement("canvas");
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          url = cv.toDataURL("image/jpeg", .72);
        } finally { pdf.destroy(); }
      }
      thumbCache.set(key, url);
    }
    if (el.isConnected) el.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy">`;
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (thumbQueue.length) { const el = thumbQueue.shift(); if (el.isConnected) { try { await makeThumb(el); } catch { /* resta l'icona */ } } }
    pumping = false;
  }

  /* ---------- Azioni ---------- */
  const coll = k => k === "folder" ? ["cartelle", cartelle] : k === "doc" ? ["documenti", docs] : ["file", files];
  const persist = k => Portal.save(coll(k)[0], coll(k)[1]);
  const find = (k, id) => coll(k)[1].find(x => x.id === id);
  const itemOf = (k, id) => all().find(i => i.kind === k && i.id === id);
  const nowIso = () => new Date().toISOString();

  const childrenOf = id => ({
    folders: cartelle.filter(f => f.parent === id), docs: docs.filter(d => d.cartella === id), files: files.filter(f => f.cartella === id)
  });
  const subtree = id => {
    const out = { folders: [id], docs: [], files: [] };
    const walk = fid => { const c = childrenOf(fid); out.docs.push(...c.docs); out.files.push(...c.files); c.folders.forEach(f => { out.folders.push(f.id); walk(f.id); }); };
    walk(id);
    return out;
  };

  async function purgeRaw(k, raw) {
    if (k === "file") { await Portal.blobs.del(raw); files.splice(files.indexOf(raw), 1); }
    else if (k === "doc") docs.splice(docs.indexOf(raw), 1);
    else {
      const t = subtree(raw.id);
      for (const f of t.files) { await Portal.blobs.del(f); const i = files.indexOf(f); if (i >= 0) files.splice(i, 1); }
      t.docs.forEach(d => { const i = docs.indexOf(d); if (i >= 0) docs.splice(i, 1); });
      t.folders.forEach(fid => { const i = cartelle.findIndex(c => c.id === fid); if (i >= 0) cartelle.splice(i, 1); });
    }
  }
  const saveAll = () => Promise.all([persist("folder"), persist("doc"), persist("file")]);

  async function purgeOld() {
    const limit = Date.now() - 30 * DAY;
    const old = all().filter(it => it.trash && new Date(it.trash).getTime() < limit);
    if (!old.length) return;
    for (const it of old) { if (find(it.kind, it.id)) await purgeRaw(it.kind, it.raw); }
    await saveAll();
  }

  async function rename(it) {
    const r = await Portal.form({ title: it.kind === "folder" ? "Rinomina cartella" : "Rinomina", fields: [{ name: "nome", label: "Nome", required: true }], values: { nome: it.nome }, submit: "Rinomina" });
    if (!r) return;
    if (it.kind === "doc") it.raw.titolo = r.nome; else it.raw.nome = r.nome;
    it.raw.aggiornato = nowIso();
    await persist(it.kind);
    render();
  }

  async function move(it) {
    const banned = it.kind === "folder" ? new Set(subtree(it.id).folders) : new Set();
    const opts = [["", "Il mio Drive"], ...cartelle.filter(f => !f.cestino && !trashedAnc(f.parent) && !banned.has(f.id))
      .map(f => [f.id, pathOf(f.id).map(x => x.nome).join(" / ")]).sort((a, b) => a[1].localeCompare(b[1], "it"))];
    const r = await Portal.form({ title: "Sposta in…", fields: [{ name: "dest", label: "Cartella di destinazione", type: "select", options: opts }], values: { dest: it.parent }, submit: "Sposta" });
    if (!r) return;
    await moveTo(it, r.dest);
  }
  async function moveTo(it, dest) {
    if (it.kind === "folder" && (dest === it.id || subtree(it.id).folders.includes(dest))) return Portal.toast("Non puoi spostare una cartella dentro se stessa");
    if ((it.parent || "") === (dest || "")) return;
    if (it.kind === "folder") it.raw.parent = dest; else it.raw.cartella = dest;
    await persist(it.kind);
    Portal.toast("Spostato in «" + (dest ? byId(dest).nome : "Il mio Drive") + "»");
    render();
  }

  async function toTrash(it) {
    it.raw.cestino = nowIso();
    await persist(it.kind);
    Portal.toast(it.kind === "folder" ? "Cartella spostata nel cestino" : "Spostato nel cestino");
    render();
  }
  async function restore(it) {
    delete it.raw.cestino;
    if (it.kind === "folder") { if (it.raw.parent && (!byId(it.raw.parent) || trashedAnc(it.raw.parent) || byId(it.raw.parent).cestino)) it.raw.parent = ""; }
    else if (it.raw.cartella && (!byId(it.raw.cartella) || byId(it.raw.cartella).cestino || trashedAnc(it.raw.cartella))) it.raw.cartella = "";
    await persist(it.kind);
    Portal.toast("Ripristinato");
    render();
  }
  async function purge(it) {
    const extra = it.kind === "folder" ? " con tutto il suo contenuto" : "";
    if (!confirm(`Eliminare definitivamente «${it.nome}»${extra}? Non si può annullare.`)) return;
    await purgeRaw(it.kind, it.raw);
    await saveAll();
    Portal.toast("Eliminato definitivamente");
    render();
  }
  async function emptyTrash() {
    const list = all().filter(it => it.trash && !trashedAnc(it.parent));
    if (!list.length || !confirm(`Eliminare definitivamente ${list.length} element${list.length === 1 ? "o" : "i"}? Non si può annullare.`)) return;
    for (const it of list) if (find(it.kind, it.id)) await purgeRaw(it.kind, it.raw);
    await saveAll();
    Portal.toast("Cestino svuotato");
    render();
  }

  async function dupDoc(it) {
    const now = nowIso();
    docs.push({ ...it.raw, id: Portal.uid(), titolo: (it.raw.titolo || "Senza titolo") + " (copia)", creato: now, aggiornato: now, preferito: false });
    await persist("doc");
    Portal.toast("Documento duplicato");
    render();
  }

  async function wordOf(it) {
    try {
      Portal.toast("Preparo il file Word…");
      const blob = await DocxExport.make({ titolo: it.raw.titolo, html: Portal.sanitize(it.raw.html), carta: it.raw.carta === false ? null : await Letterhead.get() });
      Portal.download(Portal.slug(it.raw.titolo) + ".docx", blob);
    } catch (err) { Portal.toast(err.message || "Impossibile creare il file Word"); }
  }

  /* Apertura */
  const dropIfEmpty = async d => {
    if (d && docs.includes(d) && !d.titolo && !plain(d.html).trim()) { docs.splice(docs.indexOf(d), 1); await persist("doc"); }
    render();
  };
  const openDoc = (d, extra = {}) => Editor.open(d, { docs, onClose: () => dropIfEmpty(d), ...extra });

  async function openItem(it) {
    if (it.kind === "folder") { if (it.trash) return Portal.toast("Ripristina la cartella per aprirla"); location.hash = "#c/" + it.id; return; }
    if (it.kind === "doc") return openDoc(it.raw);
    Viewers.open(it.raw, { getBlob: () => Portal.blobs.get(it.raw), onEdit: m => docxToDoc(m), onClose: render });
  }

  async function docxToDoc(m) {
    Portal.toast("Converto il documento…");
    try {
      let html = await Viewers.docxToHtml(await Portal.blobs.get(m));
      const hadImgs = /<img/i.test(html);
      html = html.replace(/<img[^>]*>/gi, "");
      const now = nowIso();
      const d = { id: Portal.uid(), titolo: m.nome.replace(/\.docx$/i, ""), html: html || "<p><br></p>", creato: now, aggiornato: now, cartella: m.cartella || "", carta: false };
      docs.push(d);
      await persist("doc");
      render();
      openDoc(d);
      Portal.toast(hadImgs ? "Aperto come documento. Le immagini non vengono importate." : "Aperto come documento modificabile");
    } catch (err) { Portal.toast(err.message || "Impossibile convertire il file"); }
  }

  const here = () => (st.view === "mio" ? st.folder : "");

  async function newDoc() {
    const now = nowIso();
    const d = { id: Portal.uid(), titolo: "", html: "<p><br></p>", creato: now, aggiornato: now, cartella: here(), carta: true };
    docs.push(d);
    await persist("doc");
    openDoc(d, { focusTitle: true });
  }

  async function newFolder() {
    const r = await Portal.form({ title: "Nuova cartella", fields: [{ name: "nome", label: "Nome", required: true, default: "Cartella senza nome" }], submit: "Crea" });
    if (!r) return;
    const now = nowIso();
    cartelle.push({ id: Portal.uid(), nome: r.nome, parent: here(), creato: now, aggiornato: now });
    await persist("folder");
    if (st.view !== "mio") location.hash = here() ? "#c/" + here() : "#mio";
    render();
  }

  /* ---------- Menu contestuale ---------- */
  let ctx = null;
  const closeCtx = () => { if (ctx) { ctx.remove(); ctx = null; } };

  function menuFor(it) {
    if (it.trash && st.view === "cestino") return [["restore", "Ripristina"], ["purge", "Elimina definitivamente", true]];
    const m = [["open", it.kind === "file" ? "Anteprima" : "Apri"]];
    if (it.kind === "file" && it.type === "docx") m.push(["todoc", "Modifica come documento"]);
    m.push(["rename", "Rinomina"]);
    if (it.kind === "doc") m.push(["dup", "Duplica"], ["word", "Scarica Word (.docx)"]);
    if (it.kind === "file") m.push(["download", "Scarica"]);
    m.push(["move", "Sposta in…"], ["fav", it.fav ? "Togli dai preferiti" : "Aggiungi ai preferiti"], ["trash", "Sposta nel cestino", true]);
    return m;
  }

  function showCtx(it, x, y) {
    closeCtx();
    ctx = document.createElement("div");
    ctx.className = "ctx";
    ctx.setAttribute("role", "menu");
    ctx.innerHTML = menuFor(it).map(([a, l, danger]) => `<button role="menuitem" data-a="${a}"${danger ? ' class="danger"' : ""}>${l}</button>`).join("");
    document.body.append(ctx);
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
    ctx.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
    ctx.addEventListener("click", async e => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      closeCtx();
      const a = b.dataset.a;
      if (a === "open") openItem(it);
      if (a === "todoc") docxToDoc(it.raw);
      if (a === "rename") rename(it);
      if (a === "dup") dupDoc(it);
      if (a === "word") wordOf(it);
      if (a === "download") { try { Portal.download(it.raw.nome, await Portal.blobs.get(it.raw)); } catch (err) { Portal.toast(err.message); } }
      if (a === "move") move(it);
      if (a === "fav") { it.raw.preferito = !it.raw.preferito; await persist(it.kind); render(); }
      if (a === "trash") toTrash(it);
      if (a === "restore") restore(it);
      if (a === "purge") purge(it);
    });
    const first = $("button", ctx);
    if (first) first.focus();
  }

  /* ---------- Caricamento file ---------- */
  const MIME = { pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json" };
  const guessMime = n => MIME[Viewers.ext(n)] || "application/octet-stream";

  const ups = (() => {
    const el = document.createElement("div");
    el.className = "ups";
    el.hidden = true;
    el.innerHTML = `<header><b id="upTitle">Caricamento</b><button class="icon-btn" data-x aria-label="Chiudi">×</button></header><ul></ul>`;
    document.body.append(el);
    const ul = $("ul", el);
    let total = 0, ended = 0, errors = 0, timer;
    const title = () => { $("#upTitle").textContent = ended >= total ? (errors ? `Finito, ${errors} con errori` : `${total} caricat${total === 1 ? "o" : "i"}`) : `Carico ${ended + 1} di ${total}…`; };
    $("[data-x]", el).onclick = () => { el.hidden = true; };
    return {
      start() { clearTimeout(timer); if (ended >= total) { ul.innerHTML = ""; total = ended = errors = 0; } el.hidden = false; },
      add(name) {
        total++;
        const li = document.createElement("li");
        li.innerHTML = `<span class="u-n">${esc(name)}</span><span class="u-s muted">In attesa</span><i class="u-bar"><b></b></i>`;
        ul.append(li);
        title();
        const end = () => { ended++; title(); if (ended >= total && !errors) timer = setTimeout(() => { el.hidden = true; }, 3500); };
        return {
          progress(p) { $(".u-bar b", li).style.width = Math.round(p * 100) + "%"; $(".u-s", li).textContent = Math.round(p * 100) + "%"; },
          done() { $(".u-bar b", li).style.width = "100%"; $(".u-s", li).textContent = "Fatto"; li.classList.add("ok"); end(); },
          fail(m) { errors++; $(".u-s", li).textContent = m; li.classList.add("err"); end(); }
        };
      }
    };
  })();

  async function ensureFolder(parent, name) {
    const ex = cartelle.find(f => f.parent === parent && f.nome === name && !f.cestino);
    if (ex) return ex.id;
    const now = nowIso(), f = { id: Portal.uid(), nome: name, parent, creato: now, aggiornato: now };
    cartelle.push(f);
    await persist("folder");
    return f.id;
  }

  async function uploadAll(entries) {
    if (!entries.length) return;
    const base = here();
    ups.start();
    const rows = entries.map(e => ups.add(e.file.name));
    for (let i = 0; i < entries.length; i++) {
      const { file, path } = entries[i], row = rows[i];
      if (file.size > MAX) { row.fail("Più di 100 MB"); continue; }
      try {
        let parent = base;
        for (const seg of path) parent = await ensureFolder(parent, seg);
        const id = Portal.uid();
        const info = await Portal.blobs.put(id, file, p => row.progress(p));
        const now = nowIso();
        files.push({ id, nome: file.name, tipo: file.type || guessMime(file.name), size: file.size, cartella: parent, creato: now, aggiornato: now, chunks: info.chunks, remote: info.remote });
        await persist("file");
        row.done();
      } catch (err) { row.fail((err && err.message) || "Errore"); }
      render();
    }
  }

  async function entriesFromDrop(dt) {
    const roots = [...dt.items].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    if (!roots.length) return [...dt.files].map(file => ({ file, path: [] }));
    const out = [];
    const walk = async (en, path) => {
      if (en.isFile) out.push({ file: await new Promise((res, rej) => en.file(res, rej)), path });
      else if (en.isDirectory) {
        const rd = en.createReader();
        let batch;
        do { batch = await new Promise((res, rej) => rd.readEntries(res, rej)); for (const c of batch) await walk(c, [...path, en.name]); } while (batch.length);
      }
    };
    for (const r of roots) await walk(r, []);
    return out;
  }

  /* ---------- Eventi ---------- */
  const itemFromEl = el => { const c = el.closest("[data-k]"); return c ? itemOf(c.dataset.k, c.dataset.id) : null; };

  $("#items").addEventListener("click", e => {
    const it = itemFromEl(e.target);
    if (!it) return;
    const mb = e.target.closest("[data-menu]");
    if (mb) { e.stopPropagation(); const r = mb.getBoundingClientRect(); return showCtx(it, r.left, r.bottom + 4); }
    openItem(it);
  });
  $("#items").addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.target.closest("[data-menu]")) return;
    const it = itemFromEl(e.target);
    if (it) openItem(it);
  });
  $("#items").addEventListener("contextmenu", e => {
    const it = itemFromEl(e.target);
    if (it) { e.preventDefault(); showCtx(it, e.clientX, e.clientY); }
  });
  document.addEventListener("click", e => { if (ctx && !e.target.closest(".ctx")) closeCtx(); if (!e.target.closest(".new-wrap")) closeNew(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeCtx(); closeNew(); } });
  window.addEventListener("scroll", closeCtx, { passive: true });
  window.addEventListener("resize", closeCtx);

  const closeNew = () => { $("#newMenu").hidden = true; $("#newBtn").setAttribute("aria-expanded", "false"); };
  $("#newBtn").onclick = e => { e.stopPropagation(); const h = $("#newMenu").hidden; $("#newMenu").hidden = !h; $("#newBtn").setAttribute("aria-expanded", h); };
  $("#newMenu").addEventListener("click", e => {
    const b = e.target.closest("[data-new]");
    if (!b) return;
    closeNew();
    const a = b.dataset.new;
    if (a === "doc") newDoc();
    if (a === "folder") newFolder();
    if (a === "upload") $("#pick").click();
    if (a === "uploaddir") $("#pickdir").click();
  });
  $("#pick").onchange = e => { uploadAll([...e.target.files].map(file => ({ file, path: [] }))); e.target.value = ""; };
  $("#pickdir").onchange = e => {
    uploadAll([...e.target.files].map(file => ({ file, path: (file.webkitRelativePath || "").split("/").slice(0, -1) })));
    e.target.value = "";
  };

  $("#sideNav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { st.q = ""; $("#q").value = ""; location.hash = "#" + b.dataset.view; } });
  $("#crumbs").addEventListener("click", e => { const b = e.target.closest("[data-crumb]"); if (b) location.hash = b.dataset.crumb ? "#c/" + b.dataset.crumb : "#mio"; });
  $("#types").addEventListener("click", e => { const b = e.target.closest("[data-type]"); if (b) { st.type = b.dataset.type; render(); } });
  $$("[data-mode]").forEach(b => b.addEventListener("click", () => { ui.mode = b.dataset.mode; saveUi(); render(); }));
  $("#sort").addEventListener("change", e => { ui.sort = e.target.value; saveUi(); render(); });
  let qt;
  $("#q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value; render(); }, 120); });
  $("#emptyTrash").onclick = emptyTrash;
  $("#lhBtn").onclick = () => Letterhead.edit();

  /* Trascinare: spostare dentro una cartella oppure caricare dal computer */
  let dragged = null;
  const dropTarget = el => el.closest('.dfolder[data-k="folder"], .drow[data-k="folder"], [data-crumb], #sideNav [data-view="mio"]');
  const targetId = t => t.dataset.id || t.dataset.crumb || "";
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const zone = $("#dropzone");

  $("#items").addEventListener("dragstart", e => {
    const c = e.target.closest("[data-k]");
    if (!c) return;
    dragged = { k: c.dataset.k, id: c.dataset.id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-gj", JSON.stringify(dragged));
    c.classList.add("dragging");
  });
  $("#items").addEventListener("dragend", e => { dragged = null; $$(".dragging,.over").forEach(n => n.classList.remove("dragging", "over")); });
  document.addEventListener("dragover", e => {
    if (dragged) {
      const t = dropTarget(e.target);
      $$(".over").forEach(n => { if (n !== t) n.classList.remove("over"); });
      if (t && !(dragged.k === "folder" && targetId(t) === dragged.id)) { e.preventDefault(); t.classList.add("over"); }
    } else if (hasFiles(e)) {
      e.preventDefault();
      if (e.target.closest("#dropzone")) {
        $("#dropHint").hidden = false;
        $("#dropWhere").textContent = st.view === "mio" ? (st.folder ? ` in «${byId(st.folder).nome}»` : " in Il mio Drive") : " in Il mio Drive";
      }
    }
  });
  document.addEventListener("dragleave", e => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest("#dropzone")) $("#dropHint").hidden = true;
  });
  document.addEventListener("drop", async e => {
    $("#dropHint").hidden = true;
    if (dragged) {
      const t = dropTarget(e.target);
      if (!t) return;
      e.preventDefault();
      const it = itemOf(dragged.k, dragged.id);
      $$(".over").forEach(n => n.classList.remove("over"));
      dragged = null;
      if (it) await moveTo(it, targetId(t));
    } else if (hasFiles(e)) {
      e.preventDefault();
      if (!e.target.closest("#dropzone")) return;
      uploadAll(await entriesFromDrop(e.dataTransfer));
    }
  });

  /* ---------- Avvio ---------- */
  const parseHash = () => {
    const h = location.hash.slice(1);
    st.folder = "";
    st.view = "mio";
    st.type = "";
    if (h.startsWith("c/")) { const f = byId(h.slice(2)); if (f && !f.cestino && !trashedAnc(f.parent)) st.folder = f.id; }
    else if (["recenti", "preferiti", "cestino"].includes(h)) st.view = h;
  };
  window.addEventListener("hashchange", () => { closeCtx(); parseHash(); render(); });

  await purgeOld();
  parseHash();
  render();
})();
