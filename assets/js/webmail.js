(async () => {
  const NAMES = { Inbox: "Posta in arrivo", Drafts: "Bozze", Templates: "Modelli", Sent: "Inviata", Spam: "Spam", Trash: "Cestino", Outbox: "In uscita" };
  const RANK = ["Inbox", "Drafts", "Sent", "Templates", "Spam", "Trash"];
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  const LIMIT = 40, BASE = document.title, MAX_UP = 4 * 1024 * 1024, MAX_DL = 5.5e6, DKEY = "jm-bozza";
  const EMPTY = `<div class="empty"><h3>Nessun messaggio aperto</h3>Scegli una mail dall'elenco.</div>`;
  const QSTYLE = "margin:12px 0 0;padding-left:10px;border-left:3px solid #ccc;color:#555";
  const SET = { sound: true, sigs: {}, from: "" };
  const S = { acc: "", me: "", addrs: [], folders: [], fid: "", inbox: "", start: 1, q: "", cur: null, curFid: "", items: [], known: new Set(), html: "", atts: [], out: false, isNew: false };

  // Zoho manda oggetto, mittente e anteprima con entità HTML (&#39; ecc.): le decodifico prima di mostrarli.
  const dec = s => { const t = document.createElement("textarea"); t.innerHTML = String(s ?? ""); return t.value; };
  const txt = s => esc(dec(s));
  const emails = s => dec(s).match(/[^\s<>",;]+@[^\s<>",;]+/g) || [];
  const mine = a => S.addrs.some(x => x.addr.toLowerCase() === String(a).toLowerCase());
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const isSys = f => f.folderType in NAMES && String(f.folderName || "").toLowerCase() === f.folderType.toLowerCase();
  const label = f => (isSys(f) ? NAMES[f.folderType] : f.folderName) || f.folderName || "(senza nome)";
  const depth = f => Math.max(0, String(f.path || "").split("/").filter(Boolean).length - 1);
  const isOut = () => ["Sent", "Drafts", "Outbox"].includes(S.folders.find(f => f.folderId === S.fid)?.folderType);
  const nl2br = t => esc(t).replace(/\n/g, "<br>");

  /* ---- Rete ---- */
  const api = async (path, opt = {}) => {
    const r = await fetch(`/api/zoho/${path}`, { ...opt, headers: opt.body ? { "content-type": "application/json" } : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { showConnect(j.error); throw new Error(j.error || "Zoho non collegato"); }
    if (!r.ok || (j.status && j.status.code >= 400)) throw new Error(j.status?.description || j.error || `Errore ${r.status}`);
    return j;
  };
  const mail = (p, opt) => api(`mail/accounts/${S.acc}${p}`, opt);
  const upd = body => mail("/updatemessage", { method: "PUT", body: JSON.stringify(body) });
  const post = (url, body = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const sync = (t, ok) => { const el = $("#sync"); if (el) { el.textContent = t; el.dataset.ok = ok ? "1" : "0"; } };
  const fail = e => Portal.toast(e.message || "Errore");

  /* ---- Date ---- */
  const msOf = m => +(m.receivedTime || m.receivedtime || m.sentDateInGMT || 0);
  const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const short = ms => {
    const d = new Date(ms), a = Math.round((day0(new Date()) - day0(d)) / 864e5);
    return a <= 0 ? hhmm(d) : a === 1 ? "Ieri" : a < 7 ? d.toLocaleDateString("it-IT", { weekday: "short" }) : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  /* ---- Suono (generato nel browser, nessun file) ---- */
  let ac;
  const unlock = () => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch {} };
  addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
  const chime = force => {
    if (!SET.sound && !force) return;
    unlock(); if (!ac) return;
    const t = ac.currentTime;
    [[784, 0], [1047, .15], [1319, .3]].forEach(([f, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.2, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .55);
      o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + .6);
    });
  };

  /* ---- Impostazioni (salvate sul server, valgono su ogni dispositivo) ---- */
  const loadSettings = async () => { try { const j = await (await fetch("/api/data/mail-impostazioni")).json(); if (j) Object.assign(SET, j); } catch {} };
  const saveSettings = () => fetch("/api/data/mail-impostazioni", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(SET) })
    .then(r => { if (!r.ok) throw 0; Portal.toast("Impostazioni salvate"); }).catch(() => Portal.toast("Salvataggio non riuscito"));
  const sigFor = a => { const k = String(a || "").toLowerCase(); return (k in SET.sigs ? SET.sigs[k] : SET.sigs["*"]) || ""; };

  /* ---- Notifiche push ---- */
  const pushOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64 = s => Uint8Array.from(atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const pushSub = async () => (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  const pushDraw = async () => {
    const on = pushOk && Notification.permission === "granted" && await pushSub();
    $("#s-push-msg").textContent = !pushOk ? "Questo browser non supporta le notifiche push (su iPhone installa prima il portale nella schermata Home)."
      : Notification.permission === "denied" ? "Le notifiche sono bloccate: sbloccale dalle impostazioni del sito nel browser."
      : on ? "Attive su questo dispositivo, anche a portale chiuso." : "Non attive su questo dispositivo.";
    $("#s-push").textContent = on ? "Disattiva" : "Attiva";
    $("#s-push").disabled = !pushOk || Notification.permission === "denied";
    $("#s-push-test").disabled = !on;
  };
  const pushToggle = async () => {
    const sub = await pushSub();
    if (sub) { await post("/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); return pushDraw(); }
    if (await Notification.requestPermission() !== "granted") return pushDraw();
    const reg = await navigator.serviceWorker.ready;
    const { key } = await (await fetch("/api/push/key")).json();
    const n = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await post("/api/push/subscribe", n.toJSON());
    Portal.toast("Notifiche attivate"); pushDraw();
  };

  /* ---- Riquadro destro: lettura, scrittura o impostazioni (tutto dentro la pagina) ---- */
  let dirty = false;
  const show = v => {
    ["reader", "composer", "settings"].forEach(id => $("#" + id).hidden = id !== v);
    $(".wm").classList.toggle("reading", v !== "reader" || !!S.cur);
    $(".wm-right").scrollTop = 0;
  };
  const draftGet = () => { try { return JSON.parse(localStorage.getItem(DKEY)); } catch { return null; } };
  const draftSet = d => { try { d ? localStorage.setItem(DKEY, JSON.stringify(d)) : localStorage.removeItem(DKEY); } catch {} };
  const leave = () => {
    if (!dirty || $("#composer").hidden) return true;
    const ok = confirm("Scartare il messaggio che stai scrivendo?");
    if (ok) draftSet(null);
    return ok;
  };
  const home = () => { dirty = false; show("reader"); };

  /* ---- Cartelle ---- */
  const drawFolders = () => {
    $("#folders").innerHTML = S.folders.map(f => `<li><button type="button" data-id="${esc(f.folderId)}" title="${txt(f.path || f.folderName)}" style="padding-left:${10 + 14 * Math.min(depth(f), 4)}px" class="${f.folderId === S.fid ? "on" : ""}"><span>${txt(label(f))}</span>${+f.unreadCount ? `<span class="n">${+f.unreadCount}</span>` : ""}</button></li>`).join("");
    const n = +S.folders.find(f => f.folderId === S.inbox)?.unreadCount || 0;
    document.title = n ? `(${n}) ${BASE}` : BASE;
    navigator.setAppBadge?.(n || 0)?.catch?.(() => {});
  };
  const loadFolders = async () => {
    const j = await mail("/folders");
    S.folders = (j.data || []).sort((a, b) => {
      const x = isSys(a) ? RANK.indexOf(a.folderType) : -1, y = isSys(b) ? RANK.indexOf(b.folderType) : -1;
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || String(a.path || a.folderName).localeCompare(String(b.path || b.folderName));
    });
    S.inbox = (S.folders.find(f => isSys(f) && f.folderType === "Inbox") || S.folders.find(f => f.folderType === "Inbox") || S.folders[0])?.folderId || "";
    if (!S.fid) S.fid = S.inbox;
    drawFolders();
  };

  /* ---- Elenco ---- */
  const row = m => {
    const out = isOut(), who = out ? (m.toAddress || m.fromAddress) : (m.sender || m.fromAddress);
    return `<li><button type="button" data-mid="${esc(m.messageId)}" class="${String(m.status) === "0" && !out ? "unread" : ""} ${S.cur?.messageId === m.messageId ? "on" : ""}">
      <div class="t"><span>${txt(who)}</span><time>${short(msOf(m))}</time></div>
      <div class="s">${m.hasAttachment && m.hasAttachment !== "0" ? "📎 " : ""}${txt(m.subject || "(senza oggetto)")}</div>
      <div class="p">${txt(m.summary || "")}</div></button></li>`;
  };
  const loadList = async (append = false) => {
    if (!append) S.start = 1;
    const j = S.q
      ? await mail(`/messages/search?searchKey=${encodeURIComponent("entire:" + S.q)}&start=${S.start}&limit=${LIMIT}&includeto=true`)
      : await mail(`/messages/view?folderId=${S.fid}&start=${S.start}&limit=${LIMIT}&includeto=true`);
    const data = j.data || [];
    S.items = append ? S.items.concat(data) : data;
    $("#msgs").innerHTML = S.items.length ? S.items.map(row).join("") : `<li class="pad muted">Nessun messaggio.</li>`;
    $("#more").hidden = data.length < LIMIT;
    sync(`Collegato · ${S.me}`, true);
  };

  /* ---- Posta nuova: suono + avviso ---- */
  const checkNew = async (first = false) => {
    if (!S.inbox || S.out) return;
    const data = (await mail(`/messages/view?folderId=${S.inbox}&status=unread&start=1&limit=20&includeto=true`)).data || [];
    const fresh = data.filter(m => !S.known.has(String(m.messageId)));
    data.forEach(m => S.known.add(String(m.messageId)));
    if (first) return;
    await loadFolders();
    if (!fresh.length) return;
    chime();
    Portal.toast(fresh.length > 1 ? `${fresh.length} nuovi messaggi` : `Nuovo messaggio da ${dec(fresh[0].sender || fresh[0].fromAddress)}`);
    if (S.fid === S.inbox && !S.q) await loadList();
  };

  /* ---- Lettura (con allegati) ---- */
  const attUrl = a => `/api/zoho/mail/accounts/${S.acc}/folders/${S.curFid}/messages/${S.cur.messageId}/attachments/${a.attachmentId}`;
  const chips = list => list.map(a => {
    const nm = dec(a.attachmentName), n = +a.attachmentSize || 0, view = /\.(png|jpe?g|gif|webp|pdf)$/i.test(nm);
    if (n > MAX_DL) return `<span class="chip" title="Troppo grande per il portale: aprilo da Zoho Mail">📎 ${esc(nm)} <small>${size(n)}</small></span>`;
    return `<a class="chip" href="${esc(attUrl(a))}${view ? "" : "?dl=" + encodeURIComponent(nm)}"${view ? ' target="_blank" rel="noopener"' : ""}>📎 ${esc(nm)} <small>${size(n)}</small></a>`;
  }).join("");
  // Le immagini incorporate (cid:) le scarico e le inserisco nel messaggio.
  const inlineImgs = async (m, fid, list, html) => {
    for (const a of (list || []).slice(0, 8)) {
      if (!a.cid || (+a.attachmentSize || 0) > 1.5e6 || !html.includes(a.cid)) continue;
      try {
        const r = await fetch(`/api/zoho/mail/accounts/${S.acc}/folders/${fid}/messages/${m.messageId}/attachments/${a.attachmentId}`); if (!r.ok) continue;
        const blob = new Blob([await r.arrayBuffer()], { type: MIME[String(a.attachmentName).split(".").pop().toLowerCase()] || "image/png" });
        const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        html = html.split("cid:" + a.cid).join(url);
      } catch {}
    }
    return html;
  };
  // Le immagini esterne restano bloccate finché non le consenti (evita i pixel di tracciamento).
  const frameDoc = (html, remote) => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${remote ? "https: http:" : ""}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>body{font:15px/1.5 system-ui,sans-serif;margin:14px;word-wrap:break-word}img{max-width:100%;height:auto}</style>${html}`;
  const hasRemote = h => /<img[^>]+src\s*=\s*["']?https?:/i.test(h) || /url\(\s*["']?https?:/i.test(h);

  const open = async mid => {
    const m = S.items.find(x => String(x.messageId) === String(mid)); if (!m || !leave()) return;
    S.cur = m; S.curFid = m.folderId || S.fid; dirty = false; show("reader");
    $$("#msgs button").forEach(b => b.classList.toggle("on", b.dataset.mid === String(mid)));
    $("#reader").innerHTML = `<p class="muted">Apro il messaggio…</p>`;
    try {
      const fid = S.curFid, wantAtt = (m.hasAttachment && m.hasAttachment !== "0") || (m.hasInline && m.hasInline !== "0");
      const [j, ai] = await Promise.all([
        mail(`/folders/${fid}/messages/${mid}/content`),
        wantAtt ? mail(`/folders/${fid}/messages/${mid}/attachmentinfo?includeInline=true`).catch(() => null) : null
      ]);
      S.atts = ai?.data?.attachments || [];
      S.html = await inlineImgs(m, fid, ai?.data?.inline, j.data?.content || "<p>(vuoto)</p>");
      const cur = S.folders.find(f => f.folderId === fid), cat = cur?.folderType;
      const moves = S.folders.filter(f => f.folderId !== fid).map(f => `<option value="${esc(f.folderId)}">${txt(label(f))}</option>`).join("");
      $("#reader").innerHTML = `<button class="btn ghost sm wm-back" type="button" data-act="back" style="margin-bottom:12px;align-self:flex-start">← Indietro</button>
        <h3>${txt(m.subject || "(senza oggetto)")}</h3>
        <div class="meta">Da ${txt(m.sender || "")} &lt;${txt(m.fromAddress || "")}&gt; · ${new Date(msOf(m)).toLocaleString("it-IT")}${m.toAddress ? `<br>A: ${txt(m.toAddress)}` : ""}${m.ccAddress ? `<br>Cc: ${txt(m.ccAddress)}` : ""}</div>
        <div class="acts"><button class="btn sm" type="button" data-act="reply">Rispondi</button><button class="btn ghost sm" type="button" data-act="all">Rispondi a tutti</button><button class="btn ghost sm" type="button" data-act="fwd">Inoltra</button>
          <select data-sel="move" aria-label="Sposta in"><option value="">Sposta in…</option>${moves}</select>
          ${cat === "Spam" ? "" : `<button class="btn ghost sm" type="button" data-act="spam">Spam</button>`}
          <button class="btn ghost sm" type="button" data-act="unread">Segna da leggere</button><button class="btn danger sm" type="button" data-act="del">Elimina</button></div>
        ${S.atts.length ? `<div class="atts">${chips(S.atts)}</div>` : ""}
        ${hasRemote(S.html) ? `<div class="note" id="remote-note">Le immagini esterne sono bloccate per proteggere la tua privacy. <button class="btn ghost sm" type="button" data-act="img">Mostra immagini</button></div>` : ""}
        <iframe sandbox="allow-popups allow-popups-to-escape-sandbox" title="Messaggio"></iframe>`;
      $("#reader iframe").srcdoc = frameDoc(S.html, false);
      if (String(m.status) === "0") {
        m.status = "1"; $(`#msgs button[data-mid="${mid}"]`)?.classList.remove("unread");
        upd({ mode: "markAsRead", messageId: [String(mid)] }).then(loadFolders).catch(() => {});
      }
    } catch (e) { $("#reader").innerHTML = `<div class="empty"><h3>Non riesco ad aprirlo</h3>${esc(e.message)}</div>`; }
  };
  const textOf = () => (new DOMParser().parseFromString(S.html, "text/html").body.textContent || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2500);

  /* ---- Scrittura: editor con formattazione, Ccn, allegati, bozza automatica ---- */
  const ed = $("#c-body");
  let ATT = [];
  const sigHtml = a => nl2br(sigFor(a));
  const quoteHtml = (head, text) => `<blockquote data-quote style="${QSTYLE}">${nl2br(head)}<br><br>${nl2br(text)}</blockquote>`;
  const drawAtts = () => { $("#c-atts").innerHTML = ATT.map((a, i) => `<span class="chip">📎 ${esc(a.name)} <small>${a.busy ? "caricamento…" : size(a.size)}</small><button type="button" data-i="${i}" aria-label="Rimuovi">×</button></span>`).join(""); };
  let tdraft;
  const saveDraft = () => {
    if (!S.isNew) return;
    clearTimeout(tdraft);
    tdraft = setTimeout(() => draftSet({ from: $("#c-from").value, to: $("#c-to").value, cc: $("#c-cc").value, bcc: $("#c-bcc").value, sub: $("#c-sub").value, html: ed.innerHTML }), 600);
  };
  const compose = (v = {}) => {
    if (!S.acc) return Portal.toast("Collega prima Zoho");
    if (!leave()) return;
    S.isNew = !Object.keys(v).length;
    $("#c-from").innerHTML = S.addrs.map(a => `<option value="${esc(a.addr)}">${esc(a.addr)}${a.alias ? " (alias)" : ""}</option>`).join("");
    const want = [v.from, SET.from, S.me].find(a => a && mine(a)) || S.me;
    $("#c-from").value = S.addrs.find(x => x.addr.toLowerCase() === want.toLowerCase())?.addr || S.me;
    $("#c-to").value = v.to || ""; $("#c-cc").value = v.cc || ""; $("#c-bcc").value = ""; $("#c-sub").value = v.sub || "";
    ed.innerHTML = `<div><br></div><div data-sig>${sigHtml($("#c-from").value)}</div>${v.quote ? quoteHtml(v.head, v.quote) : ""}`;
    ATT = []; drawAtts(); dirty = false;
    const d = S.isNew && draftGet();
    if (d) {
      if (d.from && mine(d.from)) $("#c-from").value = S.addrs.find(x => x.addr.toLowerCase() === d.from.toLowerCase()).addr;
      $("#c-to").value = d.to || ""; $("#c-cc").value = d.cc || ""; $("#c-bcc").value = d.bcc || ""; $("#c-sub").value = d.sub || ""; ed.innerHTML = d.html || ed.innerHTML;
      dirty = true; Portal.toast("Bozza ripristinata");
    }
    show("composer");
    (v.to || d ? ed : $("#c-to")).focus();
    if (v.to || d) { const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  };
  $("#composer").oninput = () => { dirty = true; saveDraft(); };
  $("#c-from").onchange = () => { const s = ed.querySelector("[data-sig]"); if (s) s.innerHTML = sigHtml($("#c-from").value); saveDraft(); };
  $("#c-cancel").onclick = () => { if (leave()) home(); };

  // Barra di formattazione
  let rng;
  document.addEventListener("selectionchange", () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) rng = s.getRangeAt(0).cloneRange(); });
  const exec = (c, v) => {
    ed.focus();
    if (rng) { const s = getSelection(); s.removeAllRanges(); s.addRange(rng); }
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(c, false, v);
    dirty = true; saveDraft();
  };
  $("#fmt").onmousedown = e => { if (e.target.closest("button")) e.preventDefault(); };
  $("#fmt").onclick = e => {
    const b = e.target.closest("button[data-cmd]"); if (!b) return;
    let v = b.dataset.val;
    if (b.dataset.cmd === "createLink") { v = prompt("Indirizzo del link", "https://"); if (!v) return; if (!/^(https?:|mailto:)/i.test(v)) v = "https://" + v; }
    exec(b.dataset.cmd, v);
  };
  $("#fmt").onchange = e => { const t = e.target; if (t.dataset.cmd && t.value) { exec(t.dataset.cmd, t.value); if (t.tagName === "SELECT") t.selectedIndex = 0; } };

  // Allegati in uscita
  const upload = async f => {
    if (f.size > MAX_UP) throw new Error(`${f.name}: supera il limite di 4 MB`);
    const fd = new FormData(); fd.append("file", f, f.name);
    const r = await fetch(`/api/zoho/mail/accounts/${S.acc}/messages/attachments?uploadType=multipart`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { showConnect(j.error); throw new Error(j.error || "Zoho non collegato"); }
    if (!r.ok || (j.status && j.status.code >= 400)) throw new Error(j.status?.description || j.error || "Caricamento non riuscito");
    const d = [].concat(j.data || [])[0];
    if (!d?.attachmentPath) throw new Error("Risposta di Zoho non valida");
    return { storeName: d.storeName, attachmentName: d.attachmentName || f.name, attachmentPath: d.attachmentPath };
  };
  $("#c-attach").onclick = () => $("#c-file").click();
  $("#c-file").onchange = async e => {
    const files = [...e.target.files]; e.target.value = "";
    for (const f of files) {
      const it = { name: f.name, size: f.size, busy: true }; ATT.push(it); drawAtts(); dirty = true;
      try { Object.assign(it, await upload(f), { busy: false }); } catch (err) { ATT.splice(ATT.indexOf(it), 1); fail(err); }
      drawAtts();
    }
  };
  $("#c-atts").onclick = e => { const b = e.target.closest("button[data-i]"); if (b) { ATT.splice(+b.dataset.i, 1); drawAtts(); } };

  $("#composer").onsubmit = async e => {
    e.preventDefault();
    if (ATT.some(a => a.busy)) return Portal.toast("Attendi la fine del caricamento degli allegati");
    const btn = $("#c-send"); btn.disabled = true;
    const html = ed.innerHTML.replace(/ data-(sig|quote)=""/g, "");
    const b = { fromAddress: $("#c-from").value, toAddress: $("#c-to").value.trim(), subject: $("#c-sub").value, mailFormat: "html",
      content: `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px">${html}</div>` };
    if ($("#c-cc").value.trim()) b.ccAddress = $("#c-cc").value.trim();
    if ($("#c-bcc").value.trim()) b.bccAddress = $("#c-bcc").value.trim();
    if (ATT.length) b.attachments = ATT.map(a => ({ storeName: a.storeName, attachmentName: a.attachmentName, attachmentPath: a.attachmentPath }));
    try { await mail("/messages", { method: "POST", body: JSON.stringify(b) }); draftSet(null); Portal.toast("Messaggio inviato"); home(); }
    catch (err) { fail(err); }
    btn.disabled = false;
  };

  /* ---- Rispondi, rispondi a tutti, inoltra ---- */
  const when = m => new Date(msOf(m)).toLocaleString("it-IT");
  const reply = all => {
    const m = S.cur; if (!m) return;
    const to = emails(m.toAddress), cc = emails(m.ccAddress), from = emails(m.fromAddress);
    let rto = all ? [...new Set([...from, ...to].filter(a => !mine(a)))] : from;
    if (!rto.length) rto = from;
    const rcc = all ? [...new Set(cc.filter(a => !mine(a)))] : [];
    const sub = dec(m.subject);
    compose({ to: rto.join(", "), cc: rcc.join(", "), sub: /^re:/i.test(sub) ? sub : `Re: ${sub}`, head: `Il ${when(m)}, ${dec(m.sender || m.fromAddress)} ha scritto:`, quote: textOf(), from: to.concat(cc).find(mine) });
  };
  const forward = () => {
    const m = S.cur; if (!m) return;
    const sub = dec(m.subject);
    compose({ sub: /^(inol|fwd?):/i.test(sub) ? sub : `Inol: ${sub}`, from: emails(m.toAddress).find(mine),
      head: `---------- Messaggio inoltrato ----------\nDa: ${dec(m.sender || "")} <${dec(m.fromAddress)}>\nData: ${when(m)}\nOggetto: ${sub}\nA: ${dec(m.toAddress || "")}`, quote: textOf() });
    if (S.atts.length) Portal.toast("Gli allegati originali non vengono inoltrati: allegali di nuovo se servono");
  };

  /* ---- Azioni sul messaggio ---- */
  const gone = async msg => { S.cur = null; $("#reader").innerHTML = EMPTY; show("reader"); Portal.toast(msg); await Promise.all([loadFolders(), loadList()]); };
  const del = async () => {
    const m = S.cur; if (!m || !confirm("Eliminare il messaggio? Se è già nel cestino sarà cancellato per sempre.")) return;
    try { await mail(`/folders/${S.curFid}/messages/${m.messageId}`, { method: "DELETE" }); await gone("Messaggio eliminato"); } catch (err) { fail(err); }
  };
  const step = d => {
    const i = S.items.findIndex(x => x.messageId === S.cur?.messageId), n = S.items[i + d] || (i < 0 ? S.items[0] : null);
    if (n) { open(n.messageId); $(`#msgs button[data-mid="${n.messageId}"]`)?.scrollIntoView({ block: "nearest" }); }
  };

  /* ---- Impostazioni ---- */
  let draft = {}, prev = "*";
  const openSettings = () => {
    if (!leave()) return;
    draft = { ...SET.sigs }; prev = "*";
    $("#s-addr").innerHTML = `<option value="*">Tutti gli indirizzi</option>` + S.addrs.map(a => `<option value="${esc(a.addr.toLowerCase())}">${esc(a.addr)}${a.alias ? " (alias)" : ""}</option>`).join("");
    $("#s-sig").value = draft["*"] || "";
    $("#s-from").innerHTML = S.addrs.map(a => `<option value="${esc(a.addr)}">${esc(a.addr)}</option>`).join("");
    $("#s-from").value = SET.from && S.addrs.some(a => a.addr === SET.from) ? SET.from : S.me;
    $("#s-sound").checked = !!SET.sound;
    dirty = false; show("settings"); pushDraw();
  };
  const keepDraft = () => { const v = $("#s-sig").value.trim(); if (v) draft[prev] = v; else delete draft[prev]; };
  $("#s-addr").onchange = () => { keepDraft(); prev = $("#s-addr").value; $("#s-sig").value = draft[prev] || ""; };
  $("#settings").onsubmit = async e => { e.preventDefault(); keepDraft(); SET.sigs = draft; SET.from = $("#s-from").value; SET.sound = $("#s-sound").checked; await saveSettings(); home(); };
  $("#s-close").onclick = home;
  $("#s-sound-test").onclick = () => chime(true);
  $("#s-push").onclick = () => pushToggle().catch(fail);
  $("#s-push-test").onclick = () => post("/api/push/test").then(r => Portal.toast(r.sent ? "Notifica inviata" : "Nessun dispositivo iscritto")).catch(fail);

  /* ---- Esci ---- */
  // «Esci» è gestito da core.js: qui basta fermare i controlli periodici.
  $("#logout")?.addEventListener("click", () => { S.out = true; });

  /* ---- Eventi ---- */
  $$("[data-new]").forEach(b => b.onclick = () => compose());
  $("#b-set").onclick = openSettings;
  $("#folders").onclick = e => {
    const b = e.target.closest("button[data-id]"); if (!b || !leave()) return;
    S.fid = b.dataset.id; S.q = ""; $("#q").value = ""; S.cur = null; dirty = false;
    $("#reader").innerHTML = EMPTY; show("reader"); drawFolders(); loadList().catch(fail);
  };
  $("#msgs").onclick = e => { const b = e.target.closest("button[data-mid]"); if (b) open(b.dataset.mid); };
  $("#more").onclick = () => { S.start += LIMIT; loadList(true).catch(fail); };
  $("#refresh").onclick = () => Promise.all([loadFolders(), loadList()]).catch(fail);
  let tq; $("#q").oninput = e => { clearTimeout(tq); tq = setTimeout(() => { S.q = e.target.value.trim(); loadList().catch(fail); }, 450); };
  $("#reader").onclick = async e => {
    const act = e.target.closest("[data-act]")?.dataset.act, m = S.cur; if (!act || !m) return;
    try {
      if (act === "back") { S.cur = null; $("#reader").innerHTML = EMPTY; show("reader"); $$("#msgs button.on").forEach(b => b.classList.remove("on")); }
      if (act === "reply") reply(false);
      if (act === "all") reply(true);
      if (act === "fwd") forward();
      if (act === "del") await del();
      if (act === "img") { $("#reader iframe").srcdoc = frameDoc(S.html, true); $("#remote-note")?.remove(); }
      if (act === "unread") { S.known.add(String(m.messageId)); await upd({ mode: "markAsUnread", messageId: [String(m.messageId)] }); Portal.toast("Segnato da leggere"); await Promise.all([loadFolders(), loadList()]); }
      if (act === "spam") { await upd({ mode: "moveToSpam", messageId: [String(m.messageId)], folderId: String(S.curFid) }); await gone("Spostato in Spam"); }
    } catch (err) { fail(err); }
  };
  $("#reader").onchange = async e => {
    if (e.target.dataset.sel !== "move" || !e.target.value || !S.cur) return;
    const dest = S.folders.find(f => f.folderId === e.target.value);
    try { await upd({ mode: "moveMessage", messageId: [String(S.cur.messageId)], folderId: String(S.curFid), destfolderId: e.target.value }); await gone(`Spostato in ${dest ? dec(label(dest)) : "cartella"}`); } catch (err) { fail(err); }
  };
  $("#disconnect").onclick = async () => { if (!confirm("Scollegare Zoho da questo portale?")) return; await post("/api/zoho/disconnect"); location.href = "/posta/"; };
  $("#code-form").onsubmit = async e => {
    e.preventDefault();
    const r = await post("/api/zoho/code", { code: $("#code").value });
    if (r.ok) location.href = "/posta/?collegato=1"; else Portal.toast(r.error || "Codice non valido");
  };
  // Scorciatoie da tastiera (solo se non stai scrivendo)
  addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey || $("#mail").hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); compose(); }
    else if (k === "/") { e.preventDefault(); $("#q").focus(); }
    else if (k === "j") step(1);
    else if (k === "k") step(-1);
    else if (S.cur && k === "r") reply(false);
    else if (S.cur && k === "a") reply(true);
    else if (S.cur && (k === "delete" || k === "backspace")) del();
  });

  function showConnect(msg) {
    $("#mail").hidden = true; $("#connect").hidden = false;
    if (msg) $("#connect-msg").textContent = msg;
    sync("Non collegato", false);
  }

  /* ---- Avvio ---- */
  $("#reader").innerHTML = EMPTY;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", e => { if (e.data?.type === "refresh") checkNew().catch(() => {}); });
  }
  const p = new URLSearchParams(location.search);
  const st = await api("status").catch(() => null);
  if (!st) return showConnect("Non riesco a contattare il server. In locale usa «npx netlify dev».");
  if (!st.configured) {
    $("#connect-actions").hidden = true;
    return showConnect("Mancano ZOHO_CLIENT_ID e ZOHO_CLIENT_SECRET nelle variabili d'ambiente di Netlify (vedi README).");
  }
  if (!st.connected) {
    return showConnect(p.get("errore")
      ? `Zoho ha risposto: ${p.get("errore")}. Controlla che in Zoho API Console l'URI di reindirizzamento sia esattamente ${st.redirect}`
      : `Autorizza il portale a leggere e inviare posta. URI di reindirizzamento da registrare in Zoho: ${st.redirect}`);
  }
  try {
    const a = await api("mail/accounts");
    const ac0 = a.data?.[0]; if (!ac0) throw new Error("Nessun account Zoho Mail trovato");
    S.acc = ac0.accountId;
    S.me = ac0.primaryEmailAddress || ac0.emailAddress?.find(e => e.isPrimary)?.mailId || ac0.emailAddress?.[0]?.mailId || ac0.mailboxAddress || "";
    // indirizzi da cui puoi scrivere: principale, alias e indirizzi di invio attivi
    const seen = new Set(), add = addr => { const k = String(addr || "").toLowerCase(); if (k && !seen.has(k)) { seen.add(k); S.addrs.push({ addr, alias: k !== S.me.toLowerCase() }); } };
    add(S.me); (ac0.emailAddress || []).forEach(e => add(e.mailId)); (ac0.sendMailDetails || []).forEach(d => d.status !== false && add(d.fromAddress));
    $("#mail").hidden = false; $("#connect").hidden = true;
    await loadSettings();
    await loadFolders(); await loadList(); await checkNew(true);
    setInterval(() => checkNew().catch(() => {}), 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNew().catch(() => {}); });
  } catch (e) { if ($("#mail").hidden) showConnect(e.message); else fail(e); sync("Errore", false); }
})();
