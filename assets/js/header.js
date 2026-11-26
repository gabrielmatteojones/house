/* Jones House · intestazione: menu a tendina accessibile da tastiera e da touch. */
(() => {
  // Esc chiude le tendine aperte
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".dd.open").forEach(d => d.classList.remove("open"));
  });
})();
