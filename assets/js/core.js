/* Portale · Gabriel Jones — funzioni comuni */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = "") => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const fmtDate = (iso, opt = { day: "numeric", month: "long", year: "numeric" }) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("it-IT", opt) : "";
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const favicon = u => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(u))}&sz=64`;
const normUrl = u => { u = (u || "").trim(); return u && !/^[a-z]+:\/\//i.test(u) ? "https://" + u : u; };
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "#";

const Portal = (() => {
  const LS = "gj-portale:";
  const COLLECTIONS = ["documenti", "siti", "utili", "link", "libri", "giochi", "lezioni", "registro"];
  const SEED_UTILI = [
    { id: "seed-zoho", nome: "Zoho Mail", url: "https://mail.zoho.eu", categoria: "Posta" },
    { id: "seed-outlook", nome: "Outlook", url: "https://outlook.office.com", categoria: "Posta" },
    { id: "seed-claude", nome: "Claude", url: "https://claude.ai", categoria: "Strumenti" }
  ];
  const mem = {};
  let remote = null; // null = non ancora verificato, true = Netlify, false = solo browser

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function status(text, ok) {
    const el = $("#sync");
    if (el) { el.textContent = text; el.dataset.ok = ok ? "1" : "0"; }
  }

  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  async function load(name, seed = []) {
    if (name in mem) return mem[name];
    let data = null;
    if (remote !== false) {
      try {
        const r = await fetch(`/api/data/${name}`, { headers: { accept: "application/json" }, cache: "no-store" });
        if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error("no api");
        data = await r.json();
        remote = true;
        status("Sincronizzato", true);
      } catch { remote = false; status("Solo su questo browser", false); }
    }
    if (remote === false) { try { data = JSON.parse(localStorage.getItem(LS + name)); } catch { /* vuoto */ } }
    if (data == null) { data = structuredClone(seed); mem[name] = data; await save(name, data); }
    return (mem[name] = data);
  }

  async function save(name, data) {
    mem[name] = data;
    try { localStorage.setItem(LS + name, JSON.stringify(data)); } catch { /* quota */ }
    if (remote) {
      try {
        const r = await fetch(`/api/data/${name}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error();
        status("Sincronizzato", true);
      } catch { status("Errore di sincronizzazione", false); toast("Salvataggio non riuscito. Riprova tra poco."); }
    }
    return data;
  }

  async function upsert(name, item) {
    const list = await load(name);
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    await save(name, list);
    return item;
  }

  async function remove(name, id) {
    const list = await load(name);
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list.splice(i, 1);
    await save(name, list);
  }

  async function meta(url) {
    let r;
    try { r = await fetch("/api/meta?url=" + encodeURIComponent(url)); }
    catch { throw new Error("Estrazione non disponibile"); }
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) throw new Error("Estrazione non disponibile in locale: usa «netlify dev»");
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Impossibile leggere il link");
    return data;
  }

  /* Finestra con modulo generico.
     fields: [{name,label,type,options,list,required,half,rows,hint,placeholder,action:{label,run(valore,tutti)},autorun}] */
  function form({ title, fields, values = {}, submit = "Salva", onDelete = false, extra = [] }) {
    return new Promise(resolve => {
      let settled = false;
      const dlg = document.createElement("dialog");
      dlg.className = "modal";
      const done = v => { if (settled) return; settled = true; dlg.close(); resolve(v); };

      const control = f => {
        const id = "f_" + f.name, v = values[f.name] ?? f.default ?? "";
        const base = `id="${id}" name="${f.name}"${f.required ? " required" : ""}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}`;
        if (f.type === "textarea") return `<textarea ${base} rows="${f.rows || 4}">${esc(v)}</textarea>`;
        if (f.type === "select") return `<select ${base}>${f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? " selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
        if (f.type === "checkbox") return `<label class="check"><input type="checkbox" id="${id}" name="${f.name}"${v ? " checked" : ""}> ${esc(f.checkLabel || f.label)}</label>`;
        const list = f.list && f.list.length ? ` list="${id}_l"` : "";
        return `<input type="${f.type || "text"}" ${base} value="${esc(v)}"${list}${f.min != null ? ` min="${f.min}"` : ""}>` +
          (list ? `<datalist id="${id}_l">${f.list.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : "");
      };

      dlg.innerHTML = `<form>
        <header><h2>${esc(title)}</h2><button type="button" class="x" data-close aria-label="Chiudi">×</button></header>
        <div class="fields">${fields.map(f => `<div class="field${f.half ? " half" : ""}">
          ${f.type === "checkbox" ? "" : `<label for="f_${f.name}">${esc(f.label)}</label>`}
          ${f.action ? `<div class="row">${control(f)}<button type="button" class="btn ghost sm" data-action="${f.name}">${esc(f.action.label)}</button></div>` : control(f)}
          ${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</div>`).join("")}</div>
        <footer>
          ${onDelete ? `<button type="button" class="btn danger" data-del>Elimina</button>` : ""}
          ${extra.map(x => `<button type="button" class="btn ghost" data-extra="${esc(x.value)}">${esc(x.label)}</button>`).join("")}
          <span class="sp"></span>
          <button type="button" class="btn ghost" data-close>Annulla</button>
          <button class="btn" type="submit">${esc(submit)}</button>
        </footer></form>`;
      document.body.append(dlg);
      const formEl = $("form", dlg);

      const read = () => {
        const o = {};
        fields.forEach(f => {
          const el = formEl.elements[f.name];
          if (!el) return;
          o[f.name] = f.type === "checkbox" ? el.checked : f.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value.trim();
        });
        return o;
      };

      fields.filter(f => f.action).forEach(f => {
        const el = formEl.elements[f.name];
        const btn = $(`[data-action="${f.name}"]`, dlg);
        const run = async auto => {
          const src = el.value.trim();
          if (!src) return;
          btn.disabled = true;
          const label = btn.textContent;
          btn.textContent = "Leggo…";
          try {
            const res = await f.action.run(src, read());
            Object.entries(res || {}).forEach(([k, val]) => {
              const t = formEl.elements[k];
              if (t && val !== undefined && val !== null && val !== "" && (!auto || !t.value)) t.value = val;
            });
            if (!auto) toast("Informazioni compilate");
          } catch (err) { if (!auto) toast(err.message || "Non riesco a leggere il link"); }
          btn.disabled = false;
          btn.textContent = label;
        };
        btn.onclick = () => run(false);
        if (f.autorun) el.addEventListener("change", () => run(true));
      });

      formEl.onsubmit = e => { e.preventDefault(); done(read()); };
      dlg.addEventListener("click", e => {
        if (e.target === dlg || e.target.closest("[data-close]")) return done(null);
        const x = e.target.closest("[data-extra]");
        if (x) return done({ ...read(), __extra: x.dataset.extra });
        if (e.target.closest("[data-del]") && confirm("Eliminare definitivamente?")) done({ __delete: true });
      });
      dlg.addEventListener("close", () => { if (!settled) { settled = true; resolve(null); } dlg.remove(); });
      dlg.showModal();
      const first = $("input:not([type=checkbox]),textarea,select", dlg);
      if (first) first.focus();
    });
  }

  /* Campo a etichette (chip): root contiene <span class="chips"> e un <input> */
  function chips(root, { values = [] } = {}) {
    const box = $(".chips", root), inp = $("input", root);
    let vals = [...values];
    const notify = () => root.dispatchEvent(new CustomEvent("chips", { bubbles: true }));
    const draw = () => { box.innerHTML = vals.map((v, i) => `<span class="chip">${esc(v)}<button type="button" data-i="${i}" aria-label="Rimuovi ${esc(v)}">×</button></span>`).join(""); };
    const add = t => { t = t.trim(); if (t && !vals.includes(t)) { vals.push(t); draw(); notify(); } inp.value = ""; };
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(inp.value); }
      else if (e.key === "Backspace" && !inp.value && vals.length) { vals.pop(); draw(); notify(); }
    });
    inp.addEventListener("change", () => add(inp.value));
    box.addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) { vals.splice(+b.dataset.i, 1); draw(); notify(); } });
    draw();
    return {
      values: () => [...vals],
      get: () => { if (inp.value.trim()) add(inp.value); return [...vals]; },
      set: v => { vals = [...v]; draw(); },
      add
    };
  }

  /* Backup completo */
  async function exportAll() {
    const out = { versione: 1, esportato: new Date().toISOString(), dati: {} };
    for (const n of COLLECTIONS) out.dati[n] = await load(n, n === "utili" ? SEED_UTILI : []);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `portale-backup-${isoDate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function importAll(file) {
    const json = JSON.parse(await file.text());
    if (!json.dati) throw new Error("File di backup non riconosciuto");
    for (const n of COLLECTIONS) if (Array.isArray(json.dati[n])) { await load(n); await save(n, json.dati[n]); }
  }

  return { load, save, upsert, remove, meta, form, chips, toast, uid, exportAll, importAll, SEED_UTILI, COLLECTIONS };
})();

/* Intestazione: data, menu mobile, menu a tendina */
(() => {
  const today = $("#today");
  if (today) today.textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const burger = $("#burger");
  if (burger) burger.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    burger.setAttribute("aria-expanded", open);
  });
  $$(".dd-btn").forEach(b => b.addEventListener("click", () => b.parentElement.classList.toggle("open")));
  document.addEventListener("click", e => { if (!e.target.closest(".dd")) $$(".dd.open").forEach(d => d.classList.remove("open")); });
})();
