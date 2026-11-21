/* Plugin Orario scolastico: pagina /orario/
   Dati: collezione "orario" (una voce per lezione settimanale). Plugin indipendente, non usa dati di altri plugin. */
(async () => {
  if (document.body.dataset.page !== "/orario/") return;
  ["orario"].forEach(n => { if (!Portal.COLLECTIONS.includes(n)) Portal.COLLECTIONS.push(n); });
  const lez = await Portal.load("orario", []);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const GG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"], PX = 64;
  const PAL = ["var(--navy)", "var(--red)", "color-mix(in srgb,var(--navy) 60%,#fff)", "color-mix(in srgb,var(--red) 65%,#fff)", "#1f7a4d", "#b7791f", "#6b4fa3", "#2b7a9b"];
  const PALN = ["Blu", "Rosso", "Azzurro", "Corallo", "Verde", "Ocra", "Viola", "Petrolio"];
  const ui = (() => { try { return JSON.parse(localStorage.getItem("or-ui") || "{}"); } catch { return {}; } })();
  const saveUi = () => { try { localStorage.setItem("or-ui", JSON.stringify(ui)); } catch {} };
  const todayIdx = () => (new Date().getDay() + 6) % 7;
  const st = { v: ui.v || "sett", cl: "", day: Math.min(todayIdx(), 5) };

  /* ---------- Utilità ---------- */
  const mins = t => { const m = /^(\d{1,2})[:.](\d{2})$/.exec((t || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
  const hm = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const dateOf = g => { const d = new Date(); d.setDate(d.getDate() - todayIdx() + g); return isoDate(d); };
  const dur = m => m < 60 ? m + " min" : (Math.floor(m / 60) + " h" + (m % 60 ? " " + m % 60 + " min" : ""));
  const col = l => PAL[l.col !== "" && l.col != null ? +l.col : [...l.materia].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
  const cname = c => c || "";
  const classList = () => [...new Set(lez.map(l => l.classe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  const vis = () => lez.filter(l => !st.cl || l.classe === st.cl);
  const skipped = (l, g) => !!(l.skip || {})[dateOf(g)];
  const sub = l => [l.aula && "Aula " + l.aula, cname(l.classe)].filter(Boolean).join(" · ");
  const save = () => Portal.save("orario", lez);

  /* ---------- Settimana ---------- */
  function lanes(arr) {
    arr.sort((a, b) => a.s - b.s); const ends = [];
    arr.forEach(x => { let k = ends.findIndex(e => e <= x.s); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = x.e; x.k = k; });
    arr.forEach(x => { const o = arr.filter(y => y.s < x.e && y.e > x.s); x.n = Math.max(...o.map(y => y.k)) + 1; x.cf = o.length > 1; });
  }
  function drawWeek() {
    const nd = lez.some(l => l.g === 5) ? 6 : 5, L = vis().map(l => ({ l, s: mins(l.i), e: mins(l.f) }));
    const h0 = Math.min(8, ...L.map(x => Math.floor(x.s / 60))), h1 = Math.max(14, ...L.map(x => Math.ceil(x.e / 60)));
    const nm = nowMin(), ti = todayIdx(), mon = new Date();
    const cols = Array.from({ length: nd }, (_, g) => {
      const day = L.filter(x => x.l.g === g); lanes(day);
      return `<div class="or-col${g === ti ? " td" : ""}" data-g="${g}">${day.map(x => {
        const sk = skipped(x.l, g), cur = g === ti && !sk && x.s <= nm && nm < x.e;
        return `<div class="or-l${cur ? " cur" : ""}${sk ? " sk" : ""}${x.cf ? " cf" : ""}" data-id="${esc(x.l.id)}" style="top:${(x.s / 60 - h0) * PX}px;height:${(x.e - x.s) / 60 * PX}px;left:${x.k / x.n * 100}%;width:${100 / x.n}%;background:${col(x.l)}" title="${x.cf ? "Sovrapposta a un'altra lezione" : ""}"><b>${esc(x.l.materia)}</b><span>${x.l.i}–${x.l.f}</span><span>${esc(sub(x.l))}</span></div>`;
      }).join("")}${g === ti && nm >= h0 * 60 && nm <= h1 * 60 ? `<div class="or-now" style="top:${(nm / 60 - h0) * PX}px"></div>` : ""}</div>`;
    }).join("");
    $("#or-main").innerHTML = `<div class="or-week" style="--nd:${nd}"><div class="or-head"><span></span>${Array.from({ length: nd }, (_, g) => { const d = new Date(); d.setDate(d.getDate() - ti + g); return `<span class="${g === ti ? "td" : ""}">${GG[g].slice(0, 3)}<small>${d.getDate()}</small></span>`; }).join("")}</div>
      <div class="or-body" style="height:${(h1 - h0) * PX}px"><div class="or-gut">${Array.from({ length: h1 - h0 }, (_, i) => `<i style="top:${i * PX + 3}px">${hm((h0 + i) * 60)}</i>`).join("")}</div>${cols}</div></div>
      ${lez.length ? `<p class="muted" style="font-size:13px">Clic su una lezione per modificarla, su uno spazio vuoto per aggiungerne una. Il bordo tratteggiato rosso segnala sovrapposizioni.</p>` : `<div class="empty"><h3>Nessuna lezione</h3>Aggiungi la prima con «Nuova lezione», oppure clicca direttamente sulla griglia.</div>`}`;
  }

  /* ---------- Oggi ---------- */
  function drawToday() {
    const g = st.day, isT = g === todayIdx(), nm = nowMin();
    const L = vis().filter(l => l.g === g).sort((a, b) => mins(a.i) - mins(b.i));
    const act = L.filter(l => !skipped(l, g)), cur = isT && act.find(l => mins(l.i) <= nm && nm < mins(l.f)), nxt = isT && act.find(l => mins(l.i) > nm);
    let hero;
    if (cur) { const e = mins(cur.f), s = mins(cur.i); hero = `<small>In corso</small><h2>${esc(cur.materia)}</h2>${esc(sub(cur))} · finisce alle ${cur.f} (tra ${dur(e - nm)})<div class="or-pg"><div style="width:${Math.round((nm - s) / (e - s) * 100)}%"></div></div>${nxt ? `<div style="margin-top:10px;opacity:.85">Poi: <b>${esc(nxt.materia)}</b> alle ${nxt.i}</div>` : ""}`; }
    else if (nxt) hero = `<small>Prossima lezione</small><h2>${esc(nxt.materia)}</h2>Alle ${nxt.i} (tra ${dur(mins(nxt.i) - nm)}) · ${esc(sub(nxt))}`;
    else if (act.length) hero = `<small>Oggi</small><h2>Lezioni finite 🎉</h2>${act.length} lezioni, ultima alle ${act.at(-1).f}`;
    else hero = `<small>${GG[g]}</small><h2>Nessuna lezione</h2>Giornata libera.`;
    if (!isT && act.length) hero = `<small>${GG[g]}</small><h2>${act.length} lezioni</h2>Dalle ${act[0].i} alle ${act.at(-1).f} · ${dur(act.reduce((a, l) => a + mins(l.f) - mins(l.i), 0))} totali`;
    $("#or-main").innerHTML = `<div class="chips-row" style="margin-top:10px">${GG.slice(0, 6).map((n, i) => `<button class="chip-btn${g === i ? " on" : ""}" data-day="${i}" type="button">${n.slice(0, 3)}${i === todayIdx() ? " •" : ""}</button>`).join("")}</div>
      <div class="or-hero">${hero}</div>${L.map(l => {
        const sk = skipped(l, g), s = mins(l.i), e = mins(l.f), state = !isT ? "" : e <= nm ? "Finita" : s <= nm ? "In corso" : "Dopo";
        return `<div class="or-row${sk ? " sk" : ""}" data-id="${esc(l.id)}" style="border-left-color:${col(l)}"><span class="tm">${l.i} – ${l.f}</span><div class="m"><b>${esc(l.materia)}</b><span>${esc(sub(l)) || "&nbsp;"}${l.note ? " · " + esc(l.note) : ""}</span></div>${sk ? `<span class="or-badge">Saltata</span>` : state ? `<span class="or-badge${state === "In corso" ? " now" : ""}">${state}</span>` : ""}<button class="btn ghost sm" data-skip="${esc(l.id)}" type="button">${sk ? "Ripristina" : "Salta"}</button></div>`;
      }).join("") || ""}`;
  }

  /* ---------- Statistiche ---------- */
  function drawStats() {
    const L = vis().map(l => ({ l, m: mins(l.f) - mins(l.i) })), tot = L.reduce((a, x) => a + x.m, 0);
    const bySub = {}, byDay = Array(6).fill(0), gaps = Array(6).fill(0);
    L.forEach(x => { bySub[x.l.materia] = (bySub[x.l.materia] || 0) + x.m; byDay[x.l.g] = (byDay[x.l.g] || 0) + x.m; });
    for (let g = 0; g < 6; g++) { const d = L.filter(x => x.l.g === g).map(x => [mins(x.l.i), mins(x.l.f)]).sort((a, b) => a[0] - b[0]); let end = null; d.forEach(([s, e]) => { if (end != null && s > end) gaps[g] += s - end; end = Math.max(end ?? 0, e); }); }
    const days = byDay.map((m, g) => ({ g, m })).filter(x => x.m), busiest = [...days].sort((a, b) => b.m - a.m)[0], early = L.length ? Math.min(...L.map(x => mins(x.l.i))) : null;
    const bar = (name, m, max, c) => `<div class="or-bar"><span>${esc(name)}</span><div style="width:${Math.max(2, m / max * 55)}%;background:${c}"></div><em>${dur(m)}</em></div>`;
    const subs = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
    $("#or-main").innerHTML = L.length ? `<div class="or-stats"><div class="or-stat"><b>${L.length}</b>lezioni a settimana</div><div class="or-stat"><b>${(tot / 60).toFixed(1).replace(".", ",")}</b>ore totali</div><div class="or-stat"><b>${subs.length}</b>materie</div><div class="or-stat"><b>${busiest ? GG[busiest.g].slice(0, 3) : "—"}</b>giorno più lungo</div><div class="or-stat"><b>${early != null ? hm(early) : "—"}</b>inizio più presto</div><div class="or-stat"><b>${dur(gaps.reduce((a, b) => a + b, 0))}</b>di ore buche</div></div>
      <h3 class="or-sec">Ore per materia</h3>${subs.map(([n, m]) => bar(n, m, subs[0][1], col(L.find(x => x.l.materia === n).l))).join("")}
      <h3 class="or-sec">Ore per giorno</h3>${days.map(x => bar(GG[x.g], x.m, busiest.m, "var(--navy)")).join("")}
      ${gaps.some(Boolean) ? `<h3 class="or-sec">Ore buche</h3>${gaps.map((m, g) => m ? bar(GG[g], m, Math.max(...gaps), "var(--red)") : "").join("")}` : ""}` : `<div class="empty"><h3>Nessun dato</h3>Aggiungi qualche lezione per vedere le statistiche.</div>`;
  }

  /* ---------- Modifica ---------- */
  async function edit(l, isNew) {
    const subjects = [...new Set(lez.map(x => x.materia))].sort();
    let values = { materia: l.materia, g: String(l.g), i: l.i, f: l.f, aula: l.aula, classe: l.classe, col: l.col === "" || l.col == null ? "" : String(l.col), note: l.note };
    GG.slice(0, 6).forEach((_, g) => values["d" + g] = false);
    const fields = [
      { name: "materia", label: "Materia", required: true, list: subjects },
      { name: "g", label: "Giorno", type: "select", half: true, options: GG.slice(0, 6).map((n, i) => [String(i), n]) },
      { name: "classe", label: "Classe", half: true, list: classList(), placeholder: "es. 2A (facoltativo)" },
      { name: "i", label: "Inizio", half: true, placeholder: "08:00" }, { name: "f", label: "Fine", half: true, placeholder: "08:55" },
      { name: "aula", label: "Aula", half: true }, { name: "col", label: "Colore", type: "select", half: true, options: [["", "Automatico"], ...PALN.map((n, i) => [String(i), n])] },
      ...GG.slice(0, 6).map((n, g) => ({ name: "d" + g, label: n, type: "checkbox", checkLabel: "Copia anche su " + n })),
      { name: "note", label: "Note", type: "textarea", rows: 2 }
    ];
    for (;;) {
      const res = await Portal.form({ title: isNew ? "Nuova lezione" : "Modifica lezione", fields, values, submit: isNew ? "Aggiungi" : "Salva", onDelete: !isNew });
      if (!res) return;
      if (res.__delete) { lez.splice(lez.indexOf(l), 1); await save(); Portal.toast("Lezione eliminata"); return render(); }
      const a = mins(res.i), b = mins(res.f);
      if (a == null || b == null || b <= a) { Portal.toast("Orario non valido: usa HH:MM e la fine deve seguire l'inizio"); values = { ...res }; continue; }
      const base = { materia: res.materia, i: hm(a), f: hm(b), aula: res.aula || "", classe: res.classe || "", col: res.col, note: res.note || "" };
      Object.assign(l, base, { g: +res.g }); if (isNew) lez.push(l);
      GG.slice(0, 6).forEach((_, g) => { if (res["d" + g] && g !== +res.g) lez.push({ id: Portal.uid(), ...base, g, skip: {} }); });
      await save(); return render();
    }
  }
  const blank = (g, i, f) => ({ id: Portal.uid(), materia: "", g, i, f, aula: "", classe: st.cl, col: "", note: "", skip: {} });

  /* ---------- Esporta ---------- */
  function exportIcs() {
    const p = n => String(n).padStart(2, "0"), t = x => x.replace(":", "") + "00", ti = todayIdx(), tx = s => s.replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, "");
    const ev = vis().map(l => { const d = new Date(); d.setDate(d.getDate() + ((l.g - ti + 7) % 7)); const ds = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      return ["BEGIN:VEVENT", `UID:${l.id}@orario`, `DTSTAMP:${stamp}`, `DTSTART:${ds}T${t(l.i)}`, `DTEND:${ds}T${t(l.f)}`, `RRULE:FREQ=WEEKLY;BYDAY=${["MO", "TU", "WE", "TH", "FR", "SA", "SU"][l.g]}`, `SUMMARY:${tx(l.materia)}`, l.aula ? `LOCATION:${tx("Aula " + l.aula)}` : "", `DESCRIPTION:${tx([cname(l.classe), l.note].filter(Boolean).join(" · "))}`, "END:VEVENT"].filter(Boolean).join("\r\n"); });
    if (!ev.length) return Portal.toast("Nessuna lezione da esportare");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Orario//IT\r\n" + ev.join("\r\n") + "\r\nEND:VCALENDAR"], { type: "text/calendar" })); a.download = "orario.ics"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- Disegno ed eventi ---------- */
  function render() {
    $("#or-views").innerHTML = [["sett", "Settimana"], ["oggi", "Oggi"], ["stat", "Statistiche"]].map(([v, l]) => `<button class="chip-btn${st.v === v ? " on" : ""}" data-v="${v}" type="button">${l}</button>`).join("");
    const cls = classList(), box = $("#or-classes"); if (st.cl && !cls.includes(st.cl)) st.cl = "";
    box.hidden = !cls.length;
    box.innerHTML = cls.length ? [["", "Tutte le classi"], ...cls.map(c => [c, c])].map(([v, l]) => `<button class="chip-btn${st.cl === v ? " on" : ""}" data-c="${esc(v)}" type="button">${esc(l)}</button>`).join("") : "";
    ({ sett: drawWeek, oggi: drawToday, stat: drawStats })[st.v]();
  }
  $("#or-views").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { st.v = ui.v = b.dataset.v; saveUi(); render(); } });
  $("#or-classes").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (b) { st.cl = b.dataset.c; render(); } });
  $("#or-new").onclick = () => edit(blank(st.v === "oggi" ? st.day : Math.min(todayIdx(), 5), "08:00", "08:55"), true);
  $("#or-ics").onclick = exportIcs; $("#or-print").onclick = () => print();
  $("#or-main").addEventListener("click", async e => {
    const d = e.target.closest("[data-day]"); if (d) { st.day = +d.dataset.day; return render(); }
    const sk = e.target.closest("[data-skip]");
    if (sk) { const l = lez.find(x => x.id === sk.dataset.skip), k = dateOf(st.day); l.skip ||= {}; if (l.skip[k]) delete l.skip[k]; else l.skip[k] = 1; await save(); return render(); }
    const el = e.target.closest("[data-id]"); if (el) return edit(lez.find(x => x.id === el.dataset.id), false);
    const colEl = e.target.closest(".or-col");
    if (colEl) {
      const nd = [...$$(".or-col")], h0 = Math.min(8, ...vis().map(l => Math.floor(mins(l.i) / 60))), y = e.clientY - colEl.getBoundingClientRect().top;
      const s = Math.max(0, Math.round(y / PX * 4) * 15 + h0 * 60); edit(blank(+colEl.dataset.g, hm(s), hm(Math.min(s + 55, 1439))), true);
    }
  });
  lez.forEach(l => { l.skip ||= {}; l.note ||= ""; l.aula ||= ""; l.classe ||= ""; l.col ??= ""; });
  render();
  setInterval(() => { if (!document.querySelector(".modal,.overlay,dialog[open]")) render(); }, 30000);
})();
