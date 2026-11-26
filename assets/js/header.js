/* Jones House · intestazione: si fa bassa e scura quando scorri la pagina; Esc chiude le tendine. */
(() => {
  const root = document.documentElement;
  let piccolo = false;
  const aggiorna = () => {
    const y = window.scrollY;
    const v = piccolo ? y > 40 : y > 140;   // due soglie: niente sfarfallio al confine
    if (v !== piccolo) { piccolo = v; root.classList.toggle("hd-small", v); }
  };
  addEventListener("scroll", aggiorna, { passive: true });
  aggiorna();
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".dd.open").forEach(d => d.classList.remove("open"));
  });
})();
