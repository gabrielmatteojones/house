/* Jones House · editor dei documenti (schermata a tutto campo, come un foglio con carta intestata) */
const Editor = (() => {
  const root = document.createElement("div");
  root.className = "scr editor";
  root.hidden = true;
  root.innerHTML = `
    <div class="scr-top">
      <button class="btn ghost sm" data-a="close" aria-label="Torna al Drive">← Drive</button>
      <input class="ed-title" id="ed-title" placeholder="Documento senza titolo" aria-label="Titolo del documento">
      <span class="muted ed-state" id="ed-state" aria-live="polite"></span>
      <span class="sp"></span>
      <label class="ed-carta" title="Carta intestata di questo documento">Carta
        <select id="ed-lh" aria-label="Carta intestata">
          <option value="jones">Jones House</option>
          <option value="gabriel">Gabriel Jones</option>
          <option value="nessuna">Nessuna</option>
        </select></label>
      <button class="icon-btn" data-a="lhset" title="Modifica le carte intestate e scegli quella predefinita" aria-label="Modifica le carte intestate">⚙</button>
      <button class="btn ghost sm" data-a="print">Stampa / PDF</button>
      <button class="btn navy sm" data-a="word">Scarica Word</button>
      <button class="btn ghost sm" data-a="dup">Duplica</button>
      <button class="btn danger sm" data-a="del">Elimina</button>
    </div>
    <div class="rte-bar" role="toolbar" aria-label="Formattazione">
      <button data-cmd="undo" title="Annulla" aria-label="Annulla">↶</button>
      <button data-cmd="redo" title="Ripeti" aria-label="Ripeti">↷</button>
      <span class="sep"></span>
      <select id="ed-font" title="Carattere" aria-label="Carattere"><option value="">Carattere</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Trebuchet MS</option><option>Courier New</option></select>
      <select id="ed-size" title="Dimensione (pt)" aria-label="Dimensione"><option value="">pt</option>${[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map(n => `<option>${n}</option>`).join("")}</select>
      <span class="sep"></span>
      <button data-cmd="bold" title="Grassetto"><b>B</b></button>
      <button data-cmd="italic" title="Corsivo"><i>I</i></button>
      <button data-cmd="underline" title="Sottolineato"><u>S</u></button>
      <button data-cmd="strikeThrough" title="Barrato"><s>B</s></button>
      <button data-cmd="subscript" title="Pedice">x₂</button>
      <button data-cmd="superscript" title="Apice">x²</button>
      <label class="rte-color" title="Colore del testo">A<input type="color" id="ed-color" value="#000000" aria-label="Colore del testo"></label>
      <label class="rte-color" title="Evidenziatore">🖍<input type="color" id="ed-hilite" value="#ffff00" aria-label="Evidenziatore"></label>
      <span class="sep"></span>
      <button data-cmd="formatBlock" data-val="h2" title="Titolo">Titolo</button>
      <button data-cmd="formatBlock" data-val="h3" title="Sottotitolo">Sottotitolo</button>
      <button data-cmd="formatBlock" data-val="p" title="Paragrafo">Testo</button>
      <button data-cmd="formatBlock" data-val="blockquote" title="Citazione">Citazione</button>
      <span class="sep"></span>
      <button data-cmd="justifyLeft" title="A sinistra" aria-label="Allinea a sinistra">⇤</button>
      <button data-cmd="justifyCenter" title="Al centro" aria-label="Centra">↔</button>
      <button data-cmd="justifyRight" title="A destra" aria-label="Allinea a destra">⇥</button>
      <button data-cmd="justifyFull" title="Giustificato" aria-label="Giustifica">☰</button>
      <button data-cmd="outdent" title="Riduci rientro" aria-label="Riduci rientro">⇠</button>
      <button data-cmd="indent" title="Aumenta rientro" aria-label="Aumenta rientro">⇢</button>
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList">Elenco</button>
      <button data-cmd="insertOrderedList">Numerato</button>
      <button data-cmd="createLink">Link</button>
      <button data-cmd="insertTable" title="Inserisci una tabella">Tabella</button>
      <button data-cmd="insertImage" title="Inserisci un'immagine">Immagine</button>
      <button data-cmd="insertHorizontalRule" title="Linea di separazione">Linea</button>
      <button data-cmd="pageBreak" title="Interruzione di pagina">Nuova pagina</button>
      <button data-cmd="insertDate" title="Data di oggi">Data</button>
      <button data-cmd="removeFormat">Pulisci</button>
      <span class="sp"></span>
      <span class="ed-zoom" title="Zoom del foglio"><input type="range" id="ed-zoom" min="60" max="140" value="100" aria-label="Zoom"><span id="ed-zv">100%</span></span>
      <span id="ed-count" class="muted"></span>
    </div>
    <div class="ed-doc-meta" id="ed-meta" hidden>
      <label>Destinatario <input id="ed-dest" placeholder="Dirigente scolastico" autocomplete="off"></label>
      <label>Oggetto <input id="ed-ogg" placeholder="Se vuoto uso il titolo" autocomplete="off"></label>
      <span class="muted">Compaiono nel piè di pagina della carta «Gabriel Jones».</span>
    </div>
    <input type="file" id="ed-img" accept="image/*" hidden>
    <div class="scr-body ed-body">
      <div class="sheet" id="ed-sheet">
        <div class="lh-slot" id="ed-head" role="button" tabindex="0" title="Clic per modificare la carta intestata"></div>
        <div id="ed-text" class="paper" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Testo del documento"></div>
        <div class="lh-slot" id="ed-foot" role="button" tabindex="0" title="Clic per modificare la carta intestata"></div>
      </div>
    </div>`;
  document.body.append(root);

  const $title = $("#ed-title", root), $text = $("#ed-text", root), $state = $("#ed-state", root), $lh = $("#ed-lh", root);
  let docs = [], cur = null, timer = null, dirty = false, hooks = {};

  let model = "";   // carta del documento aperto: "jones" | "gabriel" | "" (nessuna)
  const count = () => { $("#ed-count", root).textContent = `${($text.innerText.trim().match(/\S+/g) || []).length} parole`; };

  const paintFoot = async () => {
    if (!model || !cur) return;
    const c = await Letterhead.forDoc(cur);
    if (c) $("#ed-foot", root).innerHTML = Letterhead.footer(c);
  };
  const paintLh = async () => {
    model = await Letterhead.modelOf(cur);
    const c = model ? await Letterhead.forDoc(cur) : null;
    $("#ed-head", root).innerHTML = c ? Letterhead.header(c) : "";
    $("#ed-foot", root).innerHTML = c ? Letterhead.footer(c) : "";
    const sheet = $("#ed-sheet", root);
    sheet.classList.toggle("no-lh", !model);
    sheet.classList.toggle("lg", model === "gabriel");
    $lh.value = model || "nessuna";
    $("#ed-meta", root).hidden = model !== "gabriel";
    $("#ed-dest", root).value = cur.destinatario || "";
    $("#ed-ogg", root).value = cur.oggetto || "";
  };

  const commit = async () => {
    clearTimeout(timer);
    if (!cur || !dirty) return;
    dirty = false;
    cur.titolo = $title.value.trim();
    cur.html = $text.innerHTML;
    cur.aggiornato = new Date().toISOString();
    await Portal.save("documenti", docs);
    $state.textContent = "Salvato";
  };
  const schedule = () => { dirty = true; $state.textContent = "Salvataggio…"; clearTimeout(timer); timer = setTimeout(commit, 700); };

  const open = async (doc, opts) => {
    docs = opts.docs;
    hooks = opts;
    cur = doc;
    dirty = false;
    $title.value = doc.titolo || "";
    $text.innerHTML = Portal.sanitize(doc.html) || "<p><br></p>";
    $state.textContent = "";
    root.hidden = false;
    try { document.execCommand("styleWithCSS", false, true); } catch { /* browser vecchio */ }
    document.body.classList.add("scr-open");
    count();
    await paintLh();
    root.querySelector(".ed-body").scrollTop = 0;
    if (opts.focusTitle) $title.focus(); else $text.focus();
  };

  const close = async () => {
    await commit();
    root.hidden = true;
    document.body.classList.remove("scr-open");
    cur = null;
    if (hooks.onClose) hooks.onClose();
  };

  /* Stampa o salva in PDF: la carta intestata si ripete su ogni pagina */
  const print = async () => {
    await commit();
    const w = window.open("", "_blank");
    if (!w) return Portal.toast("Consenti le finestre popup per stampare");
    const c = await Letterhead.forDoc(cur);
    w.document.write(Letterhead.printHtml({ s: c, ctx: c && c.ctx, body: Portal.sanitize(cur.html), title: cur.titolo || "Documento" }));
    w.document.close();
    w.focus();
    const go = () => { try { w.print(); } catch { /* chiusa */ } };
    const ready = () => (w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready : Promise.resolve());
    const imgs = [...w.document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }));
    Promise.all([ready(), ...imgs]).then(() => setTimeout(go, 250));
  };

  const word = async () => {
    await commit();
    try {
      $state.textContent = "Preparo il file Word…";
      const blob = await DocxExport.make({ titolo: cur.titolo, html: Portal.sanitize(cur.html), carta: await Letterhead.forDoc(cur) });
      Portal.download(Portal.slug(cur.titolo) + ".docx", blob);
      $state.textContent = "Salvato";
    } catch (err) { $state.textContent = ""; Portal.toast(err.message || "Impossibile creare il file Word"); }
  };

  const insertTable = () => {
    const html = `<table><tbody>${Array.from({ length: 3 }, (_, r) => `<tr>${Array.from({ length: 3 }, () => r ? "<td><br></td>" : "<th><br></th>").join("")}</tr>`).join("")}</tbody></table><p><br></p>`;
    document.execCommand("insertHTML", false, html);
  };

  /* Eventi */
  $title.addEventListener("input", schedule);
  $title.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $text.focus(); } });
  $text.addEventListener("input", () => { schedule(); count(); });
  $text.addEventListener("paste", e => {
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) commit(); });
  window.addEventListener("beforeunload", () => { if (dirty) commit(); });
  root.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); commit(); } });

  const bar = $(".rte-bar", root);
  bar.addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-cmd]");
    if (!b) return;
    let val = b.dataset.val;
    if (b.dataset.cmd === "createLink") { val = prompt("Indirizzo del link (https://…)"); if (!val) return; val = normUrl(val); }
    if (b.dataset.cmd === "insertImage") return $("#ed-img", root).click();
    $text.focus();
    restoreRange();
    if (b.dataset.cmd === "insertTable") insertTable();
    else if (b.dataset.cmd === "pageBreak") document.execCommand("insertHTML", false, '<div class="pb" style="break-after:page;page-break-after:always"></div><p><br></p>');
    else if (b.dataset.cmd === "insertDate") document.execCommand("insertText", false, new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }));
    else document.execCommand(b.dataset.cmd, false, val);
    schedule();
    count();
  });

  /* Carta: scelta per questo documento, modifica e predefinita */
  $lh.addEventListener("change", async () => {
    cur.cartaModello = $lh.value;
    cur.carta = $lh.value !== "nessuna";
    await Portal.save("documenti", docs);
    paintLh();
  });
  const editLh = async () => { if (await Letterhead.edit(model || undefined)) paintLh(); };
  ["#ed-head", "#ed-foot"].forEach(sel => {
    $(sel, root).addEventListener("click", editLh);
    $(sel, root).addEventListener("keydown", e => { if (e.key === "Enter") editLh(); });
  });
  const meta = () => { cur.destinatario = $("#ed-dest", root).value.trim(); cur.oggetto = $("#ed-ogg", root).value.trim(); schedule(); paintFoot(); };
  $("#ed-dest", root).addEventListener("input", meta);
  $("#ed-ogg", root).addEventListener("input", meta);
  $title.addEventListener("input", () => { if (model === "gabriel" && !cur.oggetto) { cur.titolo = $title.value.trim(); paintFoot(); } });

  /* Carattere, dimensione, colori */
  const keepSel = el => el.addEventListener("mousedown", e => e.stopPropagation());
  let savedRange = null;
  const saveRange = () => { const sel = getSelection(); if (sel.rangeCount && $text.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange(); };
  const restoreRange = () => { if (!savedRange) return; const sel = getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); };
  document.addEventListener("selectionchange", saveRange);
  const withSel = fn => { $text.focus(); restoreRange(); fn(); schedule(); count(); };
  $("#ed-font", root).addEventListener("change", e => { const v = e.target.value; if (v) withSel(() => document.execCommand("fontName", false, v)); e.target.selectedIndex = 0; });
  $("#ed-size", root).addEventListener("change", e => {
    const v = e.target.value;
    if (v) withSel(() => {
      document.execCommand("fontSize", false, 7);
      $text.querySelectorAll("font[size='7']").forEach(f => { const sp = document.createElement("span"); sp.style.fontSize = v + "pt"; sp.innerHTML = f.innerHTML; f.replaceWith(sp); });
    });
    e.target.selectedIndex = 0;
  });
  $("#ed-color", root).addEventListener("input", e => withSel(() => document.execCommand("foreColor", false, e.target.value)));
  $("#ed-hilite", root).addEventListener("input", e => withSel(() => document.execCommand("hiliteColor", false, e.target.value)));
  [$("#ed-font", root), $("#ed-size", root), $("#ed-color", root), $("#ed-hilite", root)].forEach(keepSel);

  /* Immagini: ridotte a 1200 px per non appesantire il documento */
  const imageData = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = cv.getContext("2d");
      if (file.type !== "image/png") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Immagine non leggibile")); };
    img.src = url;
  });
  $("#ed-img", root).addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { const d = await imageData(f); withSel(() => document.execCommand("insertImage", false, d)); }
    catch (err) { Portal.toast(err.message); }
  });

  /* Zoom del foglio */
  $("#ed-zoom", root).addEventListener("input", e => { $("#ed-sheet", root).style.zoom = e.target.value / 100; $("#ed-zv", root).textContent = e.target.value + "%"; });

  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]");
    if (!b || !cur) return;
    const a = b.dataset.a;
    if (a === "close") close();
    if (a === "lhset") editLh();
    if (a === "print") print();
    if (a === "word") word();
    if (a === "dup") {
      await commit();
      const now = new Date().toISOString();
      const copy = { ...cur, id: Portal.uid(), titolo: (cur.titolo || "Senza titolo") + " (copia)", creato: now, aggiornato: now, preferito: false };
      docs.push(copy);
      await Portal.save("documenti", docs);
      Portal.toast("Documento duplicato");
      open(copy, hooks);
    }
    if (a === "del" && confirm("Spostare questo documento nel cestino?")) {
      dirty = false;
      clearTimeout(timer);
      cur.cestino = new Date().toISOString();
      await Portal.save("documenti", docs);
      root.hidden = true;
      document.body.classList.remove("scr-open");
      cur = null;
      Portal.toast("Documento spostato nel cestino");
      if (hooks.onClose) hooks.onClose();
    }
  });

  return { open, close, isOpen: () => !root.hidden };
})();
