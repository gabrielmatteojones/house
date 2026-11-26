/* People · script comune a tutte le pagine del sottosito.
   Dati: una sola collezione «people» (un elenco). Ogni elemento ha un campo "tipo" ("persona", "gruppo", "nota"…),
   così basta una collezione sola e il backup della Home la include già.
   Esempio per una pagina nuova:
       const dati = await People.tutti("persona");
       await People.salva({ tipo: "persona", nome: "Mario Rossi" });          // crea (o aggiorna se ha già un id)
       await People.togli(id);
   Per far funzionare una sezione, aggiungi in front matter della pagina:  script: nome-del-file   (assets/js/nome-del-file.js) */
const People = (() => {
  const NOME = "people";
  const tutti = async tipo => { const l = await Portal.load(NOME, []); return tipo ? l.filter(x => x.tipo === tipo) : l; };
  const salva = async el => {
    const l = await Portal.load(NOME, []);
    const oggi = new Date().toISOString();
    if (!el.id) { el.id = Portal.uid(); el.creato = oggi; l.push(el); }
    else { const i = l.findIndex(x => x.id === el.id); if (i >= 0) l[i] = { ...l[i], ...el }; else l.push(el); }
    el.modificato = oggi;
    await Portal.save(NOME, l);
    return el;
  };
  const togli = async id => Portal.save(NOME, (await Portal.load(NOME, [])).filter(x => x.id !== id));
  return { tutti, salva, togli };
})();

/* Menu laterale su telefono */
(() => {
  const b = document.getElementById("pp-burger");
  const chiudi = () => { document.body.classList.remove("pp-open"); if (b) b.setAttribute("aria-expanded", "false"); };
  if (b) b.addEventListener("click", () => b.setAttribute("aria-expanded", document.body.classList.toggle("pp-open")));
  const s = document.getElementById("pp-scrim"); if (s) s.addEventListener("click", chiudi);
  document.addEventListener("keydown", e => { if (e.key === "Escape") chiudi(); });
})();

/* Indicatore di connessione: solo un pallino, il testo va nel suggerimento */
(() => {
  const el = document.getElementById("sync"); if (!el) return;
  const dire = () => { el.title = el.textContent.trim(); };
  new MutationObserver(dire).observe(el, { childList: true, characterData: true, subtree: true });
})();

/* Panoramica: saluto e conteggi (se la pagina li ha) */
(async () => {
  const h = new Date().getHours(), t = document.getElementById("pp-greet");
  if (t) t.textContent = `${h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera"}, Gabriel`;
  const conta = document.querySelectorAll("[data-conta]");
  if (!conta.length) return;
  const l = await People.tutti();
  conta.forEach(el => { el.textContent = l.filter(x => x.tipo === el.dataset.conta).length; });
})();
