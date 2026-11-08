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
      <button class="chip-btn" id="ed-lh" aria-pressed="true" title="Mostra o nascondi la carta intestata">Carta intestata</button>
      <button class="icon-btn" data-a="lhset" title="Modifica la carta intestata" aria-label="Modifica la carta intestata">⚙</button>
      <button class="btn ghost sm" data-a="print">Stampa / PDF</button>
      <button class="btn navy sm" data-a="word">Scarica Word</button>
      <button class="btn ghost sm" data-a="dup">Duplica</button>
      <button class="btn danger sm" data-a="del">Elimina</button>
    </div>
    <div class="rte-bar" role="toolbar" aria-label="Formattazione">
      <button data-cmd="undo" title="Annulla" aria-label="Annulla">↶</button>
      <button data-cmd="redo" title="Ripeti" aria-label="Ripeti">↷</button>
      <span class="sep"></span>
      <button data-cmd="bold" title="Grassetto"><b>B</b></button>
      <button data-cmd="italic" title="Corsivo"><i>I</i></button>
      <button data-cmd="underline" title="Sottolineato"><u>S</u></button>
      <button data-cmd="strikeThrough" title="Barrato"><s>B</s></button>
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
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList">Elenco</button>
      <button data-cmd="insertOrderedList">Numerato</button>
      <button data-cmd="createLink">Link</button>
      <button data-cmd="insertTable" title="Inserisci una tabella">Tabella</button>
      <button data-cmd="insertHorizontalRule" title="Linea di separazione">Linea</button>
      <button data-cmd="removeFormat">Pulisci</button>
      <span class="sp"></span>
      <span id="ed-count" class="muted"></span>
    </div>
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

  const lhOn = () => cur && cur.carta !== false;
  const count = () => { $("#ed-count", root).textContent = `${($text.innerText.trim().match(/\S+/g) || []).length} parole`; };

  const paintLh = async () => {
    const s = await Letterhead.get();
    const on = lhOn();
    $("#ed-head", root).innerHTML = on ? Letterhead.header(s) : "";
    $("#ed-foot", root).innerHTML = on ? Letterhead.footer(s) : "";
    $("#ed-sheet", root).classList.toggle("no-lh", !on);
    $lh.classList.toggle("on", on);
    $lh.setAttribute("aria-pressed", on);
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
    const s = await Letterhead.get(), on = lhOn(), body = Portal.sanitize(cur.html);
    const content = `<div class="doc">${body}</div>`;
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(cur.titolo || "Documento")}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        @page{size:A4;margin:${on ? "11mm 16mm 10mm" : "18mm 18mm"}}
        *{box-sizing:border-box}
        body{margin:0;color:#111;font:11.5pt/1.65 Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        table.page{width:100%;border-collapse:collapse}
        table.page>thead{display:table-header-group}table.page>tfoot{display:table-footer-group}
        table.page td{padding:0}
        .gap{height:9mm}.gap-s{height:6mm}
        .doc h2{font:700 21pt/1.1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#101c4d;margin:1.1em 0 .35em;break-after:avoid}
        .doc h3{font:700 15pt/1.15 "Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#101c4d;margin:1em 0 .3em;break-after:avoid}
        .doc p{margin:0 0 .75em}.doc h2:first-child,.doc h3:first-child{margin-top:0}
        .doc blockquote{margin:1em 0;padding:2px 16px;border-left:4px solid #d3121b;color:#5d668a}
        .doc a{color:#d3121b}.doc hr{border:0;border-top:1px solid #c9cde0;margin:1.2em 0}
        .doc table{border-collapse:collapse;width:100%;margin:1em 0;break-inside:avoid}
        .doc td,.doc th{border:1px solid #c9cde0;padding:6px 9px;text-align:left;vertical-align:top}.doc th{background:#eef0f7}
        .doc img{max-width:100%}
        ${Letterhead.css}
      </style></head><body>
      <table class="page">
        ${on ? `<thead><tr><td>${Letterhead.header(s)}<div class="gap"></div></td></tr></thead><tfoot><tr><td><div class="gap-s"></div>${Letterhead.footer(s)}</td></tr></tfoot>` : ""}
        <tbody><tr><td>${content}</td></tr></tbody>
      </table></body></html>`);
    w.document.close();
    w.focus();
    const go = () => { try { w.print(); } catch { /* chiusa */ } };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 250)); else setTimeout(go, 900);
  };

  const word = async () => {
    await commit();
    try {
      $state.textContent = "Preparo il file Word…";
      const blob = await DocxExport.make({ titolo: cur.titolo, html: Portal.sanitize(cur.html), carta: lhOn() ? await Letterhead.get() : null });
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
    $text.focus();
    if (b.dataset.cmd === "insertTable") insertTable(); else document.execCommand(b.dataset.cmd, false, val);
    schedule();
    count();
  });

  $lh.addEventListener("click", async () => { cur.carta = !lhOn(); await Portal.save("documenti", docs); paintLh(); });
  const editLh = async () => { if (await Letterhead.edit()) paintLh(); };
  ["#ed-head", "#ed-foot"].forEach(sel => {
    $(sel, root).addEventListener("click", editLh);
    $(sel, root).addEventListener("keydown", e => { if (e.key === "Enter") editLh(); });
  });

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
