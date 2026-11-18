(async () => {
  const notes = await Portal.load("note", []);
  let cur = null, view = "testo", sel = null, linkFrom = null, linking = false;
  const find = t => notes.find(n => n.title.toLowerCase() === String(t).trim().toLowerCase());

  /* Markdown minimo, senza librerie esterne */
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, t, l) => `<a href="#" class="wl${find(t) ? "" : " no"}" data-t="${t}">${l || t}</a>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const md = src => {
    const out = []; let list = null, code = null, para = [];
    const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const pre = c => "<pre><code>" + esc(c.join("\n")) + "</code></pre>";
    for (const l of src.split("\n")) {
      if (code) { if (/^```/.test(l)) { out.push(pre(code)); code = null; } else code.push(l); continue; }
      let m;
      if (/^```/.test(l)) { flush(); close(); code = []; }
      else if ((m = l.match(/^(#{1,3})\s+(.*)/))) { flush(); close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
      else if ((m = l.match(/^\s*([-*]|\d+\.)\s+(.*)/))) { flush(); const t = /\d/.test(m[1]) ? "ol" : "ul"; if (list !== t) { close(); out.push(`<${t}>`); list = t; } out.push("<li>" + inline(m[2]) + "</li>"); }
      else if ((m = l.match(/^>\s?(.*)/))) { flush(); close(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); }
      else if (/^---+$/.test(l)) { flush(); close(); out.push("<hr>"); }
      else if (!l.trim()) { flush(); close(); }
      else para.push(l);
    }
    flush(); close(); if (code) out.push(pre(code));
    return out.join("");
  };

  const store = () => { cur.t = Date.now(); clearTimeout(store.h); store.h = setTimeout(() => Portal.upsert("note", cur), 400); };

  const drawList = () => {
    const q = $("#q").value.toLowerCase().trim();
    const items = notes.filter(n => !q || (n.title + " " + n.body).toLowerCase().includes(q)).sort((a, b) => b.t - a.t);
    $("#nlist").innerHTML = items.map(n => `<li><button type="button" data-id="${n.id}" class="${cur && n.id === cur.id ? "on" : ""}">${esc(n.title)}</button></li>`).join("");
    $("#nnone").hidden = notes.length > 0;
    $("#nmain").hidden = !cur;
  };

  const setView = v => { view = v; $("#vtesto").hidden = v !== "testo"; $("#vmappa").hidden = v !== "mappa"; $$("[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === v)); if (v === "mappa") drawMap(); };
  const open = n => { cur = n; sel = linkFrom = null; linking = false; $("#ntitle").value = n.title; $("#ned").value = n.body; drawPrev(); drawList(); setView(view); };
  const drawPrev = () => { $("#nprev").innerHTML = md(cur.body); };

  const create = async (title = "Senza titolo") => {
    let t = title, i = 2; while (find(t)) t = `${title} ${i++}`;
    const n = { id: Portal.uid(), title: t, body: "", mappa: { nodes: [], edges: [] }, t: Date.now() };
    notes.push(n); await Portal.upsert("note", n); return n;
  };

  /* Mappa: nodi trascinabili e collegamenti, in SVG */
  const svg = $("#msvg");
  const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: Math.round(q.x), y: Math.round(q.y) }; };
  function drawMap() {
    if (!cur) return;
    const m = cur.mappa ||= { nodes: [], edges: [] };
    const nd = id => m.nodes.find(n => n.id === id);
    svg.innerHTML = m.edges.map(([a, b], i) => nd(a) && nd(b) ? `<line class="${sel === "e" + i ? "sel" : ""}" data-e="${i}" x1="${nd(a).x}" y1="${nd(a).y}" x2="${nd(b).x}" y2="${nd(b).y}"/>` : "").join("") +
      m.nodes.map(n => { const w = Math.max(90, n.t.length * 9 + 28); return `<g class="n${sel === n.id ? " sel" : ""}${linkFrom === n.id ? " from" : ""}" data-id="${n.id}" transform="translate(${n.x},${n.y})"><rect x="${-w / 2}" y="-21" width="${w}" height="42" rx="4"/><text text-anchor="middle" dy=".35em">${esc(n.t)}</text></g>`; }).join("");
  }
  const addNode = (x, y) => { const n = { id: Portal.uid(), x, y, t: "Nuovo nodo" }; cur.mappa.nodes.push(n); sel = n.id; store(); drawMap(); return n; };
  const delSel = () => {
    const m = cur.mappa; if (!sel) return;
    if (sel[0] === "e" && sel.length < 6) m.edges.splice(+sel.slice(1), 1);
    else { m.nodes = m.nodes.filter(n => n.id !== sel); m.edges = m.edges.filter(e => !e.includes(sel)); }
    sel = null; store(); drawMap();
  };
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    const g = e.target.closest(".n"), ln = e.target.closest("line");
    if (ln) { sel = "e" + ln.dataset.e; drawMap(); return; }
    if (!g) { sel = linkFrom = null; drawMap(); return; }
    const id = g.dataset.id;
    if (linking) {
      if (!linkFrom) linkFrom = id;
      else { if (linkFrom !== id && !cur.mappa.edges.some(([a, b]) => (a === linkFrom && b === id) || (a === id && b === linkFrom))) { cur.mappa.edges.push([linkFrom, id]); store(); } linkFrom = null; linking = false; $("#mlink").classList.remove("on"); }
      drawMap(); return;
    }
    sel = id; const n = cur.mappa.nodes.find(x => x.id === id), p = pt(e);
    drag = { n, dx: n.x - p.x, dy: n.y - p.y }; svg.setPointerCapture(e.pointerId); drawMap();
  });
  svg.addEventListener("pointermove", e => { if (!drag) return; const p = pt(e); drag.n.x = p.x + drag.dx; drag.n.y = p.y + drag.dy; drawMap(); });
  svg.addEventListener("pointerup", () => { if (drag) { drag = null; store(); } });
  svg.addEventListener("dblclick", e => {
    const g = e.target.closest(".n");
    if (!g) { const p = pt(e); addNode(p.x, p.y); return; }
    const n = cur.mappa.nodes.find(x => x.id === g.dataset.id), t = prompt("Testo del nodo", n.t);
    if (t != null && t.trim()) { n.t = t.trim(); store(); drawMap(); }
  });
  svg.addEventListener("keydown", e => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSel(); } });
  $("#mnode").onclick = () => addNode(150 + Math.random() * 700, 100 + Math.random() * 400);
  $("#mdel").onclick = delSel;
  $("#mlink").onclick = e => { linking = !linking; linkFrom = null; e.currentTarget.classList.toggle("on", linking); if (linking) Portal.toast("Clicca prima un nodo, poi l’altro"); drawMap(); };

  /* Testo, elenco, azioni */
  $("#ned").addEventListener("input", e => { cur.body = e.target.value; store(); drawPrev(); });
  $("#ntitle").addEventListener("change", e => {
    const v = e.target.value.trim() || "Senza titolo", old = cur.title, clash = find(v);
    if (clash && clash !== cur) { e.target.value = old; Portal.toast("Esiste già una nota con questo titolo"); return; }
    const re = new RegExp("\\[\\[" + old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\|[^\\]]*)?\\]\\]", "gi");
    notes.forEach(n => { const b = n.body.replace(re, (m, a) => `[[${v}${a || ""}]]`); if (b !== n.body) { n.body = b; Portal.upsert("note", n); } });
    cur.title = v; e.target.value = v; $("#ned").value = cur.body; store(); drawList(); drawPrev();
  });
  $("#q").addEventListener("input", drawList);
  $("#nlist").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) open(notes.find(n => n.id === b.dataset.id)); });
  $("#nnew").onclick = async () => { open(await create()); $("#ntitle").select(); };
  $("#nprev").addEventListener("click", async e => { const a = e.target.closest("a.wl"); if (!a) return; e.preventDefault(); open(find(a.dataset.t) || await create(a.dataset.t)); });
  $$("[data-v]").forEach(b => b.onclick = () => setView(b.dataset.v));
  $("#ndl").onclick = () => Portal.download(Portal.slug(cur.title) + ".md", new Blob([cur.body], { type: "text/markdown" }));
  $("#ndel").onclick = async () => {
    if (!confirm(`Eliminare «${cur.title}»?`)) return;
    await Portal.remove("note", cur.id); cur = null; drawList(); if (notes[0]) open(notes[0]);
  };

  if (!notes.length) { const n = await create("Benvenuto"); n.body = "# Benvenuto\nScrivi qui in **Markdown**. Collega un’altra nota con [[Idee]], poi apri la scheda *Mappa* per disegnare uno schema."; n.mappa = { nodes: [{ id: "a", x: 500, y: 300, t: "Idea centrale" }, { id: "b", x: 260, y: 150, t: "Punto uno" }, { id: "c", x: 740, y: 150, t: "Punto due" }], edges: [["a", "b"], ["a", "c"]] }; await Portal.upsert("note", n); }
  drawList(); open([...notes].sort((a, b) => b.t - a.t)[0]);
})();
