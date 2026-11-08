/* Jones House · anteprime dei file del Drive
   PDF (pdf.js), PowerPoint (pptx-preview), Word (mammoth), immagini, video, audio, testo. */
const Viewers = (() => {
  const EXT = {
    pdf: ["pdf"], pptx: ["pptx", "ppsx"], docx: ["docx"],
    sheet: ["xlsx", "xls", "csv", "tsv", "ods"],
    text: ["txt", "md", "json", "xml", "yml", "yaml", "log", "css", "js", "html", "htm", "rtf", "ini", "sql"],
    ppt: ["ppt", "pps", "odp", "key"], doc: ["doc", "odt", "pages"]
  };
  const ext = n => ((n || "").split(".").pop() || "").toLowerCase();

  const kindOf = m => {
    const e = ext(m.nome), t = m.tipo || "";
    for (const [k, list] of Object.entries(EXT)) if (list.includes(e)) return k;
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("text/")) return "text";
    return "other";
  };

  // Etichetta e colore del tipo di file
  const BADGE = {
    doc: ["DOC", "#101c4d"], docx: ["DOCX", "#2f5aa8"], doc_: ["DOC", "#2f5aa8"],
    pdf: ["PDF", "#d3121b"], pptx: ["PPT", "#c2410c"], ppt: ["PPT", "#c2410c"],
    sheet: ["XLS", "#1f7a4d"], text: ["TXT", "#5d668a"], image: ["IMG", "#5b3f9e"],
    video: ["VID", "#0e7490"], audio: ["AUD", "#0e7490"], other: ["FILE", "#5d668a"], folder: ["", "#101c4d"]
  };
  const badge = kind => BADGE[kind] || BADGE.other;

  /* ---------- Struttura della schermata ---------- */
  const root = document.createElement("div");
  root.className = "scr viewer";
  root.hidden = true;
  root.innerHTML = `
    <div class="scr-top">
      <button class="btn ghost sm" data-a="close" aria-label="Chiudi">← Drive</button>
      <span class="tbadge" data-badge></span>
      <b class="v-name"></b>
      <span class="sp"></span>
      <button class="btn sm" data-a="edit" hidden>Modifica come documento</button>
      <button class="btn ghost sm" data-a="print" hidden>Stampa</button>
      <button class="btn navy sm" data-a="download">Scarica</button>
    </div>
    <div class="v-body"></div>`;
  document.body.append(root);
  const $body = $(".v-body", root);

  let cleanup = [], session = 0, hooks = {}, current = null;

  const close = () => {
    if (root.hidden) return;
    session++;
    cleanup.forEach(f => { try { f(); } catch { /* niente */ } });
    cleanup = [];
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.hidden = true;
    document.body.classList.remove("scr-open");
    $body.innerHTML = "";
    current = null;
    if (hooks.onClose) hooks.onClose();
  };

  const busy = msg => { $body.innerHTML = `<div class="v-msg"><span class="spin" aria-hidden="true"></span>${esc(msg || "Apertura in corso…")}</div>`; };
  const fail = (msg, withDl = true) => {
    $body.innerHTML = `<div class="v-msg"><div class="big-badge" style="--c:${badge(current ? current.kind : "other")[1]}">${esc(badge(current ? current.kind : "other")[0])}</div>
      <p>${esc(msg)}</p>${withDl ? `<button class="btn" data-a="download">Scarica il file</button>` : ""}</div>`;
  };

  /* ---------- PDF ---------- */
  async function showPdf(blob, my) {
    await Portal.script("/assets/vendor/pdf.min.js");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (my !== session) { pdf.destroy(); return; }
    cleanup.push(() => pdf.destroy());

    $body.innerHTML = `<div class="pv">
      <div class="pv-bar">
        <button data-p="prev" aria-label="Pagina precedente">‹</button>
        <span class="pv-pg"><input class="pv-n" value="1" inputmode="numeric" aria-label="Pagina"> / <b>${pdf.numPages}</b></span>
        <button data-p="next" aria-label="Pagina successiva">›</button>
        <span class="sep"></span>
        <button data-p="out" aria-label="Riduci">−</button><span class="pv-z">100%</span><button data-p="in" aria-label="Ingrandisci">+</button>
        <button data-p="fit">Adatta alla larghezza</button>
      </div>
      <div class="pv-scroll"><div class="pv-pages"></div></div></div>`;
    const scroll = $(".pv-scroll", $body), wrap = $(".pv-pages", $body), nIn = $(".pv-n", $body), zLab = $(".pv-z", $body);
    const first = await pdf.getPage(1);
    const base = first.getViewport({ scale: 1 });
    let zoom = 0; // 0 = adatta alla larghezza
    const scale = () => zoom || Math.max(.35, Math.min(3, (scroll.clientWidth - 32) / base.width));
    const size = div => { const s = scale(); div.style.width = base.width * s + "px"; div.style.height = base.height * s + "px"; };

    const render = async div => {
      const s = scale();
      if (div._s === s) return;
      div._s = s;
      if (div._task) { try { div._task.cancel(); } catch { /* già finito */ } }
      const page = await pdf.getPage(+div.dataset.n);
      if (div._s !== s) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5), vp = page.getViewport({ scale: s });
      let cv = div.querySelector("canvas");
      if (!cv) { cv = document.createElement("canvas"); div.append(cv); }
      cv.width = Math.floor(vp.width * dpr);
      cv.height = Math.floor(vp.height * dpr);
      cv.style.width = vp.width + "px";
      cv.style.height = vp.height + "px";
      div.style.width = vp.width + "px";
      div.style.height = vp.height + "px";
      const task = div._task = page.render({ canvasContext: cv.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      try { await task.promise; } catch { /* annullato per un nuovo zoom */ }
    };

    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) render(e.target); }), { root: scroll, rootMargin: "900px 0px" });
    cleanup.push(() => io.disconnect());
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const d = document.createElement("div");
      d.className = "pv-page";
      d.dataset.n = i;
      size(d);
      wrap.append(d);
      pages.push(d);
      io.observe(d);
    }

    const relayout = () => {
      pages.forEach(p => { size(p); p._s = 0; io.unobserve(p); io.observe(p); });
      zLab.textContent = Math.round(scale() * 100) + "%";
    };
    const go = n => { n = Math.max(1, Math.min(pdf.numPages, n)); pages[n - 1].scrollIntoView({ block: "start" }); nIn.value = n; };

    let tick = false;
    scroll.addEventListener("scroll", () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const y = scroll.scrollTop + scroll.clientHeight / 3;
        let cur = 1;
        for (const p of pages) { if (p.offsetTop <= y) cur = +p.dataset.n; else break; }
        if (document.activeElement !== nIn) nIn.value = cur;
      });
    });
    nIn.addEventListener("change", () => go(parseInt(nIn.value, 10) || 1));
    $(".pv-bar", $body).addEventListener("click", e => {
      const b = e.target.closest("[data-p]");
      if (!b) return;
      const cur = parseInt(nIn.value, 10) || 1, a = b.dataset.p;
      if (a === "prev") go(cur - 1);
      if (a === "next") go(cur + 1);
      if (a === "in") { zoom = Math.min(3, +(scale() + .15).toFixed(2)); relayout(); }
      if (a === "out") { zoom = Math.max(.35, +(scale() - .15).toFixed(2)); relayout(); }
      if (a === "fit") { zoom = 0; relayout(); }
    });
    let rt;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (!zoom) relayout(); }, 150); };
    window.addEventListener("resize", onResize);
    cleanup.push(() => window.removeEventListener("resize", onResize));
    relayout();
  }

  /* ---------- PowerPoint ---------- */
  async function showPptx(blob, my) {
    await Portal.script("/assets/vendor/pptx-preview.umd.js");
    $body.innerHTML = `<div class="pp">
      <aside class="pp-thumbs" aria-label="Diapositive"></aside>
      <div class="pp-main">
        <div class="pp-stage"><div class="pp-box"></div></div>
        <div class="pp-bar">
          <button data-s="prev" aria-label="Diapositiva precedente">‹</button><span class="pp-count"></span><button data-s="next" aria-label="Diapositiva successiva">›</button>
          <span class="sp"></span><button data-s="full">Schermo intero</button>
        </div>
      </div>
      <div class="pp-hold" aria-hidden="true"></div></div>`;
    const hold = $(".pp-hold", $body), box = $(".pp-box", $body), stage = $(".pp-stage", $body), thumbs = $(".pp-thumbs", $body), main = $(".pp-main", $body), count = $(".pp-count", $body);

    const W = 1280;
    const previewer = window.pptxPreview.init(hold, { width: W, mode: "list" });
    await previewer.preview(await blob.arrayBuffer());
    if (my !== session) return;
    const slides = $$(".pptx-preview-slide-wrapper", hold);
    if (!slides.length) throw new Error("Nessuna diapositiva trovata");
    slides.forEach(s => { s.style.margin = "0"; });
    const sh = parseFloat(slides[0].style.height) || W * 9 / 16;
    const TW = 156, k = TW / W;

    slides.forEach((s, i) => {
      const t = document.createElement("button");
      t.className = "pp-th";
      t.dataset.i = i;
      t.setAttribute("aria-label", "Diapositiva " + (i + 1));
      t.style.height = sh * k + "px";
      const inner = document.createElement("div");
      inner.className = "pp-th-in";
      inner.style.cssText = `width:${W}px;height:${sh}px;transform:scale(${k});transform-origin:0 0`;
      inner.append(s.cloneNode(true));
      const num = document.createElement("span");
      num.textContent = i + 1;
      t.append(inner, num);
      thumbs.append(t);
    });

    let idx = 0;
    const fit = () => {
      const w = stage.clientWidth - 32, h = stage.clientHeight - 32;
      if (w <= 0 || h <= 0) return;
      const f = Math.min(w / W, h / sh);
      box.style.width = W * f + "px";
      box.style.height = sh * f + "px";
      const s = slides[idx];
      s.style.transformOrigin = "0 0";
      s.style.transform = `scale(${f})`;
    };
    const show = i => {
      idx = Math.max(0, Math.min(slides.length - 1, i));
      box.replaceChildren(slides[idx]);
      count.textContent = `${idx + 1} / ${slides.length}`;
      $$(".pp-th", thumbs).forEach((t, n) => t.classList.toggle("on", n === idx));
      const t = $(`.pp-th[data-i="${idx}"]`, thumbs);
      if (t) t.scrollIntoView({ block: "nearest" });
      fit();
    };

    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    cleanup.push(() => ro.disconnect());
    thumbs.addEventListener("click", e => { const t = e.target.closest(".pp-th"); if (t) show(+t.dataset.i); });
    $(".pp-bar", $body).addEventListener("click", e => {
      const b = e.target.closest("[data-s]");
      if (!b) return;
      if (b.dataset.s === "prev") show(idx - 1);
      if (b.dataset.s === "next") show(idx + 1);
      if (b.dataset.s === "full" && main.requestFullscreen) main.requestFullscreen().catch(() => {});
    });
    stage.addEventListener("click", () => { if (document.fullscreenElement) show(idx + 1); });
    const onKey = e => {
      if (root.hidden || e.target.closest("input,textarea")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); show(idx + 1); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); show(idx - 1); }
      if (e.key === "Home") show(0);
      if (e.key === "End") show(slides.length - 1);
    };
    document.addEventListener("keydown", onKey);
    cleanup.push(() => document.removeEventListener("keydown", onKey));
    show(0);
  }

  /* ---------- Word, testo, immagini, audio/video ---------- */
  const docxToHtml = async blob => {
    await Portal.script("/assets/vendor/mammoth.browser.min.js");
    const r = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() }, {
      convertImage: window.mammoth.images.imgElement(img => img.read("base64").then(b64 => ({ src: `data:${img.contentType};base64,${b64}` })))
    });
    return Portal.sanitize(r.value);
  };

  async function showDocx(blob) {
    const html = await docxToHtml(blob);
    $body.innerHTML = `<div class="v-scroll"><div class="sheet"><div class="paper ro">${html || "<p class='muted'>Il documento è vuoto.</p>"}</div></div></div>`;
  }

  async function showText(blob) {
    const LIMIT = 1.5 * 1024 * 1024;
    const text = await blob.slice(0, LIMIT).text();
    $body.innerHTML = `<div class="v-scroll"><pre class="v-text"></pre>${blob.size > LIMIT ? `<p class="muted" style="text-align:center">Mostro solo l'inizio del file. Scaricalo per leggerlo tutto.</p>` : ""}</div>`;
    $(".v-text", $body).textContent = text;
  }

  function showMedia(blob, kind) {
    const url = URL.createObjectURL(blob);
    cleanup.push(() => URL.revokeObjectURL(url));
    $body.innerHTML = kind === "image"
      ? `<div class="v-scroll v-center"><img class="v-img" alt="${esc(current.meta.nome)}"></div>`
      : `<div class="v-scroll v-center"><${kind} class="v-media" controls></${kind}></div>`;
    $(kind === "image" ? "img" : kind, $body).src = url;
  }

  /* ---------- Apertura ---------- */
  async function open(meta, opts = {}) {
    hooks = opts;
    const kind = kindOf(meta), my = ++session;
    current = { meta, kind, blob: null };
    root.hidden = false;
    document.body.classList.add("scr-open");
    $(".v-name", root).textContent = meta.nome;
    const [lab, col] = badge(kind === "doc" ? "doc_" : kind);
    const bd = $("[data-badge]", root);
    bd.textContent = lab;
    bd.style.setProperty("--c", col);
    $('[data-a="edit"]', root).hidden = kind !== "docx";
    $('[data-a="print"]', root).hidden = !(kind === "pdf" || kind === "image");
    busy();
    try {
      const blob = current.blob = await opts.getBlob();
      if (my !== session) return;
      if (kind === "pdf") await showPdf(blob, my);
      else if (kind === "pptx") await showPptx(blob, my);
      else if (kind === "docx") await showDocx(blob);
      else if (kind === "text") await showText(blob);
      else if (kind === "image" || kind === "video" || kind === "audio") showMedia(blob, kind);
      else if (kind === "ppt") fail("Questo è un formato PowerPoint antico (.ppt): non riesco a mostrarlo qui. Scaricalo, oppure salvalo come .pptx.");
      else if (kind === "doc") fail("Questo è un formato Word antico (.doc): non riesco a mostrarlo qui. Scaricalo, oppure salvalo come .docx.");
      else fail("Per questo tipo di file non c'è un'anteprima.");
    } catch (err) {
      if (my === session) fail(kind === "pptx" ? "Non riesco a leggere questa presentazione. Scaricala per aprirla con PowerPoint." : (err && err.message) || "Impossibile aprire il file.");
    }
  }

  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]");
    if (!b || !current) return;
    const a = b.dataset.a;
    if (a === "close") close();
    if (a === "download" && current.blob) Portal.download(current.meta.nome, current.blob);
    if (a === "edit" && hooks.onEdit) { const m = current.meta; close(); hooks.onEdit(m); }
    if (a === "print" && current.blob) {
      const url = URL.createObjectURL(current.blob);
      const w = window.open(url, "_blank");
      if (!w) Portal.toast("Consenti le finestre popup per stampare");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !root.hidden && !document.fullscreenElement && !document.querySelector("dialog[open]")) close(); });

  return { open, close, kindOf, badge, docxToHtml, ext };
})();
