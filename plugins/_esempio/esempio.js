/* Esempio: gira su ogni pagina, dopo core.js e lo script della pagina.
   Disponibili: Portal (load, save, upsert, remove, toast, form…), $, $$, esc, fmtDate…
   document.body.dataset.page contiene l indirizzo della pagina corrente (es. "/calendario/"). */
(() => {
  if (document.body.dataset.page !== "/") return;      // solo nella Home
  const main = $("main");
  if (!main) return;
  const el = document.createElement("div");
  el.className = "esempio-banner";
  el.textContent = "Il plugin di esempio funziona.";
  main.prepend(el);
})();
