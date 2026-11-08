/* Jones House · carta intestata
   Un'unica definizione, usata dall'editor, dalla stampa/PDF e dall'esportazione Word. */
const Letterhead = (() => {
  const DEFAULTS = { nome: "Jones House", sottotitolo: "", mittente: "Gabriel Jones", indirizzo: "", telefono: "", email: "", web: "", piede: "" };
  let cache = null;

  const get = async () => {
    if (cache) return cache;
    const s = await Portal.load("impostazioni", {});
    cache = { ...DEFAULTS, ...(s.carta || {}) };
    return cache;
  };

  const save = async values => {
    const s = await Portal.load("impostazioni", {});
    s.carta = { ...DEFAULTS, ...values };
    await Portal.save("impostazioni", s);
    cache = s.carta;
    return cache;
  };

  const initials = nome => {
    const w = String(nome || "").trim().split(/\s+/).filter(Boolean);
    return ((w[0] || "J")[0] + ((w[1] || "")[0] || "")).toUpperCase();
  };

  const lines = t => String(t || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  const contactLines = s => {
    const out = [];
    if (s.mittente) out.push({ b: true, t: s.mittente });
    lines(s.indirizzo).forEach(t => out.push({ t }));
    if (s.telefono) out.push({ t: s.telefono });
    if (s.email) out.push({ t: s.email });
    if (s.web) out.push({ t: s.web });
    return out;
  };

  const footText = s => s.piede || [s.nome, ...lines(s.indirizzo), s.email, s.web].filter(Boolean).join("  ·  ");

  const header = s => `<div class="lh-head">
    <div class="lh-brand"><span class="lh-mark">${esc(initials(s.nome))}</span>
      <span class="lh-name"><b>${esc(s.nome)}</b>${s.sottotitolo ? `<small>${esc(s.sottotitolo)}</small>` : ""}</span></div>
    <div class="lh-contact">${contactLines(s).map(l => l.b ? `<b>${esc(l.t)}</b>` : `<span>${esc(l.t)}</span>`).join("")}</div>
  </div>`;

  const footer = s => `<div class="lh-foot"><div class="lh-band"></div><div class="lh-text">${esc(footText(s))}</div></div>`;

  const FONT = `"Barlow Condensed","Arial Narrow",Arial,sans-serif`;
  const css = `
.lh-head,.lh-foot{font-family:"Public Sans",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
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
`;

  // Stili condivisi con la pagina del portale
  const style = document.createElement("style");
  style.id = "lh-css";
  style.textContent = css;
  document.head.append(style);

  /* Finestra delle impostazioni, con anteprima dal vivo */
  const fields = [
    ["nome", "Nome", "text", "Jones House", true],
    ["sottotitolo", "Sottotitolo (facoltativo)", "text", "Es. Lezioni e attività"],
    ["mittente", "Nome del mittente", "text", "Gabriel Jones"],
    ["indirizzo", "Indirizzo (una riga per ogni riga)", "textarea", "Via…\n35100 Padova"],
    ["telefono", "Telefono", "text", ""],
    ["email", "Email", "text", ""],
    ["web", "Sito web", "text", ""],
    ["piede", "Testo del piè di pagina (se vuoto, uso nome, indirizzo, email e sito)", "text", ""]
  ];

  const edit = async () => {
    const cur = await get();
    return new Promise(resolve => {
      const dlg = document.createElement("dialog");
      dlg.className = "modal lh-modal";
      dlg.innerHTML = `<form>
        <header><h2>Carta intestata</h2><button type="button" class="x" data-close aria-label="Chiudi">×</button></header>
        <div class="lh-preview"><div class="lh-sheet"><div data-h></div><div class="lh-fake"><i></i><i></i><i style="width:70%"></i></div><div data-f></div></div></div>
        <div class="fields">${fields.map(([n, l, t, ph]) => `<div class="field${["telefono", "email"].includes(n) ? " half" : ""}">
          <label for="lh_${n}">${esc(l)}</label>
          ${t === "textarea" ? `<textarea id="lh_${n}" name="${n}" rows="2" placeholder="${esc(ph)}">${esc(cur[n])}</textarea>` : `<input id="lh_${n}" name="${n}" value="${esc(cur[n])}" placeholder="${esc(ph)}">`}</div>`).join("")}</div>
        <footer><button type="button" class="btn ghost" data-reset>Ripristina</button><span class="sp"></span>
          <button type="button" class="btn ghost" data-close>Annulla</button><button class="btn" type="submit">Salva</button></footer></form>`;
      document.body.append(dlg);
      const form = dlg.querySelector("form");
      const read = () => Object.fromEntries(fields.map(([n]) => [n, form.elements[n].value.trim()]));
      const paint = () => {
        const v = { ...DEFAULTS, ...read() };
        dlg.querySelector("[data-h]").innerHTML = header(v);
        dlg.querySelector("[data-f]").innerHTML = footer(v);
      };
      let done = false;
      const finish = v => { if (done) return; done = true; dlg.close(); resolve(v); };
      form.addEventListener("input", paint);
      form.onsubmit = async e => { e.preventDefault(); const v = await save(read()); Portal.toast("Carta intestata salvata"); finish(v); };
      dlg.addEventListener("click", e => {
        if (e.target === dlg || e.target.closest("[data-close]")) return finish(null);
        if (e.target.closest("[data-reset]")) { fields.forEach(([n]) => { form.elements[n].value = DEFAULTS[n]; }); paint(); }
      });
      dlg.addEventListener("close", () => { if (!done) { done = true; resolve(null); } dlg.remove(); });
      paint();
      dlg.showModal();
    });
  };

  return { DEFAULTS, get, save, header, footer, css, edit, initials, contactLines, footText };
})();
