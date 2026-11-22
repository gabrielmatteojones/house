/* Jones House · carte intestate
   Due modelli, una sola definizione usata da editor, stampa/PDF, esportazione Word e resoconto presenze:
     · «jones»   fascia con sigla blu e rossa, tutta modificabile
     · «gabriel» logo a sinistra, nome e recapiti, filetto verticale, piè di pagina con destinatario e oggetto
   Impostazioni nella collezione "impostazioni":
     carta          campi del modello Jones House        (invariato, per non perdere quanto già salvato)
     cartaGabriel   campi del modello Gabriel Jones
     cartaModello   modello predefinito per i nuovi documenti ("jones" | "gabriel")
   Ogni documento può scegliere il suo: cartaModello = "jones" | "gabriel" | "nessuna". */
const Letterhead = (() => {
  const MODELS = [
    { id: "jones", nome: "Jones House", desc: "Fascia blu con sigla e barra rossa" },
    { id: "gabriel", nome: "Gabriel Jones", desc: "Logo a sinistra e filetto verticale" }
  ];
  const DEF = {
    jones: { nome: "Jones House", sottotitolo: "", mittente: "Gabriel Jones", indirizzo: "", telefono: "", email: "", web: "", piede: "" },
    gabriel: {
      nome: "Gabriel Jones",
      righe: "Fontanafredda (PN)\nTel. 0434 733808\nEmail: -@joneshouse.it",
      piede: "Documento realizzato dall’ufficio di {nome} destinato a {destinatario} con l’oggetto {oggetto}"
    }
  };
  const LOGO = "/assets/img/logo-gabriel.png";
  const BLUE_G = "#3D6E99";
  const STORE = { jones: "carta", gabriel: "cartaGabriel" };
  const DEFAULT_CTX = { destinatario: "Dirigente scolastico", oggetto: "Oggetto del documento" };

  const cache = {};
  let defCache = null;

  const valid = id => (id === "gabriel" ? "gabriel" : "jones");
  const load = () => Portal.load("impostazioni", {});

  /** Modello predefinito per i nuovi documenti */
  const getDefault = async () => {
    if (defCache) return defCache;
    const s = await load();
    return (defCache = valid(s.cartaModello));
  };
  const setDefault = async id => {
    const s = await load();
    s.cartaModello = defCache = valid(id);
    await Portal.save("impostazioni", s);
    return defCache;
  };

  /** Impostazioni di un modello (campi già completati con i valori di base) */
  const get = async id => {
    id = valid(id || (await getDefault()));
    if (cache[id]) return cache[id];
    const s = await load();
    return (cache[id] = { ...DEF[id], ...(s[STORE[id]] || {}), modello: id });
  };

  const save = async (id, values) => {
    id = valid(id);
    const s = await load();
    const { modello, ctx, ...pulito } = values;   // il modello si ricava dal nome del campo, non si salva
    s[STORE[id]] = { ...DEF[id], ...pulito };
    await Portal.save("impostazioni", s);
    return (cache[id] = { ...s[STORE[id]], modello: id });
  };

  /** Quale carta usa un documento: "jones" | "gabriel" | "" (nessuna). Compatibile coi vecchi documenti (carta: true/false). */
  const modelOf = async doc => {
    if (!doc) return "";
    if (doc.cartaModello === "nessuna" || (doc.carta === false && !doc.cartaModello)) return "";
    if (doc.cartaModello === "jones" || doc.cartaModello === "gabriel") return doc.cartaModello;
    return getDefault();
  };
  /** Contesto del documento: destinatario e oggetto (piè di pagina del modello Gabriel) */
  const ctxOf = doc => ({
    destinatario: (doc && doc.destinatario) || DEFAULT_CTX.destinatario,
    oggetto: (doc && doc.oggetto) || (doc && doc.titolo) || DEFAULT_CTX.oggetto
  });

  /** La carta di un documento, pronta all'uso (con destinatario e oggetto), oppure null se il documento non ne ha */
  const forDoc = async doc => {
    const m = await modelOf(doc);
    return m ? { ...(await get(m)), ctx: ctxOf(doc) } : null;
  };

  const initials = nome => {
    const w = String(nome || "").trim().split(/\s+/).filter(Boolean);
    return ((w[0] || "J")[0] + ((w[1] || "")[0] || "")).toUpperCase();
  };
  const lines = t => String(t || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  /** Righe di contatto (per Word e anteprime) */
  const contactLines = s => {
    if (s.modello === "gabriel") return lines(s.righe).map(t => ({ t }));
    const out = [];
    if (s.mittente) out.push({ b: true, t: s.mittente });
    lines(s.indirizzo).forEach(t => out.push({ t }));
    if (s.telefono) out.push({ t: s.telefono });
    if (s.email) out.push({ t: s.email });
    if (s.web) out.push({ t: s.web });
    return out;
  };

  const footText = (s, ctx = s.ctx || DEFAULT_CTX) => {
    if (s.modello === "gabriel") {
      const c = { ...DEFAULT_CTX, ...ctx };
      return String(s.piede || DEF.gabriel.piede).replace(/\{(nome|destinatario|oggetto)\}/g, (_, k) => (k === "nome" ? s.nome : c[k]));
    }
    return s.piede || [s.nome, ...lines(s.indirizzo), s.email, s.web].filter(Boolean).join("  ·  ");
  };

  const logoUrl = () => (typeof location !== "undefined" ? location.origin : "") + LOGO;

  /* ---------- HTML ---------- */
  const header = (s, ctx = s.ctx) => s.modello === "gabriel"
    ? `<div class="lg-head"><img class="lg-logo" src="${logoUrl()}" alt="${esc(s.nome)}"><div class="lg-text"><b>${esc(s.nome.toUpperCase())}</b>${lines(s.righe).map(l => `<span>${esc(l)}</span>`).join("")}</div></div>`
    : `<div class="lh-head">
    <div class="lh-brand"><span class="lh-mark">${esc(initials(s.nome))}</span>
      <span class="lh-name"><b>${esc(s.nome)}</b>${s.sottotitolo ? `<small>${esc(s.sottotitolo)}</small>` : ""}</span></div>
    <div class="lh-contact">${contactLines(s).map(l => l.b ? `<b>${esc(l.t)}</b>` : `<span>${esc(l.t)}</span>`).join("")}</div>
  </div>`;

  const footer = (s, ctx = s.ctx) => s.modello === "gabriel"
    ? `<div class="lg-foot">${esc(footText(s, ctx))}</div>`
    : `<div class="lh-foot"><div class="lh-band"></div><div class="lh-text">${esc(footText(s, ctx))}</div></div>`;

  const FONT = `"Barlow Condensed","Arial Narrow",Arial,sans-serif`;
  const css = `
.lh-head,.lh-foot,.lg-head,.lg-foot{font-family:"Public Sans",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lh-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:15px;border-bottom:2.5px solid #101c4d;position:relative;color:#101c4d}
.lh-head::after{content:"";position:absolute;left:0;bottom:-2.5px;width:96px;height:5px;background:#d3121b}
.lh-brand{display:flex;align-items:center;gap:14px;min-width:0}
.lh-mark{position:relative;flex:none;width:54px;height:54px;box-sizing:border-box;border-radius:7px;background:#101c4d;color:#fdf5ee;display:grid;place-items:center;padding-bottom:9px;font:800 30px/1 ${FONT};letter-spacing:.01em}
.lh-mark::after{content:"";position:absolute;left:10px;right:10px;bottom:9px;height:5px;background:#d3121b}
.lh-name b{display:block;font:800 36px/.9 ${FONT};text-transform:uppercase;letter-spacing:.02em}
.lh-name small{display:block;margin-top:6px;font:700 11px/1.1 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:#d3121b}
.lh-contact{display:flex;flex-direction:column;text-align:right;font-size:10.5px;line-height:1.55;color:#5d668a}
.lh-contact b{color:#101c4d;font-size:11.5px}
.lh-foot{color:#5d668a;font-size:10px;line-height:1.5;text-align:center}
.lh-band{height:9px;margin-bottom:9px;background-color:#101c4d;background-image:radial-gradient(rgba(255,255,255,.2) 1px,transparent 1.5px);background-size:6px 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Modello Gabriel Jones: colonna a sinistra con il logo, testo e filetto a destra (misure della pagina A4: 58 mm il filetto, 62 mm il testo) */
.lg-head{position:relative;padding-left:29.5%;min-height:150px;color:#222}
.lg-logo{position:absolute;left:3%;top:-6px;width:23%;height:auto}
.lg-text{padding-top:14px;font-size:12.5px;line-height:1.45}
.lg-text b{display:block;font-size:14.5px;letter-spacing:.01em}
.lg-text span{display:block}
.lg-foot{font-size:10.5px;font-style:italic;color:#555;line-height:1.4}
`;

  // Stili condivisi con la pagina del portale
  if (typeof document !== "undefined" && !document.getElementById("lh-css")) {
    const style = document.createElement("style");
    style.id = "lh-css";
    style.textContent = css;
    document.head.append(style);
  }

  /** Pagina completa per la stampa / PDF, con la carta che si ripete su ogni pagina */
  const printHtml = ({ s, ctx, body, title, fontLink = true }) => {
    const base = `
      *{box-sizing:border-box}
      body{margin:0;color:#111;font:11.5pt/1.65 Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.page{width:100%;border-collapse:collapse}
      table.page>thead{display:table-header-group}table.page>tfoot{display:table-footer-group}
      table.page td{padding:0}
      .doc h1{font:700 26pt/1.1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#101c4d;margin:1em 0 .35em;break-after:avoid}
      .doc h2{font:700 21pt/1.1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#101c4d;margin:1.1em 0 .35em;break-after:avoid}
      .doc h3{font:700 15pt/1.15 "Barlow Condensed","Arial Narrow",Arial,sans-serif;color:#101c4d;margin:1em 0 .3em;break-after:avoid}
      .doc p{margin:0 0 .75em}.doc h1:first-child,.doc h2:first-child,.doc h3:first-child{margin-top:0}
      .doc blockquote{margin:1em 0;padding:2px 16px;border-left:4px solid #d3121b;color:#5d668a}
      .doc a{color:#d3121b}.doc hr{border:0;border-top:1px solid #c9cde0;margin:1.2em 0}
      .doc table{border-collapse:collapse;width:100%;margin:1em 0;break-inside:avoid}
      .doc td,.doc th{border:1px solid #c9cde0;padding:6px 9px;text-align:left;vertical-align:top}.doc th{background:#eef0f7}
      .doc img{max-width:100%}.doc .pb{height:0;border:0;break-after:page}`;
    const head = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title || "Documento")}</title>
      ${fontLink ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">` : ""}`;
    const doc = `<div class="doc">${body}</div>`;
    if (!s) {
      return `${head}<style>@page{size:A4;margin:18mm 18mm}${base}</style></head><body><div class="page-plain">${doc}</div></body></html>`;
    }
    if (s.modello === "gabriel") {
      const foot = esc(footText(s, ctx));
      return `${head}<style>
        @page{size:A4;margin:0}${base}${css}
        body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}
        .doc h1,.doc h2,.doc h3{color:${BLUE_G}}
        .lgp .lg-head{padding:0;height:45mm;min-height:0}
        .lgp .lg-logo{left:6mm;top:8mm;width:42mm}
        .lgp .lg-text{position:absolute;left:62mm;top:12mm;padding:0;font-size:9.5pt}
        .lgp .lg-text b{font-size:11pt}
        .lgp tbody td{vertical-align:top;padding:0 15mm 0 62mm}
        .lgp tfoot td{height:28mm}
        .lg-line{position:fixed;left:58mm;top:42mm;bottom:12mm;border-left:.3mm solid ${BLUE_G}}
        .lg-fix{position:fixed;left:62mm;right:15mm;bottom:9mm;font-size:8pt;font-style:italic;color:#555}
      </style></head><body>
      <div class="lg-line"></div><div class="lg-fix">${foot}</div>
      <table class="page lgp">
        <thead><tr><td>${header(s, ctx)}</td></tr></thead>
        <tfoot><tr><td></td></tr></tfoot>
        <tbody><tr><td>${doc}</td></tr></tbody>
      </table></body></html>`;
    }
    return `${head}<style>
      @page{size:A4;margin:11mm 16mm 10mm}${base}${css}
      .gap{height:9mm}.gap-s{height:6mm}
      </style></head><body>
      <table class="page">
        <thead><tr><td>${header(s, ctx)}<div class="gap"></div></td></tr></thead>
        <tfoot><tr><td><div class="gap-s"></div>${footer(s, ctx)}</td></tr></tfoot>
        <tbody><tr><td>${doc}</td></tr></tbody>
      </table></body></html>`;
  };

  /* ---------- Finestra di scelta e modifica ---------- */
  const FIELDS = {
    jones: [
      ["nome", "Nome", "text", "Jones House", true],
      ["sottotitolo", "Sottotitolo (facoltativo)", "text", "Es. Lezioni e attività"],
      ["mittente", "Nome del mittente", "text", "Gabriel Jones"],
      ["indirizzo", "Indirizzo (una riga per ogni riga)", "textarea", "Via…\n35100 Padova"],
      ["telefono", "Telefono", "text", ""],
      ["email", "Email", "text", ""],
      ["web", "Sito web", "text", ""],
      ["piede", "Testo del piè di pagina (se vuoto, uso nome, indirizzo, email e sito)", "text", ""]
    ],
    gabriel: [
      ["nome", "Nome", "text", "Gabriel Jones", true],
      ["righe", "Recapiti (una riga per ogni riga)", "textarea", "Fontanafredda (PN)\nTel. …\nEmail: …"],
      ["piede", "Piè di pagina. Puoi usare {nome}, {destinatario} e {oggetto}", "text", DEF.gabriel.piede]
    ]
  };

  /** Apre la finestra: scelta della carta predefinita, modifica dei campi di ciascun modello, anteprima dal vivo.
      Restituisce { modello, ... } oppure null se annullata. */
  const edit = async (startModel) => {
    const all = { jones: await get("jones"), gabriel: await get("gabriel") };
    let sel = valid(startModel || (await getDefault()));
    let predefinito = await getDefault();
    return new Promise(resolve => {
      const dlg = document.createElement("dialog");
      dlg.className = "modal lh-modal";
      dlg.innerHTML = `<form>
        <header><h2>Carta intestata</h2><button type="button" class="x" data-close aria-label="Chiudi">×</button></header>
        <div class="lh-pick" role="radiogroup" aria-label="Modello">${MODELS.map(m => `<button type="button" role="radio" class="lh-opt" data-m="${m.id}"><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small><i class="lh-star" data-star hidden>Predefinita</i></button>`).join("")}</div>
        <div class="lh-preview"><div class="lh-sheet" data-sheet><div data-h></div><div class="lh-fake"><i></i><i></i><i style="width:70%"></i></div><div data-f></div></div></div>
        <div class="fields" data-fields></div>
        <footer><button type="button" class="btn ghost" data-reset>Ripristina</button><button type="button" class="btn ghost" data-default>Usa come predefinita</button><span class="sp"></span>
          <button type="button" class="btn ghost" data-close>Annulla</button><button class="btn" type="submit">Salva</button></footer></form>`;
      document.body.append(dlg);
      const form = dlg.querySelector("form"), box = dlg.querySelector("[data-fields]");

      const read = () => Object.fromEntries(FIELDS[sel].map(([n]) => [n, (form.elements[n].value || "").trim()]));
      const paint = () => {
        const v = { ...DEF[sel], ...all[sel], ...read(), modello: sel };
        dlg.querySelector("[data-sheet]").className = "lh-sheet" + (sel === "gabriel" ? " lg" : "");
        dlg.querySelector("[data-h]").innerHTML = header(v, DEFAULT_CTX);
        dlg.querySelector("[data-f]").innerHTML = footer(v, DEFAULT_CTX);
        dlg.querySelectorAll(".lh-opt").forEach(b => {
          b.setAttribute("aria-checked", b.dataset.m === sel);
          b.querySelector("[data-star]").hidden = b.dataset.m !== predefinito;
        });
        dlg.querySelector("[data-default]").hidden = sel === predefinito;
      };
      const fill = () => {
        box.innerHTML = FIELDS[sel].map(([n, l, t, ph]) => `<div class="field${["telefono", "email"].includes(n) ? " half" : ""}">
          <label for="lh_${n}">${esc(l)}</label>
          ${t === "textarea" ? `<textarea id="lh_${n}" name="${n}" rows="${n === "righe" ? 3 : 2}" placeholder="${esc(ph)}">${esc(all[sel][n])}</textarea>` : `<input id="lh_${n}" name="${n}" value="${esc(all[sel][n])}" placeholder="${esc(ph)}">`}</div>`).join("");
        paint();
      };
      const keep = () => { all[sel] = { ...all[sel], ...read() }; };   // non perdere quello che hai scritto cambiando modello

      let done = false;
      const finish = v => { if (done) return; done = true; dlg.close(); resolve(v); };
      form.addEventListener("input", paint);
      form.onsubmit = async e => {
        e.preventDefault();
        keep();
        // salva entrambi i modelli (se non toccati restano com'erano)
        const out = await save(sel, all[sel]);
        const other = sel === "jones" ? "gabriel" : "jones";
        await save(other, all[other]);
        await setDefault(predefinito);
        Portal.toast("Carta intestata salvata");
        finish({ ...out, predefinito });
      };
      dlg.addEventListener("click", e => {
        if (e.target === dlg || e.target.closest("[data-close]")) return finish(null);
        const opt = e.target.closest(".lh-opt");
        if (opt && opt.dataset.m !== sel) { keep(); sel = opt.dataset.m; fill(); return; }
        if (e.target.closest("[data-default]")) { predefinito = sel; paint(); Portal.toast(`«${MODELS.find(m => m.id === sel).nome}» sarà la carta dei nuovi documenti: premi Salva`); return; }
        if (e.target.closest("[data-reset]")) { all[sel] = { ...DEF[sel], modello: sel }; fill(); }
      });
      dlg.addEventListener("close", () => { if (!done) { done = true; resolve(null); } dlg.remove(); });
      fill();
      dlg.showModal();
    });
  };

  /** Scarica il logo del modello Gabriel come byte (per Word e PDF) */
  const logoBytes = async () => {
    const r = await fetch(LOGO, { cache: "force-cache" });
    if (!r.ok) throw new Error("Logo non trovato");
    return new Uint8Array(await r.arrayBuffer());
  };

  return { MODELS, DEF, DEFAULT_CTX, LOGO, BLUE_G, get, save, getDefault, setDefault, modelOf, ctxOf, forDoc, header, footer, printHtml, css, edit, initials, contactLines, footText, logoBytes };
})();
