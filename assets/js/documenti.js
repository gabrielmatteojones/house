(async () => {
  const docs = await Portal.load("documenti", []);
  const $list = $("#docs"), $title = $("#title"), $body = $("#body"), $state = $("#state");
  let cur = null, timer = null, dirty = false;

  const sanitize = html => {
    const d = new DOMParser().parseFromString(html || "", "text/html");
    d.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(n => n.remove());
    d.querySelectorAll("*").forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }));
    return d.body.innerHTML;
  };
  const plain = html => (html || "").replace(/<[^>]+>/g, " ");
  const slug = s => (s || "documento").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "documento";
  const count = () => { $("#count").textContent = `${($body.innerText.trim().match(/\S+/g) || []).length} parole`; };

  const drawList = () => {
    const q = $("#q").value.toLowerCase();
    const items = [...docs].sort((a, b) => (b.aggiornato || "").localeCompare(a.aggiornato || ""))
      .filter(d => !q || (d.titolo + " " + plain(d.html)).toLowerCase().includes(q));
    $list.innerHTML = items.length
      ? items.map(d => `<li><button data-id="${d.id}" class="${cur && cur.id === d.id ? "on" : ""}"><b>${esc(d.titolo || "Senza titolo")}</b><small>Modificato il ${fmtDate((d.aggiornato || "").slice(0, 10), { day: "numeric", month: "short" })}</small></button></li>`).join("")
      : `<li class="muted pad">Nessun documento</li>`;
  };

  const commit = async () => {
    clearTimeout(timer);
    if (!cur || !dirty) return;
    dirty = false;
    cur.titolo = $title.value.trim();
    cur.html = $body.innerHTML;
    cur.aggiornato = new Date().toISOString();
    await Portal.save("documenti", docs);
    $state.textContent = "Salvato";
    drawList();
  };
  const schedule = () => { dirty = true; $state.textContent = "Salvataggio in corso…"; clearTimeout(timer); timer = setTimeout(commit, 700); };

  const open = async id => {
    await commit();
    cur = docs.find(d => d.id === id) || null;
    $("#editor").hidden = !cur;
    $("#empty").hidden = !!cur;
    if (!cur) return drawList();
    $title.value = cur.titolo || "";
    $body.innerHTML = sanitize(cur.html) || "<p><br></p>";
    $state.textContent = "";
    count();
    drawList();
  };

  const download = (name, mime, content) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  $("#new").onclick = async () => {
    await commit();
    const now = new Date().toISOString();
    const d = { id: Portal.uid(), titolo: "", html: "<p><br></p>", creato: now, aggiornato: now };
    docs.push(d);
    await Portal.save("documenti", docs);
    await open(d.id);
    $title.focus();
  };

  $list.addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) open(b.dataset.id); });
  $("#q").addEventListener("input", drawList);
  $title.addEventListener("input", schedule);
  $body.addEventListener("input", () => { schedule(); count(); });
  $body.addEventListener("paste", e => {
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) commit(); });

  const bar = $(".rte-bar");
  bar.addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-cmd]");
    if (!b) return;
    let val = b.dataset.val;
    if (b.dataset.cmd === "createLink") { val = prompt("Indirizzo del link (https://…)"); if (!val) return; }
    $body.focus();
    document.execCommand(b.dataset.cmd, false, val);
    schedule();
    count();
  });

  $("#print").onclick = async () => {
    await commit();
    const w = window.open("", "_blank");
    if (!w) return Portal.toast("Consenti le finestre popup per stampare");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(cur.titolo || "Documento")}</title>
      <style>body{font:12pt/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}h1{font:700 26pt/1.1 "Arial Narrow",Arial,sans-serif}h2{font:700 19pt Arial,sans-serif}h3{font:700 14pt Arial,sans-serif}blockquote{border-left:4px solid #999;margin-left:0;padding-left:16px;color:#444}</style>
      <h1>${esc(cur.titolo || "")}</h1>${sanitize(cur.html)}`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  $("#word").onclick = async () => {
    await commit();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(cur.titolo)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5}h1{font-size:22pt}h2{font-size:16pt}h3{font-size:13pt}</style></head><body><h1>${esc(cur.titolo)}</h1>${sanitize(cur.html)}</body></html>`;
    download(slug(cur.titolo) + ".doc", "application/msword", html);
  };

  $("#dup").onclick = async () => {
    await commit();
    const now = new Date().toISOString();
    const copy = { ...cur, id: Portal.uid(), titolo: (cur.titolo || "Senza titolo") + " (copia)", creato: now, aggiornato: now };
    docs.push(copy);
    await Portal.save("documenti", docs);
    open(copy.id);
  };

  $("#del").onclick = async () => {
    if (!cur || !confirm("Eliminare questo documento?")) return;
    docs.splice(docs.findIndex(d => d.id === cur.id), 1);
    dirty = false;
    cur = null;
    await Portal.save("documenti", docs);
    open(null);
    Portal.toast("Documento eliminato");
  };

  drawList();
})();
