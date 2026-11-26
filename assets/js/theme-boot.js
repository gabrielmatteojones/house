/* Jones House · applica subito il tema salvato (colori, caratteri, stile) prima che la pagina venga disegnata.
   Va nell'<head>, bloccante: i valori sono già pronti in localStorage, calcolati da theme.js. */
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("gj-tema") || "null");
    if (!t || !t.vars) return;
    var r = document.documentElement;
    for (var k in t.vars) r.style.setProperty(k, t.vars[k]);
    if (t.hero) r.setAttribute("data-hero", t.hero);
    if (t.fonts) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = t.fonts; document.head.appendChild(l); }
  } catch (e) { /* tema di base */ }
})();
