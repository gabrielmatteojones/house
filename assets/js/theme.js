/* Jones House · temi: colori, caratteri, bordi e riquadro di testata.
   Il tema scelto sta nella collezione «tema» (sincronizzata) e, già calcolato, in localStorage («gj-tema»),
   così theme-boot.js lo applica prima del disegno. Questo file serve a calcolarlo e a tenerlo allineato tra dispositivi. */
const Tema = (() => {
  const PRESETS = {
    classico: { nome: "Classico", primario: "#101c4d", accento: "#d3121b", sfondo: "#fdf5ee" },
    bosco:    { nome: "Bosco",    primario: "#1d3b2c", accento: "#c8541a", sfondo: "#f5f2e6" },
    oceano:   { nome: "Oceano",   primario: "#0b3a4a", accento: "#0e9aa7", sfondo: "#eef6f7" },
    vinaccia: { nome: "Vinaccia", primario: "#3b0d1e", accento: "#d1495b", sfondo: "#fbf3f1" },
    viola:    { nome: "Viola",    primario: "#2d1b69", accento: "#e0457b", sfondo: "#f7f3fb" },
    sabbia:   { nome: "Sabbia",   primario: "#4a3426", accento: "#b4532a", sfondo: "#f8f1e4" },
    grafite:  { nome: "Grafite",  primario: "#20232a", accento: "#e08a00", sfondo: "#f3f3f0" }
  };
  const G = "https://fonts.googleapis.com/css2?";
  const FONTS = {
    classico: { nome: "Classico", esempio: "Barlow Condensed", head: '"Barlow Condensed","Arial Narrow",Impact,sans-serif', body: '"Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif', url: "" },
    elegante: { nome: "Elegante", esempio: "Fraunces", head: '"Fraunces",Georgia,serif', body: '"Source Sans 3",system-ui,sans-serif', url: G + "family=Fraunces:wght@600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" },
    moderno:  { nome: "Moderno", esempio: "Space Grotesk", head: '"Space Grotesk",system-ui,sans-serif', body: '"DM Sans",system-ui,sans-serif', url: G + "family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;600;700&display=swap" },
    tecnico:  { nome: "Tecnico", esempio: "JetBrains Mono", head: '"JetBrains Mono",ui-monospace,Consolas,monospace', body: '"IBM Plex Sans",system-ui,sans-serif', url: G + "family=JetBrains+Mono:wght@700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" }
  };
  const RAGGI = { netto: { nome: "Netti", r: "2px", rb: "2px" }, medio: { nome: "Medi", r: "6px", rb: "4px" }, morbido: { nome: "Morbidi", r: "16px", rb: "999px" } };
  const HEADERS = { classico: "Classico", sinistra: "Logo a sinistra", compatto: "Compatto", scuro: "Scuro", minimo: "Minimo" };
  const HEROS = { dots: "Punteggiato", solid: "Pieno", gradient: "Sfumato", light: "Chiaro", strip: "Sottile" };
  const BASE = { preset: "classico", colori: { primario: PRESETS.classico.primario, accento: PRESETS.classico.accento, sfondo: PRESETS.classico.sfondo }, font: "classico", raggio: "medio", hero: "dots", header: "classico" };

  /* ---- colori ---- */
  const rgb = h => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const hex = a => "#" + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  /** mescola a con b: t = quota di b (0..1) */
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const buio = c => { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) < 140; };

  /** Dal tema scelto ai valori finali (variabili CSS + caratteri) */
  const calcola = t => {
    t = { ...BASE, ...t, colori: { ...BASE.colori, ...(t && t.colori) } };
    const { primario: p, accento: a, sfondo: s } = t.colori, f = FONTS[t.font] || FONTS.classico, r = RAGGI[t.raggio] || RAGGI.medio;
    const vars = {
      "--navy": p, "--navy-d": mix(p, "#000000", .35), "--red": a, "--red-d": mix(a, "#000000", .18),
      "--cream": s, "--paper": mix(s, "#ffffff", .75), "--hd-bg": mix(s, "#ffffff", .55),
      "--muted": mix(p, s, .36), "--line": `rgba(${rgb(p).join(",")},.15)`,
      "--r": r.r, "--rb": r.rb, "--head": f.head, "--body": f.body
    };
    return { vars, fonts: f.url, hero: t.hero, header: HEADERS[t.header] ? t.header : "classico", contrastoAccento: buio(a) };
  };

  const applica = t => {
    const c = calcola(t), root = document.documentElement;
    for (const k in c.vars) root.style.setProperty(k, c.vars[k]);
    root.setAttribute("data-hero", c.hero);
    root.setAttribute("data-header", c.header);
    let l = document.getElementById("tema-font");
    if (c.fonts) {
      if (!l) { l = document.createElement("link"); l.id = "tema-font"; l.rel = "stylesheet"; document.head.append(l); }
      if (l.getAttribute("href") !== c.fonts) l.setAttribute("href", c.fonts);
    } else if (l) l.remove();
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", c.vars["--navy"]);
    return c;
  };

  const salvaLocale = (t, agg) => { try { localStorage.setItem("gj-tema", JSON.stringify({ ...calcola(t), agg })); } catch { /* quota */ } };

  /** Salva ovunque: collezione sincronizzata + copia pronta per l'avvio rapido */
  const salva = async t => {
    const agg = new Date().toISOString();
    salvaLocale(t, agg);
    await Portal.save("tema", { ...t, aggiornato: agg });
  };

  /* Allinea questo dispositivo al tema salvato altrove (solo se più recente) */
  const sincronizza = async () => {
    try {
      const remoto = await Portal.load("tema", {});
      if (!remoto || !remoto.aggiornato) return;
      const loc = JSON.parse(localStorage.getItem("gj-tema") || "null");
      if (loc && loc.agg && loc.agg >= remoto.aggiornato) return;
      applica(remoto); salvaLocale(remoto, remoto.aggiornato);
    } catch { /* resta il tema locale */ }
  };
  if (document.body && !document.body.hasAttribute("data-nosync-tema")) sincronizza();

  return { PRESETS, FONTS, RAGGI, HEROS, HEADERS, BASE, calcola, applica, salva, mix, buio };
})();
