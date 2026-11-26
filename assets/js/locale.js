/* Jones House · Cartella locale
   Sfoglia una cartella / chiavetta USB / disco del computer (sola lettura), guarda foto e documenti
   e, solo con un pulsante, carica quello che vuoi nel Drive. Niente drag and drop. */
(async () => {
  const [cartelle, files] = await Promise.all([Portal.load("cartelle", []), Portal.load("file", [])]);
  const HAS_FS = typeof window.showDirectoryPicker === "function";
  const MAX = 100 * 1024 * 1024;
  const CAP = 5000;                                   // massimo di file letti con «Includi sottocartelle»
  const NASCOSTI = /^(\.|\$RECYCLE\.BIN$|System Volume Information$|Thumbs\.db$|desktop\.ini$|__MACOSX$)/i;
  const DOCS = ["pdf", "pptx", "docx", "sheet", "text", "ppt", "doc"];
  const GRUPPI = [["", "Tutto"], ["image", "Foto"], ["docs", "Documenti"], ["video", "Video"], ["audio", "Audio"], ["other", "Altro"]];
  const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

  const st = { root: null, cwd: null, q: "", type: "", sort: "nome", mode: "grid", deep: false, hidden: false, sel: new Set(), view: [], tok: 0 };
  try { const u = JSON.parse(localStorage.getItem("gj-locale-ui") || "{}"); if (u.mode) st.mode = u.mode; if (u.sort) st.sort = u.sort; } catch { /* predefiniti */ }
  const saveUi = () => { try { localStorage.setItem("gj-locale-ui", JSON.stringify({ mode: st.mode, sort: st.sort })); } catch { /* niente */ } };

  /* ---------- nodi ---------- */
  const mkDir = (name, parent, handle, children = null) => ({ kind: "dir", name, parent, handle, children });
  const mkFile = (name, parent, file, handle) => ({ kind: "file", name, parent, file, handle, size: file ? file.size : 0, mod: file ? file.lastModified : 0, tipo: file ? file.type : "" });
  const kindOf = n => (IMG_EXT.test(n.name) && !(n.tipo || "").startsWith("image/")) ? "image" : Viewers.kindOf({ nome: n.name, tipo: n.tipo });
  const grp = n => { const k = kindOf(n); return k === "image" || k === "video" || k === "audio" ? k : DOCS.includes(k) ? "docs" : "other"; };
  const pathOf = n => { const o = []; for (let x = n; x; x = x.parent) o.unshift(x); return o; };

  /* ---------- lettura delle cartelle ---------- */
  async function listDir(d) {
    if (d.children) return d.children;
    const out = [];
    for await (const [name, h] of d.handle.entries()) out.push(h.kind === "directory" ? mkDir(name, d, h) : mkFile(name, d, null, h));
    for (let i = 0; i < out.length; i += 64) {
      await Promise.all(out.slice(i, i + 64).filter(n => n.kind === "file").map(async n => {
        try { const f = await n.handle.getFile(); n.file = f; n.size = f.size; n.mod = f.lastModified; n.tipo = f.type; } catch { n.err = true; }
      }));
    }
    return (d.children = out.filter(n => !n.err));
  }

  async function deep(d, tok, out = [], prog = n => {}) {
    for (const c of await listDir(d)) {
      if (tok !== st.tok || out.length >= CAP) return out;
      if (!st.hidden && NASCOSTI.test(c.name)) continue;
      if (c.kind === "dir") await deep(c, tok, out, prog); else { out.push(c); if (out.length % 50 === 0) prog(out.length); }
    }
    return out;
  }

  /** da elenco piatto (input classico) a albero */
  function treeFromFiles(list, fallbackName) {
    const arr = [...list];
    const first = arr.find(f => f.webkitRelativePath);
    const rootName = first ? first.webkitRelativePath.split("/")[0] : fallbackName;
    const root = mkDir(rootName, null, null, []);
    for (const f of arr) {
      const parts = f.webkitRelativePath ? f.webkitRelativePath.split("/").slice(1) : [f.name];
      let d = root;
      for (const seg of parts.slice(0, -1)) {
        let nx = d.children.find(c => c.kind === "dir" && c.name === seg);
        if (!nx) { nx = mkDir(seg, d, null, []); d.children.push(nx); }
        d = nx;
      }
      d.children.push(mkFile(parts[parts.length - 1], d, f, null));
    }
    return root;
  }

  /* ---------- ultima cartella (IndexedDB) ---------- */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open("gj-locale", 1); r.onupgradeneeded = () => r.result.createObjectStore("h"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbPut = async h => { try { const db = await idb(); db.transaction("h", "readwrite").objectStore("h").put(h, "last"); } catch { /* niente */ } };
  const idbGet = async () => { try { const db = await idb(); return await new Promise(res => { const q = db.transaction("h").objectStore("h").get("last"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; } };

  /* ---------- apertura ---------- */
  function openRoot(root) {
    st.root = st.cwd = root; st.sel.clear(); st.q = ""; st.type = ""; $("#lc-q").value = "";
    thumbs.forEach(u => URL.revokeObjectURL(u)); thumbs.clear();
    $("#lc-start").hidden = true; $("#lc-browser").hidden = false;
    $("#lc-rootname").textContent = root.name;
    fillDest();
    show();
  }

  async function pick() {
    if (HAS_FS) {
      try {
        const h = await window.showDirectoryPicker({ mode: "read" });
        idbPut(h);
        openRoot(mkDir(h.name, null, h));
      } catch (e) {
        if (e && e.name === "AbortError") return;
        Portal.toast("Il browser non ha concesso l'accesso diretto: uso la modalità compatibile.");
        $("#lc-fallback-dir").click();
      }
    } else $("#lc-fallback-dir").click();
  }
  $("#lc-pick").onclick = pick;
  $("#lc-change").onclick = () => { $("#lc-browser").hidden = true; $("#lc-start").hidden = false; };
  $("#lc-fallback-dir").onchange = e => { const l = e.target.files; if (l.length) openRoot(treeFromFiles(l, "Cartella")); e.target.value = ""; };
  $("#lc-files").onclick = () => $("#lc-fallback-files").click();
  $("#lc-fallback-files").onchange = e => { const l = e.target.files; if (l.length) openRoot(treeFromFiles([...l].map(f => f), "File selezionati")); e.target.value = ""; };
  $("#lc-reopen").onclick = async () => {
    const h = await idbGet();
    if (!h) return;
    try {
      if ((await h.queryPermission({ mode: "read" })) !== "granted" && (await h.requestPermission({ mode: "read" })) !== "granted") { Portal.toast("Permesso non concesso"); return; }
      openRoot(mkDir(h.name, null, h));
    } catch { Portal.toast("Non riesco a riaprire quella cartella (l'unità è collegata?)"); }
  };
  if (HAS_FS) idbGet().then(h => { if (h) { $("#lc-reopen").hidden = false; $("#lc-reopen").textContent = `Riapri «${h.name}»`; } });
  $("#lc-note").textContent = HAS_FS
    ? "Il tuo browser permette la lettura diretta: anche le cartelle molto grandi si aprono subito."
    : "Il tuo browser userà la modalità compatibile: vedrai una richiesta tipo «Caricare N file su questo sito?». Serve solo a leggere l'elenco: non viene caricato nulla finché non premi «Carica nel Drive».";

  /* ---------- elenco mostrato ---------- */
  const ord = arr => {
    const s = st.sort, cmp = (a, b) => a.name.localeCompare(b.name, "it", { numeric: true, sensitivity: "base" });
    return arr.sort((a, b) => (a.kind === "dir") !== (b.kind === "dir") ? (a.kind === "dir" ? -1 : 1)
      : s === "mod" ? (b.mod || 0) - (a.mod || 0) || cmp(a, b)
      : s === "size" ? (b.size || 0) - (a.size || 0) || cmp(a, b)
      : s === "tipo" ? (a.kind === "file" ? kindOf(a) : "").localeCompare(b.kind === "file" ? kindOf(b) : "") || cmp(a, b)
      : cmp(a, b));
  };

  async function show() {
    const tok = ++st.tok;
    $("#lc-status").textContent = st.deep ? "Leggo le sottocartelle…" : "Leggo la cartella…";
    let base;
    try {
      base = st.deep ? await deep(st.cwd, tok, [], n => { if (tok === st.tok) $("#lc-status").textContent = `Leggo le sottocartelle… ${n} file`; }) : [...await listDir(st.cwd)];
    } catch (e) { $("#lc-status").textContent = "Non riesco a leggere questa cartella: " + ((e && e.message) || "errore"); return; }
    if (tok !== st.tok) return;
    if (!st.hidden) base = base.filter(n => !NASCOSTI.test(n.name));
    const q = st.q.trim().toLowerCase();
    const perNome = base.filter(n => !q || n.name.toLowerCase().includes(q));
    const conteggi = { "": perNome.filter(n => n.kind === "file").length };
    perNome.filter(n => n.kind === "file").forEach(n => { conteggi[grp(n)] = (conteggi[grp(n)] || 0) + 1; });
    st.view = ord(perNome.filter(n => !st.type || (n.kind === "file" && grp(n) === st.type)));

    $("#lc-types").innerHTML = GRUPPI.filter(([k]) => k === "" || conteggi[k]).map(([k, t]) => `<button type="button" class="chip-btn${st.type === k ? " on" : ""}" data-type="${k}">${t} <i>${conteggi[k] || 0}</i></button>`).join("");
    const nf = st.view.filter(n => n.kind === "file").length, nd = st.view.length - nf;
    $("#lc-status").innerHTML = `${nd ? `<b>${nd}</b> cartelle · ` : ""}<b>${nf}</b> file${st.deep && nf >= CAP ? ` <em>(letti i primi ${CAP})</em>` : ""} · ${Portal.fmtSize(st.view.reduce((s, n) => s + (n.size || 0), 0))}`;
    crumbs();
    draw();
  }

  function crumbs() {
    const p = pathOf(st.cwd);
    $("#lc-crumbs").innerHTML = p.map((n, i) => i === p.length - 1 ? `<b>${esc(n.name)}</b>` : `<button type="button" data-crumb="${i}">${esc(n.name)}</button><span>/</span>`).join("");
  }

  /* ---------- disegno ---------- */
  const thumbs = new Map();                              // nodo → url miniatura
  const when = ms => ms ? new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "";
  const FOLDER = `<svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true"><path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h5l2 2.5h9A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18z" fill="#ffd400" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  const icon = n => {
    if (n.kind === "dir") return FOLDER;
    const k = kindOf(n), [lab, col] = Viewers.badge(k === "doc" ? "doc_" : k);
    return `<span class="lc-badge" style="--c:${col}">${esc(lab)}</span>`;
  };

  function draw() {
    const items = st.view, grid = st.mode === "grid";
    $("#lc-empty").hidden = items.length > 0;
    if (!items.length) $("#lc-empty").innerHTML = st.q || st.type ? `<h3>Nessun risultato</h3>Cambia filtro o ricerca.` : `<h3>Cartella vuota</h3>Qui non c'è nessun file visibile.`;
    const el = $("#lc-items");
    el.className = grid ? "lc-grid" : "lc-list";
    el.innerHTML = (grid ? "" : `<div class="lc-lh"><span></span><span></span><span>Nome</span><span>Tipo</span><span>Modificato</span><span>Dimensione</span></div>`) +
      items.map((n, i) => {
        const f = n.kind === "file", on = st.sel.has(n), tip = f ? { image: "Foto", pdf: "PDF", docx: "Word", pptx: "PowerPoint", sheet: "Foglio", text: "Testo", video: "Video", audio: "Audio" }[kindOf(n)] || (n.name.split(".").pop() || "File").toUpperCase() : "Cartella";
        const sub = st.deep && f ? pathOf(n.parent).slice(pathOf(st.cwd).length).map(x => x.name).join(" / ") : "";
        const th = f && kindOf(n) === "image" ? `<img alt="" data-thumb="${i}">` : "";
        const ck = f ? `<label class="lc-ck" title="Seleziona"><input type="checkbox" data-sel="${i}"${on ? " checked" : ""}><i></i></label>` : "";
        const dr = n.up ? `<span class="lc-up" title="Caricato nel Drive">✓ nel Drive</span>` : "";
        if (grid) return `<div class="lc-it${on ? " on" : ""}" data-i="${i}">${ck}<button type="button" class="lc-th" data-go="${i}" aria-label="${f ? "Apri" : "Entra in"} ${esc(n.name)}"><div class="lc-ph">${icon(n)}</div>${th}</button><div class="lc-nm" title="${esc(n.name)}">${esc(n.name)}</div><small>${f ? `${Portal.fmtSize(n.size)} · ${when(n.mod)}` : "Cartella"}${sub ? `<br>${esc(sub)}` : ""}</small>${dr}</div>`;
        return `<div class="lc-row${on ? " on" : ""}" data-i="${i}">${ck || "<span></span>"}<span class="lc-ri">${n.kind === "dir" ? FOLDER.replace(/54/g, "26") : icon(n)}</span><button type="button" class="lc-rn" data-go="${i}">${esc(n.name)}${sub ? `<small>${esc(sub)}</small>` : ""} ${dr}</button><span>${tip}</span><span>${f ? when(n.mod) : ""}</span><span>${f ? Portal.fmtSize(n.size) : ""}</span></div>`;
      }).join("");
    observe();
    selInfo();
  }

  /* miniature: solo quando entrano nello schermo, tre alla volta */
  let coda = [], attivi = 0;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); coda.push(e.target); pump(); } }), { rootMargin: "300px" });
  function observe() { coda = []; $$("img[data-thumb]", $("#lc-items")).forEach(im => io.observe(im)); }
  async function pump() {
    while (attivi < 3 && coda.length) {
      const im = coda.shift(), n = st.view[+im.dataset.thumb];
      if (!n || !n.file) continue;
      attivi++;
      thumb(n).then(u => { if (u && im.isConnected) { im.src = u; im.classList.add("ok"); im.previousElementSibling?.classList.add("has"); } }).finally(() => { attivi--; pump(); });
    }
  }
  async function thumb(n) {
    if (thumbs.has(n)) return thumbs.get(n);
    try {
      const bmp = await createImageBitmap(n.file, { resizeWidth: 360, resizeQuality: "low" });
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0); bmp.close && bmp.close();
      const b = await new Promise(r => c.toBlob(r, "image/jpeg", .74));
      const u = URL.createObjectURL(b); thumbs.set(n, u); return u;
    } catch {
      if (n.size < 6e6 && /^image\/(jpeg|png|gif|webp|svg)/.test(n.tipo)) { const u = URL.createObjectURL(n.file); thumbs.set(n, u); return u; }
      return null;
    }
  }

  /* ---------- selezione ---------- */
  function selInfo() {
    const n = st.sel.size, tot = [...st.sel].reduce((s, x) => s + x.size, 0);
    $("#lc-selinfo").textContent = n ? `${n} selezionat${n === 1 ? "o" : "i"} · ${Portal.fmtSize(tot)}` : "Nessun file selezionato";
    $("#lc-up-sel").disabled = !n;
    $("#lc-up-sel").textContent = n ? `Carica ${n} nel Drive` : "Carica nel Drive";
    const fv = st.view.filter(x => x.kind === "file");
    $("#lc-all").checked = fv.length > 0 && fv.every(x => st.sel.has(x));
  }

  /* ---------- Drive: destinazione e caricamento ---------- */
  const driveId = id => cartelle.find(c => c.id === id);
  const drivePath = id => { const o = []; let g = 0; while (id && g++ < 60) { const f = driveId(id); if (!f) break; o.unshift(f.nome); id = f.parent; } return o.join(" / "); };
  function fillDest() {
    const sel = $("#lc-dest"), cur = sel.value;
    const opts = cartelle.filter(c => !c.cestino).map(c => [c.id, drivePath(c.id)]).sort((a, b) => a[1].localeCompare(b[1], "it"));
    sel.innerHTML = `<option value="">Il mio Drive (radice)</option><option value="__new">＋ Nuova cartella…</option>` + opts.map(([id, p]) => `<option value="${esc(id)}">${esc(p)}</option>`).join("");
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  const ups = (() => {
    const el = document.createElement("div");
    el.className = "ups"; el.hidden = true;
    el.innerHTML = `<header><b id="lcUpTitle">Caricamento</b><button class="icon-btn" data-x aria-label="Chiudi">×</button></header><ul></ul>`;
    document.body.append(el);
    const ul = $("ul", el);
    let total = 0, ended = 0, errors = 0, timer;
    const title = () => { $("#lcUpTitle").textContent = ended >= total ? (errors ? `Finito, ${errors} con errori` : `${total} elaborat${total === 1 ? "o" : "i"}`) : `Carico ${ended + 1} di ${total}…`; };
    $("[data-x]", el).onclick = () => { el.hidden = true; };
    return {
      start() { clearTimeout(timer); if (ended >= total) { ul.innerHTML = ""; total = ended = errors = 0; } el.hidden = false; },
      add(name) {
        total++;
        const li = document.createElement("li");
        li.innerHTML = `<span class="u-n">${esc(name)}</span><span class="u-s muted">In attesa</span><i class="u-bar"><b></b></i>`;
        ul.append(li); title();
        const end = () => { ended++; title(); if (ended >= total && !errors) timer = setTimeout(() => { el.hidden = true; }, 4000); };
        return {
          progress(p) { $(".u-bar b", li).style.width = Math.round(p * 100) + "%"; $(".u-s", li).textContent = Math.round(p * 100) + "%"; },
          done(t = "Fatto") { $(".u-bar b", li).style.width = "100%"; $(".u-s", li).textContent = t; li.classList.add("ok"); end(); },
          fail(m) { errors++; $(".u-s", li).textContent = m; li.classList.add("err"); end(); }
        };
      }
    };
  })();

  async function ensureFolder(parent, name) {
    const ex = cartelle.find(f => f.parent === parent && f.nome === name && !f.cestino);
    if (ex) return ex.id;
    const now = new Date().toISOString(), f = { id: Portal.uid(), nome: name, parent, creato: now, aggiornato: now };
    cartelle.push(f);
    await Portal.save("cartelle", cartelle);
    return f.id;
  }

  async function destinazione() {
    let v = $("#lc-dest").value;
    if (v === "__new") {
      const r = await Portal.form({ title: "Nuova cartella nel Drive", submit: "Crea e carica", values: { nome: st.cwd.name }, fields: [{ name: "nome", label: "Nome della cartella", required: true }] });
      if (!r) return null;
      v = await ensureFolder("", r.nome);
      fillDest(); $("#lc-dest").value = v;
    }
    return v;
  }

  async function carica(entries) {
    if (!entries.length) return;
    const base = await destinazione();
    if (base === null) return;
    ups.start();
    const rows = entries.map(e => ups.add(e.node.name));
    let ok = 0;
    for (let i = 0; i < entries.length; i++) {
      const { node, path } = entries[i], row = rows[i], file = node.file;
      if (!file) { row.fail("Non leggibile"); continue; }
      if (file.size > MAX) { row.fail("Più di 100 MB"); continue; }
      try {
        let parent = base;
        for (const seg of path) parent = await ensureFolder(parent, seg);
        if (files.some(f => f.cartella === parent && f.nome === file.name && f.size === file.size && !f.cestino)) { row.done("Già presente"); node.up = true; continue; }
        const id = Portal.uid();
        const info = await Portal.blobs.put(id, file, p => row.progress(p));
        const now = new Date().toISOString();
        files.push({ id, nome: file.name, tipo: file.type || "application/octet-stream", size: file.size, cartella: parent, creato: now, aggiornato: now, chunks: info.chunks, remote: info.remote });
        await Portal.save("file", files);
        node.up = true; ok++;
        row.done();
      } catch (err) { row.fail((err && err.message) || "Errore"); }
    }
    fillDest();
    if (ok) Portal.toast(`${ok} file caricat${ok === 1 ? "o" : "i"} nel Drive`);
    draw();
  }

  /* selezionati: le sottocartelle si ricreano nel Drive a partire da dove stai guardando */
  const relPath = n => pathOf(n.parent).slice(pathOf(st.cwd).length).map(x => x.name);
  $("#lc-up-sel").onclick = () => carica([...st.sel].map(node => ({ node, path: relPath(node) })));
  $("#lc-up-folder").onclick = async () => {
    const tok = ++st.tok;
    $("#lc-status").textContent = "Conto i file…";
    const lista = await deep(st.cwd, tok, []);
    if (tok !== st.tok) return;
    show();
    if (!lista.length) { Portal.toast("Nessun file da caricare"); return; }
    const tot = lista.reduce((s, n) => s + n.size, 0);
    if (!confirm(`Caricare nel Drive la cartella «${st.cwd.name}»: ${lista.length} file, ${Portal.fmtSize(tot)}?`)) return;
    carica(lista.map(node => ({ node, path: [st.cwd.name, ...relPath(node)] })));
  };

  /* ---------- eventi ---------- */
  const apri = n => {
    if (n.kind === "dir") { st.cwd = n; st.q = ""; $("#lc-q").value = ""; show(); return; }
    if (kindOf(n) === "image") { lightbox(n); return; }
    Viewers.open({ nome: n.name, tipo: n.tipo }, { getBlob: async () => n.file, backLabel: "← Cartella locale" });
  };

  $("#lc-items").addEventListener("click", e => {
    const ck = e.target.closest("[data-sel]");
    if (ck) { const n = st.view[+ck.dataset.sel]; ck.checked ? st.sel.add(n) : st.sel.delete(n); ck.closest(".lc-it,.lc-row").classList.toggle("on", ck.checked); selInfo(); return; }
    const g = e.target.closest("[data-go]");
    if (g) apri(st.view[+g.dataset.go]);
  });
  $("#lc-all").onchange = e => { st.view.filter(n => n.kind === "file").forEach(n => e.target.checked ? st.sel.add(n) : st.sel.delete(n)); draw(); };
  $("#lc-crumbs").addEventListener("click", e => { const b = e.target.closest("[data-crumb]"); if (b) { st.cwd = pathOf(st.cwd)[+b.dataset.crumb]; show(); } });
  $("#lc-types").addEventListener("click", e => { const b = e.target.closest("[data-type]"); if (b) { st.type = b.dataset.type; show(); } });
  let t0; $("#lc-q").addEventListener("input", e => { clearTimeout(t0); t0 = setTimeout(() => { st.q = e.target.value; show(); }, 160); });
  $("#lc-deep").onchange = e => { st.deep = e.target.checked; show(); };
  $("#lc-hidden").onchange = e => { st.hidden = e.target.checked; show(); };
  $("#lc-sort").value = st.sort;
  $("#lc-sort").onchange = e => { st.sort = e.target.value; saveUi(); show(); };
  $$(".jseg [data-mode]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.mode === st.mode); b.onclick = () => { st.mode = b.dataset.mode; saveUi(); $$(".jseg [data-mode]").forEach(x => x.setAttribute("aria-pressed", x.dataset.mode === st.mode)); draw(); }; });

  /* ---------- foto a schermo intero ---------- */
  const lb = $("#lc-lb"); let lbList = [], lbI = 0, lbUrl = "";
  function lightbox(n) {
    lbList = st.view.filter(x => x.kind === "file" && kindOf(x) === "image");
    lbI = Math.max(0, lbList.indexOf(n));
    lb.hidden = false; document.body.classList.add("scr-open");
    lbShow();
  }
  function lbShow() {
    const n = lbList[lbI];
    if (lbUrl) URL.revokeObjectURL(lbUrl);
    lbUrl = URL.createObjectURL(n.file);
    const im = $("#lb-img"); im.src = lbUrl; im.alt = n.name;
    $("#lb-name").textContent = n.name;
    $("#lb-meta").textContent = `${Portal.fmtSize(n.size)} · ${when(n.mod)}`;
    $("#lb-cnt").textContent = `${lbI + 1} / ${lbList.length}`;
    $("#lb-up").textContent = n.up ? "✓ Già nel Drive" : "Carica nel Drive";
  }
  const lbGo = d => { if (!lbList.length) return; lbI = (lbI + d + lbList.length) % lbList.length; lbShow(); };
  const lbClose = () => { lb.hidden = true; document.body.classList.remove("scr-open"); if (lbUrl) URL.revokeObjectURL(lbUrl); lbUrl = ""; $("#lb-img").removeAttribute("src"); draw(); };
  $("#lb-prev").onclick = () => lbGo(-1); $("#lb-next").onclick = () => lbGo(1); $("#lb-x").onclick = lbClose;
  $("#lb-up").onclick = async () => { await carica([{ node: lbList[lbI], path: relPath(lbList[lbI]) }]); lbShow(); };
  lb.addEventListener("click", e => { if (e.target.classList.contains("lc-lb-stage")) lbClose(); });
  document.addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") lbClose(); else if (e.key === "ArrowLeft") lbGo(-1); else if (e.key === "ArrowRight") lbGo(1);
  });
})();
