/* Plugin Notion: pagina /notion/ — spazio di lavoro a blocchi, database, board e agenda.
   Dati: collezione "pagine" (sincronizzata e inclusa nel backup come le altre). */
(async () => {
  if (document.body.dataset.page !== "/notion/") return;
  if (!Portal.COLLECTIONS.includes("pagine")) Portal.COLLECTIONS.push("pagine");
  const pages = await Portal.load("pagine", []);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const now = () => new Date().toISOString();
  const ui = (() => { try { return JSON.parse(localStorage.getItem("nt-ui") || "{}"); } catch { return {}; } })();
  const saveUi = () => { try { localStorage.setItem("nt-ui", JSON.stringify(ui)); } catch {} };
  const st = { id: "", q: "" }, main = $("#nt-main"), pop = $("#nt-pop");
  let dbq = "", dbs = "", drag = null, menu = null, tm = null, dirty = null;

  const COVERS = ["linear-gradient(120deg,var(--navy),color-mix(in srgb,var(--navy) 50%,#fff))", "linear-gradient(120deg,var(--red),color-mix(in srgb,var(--red) 40%,#fff))", "linear-gradient(120deg,var(--navy),var(--red))", "linear-gradient(120deg,var(--cream),color-mix(in srgb,var(--navy) 22%,var(--cream)))"];
  const EMO = ["📄", "📝", "📚", "🎯", "🚀", "💡", "📅", "✅", "🧠", "🎨", "🔥", "⭐", "🌱", "📌", "🗂️", "🧪", "🎓", "🏠", "💼", "🗺️", "🎵", "📊", "🛠️", "❤️", "🌍", "☕"];
  const TYPES = [["t", "Testo", "Aa"], ["h1", "Titolo 1", "H1"], ["h2", "Titolo 2", "H2"], ["h3", "Titolo 3", "H3"], ["bul", "Elenco puntato", "•"], ["num", "Elenco numerato", "1."], ["todo", "Da fare", "☐"], ["tog", "Toggle", "▸"], ["quote", "Citazione", "❝"], ["call", "Callout", "💡"], ["code", "Codice", "</>"], ["hr", "Divisore", "—"], ["img", "Immagine", "🖼"], ["link", "Segnalibro", "🔗"], ["page", "Sottopagina", "📄"]];
  const SC = { "# ": "h1", "## ": "h2", "### ": "h3", "- ": "bul", "* ": "bul", "1. ": "num", "[] ": "todo", "> ": "quote", "```": "code", "---": "hr", "!! ": "call" };
  const ST = ["Da fare", "In corso", "Fatto"], PR = ["Bassa", "Media", "Alta"];
  const TPL = [
    { n: "Pagina vuota", ic: "📄", md: "" },
    { n: "Appunti riunione", ic: "🗒️", md: "> Data, partecipanti e obiettivo\n## Agenda\n- Punto 1\n- Punto 2\n## Decisioni\n!! Scrivi qui le decisioni prese\n## Azioni\n[] Prima azione\n[] Seconda azione" },
    { n: "Diario", ic: "📔", md: "## Come mi sento oggi\n\n## Tre cose belle\n1. \n2. \n3. \n## Da ricordare\n> Una frase della giornata\n## Domani\n[] " },
    { n: "Lista to-do", ic: "✅", md: "## Oggi\n[] \n## Questa settimana\n[] \n## Prima o poi\n[] " },
    { n: "Piano di studio", ic: "🎓", md: "## Obiettivo\n!! Cosa voglio imparare e entro quando\n## Argomenti\n- Argomento 1\n- Argomento 2\n## Risorse\n- Libro o link\n## Verifica\n[] Ripasso\n[] Esercizi\n[] Autovalutazione" },
    { n: "Database progetti", ic: "🗺️", db: 1 }
  ];

  /* ---------- Utilità ---------- */
  const uid = () => Portal.uid();
  const strip = h => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent; };
  const words = p => p.tipo === "db" ? p.righe.length : (p.blocchi.map(b => strip(b.h) + " " + strip(b.d)).join(" ").match(/\S+/g) || []).length;
  const snip = p => p.tipo === "db" ? p.righe.length + " righe" : strip(p.blocchi.map(b => b.h).join(" ")).slice(0, 80);
  const nb = (t = "t", h = "") => ({ id: uid(), t, h });
  const P = () => pages.find(p => p.id === st.id);
  const live = () => pages.filter(p => !p.cestino);
  const title = p => p.titolo || "Senza titolo";
  const isDesc = (id, anc) => { for (let p = pages.find(x => x.id === id); p; p = pages.find(x => x.id === p.parent)) if (p.id === anc) return true; return false; };
  const inl = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/~~([^~]+)~~/g, "<s>$1</s>").replace(/\*([^*]+)\*/g, "<i>$1</i>");

  function clean(html) {   // lascia passare solo la formattazione sicura
    const out = document.createElement("div"), src = document.createElement("div"); src.innerHTML = html;
    const map = { b: "b", strong: "b", i: "i", em: "i", u: "u", s: "s", strike: "s", del: "s", code: "code", mark: "mark", br: "br", a: "a" };
    const walk = (n, to) => n.childNodes.forEach(c => {
      if (c.nodeType === 3) return to.append(c.textContent);
      if (c.nodeType !== 1) return;
      const t = c.tagName.toLowerCase(), m = map[t];
      if (!m) { if (/^(div|p|li)$/.test(t) && to.lastChild) to.append(document.createElement("br")); return walk(c, to); }
      const e = document.createElement(m);
      if (m === "a") { const h = safeUrl(c.getAttribute("href") || ""); if (!h || h === "#") return walk(c, to); e.href = h; e.target = "_blank"; e.rel = "noopener"; }
      if (m !== "br") walk(c, e);
      to.append(e);
    });
    walk(src, out); return out.innerHTML;
  }

  function mdToBlocks(text) {
    const out = []; let code = null;
    text.replace(/\r/g, "").split("\n").forEach(l => {
      if (/^```/.test(l)) { if (code) { out.push({ ...nb("code", esc(code.join("\n"))) }); code = null; } else code = []; return; }
      if (code) return void code.push(l);
      if (!l.trim()) return;
      let m;
      if ((m = l.match(/^(#{1,3}) (.*)/))) out.push(nb("h" + m[1].length, inl(m[2])));
      else if ((m = l.match(/^(?:[-*] )?\[( |x)?\] ?(.*)/i))) { const b = nb("todo", inl(m[2])); b.c = /x/i.test(m[1] || ""); out.push(b); }
      else if ((m = l.match(/^[-*] (.*)/))) out.push(nb("bul", inl(m[1])));
      else if ((m = l.match(/^\d+\. ?(.*)/))) out.push(nb("num", inl(m[1])));
      else if ((m = l.match(/^> ?(.*)/))) out.push(nb("quote", inl(m[1])));
      else if ((m = l.match(/^!! ?(.*)/))) out.push(nb("call", inl(m[1])));
      else if (/^---+$/.test(l)) out.push(nb("hr"));
      else out.push(nb("t", inl(l)));
    });
    return out;
  }
  const h2m = h => strip(h.replace(/<b>(.*?)<\/b>/g, "**$1**").replace(/<i>(.*?)<\/i>/g, "*$1*").replace(/<s>(.*?)<\/s>/g, "~~$1~~").replace(/<code>(.*?)<\/code>/g, "`$1`").replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)").replace(/<br>/g, "\n"));
  function toMd(p) {
    const head = `# ${p.icona} ${title(p)}\n\n`;
    if (p.tipo === "db") return head + "| Titolo | Stato | Priorità | Data | Tag |\n|---|---|---|---|---|\n" + p.righe.map(r => `| ${r.titolo} | ${r.stato} | ${r.prio} | ${r.data || ""} | ${r.tag || ""} |`).join("\n");
    let n = 0;
    return head + p.blocchi.map(b => {
      n = b.t === "num" ? n + 1 : 0; const t = h2m(b.h || "");
      return ({ h1: "# " + t, h2: "## " + t, h3: "### " + t, bul: "- " + t, num: n + ". " + t, todo: `- [${b.c ? "x" : " "}] ${t}`, quote: "> " + t, call: "> 💡 " + t, tog: "- " + t + (b.d ? "\n  " + h2m(b.d) : ""), code: "```\n" + strip(b.h) + "\n```", hr: "---", img: `![](${b.u || ""})`, link: `[${t || b.u}](${b.u})`, page: "[[" + title(pages.find(x => x.id === b.p) || {}) + "]]" })[b.t] ?? t;
    }).join("\n\n");
  }

  /* ---------- Salvataggio ---------- */
  const touch = p => { p.agg = now(); dirty = p; const s = $("#nt-sv"); if (s) s.textContent = "Salvataggio…"; clearTimeout(tm); tm = setTimeout(flush, 600); };
  async function flush() { clearTimeout(tm); const p = dirty; if (!p) return; dirty = null; await Portal.upsert("pagine", p); const s = $("#nt-sv"); if (s) s.textContent = "Salvato ✓"; }
  addEventListener("beforeunload", flush);

  /* ---------- Pagine ---------- */
  function mkPage(o = {}) {
    const p = { id: uid(), titolo: "", icona: "📄", cover: -1, parent: "", tipo: "doc", blocchi: [nb()], righe: [], vista: "tabella", fav: false, cestino: false, aperta: true, creato: now(), agg: now(), ...o };
    pages.push(p); return p;
  }
  async function newFromTpl(t, parent = "") {
    const p = mkPage({ titolo: t.n === "Pagina vuota" ? "" : t.n, icona: t.ic, parent });
    if (t.db) { p.tipo = "db"; p.blocchi = []; p.righe = [["Definire obiettivi", "Da fare", "Alta"], ["Prima bozza", "In corso", "Media"], ["Revisione finale", "Da fare", "Bassa"]].map(([titolo, stato, prio]) => ({ id: uid(), titolo, stato, prio, data: "", tag: "" })); }
    else if (t.md) p.blocchi = mdToBlocks(t.md);
    if (parent) { const pp = pages.find(x => x.id === parent); if (pp) pp.aperta = true; await Portal.upsert("pagine", pp); }
    await Portal.upsert("pagine", p); location.hash = p.id; return p;
  }
  const trash = (p, v) => { p.cestino = v; pages.filter(x => x.parent === p.id).forEach(c => trash(c, v)); dirty = null; Portal.upsert("pagine", p); };
  async function dup(p) {
    const c = mkPage({ ...JSON.parse(JSON.stringify(p)), id: uid(), titolo: title(p) + " (copia)", creato: now() });
    c.blocchi.forEach(b => b.id = uid()); c.righe.forEach(r => r.id = uid());
    await Portal.upsert("pagine", c); location.hash = c.id; Portal.toast("Pagina duplicata");
  }
  function download(name, text, type = "text/markdown") {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- Barra laterale ---------- */
  function drawTree() {
    const q = st.q.toLowerCase().trim(), all = live();
    const kids = id => all.filter(p => p.parent === id && pages.some(x => x.id === id)).sort((a, b) => a.creato.localeCompare(b.creato));
    const row = (p, d) => { const k = kids(p.id); return `<li><div class="nt-row${p.id === st.id ? " on" : ""}" data-id="${esc(p.id)}" draggable="true" style="padding-left:${4 + d * 14}px"><button data-tg="${esc(p.id)}" type="button" aria-label="Apri o chiudi">${k.length ? (p.aperta ? "▾" : "▸") : "·"}</button><a href="#${esc(p.id)}">${esc(p.icona)} ${esc(title(p))}</a><button class="ad" data-sub="${esc(p.id)}" type="button" title="Nuova sottopagina">+</button></div>${p.aperta && k.length ? `<ul>${k.map(c => row(c, d + 1)).join("")}</ul>` : ""}</li>`; };
    const flat = p => `<li><div class="nt-row${p.id === st.id ? " on" : ""}" data-id="${esc(p.id)}"><a href="#${esc(p.id)}" style="padding-left:8px">${esc(p.icona)} ${esc(title(p))}</a></div></li>`;
    let h = `<div class="nt-row${st.id === "" ? " on" : ""}"><a href="#" style="padding-left:8px">🏠 Home</a></div>`;
    if (q) h += `<h4>Risultati</h4><ul>${all.filter(p => (title(p) + " " + strip(p.blocchi.map(b => b.h).join(" "))).toLowerCase().includes(q)).map(flat).join("") || "<li class='muted' style='padding:6px'>Nessun risultato</li>"}</ul>`;
    else {
      const fav = all.filter(p => p.fav);
      if (fav.length) h += `<h4>Preferiti</h4><ul>${fav.map(flat).join("")}</ul>`;
      h += `<h4>Pagine</h4><ul>${all.filter(p => !p.parent || !pages.some(x => x.id === p.parent)).sort((a, b) => a.creato.localeCompare(b.creato)).map(p => row(p, 0)).join("")}</ul>`;
    }
    h += `<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px"><button class="btn sm" data-new="" type="button">+ Nuova pagina</button><button class="btn ghost sm" data-tpls type="button">Da modello…</button><button class="btn ghost sm" id="nt-imp" type="button">Importa Markdown</button></div>
      <div class="nt-row${st.id === "cestino" ? " on" : ""}" style="margin-top:10px"><a href="#cestino" style="padding-left:8px">🗑 Cestino (${pages.length - all.length})</a></div>`;
    $("#nt-tree").innerHTML = h;
  }

  /* ---------- Home e cestino ---------- */
  function drawHome() {
    const L = live(), hr = new Date().getHours(), todos = L.flatMap(p => p.blocchi.filter(b => b.t === "todo")), card = p => `<a class="nt-hc" href="#${esc(p.id)}"><span class="hi">${esc(p.icona)}</span><b>${esc(title(p))}</b><small>${esc(snip(p))}</small></a>`;
    const rec = [...L].sort((a, b) => b.agg.localeCompare(a.agg)).slice(0, 6);
    main.innerHTML = `<div class="nt-page nt-home"><h1 class="nt-hello">${hr < 6 ? "Buonanotte" : hr < 13 ? "Buongiorno" : hr < 19 ? "Buon pomeriggio" : "Buonasera"} 👋</h1>
      <p class="muted">Premi <b>Ctrl+K</b> per cercare ovunque, <b>/</b> in una pagina per i comandi.</p>
      <div class="nt-stats"><div class="nt-stat"><b>${L.length}</b>pagine</div><div class="nt-stat"><b>${L.reduce((a, p) => a + words(p), 0)}</b>parole</div><div class="nt-stat"><b>${todos.filter(t => t.c).length}/${todos.length}</b>attività fatte</div></div>
      ${L.some(p => p.fav) ? `<h3 class="sec">Preferiti</h3><div class="nt-hg">${L.filter(p => p.fav).map(card).join("")}</div>` : ""}
      ${rec.length ? `<h3 class="sec">Modificate di recente</h3><div class="nt-hg">${rec.map(card).join("")}</div>` : ""}
      <h3 class="sec">Inizia da un modello</h3><div class="nt-hg">${TPL.map((t, i) => `<button class="nt-hc" data-tpl="${i}" type="button"><span class="hi">${t.ic}</span><b>${esc(t.n)}</b></button>`).join("")}</div></div>`;
  }
  function drawTrash() {
    const T = pages.filter(p => p.cestino);
    main.innerHTML = `<div class="nt-page"><h1 class="nt-title">🗑 Cestino</h1>${T.length ? T.map(p => `<div class="nt-row" style="padding:4px 6px"><span style="flex:1">${esc(p.icona)} ${esc(title(p))}</span><button class="btn ghost sm" data-rs="${esc(p.id)}" type="button">Ripristina</button><button class="btn ghost sm" data-pd="${esc(p.id)}" type="button">Elimina</button></div>`).join("") : "<p class='muted'>Il cestino è vuoto.</p>"}</div>`;
  }

  /* ---------- Pagina ---------- */
  function drawPage(p) {
    const chain = []; for (let x = p; x; x = pages.find(y => y.id === x.parent)) chain.unshift(x);
    main.innerHTML = `<div class="nt-bar">${chain.map(x => `<a href="#${esc(x.id)}">${esc(x.icona)} ${esc(title(x))}</a>`).join(" / ")}<span class="sp"></span><span id="nt-sv"></span>
      <button class="nt-btn" data-a="fav" title="Preferita" type="button">${p.fav ? "★" : "☆"}</button><button class="nt-btn" data-a="focus" title="Modalità focus (Ctrl+\\)" type="button">⛶</button><button class="nt-btn" data-a="wide" title="Larghezza" type="button">↔</button><button class="nt-btn" data-a="big" title="Testo grande" type="button">Aa</button><button class="nt-btn" data-a="md" title="Esporta Markdown" type="button">⤓</button><button class="nt-btn" data-a="print" title="Stampa / PDF" type="button">⎙</button><button class="nt-btn" data-a="dup" title="Duplica" type="button">⧉</button><button class="nt-btn" data-a="del" title="Elimina" type="button">🗑</button></div>
      ${p.cover >= 0 ? `<div class="nt-cover" style="background:${COVERS[p.cover % COVERS.length]}"><div><button data-a="cov" type="button">Cambia copertina</button><button data-a="nocov" type="button">Rimuovi</button></div></div>` : ""}
      <div class="nt-page"><button class="nt-ico${p.cover >= 0 ? " cv" : ""}" data-a="ico" type="button" title="Cambia icona">${esc(p.icona)}</button>
      ${p.cover < 0 ? `<button class="nt-btn" data-a="cov" type="button">🖼 Aggiungi copertina</button>` : ""}
      <h1 class="nt-title" id="nt-title" contenteditable="plaintext-only" data-ph="Senza titolo">${esc(p.titolo)}</h1>
      <div class="nt-meta"><span>Modificata ${esc(fmtDate(p.agg, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>${p.tipo === "doc" ? `<span>${words(p)} parole · ${Math.max(1, Math.round(words(p) / 200))} min di lettura</span>` : ""}</div>
      <div id="nt-body"></div></div>`;
    if (p.tipo === "db") drawDb(p); else drawBlocks(p);
    if (!p.titolo && p.tipo === "doc" && p.blocchi.length <= 1 && !strip(p.blocchi[0]?.h)) $("#nt-title").focus();
  }
  function blockHtml(b, i, arr) {
    const ph = { t: "Scrivi qualcosa, «/» per i comandi", h1: "Titolo 1", h2: "Titolo 2", h3: "Titolo 3", bul: "Elemento", num: "Elemento", todo: "Da fare", tog: "Toggle", quote: "Citazione", call: "Scrivi un'osservazione" };
    const ed = (f, h, cls = "") => `<div class="nb-c ${cls}" contenteditable="true" data-f="${f}" data-ph="${esc(ph[b.t] || "")}">${h || ""}</div>`;
    const urlIn = `<input class="nb-url" data-u placeholder="Incolla il link e premi Invio" aria-label="Link">`;
    let mk = "", inner;
    switch (b.t) {
      case "bul": mk = "•"; inner = ed("h", b.h); break;
      case "num": { let n = 0; for (let j = i; j >= 0 && arr[j].t === "num"; j--) n++; mk = n + "."; inner = ed("h", b.h); break; }
      case "todo": mk = `<input type="checkbox" data-c ${b.c ? "checked" : ""} aria-label="Fatto">`; inner = ed("h", b.h, b.c ? "done" : ""); break;
      case "tog": mk = `<button data-o type="button">${b.o ? "▾" : "▸"}</button>`; inner = ed("h", b.h) + (b.o ? `<div class="nb-c nb-d" contenteditable="true" data-f="d" data-ph="Contenuto nascosto">${b.d || ""}</div>` : ""); break;
      case "call": mk = "💡"; inner = ed("h", b.h); break;
      case "code": inner = `<pre class="nb-c nb-code" contenteditable="plaintext-only" data-f="h" data-ph="Codice">${b.h || ""}</pre>`; break;
      case "hr": inner = "<hr>"; break;
      case "img": inner = b.u ? `<img src="${esc(safeUrl(b.u))}" alt="">` : urlIn; break;
      case "link": inner = b.u ? `<a class="nb-bm" href="${esc(safeUrl(b.u))}" target="_blank" rel="noopener">${esc(b.h || b.u)}<span>${esc(b.u)}</span></a>` : urlIn; break;
      case "page": { const q = pages.find(x => x.id === b.p); inner = q && !q.cestino ? `<a class="nb-pg" href="#${esc(q.id)}">${esc(q.icona)} ${esc(title(q))}</a>` : `<span class="muted">Sottopagina non disponibile</span>`; break; }
      default: inner = ed("h", b.h);
    }
    return `<div class="nb nb-${b.t}" data-id="${esc(b.id)}"><span class="nb-hd" draggable="true" title="Trascina · clic per il menu">⋮⋮</span><span class="nb-mk">${mk}</span><div class="nb-bd">${inner}</div></div>`;
  }
  const drawBlocks = p => { $("#nt-body").innerHTML = p.blocchi.map(blockHtml).join("") + `<div class="nt-end" id="nt-end"></div>`; };
  const blk = c => P().blocchi.find(x => x.id === c.closest(".nb").dataset.id);

  /* ---------- Cursore ---------- */
  function focusB(id, end = true) {
    const c = $(`.nb[data-id="${id}"] .nb-c`); if (!c) return;
    c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(!end); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function caretTo(c, n) {
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let t, left = n;
    while ((t = w.nextNode())) { if (t.length >= left) { const r = document.createRange(); r.setStart(t, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } left -= t.length; }
    focusB(c.closest(".nb").dataset.id);
  }
  const edge = (c, atEnd) => { const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false; const r = s.getRangeAt(0), x = r.cloneRange(); x.selectNodeContents(c); atEnd ? x.setStart(r.startContainer, r.startOffset) : x.setEnd(r.startContainer, r.startOffset); return x.toString() === ""; };
  const splitAt = c => { const r = getSelection().getRangeAt(0), t = document.createRange(); t.selectNodeContents(c); t.setStart(r.endContainer, r.endOffset); const d = document.createElement("div"); d.append(t.extractContents()); return clean(d.innerHTML); };

  /* ---------- Menu a comparsa ---------- */
  function openMenu(rect, items, pick, grid) {
    menu = { items, pick, i: 0 };
    pop.className = grid ? "grid" : "";
    pop.innerHTML = items.length ? items.map(([, l, ic], j) => `<button type="button" data-j="${j}" class="${j ? "" : "on"}"><i>${grid ? "" : esc(ic || "")}</i>${grid ? esc(l) : esc(l)}</button>`).join("") : "<em>Nessun risultato</em>";
    pop.hidden = false; pop.style.top = Math.max(8, Math.min(rect.bottom + 4, innerHeight - 310)) + "px"; pop.style.left = Math.max(8, Math.min(rect.left, innerWidth - 270)) + "px";
  }
  const closeMenu = () => { menu = null; pop.hidden = true; };
  const pickItem = j => { const m = menu; if (m && m.items[j]) { closeMenu(); m.pick(m.items[j]); } };
  pop.addEventListener("mousedown", e => { e.preventDefault(); const b = e.target.closest("[data-j]"); if (b) pickItem(+b.dataset.j); });
  function menuKey(e) {
    if (e.key === "Escape") { e.preventDefault(); return closeMenu(); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return pickItem(menu.i); }
    e.preventDefault(); const n = menu.items.length; if (!n) return;
    menu.i = (menu.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    $$("#nt-pop button").forEach((b, j) => { b.classList.toggle("on", j === menu.i); if (j === menu.i) b.scrollIntoView({ block: "nearest" }); });
  }
  const typeItems = q => TYPES.filter(t => !q || t[1].toLowerCase().includes(q.toLowerCase()) || t[0] === q);

  function setType(p, b, t, keep) {
    if (!keep) b.h = ""; b.t = t; if (t !== "todo") delete b.c;
    if (t === "page") { const q = mkPage({ parent: p.id }); b.p = q.id; p.aperta = true; Portal.upsert("pagine", q); }
    const i = p.blocchi.indexOf(b); if (t === "hr" && i === p.blocchi.length - 1) p.blocchi.push(nb());
    touch(p); drawBlocks(p); drawTree();
    if (t === "hr") focusB(p.blocchi[i + 1].id); else if (t === "img" || t === "link") $(`.nb[data-id="${b.id}"] .nb-url`)?.focus(); else focusB(b.id);
  }
  function moveB(p, i, d) { const j = i + d; if (j < 0 || j >= p.blocchi.length) return; p.blocchi.splice(j, 0, p.blocchi.splice(i, 1)[0]); touch(p); drawBlocks(p); }
  function blockMenu(h) {
    const p = P(), b = blk(h), i = p.blocchi.indexOf(b), r = h.getBoundingClientRect();
    openMenu(r, [["turn", "Trasforma in…", "↻"], ["up", "Sposta su", "↑"], ["down", "Sposta giù", "↓"], ["dup", "Duplica", "⧉"], ["del", "Elimina", "🗑"]], ([k]) => {
      if (k === "turn") return setTimeout(() => openMenu(r, typeItems(""), ([t]) => setType(p, b, t, true)), 0);
      if (k === "up") return moveB(p, i, -1); if (k === "down") return moveB(p, i, 1);
      if (k === "dup") p.blocchi.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(b)), id: uid() });
      if (k === "del") { p.blocchi.splice(i, 1); if (!p.blocchi.length) p.blocchi.push(nb()); }
      touch(p); drawBlocks(p);
    });
  }

  /* ---------- Eventi dell'editor ---------- */
  main.addEventListener("input", e => {
    const el = e.target, p = P(); if (!p) return;
    if (el.id === "nt-title") { p.titolo = el.textContent.replace(/\n/g, " "); touch(p); drawTree(); return; }
    if (el.matches("[data-k]")) { const r = p.righe.find(x => x.id === el.closest("tr").dataset.r); r[el.dataset.k] = el.value; touch(p); if (el.tagName === "SELECT") drawDbView(p); return; }
    if (el.id === "nt-dbq") { dbq = el.value; return drawDbView(p); }
    const c = el.closest?.(".nb-c"); if (!c) return;
    const b = blk(c), f = c.dataset.f; b[f] = c.tagName === "PRE" ? esc(c.textContent) : clean(c.innerHTML);
    if (f === "h" && b.t !== "code") {
      const txt = c.textContent.replace(/\u00a0/g, " ");
      if (SC[txt]) { closeMenu(); return setType(p, b, SC[txt]); }
      const m = txt.match(/^\/(\S*)$/);
      if (m) openMenu(c.getBoundingClientRect(), typeItems(m[1]), ([t]) => { c.innerHTML = ""; setType(p, b, t); }); else if (menu) closeMenu();
    }
    touch(p);
  });
  main.addEventListener("change", e => {
    const p = P(), c = e.target; if (!p) return;
    if (c.matches("[data-c]")) { const b = blk(c); b.c = c.checked; c.closest(".nb").querySelector(".nb-c").classList.toggle("done", b.c); touch(p); }
    if (c.id === "nt-dbs") { dbs = c.value; drawDbView(p); }
  });
  main.addEventListener("paste", e => {
    const c = e.target.closest?.(".nb-c"); if (!c) return;
    e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (/\n/.test(t.trim()) && c.dataset.f === "h" && c.tagName !== "PRE") {
      const p = P(), b = blk(c), nbk = mdToBlocks(t); if (!nbk.length) return;
      const i = p.blocchi.indexOf(b); p.blocchi.splice(strip(b.h) ? i + 1 : i, strip(b.h) ? 0 : 1, ...nbk); touch(p); drawBlocks(p); focusB(nbk.at(-1).id); return;
    }
    document.execCommand("insertText", false, t);
  });
  main.addEventListener("keydown", e => {
    if (e.target.id === "nt-title" && e.key === "Enter") { e.preventDefault(); const p = P(); return focusB(p.blocchi[0]?.id); }
    if (e.target.matches?.("[data-u]") && e.key === "Enter") {
      e.preventDefault(); const p = P(), b = blk(e.target), v = e.target.value.trim(); if (!v) return;
      b.u = normUrl(v); try { b.h = new URL(b.u).hostname; } catch {} touch(p); drawBlocks(p); return;
    }
    const c = e.target.closest?.(".nb-c"); if (!c) return;
    if (menu && ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) return menuKey(e);
    const p = P(), b = blk(c), i = p.blocchi.indexOf(b), mod = e.ctrlKey || e.metaKey, main_ = c.dataset.f === "h";
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveB(p, i, e.key === "ArrowUp" ? -1 : 1); return focusB(b.id); }
    if (mod && e.key === "Enter") { e.preventDefault(); const n = nb(); p.blocchi.splice(i + 1, 0, n); touch(p); drawBlocks(p); return focusB(n.id); }
    if (e.key === "Enter" && !e.shiftKey && main_ && b.t !== "code") {
      e.preventDefault();
      if (!strip(b.h) && b.t !== "t") { b.t = "t"; touch(p); drawBlocks(p); return focusB(b.id); }
      const tail = splitAt(c); b.h = clean(c.innerHTML);
      const n = nb(["bul", "num", "todo"].includes(b.t) ? b.t : "t", tail); p.blocchi.splice(i + 1, 0, n); touch(p); drawBlocks(p); return focusB(n.id, false);
    }
    if (e.key === "Backspace" && main_ && edge(c, false)) {
      if (b.t !== "t") { e.preventDefault(); b.t = "t"; touch(p); drawBlocks(p); return focusB(b.id, false); }
      const prev = p.blocchi[i - 1];
      if (prev && ["t", "h1", "h2", "h3", "bul", "num", "todo", "quote", "call", "tog"].includes(prev.t)) {
        e.preventDefault(); const len = strip(prev.h).length; prev.h += b.h; p.blocchi.splice(i, 1); touch(p); drawBlocks(p); return caretTo($(`.nb[data-id="${prev.id}"] .nb-c`), len);
      }
      if (prev && !strip(b.h)) { e.preventDefault(); p.blocchi.splice(i, 1); touch(p); drawBlocks(p); }
      return;
    }
    if ((e.key === "ArrowUp" && edge(c, false)) || (e.key === "ArrowDown" && edge(c, true))) {
      for (let j = i + (e.key === "ArrowUp" ? -1 : 1); j >= 0 && j < p.blocchi.length; j += e.key === "ArrowUp" ? -1 : 1) if ($(`.nb[data-id="${p.blocchi[j].id}"] .nb-c`)) { e.preventDefault(); return focusB(p.blocchi[j].id, e.key === "ArrowUp"); }
    }
  });
  main.addEventListener("click", async e => {
    const t = e.target, p = P();
    const hd = t.closest(".nb-hd"); if (hd) return blockMenu(hd);
    if (t.closest("[data-o]")) { const b = blk(t); b.o = !b.o; touch(p); drawBlocks(p); return focusB(b.id); }
    if (t.id === "nt-end" && p) { const l = p.blocchi.at(-1); if (!l || strip(l.h) || l.t !== "t") { const n = nb(); p.blocchi.push(n); touch(p); drawBlocks(p); } return focusB(p.blocchi.at(-1).id); }
    const tp = t.closest("[data-tpl]"); if (tp) return newFromTpl(TPL[+tp.dataset.tpl]);
    const rs = t.closest("[data-rs]"); if (rs) { trash(pages.find(x => x.id === rs.dataset.rs), false); drawTree(); return drawTrash(); }
    const pd = t.closest("[data-pd]"); if (pd) { const id = pd.dataset.pd; for (let i = pages.length - 1; i >= 0; i--) if (pages[i].id === id || isDesc(pages[i].id, id)) pages.splice(i, 1); await Portal.save("pagine", pages); drawTree(); return drawTrash(); }
    if (t.closest("[data-rd]")) { p.righe = p.righe.filter(x => x.id !== t.closest("[data-rd]").dataset.rd); touch(p); return drawDbView(p); }
    const kc = t.closest(".nt-kc,.nt-ag [data-r]"); if (kc && p?.tipo === "db") return editRow(p, p.righe.find(x => x.id === kc.dataset.r));
    const v = t.closest("[data-v]"); if (v) { p.vista = v.dataset.v; touch(p); return drawDb(p); }
    if (t.closest("#nt-addrow")) { const r = { id: uid(), titolo: "", stato: "Da fare", prio: "Media", data: "", tag: "" }; p.righe.push(r); touch(p); drawDbView(p); return $(`tr[data-r="${r.id}"] input`)?.focus(); }
    const a = t.closest("[data-a]")?.dataset.a; if (!a) return;
    if (a === "fav") p.fav = !p.fav;
    else if (a === "focus" || a === "wide" || a === "big") { ui[a] = !ui[a]; saveUi(); return applyUi(); }
    else if (a === "md") return download((title(p).replace(/[^\w-]+/g, "-") || "pagina") + ".md", toMd(p));
    else if (a === "print") return print();
    else if (a === "dup") return dup(p);
    else if (a === "del") { trash(p, true); Portal.toast("Pagina spostata nel cestino"); location.hash = ""; return; }
    else if (a === "cov") p.cover = (p.cover + 1) % COVERS.length;
    else if (a === "nocov") p.cover = -1;
    else if (a === "ico") return openMenu(t.getBoundingClientRect(), EMO.map(x => [x, x]), ([x]) => { p.icona = x; touch(p); drawPage(p); drawTree(); }, true);
    touch(p); drawPage(p); drawTree();
  });

  /* ---------- Database ---------- */
  function drawDb(p) {
    $("#nt-body").innerHTML = `<div class="nt-dbt">${[["tabella", "▦ Tabella"], ["board", "▥ Board"], ["agenda", "▤ Agenda"]].map(([v, l]) => `<button class="chip-btn${p.vista === v ? " on" : ""}" data-v="${v}" type="button">${l}</button>`).join("")}<span class="sp"></span>
      <input type="search" id="nt-dbq" placeholder="Filtra…" value="${esc(dbq)}"><select id="nt-dbs" aria-label="Ordina"><option value="">Ordine manuale</option>${[["data", "Per data"], ["prio", "Per priorità"], ["stato", "Per stato"]].map(([v, l]) => `<option value="${v}"${dbs === v ? " selected" : ""}>${l}</option>`).join("")}</select><button class="btn sm" id="nt-addrow" type="button">+ Riga</button></div>
      <div class="nt-prog"><div id="nt-pg"></div></div><div id="nt-dbv"></div>`;
    drawDbView(p);
  }
  function drawDbView(p) {
    const q = dbq.toLowerCase(), k = { data: x => x.data || "9", prio: x => 2 - PR.indexOf(x.prio), stato: x => ST.indexOf(x.stato) }[dbs];
    let r = p.righe.filter(x => !q || (x.titolo + " " + x.tag).toLowerCase().includes(q));
    if (k) r = [...r].sort((a, b) => String(k(a)).localeCompare(String(k(b)), "it", { numeric: true }));
    const done = p.righe.filter(x => x.stato === "Fatto").length; $("#nt-pg").style.width = (p.righe.length ? Math.round(done / p.righe.length * 100) : 0) + "%";
    const pr = x => `<span class="nt-pr p${PR.indexOf(x.prio)}">${esc(x.prio)}</span>`, dt = x => x.data ? `<span class="muted">${esc(fmtDate(x.data, { day: "numeric", month: "short" }))}</span>` : "";
    const kc = x => `<div class="nt-kc" draggable="true" data-r="${esc(x.id)}"><b>${esc(x.titolo || "Senza titolo")}</b><div>${pr(x)}${dt(x)}</div>${x.tag ? `<small>${esc(x.tag)}</small>` : ""}<button class="icon-btn" data-rd="${esc(x.id)}" type="button" aria-label="Elimina">✕</button></div>`;
    const opt = (a, v) => a.map(o => `<option${o === v ? " selected" : ""}>${o}</option>`).join("");
    $("#nt-dbv").innerHTML = p.vista === "board" ? `<div class="nt-board">${ST.map(s => `<div class="nt-col" data-s="${s}"><h4>${s} <span>${r.filter(x => x.stato === s).length}</span></h4>${r.filter(x => x.stato === s).map(kc).join("")}</div>`).join("")}</div>`
      : p.vista === "agenda" ? `<div class="nt-ag">${[...new Set(r.map(x => x.data || ""))].sort((a, b) => (a || "9").localeCompare(b || "9")).map(d => `<h4>${d ? esc(fmtDate(d, { weekday: "long", day: "numeric", month: "long" })) : "Senza data"}</h4>${r.filter(x => (x.data || "") === d).map(kc).join("")}`).join("") || "<p class='muted'>Nessuna riga.</p>"}</div>`
      : `<table class="nt-tb"><thead><tr><th>Titolo<th>Stato<th>Priorità<th>Data<th>Tag<th></tr></thead><tbody>${r.map(x => `<tr data-r="${esc(x.id)}"><td><input data-k="titolo" value="${esc(x.titolo)}" placeholder="Senza titolo"><td><select data-k="stato">${opt(ST, x.stato)}</select><td><select data-k="prio">${opt(PR, x.prio)}</select><td><input type="date" data-k="data" value="${esc(x.data || "")}"><td><input data-k="tag" value="${esc(x.tag || "")}" placeholder="—"><td><button class="icon-btn" data-rd="${esc(x.id)}" type="button" aria-label="Elimina">✕</button></tr>`).join("")}</tbody></table>`;
  }
  async function editRow(p, r) {
    const res = await Portal.form({ title: "Modifica riga", submit: "Salva", onDelete: true, values: r, fields: [{ name: "titolo", label: "Titolo", required: true }, { name: "stato", label: "Stato", type: "select", half: true, options: ST.map(s => [s, s]) }, { name: "prio", label: "Priorità", type: "select", half: true, options: PR.map(s => [s, s]) }, { name: "data", label: "Data", type: "date", half: true }, { name: "tag", label: "Tag", half: true }] });
    if (!res) return;
    if (res.__delete) p.righe = p.righe.filter(x => x !== r); else Object.assign(r, { titolo: res.titolo, stato: res.stato, prio: res.prio, data: res.data || "", tag: res.tag || "" });
    touch(p); drawDbView(p);
  }

  /* ---------- Barra di formattazione ---------- */
  document.addEventListener("selectionchange", () => {
    const s = getSelection(), f = $("#nt-fmt"), an = s.anchorNode, el = an && (an.nodeType === 1 ? an : an.parentElement), c = !s.isCollapsed && el ? el.closest(".nb-c:not(.nb-code)") : null;
    if (!c || !main.contains(c)) return void (f.hidden = true);
    const r = s.getRangeAt(0).getBoundingClientRect(); f.hidden = false; f.style.top = Math.max(8, r.top - 46) + "px"; f.style.left = Math.max(8, r.left) + "px";
  });
  $("#nt-fmt").addEventListener("mousedown", e => {
    const b = e.target.closest("[data-x]"); if (!b) return; e.preventDefault();
    const x = b.dataset.x, sel = getSelection().toString(), ed = document.activeElement;
    if (x === "code" || x === "mark") document.execCommand("insertHTML", false, `<${x}>${esc(sel)}</${x}>`);
    else if (x === "link") { const u = prompt("Indirizzo del link (https://…)"); if (u) document.execCommand("createLink", false, normUrl(u)); }
    else document.execCommand(x);
    ed?.dispatchEvent?.(new Event("input", { bubbles: true }));
  });

  /* ---------- Trascinamento ---------- */
  const clr = () => $$(".over").forEach(x => x.classList.remove("over", "after"));
  document.addEventListener("dragstart", e => {
    const h = e.target.closest?.(".nb-hd,.nt-row[draggable],.nt-kc"); if (!h) return;
    drag = h.matches(".nb-hd") ? { t: "b", id: h.closest(".nb").dataset.id } : h.matches(".nt-kc") ? { t: "r", id: h.dataset.r } : { t: "p", id: h.dataset.id };
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag.id);
  });
  document.addEventListener("dragend", () => { drag = null; clr(); });
  document.addEventListener("dragover", e => {
    if (!drag) return; const t = e.target.closest?.({ b: ".nb", p: ".nt-row[data-id]", r: ".nt-col" }[drag.t]); if (!t) return;
    e.preventDefault(); clr(); t.classList.add("over"); if (drag.t === "b") t.classList.toggle("after", e.clientY > t.getBoundingClientRect().top + t.offsetHeight / 2);
  });
  document.addEventListener("drop", e => {
    if (!drag) return; const d = drag; drag = null; const p = P();
    const t = e.target.closest?.({ b: ".nb", p: ".nt-row[data-id]", r: ".nt-col" }[d.t]); clr(); if (!t) return; e.preventDefault();
    if (d.t === "b") { const after = e.clientY > t.getBoundingClientRect().top + t.offsetHeight / 2, b = p.blocchi.find(x => x.id === d.id); if (!b || t.dataset.id === d.id) return; p.blocchi.splice(p.blocchi.indexOf(b), 1); p.blocchi.splice(p.blocchi.findIndex(x => x.id === t.dataset.id) + (after ? 1 : 0), 0, b); touch(p); drawBlocks(p); }
    if (d.t === "r") { const r = p.righe.find(x => x.id === d.id); r.stato = t.dataset.s; touch(p); drawDbView(p); }
    if (d.t === "p") { const id = t.dataset.id; if (id === d.id || isDesc(id, d.id)) return Portal.toast("Non puoi spostare una pagina dentro sé stessa"); const mv = pages.find(x => x.id === d.id), tg = pages.find(x => x.id === id); mv.parent = id; tg.aperta = true; Portal.upsert("pagine", mv); Portal.upsert("pagine", tg); drawTree(); }
  });

  /* ---------- Palette Ctrl+K ---------- */
  function palette() {
    if ($("#nt-pal")) return;
    const el = document.createElement("div"); el.id = "nt-pal"; el.innerHTML = `<div><input placeholder="Cerca una pagina o digita un comando…" aria-label="Cerca"><ul></ul></div>`; document.body.append(el);
    const inp = el.querySelector("input"), ul = el.querySelector("ul"); let items = [], i = 0;
    const cmds = [["➕", "Nuova pagina", () => newFromTpl(TPL[0])], ["🗺️", "Nuovo database", () => newFromTpl(TPL[5])], ["🏠", "Vai alla Home", () => location.hash = ""], ["⛶", "Modalità focus", () => { ui.focus = !ui.focus; saveUi(); applyUi(); }], ["🗑", "Apri il cestino", () => location.hash = "cestino"]];
    const draw = () => {
      const q = inp.value.toLowerCase().trim();
      items = [...cmds.filter(c => !q || c[1].toLowerCase().includes(q)).map(c => ({ ic: c[0], t: c[1], s: "comando", go: c[2] })), ...live().filter(p => !q || (title(p) + " " + strip(p.blocchi.map(b => b.h).join(" "))).toLowerCase().includes(q)).slice(0, 12).map(p => ({ ic: p.icona, t: title(p), s: snip(p).slice(0, 30), go: () => location.hash = p.id }))];
      i = Math.min(i, Math.max(0, items.length - 1));
      ul.innerHTML = items.map((x, j) => `<li class="${j === i ? "on" : ""}" data-j="${j}">${esc(x.ic)} ${esc(x.t)}<small>${esc(x.s)}</small></li>`).join("") || "<li>Nessun risultato</li>";
    };
    const close = () => el.remove(), run = j => { const x = items[j]; close(); x?.go(); };
    inp.addEventListener("input", () => { i = 0; draw(); });
    inp.addEventListener("keydown", e => { if (e.key === "Escape") close(); else if (e.key === "Enter") run(i); else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); i = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; draw(); } });
    el.addEventListener("mousedown", e => { const li = e.target.closest("[data-j]"); if (li) run(+li.dataset.j); else if (e.target === el) close(); });
    draw(); inp.focus();
  }
  addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); ui.focus = !ui.focus; saveUi(); applyUi(); }
  });

  /* ---------- Barra laterale: eventi ---------- */
  $("#nt-q").addEventListener("input", e => { st.q = e.target.value; drawTree(); });
  $("#nt-tree").addEventListener("click", async e => {
    const tg = e.target.closest("[data-tg]"), sub = e.target.closest("[data-sub]");
    if (tg) { const p = pages.find(x => x.id === tg.dataset.tg); p.aperta = !p.aperta; await Portal.upsert("pagine", p); return drawTree(); }
    if (sub) return void newFromTpl(TPL[0], sub.dataset.sub);
    if (e.target.closest("[data-new]")) return void newFromTpl(TPL[0]);
    if (e.target.closest("[data-tpls]")) { const res = await Portal.form({ title: "Nuova pagina da modello", submit: "Crea", fields: [{ name: "t", label: "Modello", type: "select", options: TPL.map((t, i) => [String(i), t.ic + " " + t.n]) }], values: { t: "1" } }); if (res) newFromTpl(TPL[+res.t]); }
    if (e.target.closest("#nt-imp")) {
      const res = await Portal.form({ title: "Importa Markdown", submit: "Importa", fields: [{ name: "titolo", label: "Titolo", required: true }, { name: "md", label: "Testo Markdown", type: "textarea", rows: 10, required: true, hint: "Titoli #, elenchi, [ ] attività, > citazioni, ``` codice" }] });
      if (res) { const p = mkPage({ titolo: res.titolo, blocchi: mdToBlocks(res.md) }); if (!p.blocchi.length) p.blocchi = [nb()]; await Portal.upsert("pagine", p); location.hash = p.id; }
    }
  });

  /* ---------- Avvio e routing ---------- */
  function applyUi() { const r = $("#nt"); r.classList.toggle("focus", !!ui.focus); r.classList.toggle("wide", !!ui.wide); r.classList.toggle("big", !!ui.big); }
  function render() {
    closeMenu(); applyUi(); drawTree();
    const p = P();
    if (st.id === "cestino") drawTrash(); else if (p && !p.cestino) drawPage(p); else { if (st.id) { st.id = ""; } drawHome(); }
  }
  addEventListener("hashchange", async () => { await flush(); st.id = decodeURIComponent(location.hash.slice(1)); render(); scrollTo(0, 0); });
  pages.forEach(p => { p.blocchi ||= [nb()]; p.righe ||= []; p.vista ||= "tabella"; p.tipo ||= "doc"; p.cover ??= -1; p.aperta ??= true; p.icona ||= "📄"; p.creato ||= now(); p.agg ||= p.creato; });
  st.id = decodeURIComponent(location.hash.slice(1)); render();
})();
