/* Jones House · intestazione: ricerca nel portale (icona lente o tasto «/») e descrizione dell'indicatore di connessione.
   L'elenco delle pagine è preso dal menu stesso, quindi basta aggiungere una voce a _data/nav.yml. */
(() => {
  const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Indicatore di connessione: è solo un pallino, il testo va nel suggerimento
  const sync = document.getElementById("sync");
  if (sync) {
    const dire = () => { sync.title = sync.textContent.trim(); sync.setAttribute("aria-label", sync.title); };
    dire();
    new MutationObserver(dire).observe(sync, { childList: true, characterData: true, subtree: true });
  }

  const voci = () => {
    const out = [], visti = new Set();
    const metti = (nome, url, gruppo) => { if (url && !visti.has(url)) { visti.add(url); out.push({ nome, url, gruppo }); } };
    document.querySelectorAll(".hd-center .nav > a").forEach(a => metti(a.textContent.trim(), a.getAttribute("href"), ""));
    document.querySelectorAll(".hd-center .dd").forEach(d => {
      const g = d.querySelector(".dd-btn").textContent.trim();
      d.querySelectorAll(".dd-menu a").forEach(a => metti(a.textContent.trim(), a.getAttribute("href"), g));
    });
    return out;
  };

  let dlg = null, lista = [], sel = 0;
  const disegna = q => {
    const n = norm(q.trim());
    const trovate = lista.filter(v => !n || norm(v.nome + " " + v.gruppo).includes(n));
    sel = Math.min(sel, Math.max(0, trovate.length - 1));
    const ul = dlg.querySelector(".hd-results");
    ul.innerHTML = trovate.length
      ? trovate.map((v, i) => `<li><a href="${v.url}" class="${i === sel ? "sel" : ""}">${v.nome}<small>${v.gruppo}</small></a></li>`).join("")
      : `<li class="muted" style="padding:10px 12px">Nessuna pagina trovata.</li>`;
    return trovate;
  };
  const apri = () => {
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "modal hd-search";
      dlg.innerHTML = `<form method="dialog" onsubmit="return false"><input type="search" placeholder="Cerca una pagina…" aria-label="Cerca nel portale" autocomplete="off"><ul class="hd-results"></ul></form>`;
      document.body.append(dlg);
      const inp = dlg.querySelector("input");
      inp.addEventListener("input", () => { sel = 0; disegna(inp.value); });
      dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("keydown", e => {
        const t = disegna(inp.value);
        if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, t.length - 1); disegna(inp.value); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); disegna(inp.value); }
        else if (e.key === "Enter" && t[sel]) { e.preventDefault(); location.href = t[sel].url; }
      });
    }
    lista = voci();
    sel = 0;
    const inp = dlg.querySelector("input");
    inp.value = "";
    disegna("");
    if (!dlg.open) dlg.showModal();
    inp.focus();
  };

  document.addEventListener("click", e => { if (e.target.closest("#hd-search")) apri(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest("input,textarea,select,[contenteditable],dialog[open]")) return;
    e.preventDefault(); apri();
  });
})();
