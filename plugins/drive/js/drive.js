/* Drive a canvas · Jones House
 * Lavagna infinita (pan/zoom) in cui file e "cartelle" (frame) si dispongono liberamente.
 * I file restano nel browser (IndexedDB) di chi usa la pagina.
 */
(() => {
  'use strict';

  // ---- Configurazione -------------------------------------------------------
  // Limite personale del drive in byte. 0 = usa la quota offerta dal browser.
  // Esempio: 500 * 1024 * 1024 per un drive da 500 MB.
  const LIMIT_BYTES = 5;
  const CARD_W = 150, CARD_H = 150;
  const MIN_Z = 0.1, MAX_Z = 4;
  const DB_NAME = 'joneshouse-drive';
  const VIEW_KEY = 'joneshouse-drive-view';

  // ---- Utilità --------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const viewport = $('#viewport'), world = $('#world');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function fmt(b) {
    if (b < 1024) return b + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return b.toLocaleString('it-IT', { maximumFractionDigits: b < 10 ? 2 : 1 }) + ' ' + u[i];
  }
  const ext = (n) => { const m = /\.([^.]+)$/.exec(n); return m ? m[1].slice(0, 4).toUpperCase() : 'FILE'; };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---- Database -------------------------------------------------------------
  let db;
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('items', { keyPath: 'id' });
        r.result.createObjectStore('blobs', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(stores, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transazione annullata'));
    });
  }
  const getAll = () => new Promise((res, rej) => {
    const r = db.transaction('items').objectStore('items').getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const getBlob = (id) => new Promise((res, rej) => {
    const r = db.transaction('blobs').objectStore('blobs').get(id);
    r.onsuccess = () => res(r.result && r.result.blob);
    r.onerror = () => rej(r.error);
  });
  const saveItem = (it) => tx('items', 'readwrite', (t) => t.objectStore('items').put(it))
    .catch(() => toast('Impossibile salvare le modifiche'));

  // ---- Stato e vista --------------------------------------------------------
  const items = new Map();   // id -> dati
  const els = new Map();     // id -> elemento DOM
  const view = { x: 0, y: 0, z: 1 };
  let selected = null;

  function applyView() {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
    const s = 24 * view.z;
    viewport.style.backgroundSize = `${s}px ${s}px`;
    viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
    $('#z-level').textContent = Math.round(view.z * 100) + '%';
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) {}
  }
  function zoomAt(sx, sy, nz) {
    nz = clamp(nz, MIN_Z, MAX_Z);
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
    view.z = nz;
    view.x = sx - wx * nz;
    view.y = sy - wy * nz;
    applyView();
  }
  const rectOf = () => viewport.getBoundingClientRect();
  function toWorld(cx, cy) {
    const r = rectOf();
    return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
  }
  function centerWorld() {
    const r = rectOf();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }
  function fitAll() {
    const list = [...items.values()];
    if (!list.length) { view.x = 40; view.y = 40; view.z = 1; applyView(); return; }
    const x1 = Math.min(...list.map((i) => i.x)), y1 = Math.min(...list.map((i) => i.y - (i.kind === 'frame' ? 30 : 0)));
    const x2 = Math.max(...list.map((i) => i.x + i.w)), y2 = Math.max(...list.map((i) => i.y + i.h));
    const r = rectOf(), pad = 60;
    const z = clamp(Math.min((r.width - pad * 2) / (x2 - x1), (r.height - pad * 2) / (y2 - y1)), MIN_Z, 1.5);
    view.z = z;
    view.x = (r.width - (x2 - x1) * z) / 2 - x1 * z;
    view.y = (r.height - (y2 - y1) * z) / 2 - y1 * z;
    applyView();
  }

  // ---- Rendering elementi ---------------------------------------------------
  const thumbURLs = new Map();
  function place(el, it) {
    el.style.left = it.x + 'px';
    el.style.top = it.y + 'px';
    el.style.width = it.w + 'px';
    el.style.height = it.h + 'px';
  }
  function makeEl(it) {
    const el = document.createElement('div');
    el.className = 'item ' + it.kind;
    el.dataset.id = it.id;
    if (it.kind === 'frame') {
      const t = document.createElement('div'); t.className = 'frame-title'; t.textContent = it.name;
      const h = document.createElement('div'); h.className = 'resize';
      el.append(t, h);
    } else {
      const th = document.createElement('div'); th.className = 'thumb';
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = ext(it.name);
      th.append(b);
      const n = document.createElement('div'); n.className = 'fname'; n.textContent = it.name; n.title = it.name;
      const m = document.createElement('div'); m.className = 'fmeta'; m.textContent = fmt(it.size);
      el.append(th, n, m);
      if ((it.mime || '').startsWith('image/')) {
        getBlob(it.id).then((blob) => {
          if (!blob || !els.has(it.id)) return;
          const url = URL.createObjectURL(blob);
          thumbURLs.set(it.id, url);
          const img = new Image();
          img.alt = '';
          img.draggable = false;
          img.onload = () => { th.textContent = ''; th.append(img); };
          img.src = url;
        }).catch(() => {});
      }
    }
    place(el, it);
    world.append(el);
    els.set(it.id, el);
    updateEmpty();
  }
  function updateEmpty() { $('#empty-hint').hidden = items.size > 0; }

  function select(id) {
    if (selected && els.get(selected)) els.get(selected).classList.remove('selected');
    selected = id && items.has(id) ? id : null;
    if (selected) els.get(selected).classList.add('selected');
    const it = selected && items.get(selected);
    $('#btn-open').disabled = !(it && it.kind === 'file');
    $('#btn-download').disabled = !(it && it.kind === 'file');
    $('#btn-rename').disabled = !it;
    $('#btn-delete').disabled = !it;
  }

  // ---- Spazio disponibile ---------------------------------------------------
  async function storageInfo() {
    const mine = [...items.values()].reduce((a, i) => a + (i.size || 0), 0);
    let usage = 0, quota = 0;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        usage = e.usage || 0; quota = e.quota || 0;
      }
    } catch (_) {}
    if (LIMIT_BYTES > 0) return { mine, other: 0, total: LIMIT_BYTES, free: Math.max(0, LIMIT_BYTES - mine) };
    if (!quota) return { mine, other: 0, total: 0, free: 0 };
    usage = Math.max(usage, mine);   // la stima del browser può essere in ritardo
    const other = usage - mine;
    return { mine, other, total: quota, free: Math.max(0, quota - usage) };
  }
  async function refreshStorage() {
    const s = await storageInfo();
    if (!s.total) {
      $('#s-main').textContent = fmt(s.mine) + ' usati (limite non rilevabile dal browser)';
      $('#s-pct').textContent = '–';
      $('#l-mine').textContent = fmt(s.mine);
      $('#l-other').textContent = '–'; $('#l-free').textContent = '–';
      $('#seg-mine').style.width = '0'; $('#seg-other').style.width = '0';
      return;
    }
    const used = s.mine + s.other;
    const pct = (used / s.total) * 100;
    const pMine = (s.mine / s.total) * 100, pOther = (s.other / s.total) * 100;
    $('#seg-mine').style.width = (s.mine > 0 ? Math.max(pMine, 1.2) : 0) + '%';
    $('#seg-other').style.width = pOther + '%';
    $('#s-pct').textContent = pct.toLocaleString('it-IT', { maximumFractionDigits: pct < 10 ? 2 : 1 }) + '% usato';
    $('#s-main').textContent = `${fmt(used)} usati su ${fmt(s.total)}`;
    $('#l-mine').textContent = fmt(s.mine);
    $('#l-other').textContent = fmt(s.other);
    $('#l-free').textContent = fmt(s.free);
    $('.bar').setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  // ---- Aggiunta / modifica / eliminazione -----------------------------------
  async function addFiles(files, at) {
    const list = [...files].filter((f) => f && f.name);
    if (!list.length) return;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    const info = await storageInfo();
    let free = info.total ? info.free : Infinity;
    let i = 0, added = 0;
    for (const f of list) {
      if (f.size > free) { toast(`Spazio insufficiente per “${f.name}”`); continue; }
      const id = uid();
      const it = {
        id, kind: 'file', name: f.name, size: f.size, mime: f.type || '',
        x: Math.round(at.x + (i % 4) * (CARD_W + 20)),
        y: Math.round(at.y + Math.floor(i / 4) * (CARD_H + 20)),
        w: CARD_W, h: CARD_H
      };
      try {
        await tx(['items', 'blobs'], 'readwrite', (t) => {
          t.objectStore('items').put(it);
          t.objectStore('blobs').put({ id, blob: f });
        });
      } catch (err) {
        toast(`Non riesco a salvare “${f.name}” (spazio esaurito?)`);
        continue;
      }
      free -= f.size; i++; added++;
      items.set(id, it); makeEl(it);
    }
    if (added) { select(null); refreshStorage(); }
  }

  function addFrame() {
    const c = centerWorld();
    const it = { id: uid(), kind: 'frame', name: 'Nuova cartella', size: 0, x: Math.round(c.x - 250), y: Math.round(c.y - 180), w: 500, h: 360 };
    items.set(it.id, it); makeEl(it); saveItem(it); select(it.id);
  }

  function renameSelected() {
    const it = items.get(selected); if (!it) return;
    const n = prompt('Nuovo nome:', it.name);
    if (n === null || !n.trim()) return;
    it.name = n.trim().slice(0, 120);
    const el = els.get(it.id);
    if (it.kind === 'frame') el.querySelector('.frame-title').textContent = it.name;
    else { const f = el.querySelector('.fname'); f.textContent = it.name; f.title = it.name; el.querySelector('.badge') && (el.querySelector('.badge').textContent = ext(it.name)); }
    saveItem(it);
  }

  async function deleteSelected() {
    const it = items.get(selected); if (!it) return;
    if (it.kind === 'file' && !confirm(`Eliminare “${it.name}”?`)) return;
    try {
      await tx(['items', 'blobs'], 'readwrite', (t) => {
        t.objectStore('items').delete(it.id);
        t.objectStore('blobs').delete(it.id);
      });
    } catch (_) { toast('Eliminazione non riuscita'); return; }
    els.get(it.id).remove(); els.delete(it.id); items.delete(it.id);
    const u = thumbURLs.get(it.id); if (u) { URL.revokeObjectURL(u); thumbURLs.delete(it.id); }
    select(null); updateEmpty(); refreshStorage();
  }

  async function downloadItem(it) {
    const blob = await getBlob(it.id);
    if (!blob) { toast('File non trovato'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = it.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---- Anteprima ------------------------------------------------------------
  let modalURL = null, modalItem = null;
  async function openItem(it) {
    if (!it || it.kind !== 'file') return;
    const blob = await getBlob(it.id);
    if (!blob) { toast('File non trovato'); return; }
    closeModal();
    modalItem = it;
    modalURL = URL.createObjectURL(blob);
    $('#modal-title').textContent = it.name;
    const body = $('#modal-body'); body.textContent = '';
    const m = it.mime || '';
    let node;
    if (m.startsWith('image/')) { node = new Image(); node.alt = it.name; node.src = modalURL; }
    else if (m.startsWith('video/')) { node = document.createElement('video'); node.controls = true; node.src = modalURL; }
    else if (m.startsWith('audio/')) { node = document.createElement('audio'); node.controls = true; node.src = modalURL; }
    else if (m === 'application/pdf' || m.startsWith('text/')) { node = document.createElement('iframe'); node.src = modalURL; node.title = it.name; }
    else { node = document.createElement('p'); node.textContent = 'Anteprima non disponibile per questo tipo di file. Usa “Scarica”.'; }
    body.append(node);
    $('#modal').hidden = false;
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modal-body').textContent = '';
    if (modalURL) { URL.revokeObjectURL(modalURL); modalURL = null; }
    modalItem = null;
  }

  // ---- Interazione: pan, zoom, drag, resize ---------------------------------
  const pointers = new Map();
  let drag = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 1) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {           // pinch
      const [a, b] = [...pointers.values()];
      drag = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.size > 2) return;

    const handle = e.target.closest('.resize');
    const el = e.target.closest('.item');
    if (handle && el) {
      const it = items.get(el.dataset.id);
      select(it.id);
      drag = { type: 'resize', it, sx: e.clientX, sy: e.clientY, w: it.w, h: it.h };
    } else if (el) {
      const it = items.get(el.dataset.id);
      select(it.id);
      const moved = [it];
      if (it.kind === 'frame') {         // muove anche le schede contenute
        for (const o of items.values()) {
          if (o.kind !== 'file') continue;
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          if (cx >= it.x && cx <= it.x + it.w && cy >= it.y && cy <= it.y + it.h) moved.push(o);
        }
      }
      drag = { type: 'move', moved: moved.map((o) => ({ o, x: o.x, y: o.y })), sx: e.clientX, sy: e.clientY, changed: false };
    } else {
      select(null);
      viewport.classList.add('panning');
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = rectOf();
      view.x += mx - drag.mx; view.y += my - drag.my;
      zoomAt(mx - r.left, my - r.top, view.z * (dist / drag.dist));
      drag.dist = dist; drag.mx = mx; drag.my = my;
    } else if (drag.type === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      applyView();
    } else if (drag.type === 'move') {
      const dx = (e.clientX - drag.sx) / view.z, dy = (e.clientY - drag.sy) / view.z;
      if (!drag.changed && Math.hypot(dx, dy) * view.z < 3) return;
      drag.changed = true;
      for (const m of drag.moved) {
        m.o.x = Math.round(m.x + dx); m.o.y = Math.round(m.y + dy);
        place(els.get(m.o.id), m.o);
      }
    } else if (drag.type === 'resize') {
      drag.it.w = Math.max(160, Math.round(drag.w + (e.clientX - drag.sx) / view.z));
      drag.it.h = Math.max(120, Math.round(drag.h + (e.clientY - drag.sy) / view.z));
      place(els.get(drag.it.id), drag.it);
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.type === 'pinch') { if (pointers.size < 2) drag = null; return; }
    if (drag.type === 'move' && drag.changed) drag.moved.forEach((m) => saveItem(m.o));
    if (drag.type === 'resize') saveItem(drag.it);
    viewport.classList.remove('panning');
    drag = null;
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('dblclick', (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);   // il pointer capture sposta e.target sul viewport
    const el = hit && hit.closest('.item');
    if (!el) return;
    if (el.classList.contains('file')) openItem(items.get(el.dataset.id));
    else { select(el.dataset.id); renameSelected(); }
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = rectOf();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * Math.exp(-e.deltaY * 0.01));
    } else {
      view.x -= e.deltaX; view.y -= e.deltaY; applyView();
    }
  }, { passive: false });

  // ---- Drag & drop di file dal computer -------------------------------------
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('#dropmask').classList.add('on'); } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropmask').classList.remove('on'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; $('#dropmask').classList.remove('on');
    const p = toWorld(e.clientX, e.clientY);
    addFiles(e.dataTransfer.files, { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 });
  });

  // ---- Pulsanti e tastiera --------------------------------------------------
  const fileInput = $('#file-input');
  $('#btn-upload').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const c = centerWorld();
    addFiles(fileInput.files, { x: c.x - CARD_W / 2, y: c.y - CARD_H / 2 });
    fileInput.value = '';
  };
  $('#btn-frame').onclick = addFrame;
  $('#btn-open').onclick = () => openItem(items.get(selected));
  $('#btn-rename').onclick = renameSelected;
  $('#btn-download').onclick = () => { const it = items.get(selected); if (it) downloadItem(it); };
  $('#btn-delete').onclick = deleteSelected;
  $('#z-in').onclick = () => { const r = rectOf(); zoomAt(r.width / 2, r.height / 2, view.z * 1.25); };
  $('#z-out').onclick = () => { const r = rectOf(); zoomAt(r.width / 2, r.height / 2, view.z / 1.25); };
  $('#z-level').onclick = () => { const r = rectOf(); zoomAt(r.width / 2, r.height / 2, 1); };
  $('#z-fit').onclick = fitAll;
  $('#modal-close').onclick = closeModal;
  $('#modal-dl').onclick = () => modalItem && downloadItem(modalItem);
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else select(null); return; }
    if (e.target.closest('input,textarea') || !$('#modal').hidden) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'F2' && selected) { e.preventDefault(); renameSelected(); }
    else if (e.key === 'Enter' && selected) openItem(items.get(selected));
    else if (e.key === '+' || e.key === '=') $('#z-in').click();
    else if (e.key === '-') $('#z-out').click();
    else if (e.key === '0') $('#z-level').click();
    else if (e.key === '1') fitAll();
  });
  window.addEventListener('resize', applyView);

  // ---- Avvio ----------------------------------------------------------------
  (async () => {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z)) { view.x = v.x; view.y = v.y; view.z = clamp(v.z, MIN_Z, MAX_Z); }
      else { view.x = 40; view.y = 60; }
    } catch (_) { view.x = 40; view.y = 60; }
    applyView();
    try {
      db = await openDB();
      const all = await getAll();
      // frame sotto, file sopra
      all.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'frame' ? -1 : 1));
      for (const it of all) { items.set(it.id, it); makeEl(it); }
    } catch (err) {
      toast('Archiviazione del browser non disponibile: il drive non può salvare i file');
    }
    updateEmpty();
    select(null);
    refreshStorage();
  })();
})();
