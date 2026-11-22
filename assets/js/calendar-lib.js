/* Jones Calendar · logica pura (date, ripetizioni, festività, ICS). Nessun accesso al DOM: si può provare anche con node. */
(function (g) {
  "use strict";

  const pad = n => String(n).padStart(2, "0");
  const D = s => new Date(s + "T12:00:00"); // a mezzogiorno: l'ora legale non sposta mai il giorno
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const weekStart = s => addDays(s, -((D(s).getDay() + 6) % 7)); // la settimana inizia di lunedì
  const minutes = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };

  /* ---------- Festività italiane ---------- */
  function pasqua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), gg = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - gg + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return `${y}-${pad(mese)}-${pad(giorno)}`;
  }
  const cacheFest = {};
  function festivitaAnno(y) {
    if (cacheFest[y]) return cacheFest[y];
    const p = pasqua(y);
    return (cacheFest[y] = {
      [`${y}-01-01`]: "Capodanno", [`${y}-01-06`]: "Epifania", [p]: "Pasqua", [addDays(p, 1)]: "Lunedì dell'Angelo",
      [`${y}-04-25`]: "Festa della Liberazione", [`${y}-05-01`]: "Festa dei lavoratori", [`${y}-06-02`]: "Festa della Repubblica",
      [`${y}-08-15`]: "Ferragosto", [`${y}-11-01`]: "Ognissanti", [`${y}-12-08`]: "Immacolata Concezione",
      [`${y}-12-25`]: "Natale", [`${y}-12-26`]: "Santo Stefano"
    });
  }
  function festivita(from, to) {
    const out = {};
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) Object.assign(out, festivitaAnno(y));
    return out;
  }

  /* ---------- Ripetizioni ---------- */
  // Evento: { id, titolo, data, dataFine, tutto, inizio, fine, luogo, note, colore, ripeti, fineRipeti, eccezioni[] }
  // Restituisce le occorrenze che toccano l'intervallo [from, to]: { ev, data, fine } (fine = ultimo giorno)
  function occorrenze(ev, from, to) {
    const dur = ev.dataFine && ev.dataFine > ev.data ? diffDays(ev.data, ev.dataFine) : 0;
    const salta = new Set(ev.eccezioni || []);
    const out = [];
    const push = s => { if (!salta.has(s) && s <= to && addDays(s, dur) >= from) out.push({ ev, data: s, fine: addDays(s, dur) }); };
    const rip = ev.ripeti || "no";
    if (rip === "no") { push(ev.data); return out; }
    const limite = ev.fineRipeti && ev.fineRipeti < to ? ev.fineRipeti : to;
    if (rip === "giornaliera" || rip === "settimanale") {
      const passo = rip === "giornaliera" ? 1 : 7;
      let s = ev.data;
      if (s < from) s = addDays(s, Math.max(0, Math.floor((diffDays(s, from) - dur) / passo)) * passo);
      for (; s <= limite; s = addDays(s, passo)) push(s);
    } else {
      const base = D(ev.data), y0 = base.getFullYear(), m0 = base.getMonth(), gg = base.getDate();
      const passoMesi = rip === "mensile" ? 1 : 12;
      for (let k = 0; k < 5000; k++) {
        const tot = m0 + k * passoMesi, y = y0 + Math.floor(tot / 12), m = tot % 12;
        const ultimo = new Date(y, m + 1, 0).getDate(); // il 31 in un mese corto cade nell'ultimo giorno
        const s = iso(new Date(y, m, Math.min(gg, ultimo), 12));
        if (s > limite) break;
        push(s);
      }
    }
    return out;
  }

  const giornaliero = o => !!o.ev.tutto || o.fine > o.data; // va nella riga «tutto il giorno»
  const ordina = (a, b) =>
    (giornaliero(b) - giornaliero(a)) || String(a.ev.inizio || "").localeCompare(String(b.ev.inizio || "")) || String(a.ev.titolo).localeCompare(String(b.ev.titolo), "it");

  // Mappa giorno -> occorrenze ordinate, per ogni giorno tra from e to
  function perGiorno(eventi, from, to) {
    const map = {};
    for (const ev of eventi) for (const o of occorrenze(ev, from, to)) {
      const a = o.data < from ? from : o.data, b = o.fine > to ? to : o.fine;
      for (let d = a; d <= b; d = addDays(d, 1)) (map[d] ||= []).push(o);
    }
    for (const k in map) map[k].sort(ordina);
    return map;
  }

  /* ---------- ICS ---------- */
  const escICS = s => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const unescICS = s => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
  const fold = line => { const o = []; let l = line; while (l.length > 74) { o.push(l.slice(0, 74)); l = " " + l.slice(74); } o.push(l); return o.join("\r\n"); };
  const d8 = s => s.replace(/-/g, "");
  const dt = (s, t) => `${d8(s)}T${String(t || "00:00").replace(":", "")}00`;
  const FREQ = { giornaliera: "DAILY", settimanale: "WEEKLY", mensile: "MONTHLY", annuale: "YEARLY" };
  const FREQ_INV = { DAILY: "giornaliera", WEEKLY: "settimanale", MONTHLY: "mensile", YEARLY: "annuale" };

  function inICS(eventi, nome = "Jones Calendar") {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jones House//Calendario//IT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + escICS(nome)];
    for (const ev of eventi) {
      const tutto = ev.tutto || !ev.inizio, fineGiorno = ev.dataFine && ev.dataFine > ev.data ? ev.dataFine : ev.data;
      L.push("BEGIN:VEVENT", `UID:${ev.uid || ev.id + "@calendar.joneshouse.it"}`, `DTSTAMP:${stamp}`);
      if (tutto) { L.push(`DTSTART;VALUE=DATE:${d8(ev.data)}`, `DTEND;VALUE=DATE:${d8(addDays(fineGiorno, 1))}`); }
      else { L.push(`DTSTART:${dt(ev.data, ev.inizio)}`, `DTEND:${dt(fineGiorno, ev.fine || ev.inizio)}`); }
      L.push("SUMMARY:" + escICS(ev.titolo));
      if (ev.luogo) L.push("LOCATION:" + escICS(ev.luogo));
      if (ev.note) L.push("DESCRIPTION:" + escICS(ev.note));
      if (FREQ[ev.ripeti]) {
        let r = "RRULE:FREQ=" + FREQ[ev.ripeti];
        if (ev.fineRipeti) r += ";UNTIL=" + (tutto ? d8(ev.fineRipeti) : d8(ev.fineRipeti) + "T235959");
        L.push(r);
      }
      for (const x of ev.eccezioni || []) L.push(tutto ? `EXDATE;VALUE=DATE:${d8(x)}` : `EXDATE:${dt(x, ev.inizio)}`);
      L.push("END:VEVENT");
    }
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  function leggiData(v) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v).trim());
    if (!m) return null;
    if (!m[4]) return { data: `${m[1]}-${m[2]}-${m[3]}`, tutto: true };
    if (m[7]) { // UTC: la porto all'ora locale
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return { data: iso(d), ora: `${pad(d.getHours())}:${pad(d.getMinutes())}`, tutto: false };
    }
    return { data: `${m[1]}-${m[2]}-${m[3]}`, ora: `${m[4]}:${m[5]}`, tutto: false };
  }

  // Restituisce { eventi, approssimati }: approssimati = eventi con regole di ripetizione che il calendario non supporta fino in fondo
  function daICS(testo) {
    const righe = String(testo).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const eventi = []; let approssimati = 0, cur = null, allarme = false;
    const prima = (n) => cur.find(p => p.nome === n);
    for (const riga of righe) {
      if (riga === "BEGIN:VEVENT") { cur = []; allarme = false; continue; }
      if (riga === "END:VEVENT") {
        if (cur) {
          const s = prima("DTSTART"), a = s && leggiData(s.val);
          if (a) {
            const e = prima("DTEND"), b = e && leggiData(e.val);
            const ev = { titolo: unescICS((prima("SUMMARY") || {}).val) || "(senza titolo)", data: a.data, dataFine: "", tutto: a.tutto, inizio: a.tutto ? "" : a.ora, fine: "", luogo: unescICS((prima("LOCATION") || {}).val), note: unescICS((prima("DESCRIPTION") || {}).val), colore: "navy", ripeti: "no", fineRipeti: "", eccezioni: [] };
            const uid = prima("UID"); if (uid) ev.uid = uid.val;
            if (b) {
              if (a.tutto) { const u = addDays(b.data, -1); if (u > a.data) ev.dataFine = u; }
              else { if (b.data > a.data) ev.dataFine = b.data; ev.fine = b.ora || ""; }
            }
            const rr = prima("RRULE");
            if (rr) {
              const p = Object.fromEntries(rr.val.split(";").map(x => x.split("=")));
              if (FREQ_INV[p.FREQ]) {
                ev.ripeti = FREQ_INV[p.FREQ];
                if (p.UNTIL) { const u = leggiData(p.UNTIL); if (u) ev.fineRipeti = u.data; }
                if ((p.INTERVAL && p.INTERVAL !== "1") || p.COUNT || p.BYDAY || p.BYMONTHDAY || p.BYSETPOS) approssimati++;
              } else approssimati++;
            }
            for (const x of cur.filter(p => p.nome === "EXDATE")) for (const v of x.val.split(",")) { const d = leggiData(v); if (d) ev.eccezioni.push(d.data); }
            eventi.push(ev);
          }
        }
        cur = null; continue;
      }
      if (!cur) continue;
      if (riga === "BEGIN:VALARM") { allarme = true; continue; }
      if (riga === "END:VALARM") { allarme = false; continue; }
      if (allarme) continue;
      const i = riga.indexOf(":"); if (i < 0) continue;
      const [nome, ...par] = riga.slice(0, i).split(";");
      cur.push({ nome: nome.toUpperCase(), par: par.join(";").toUpperCase(), val: riga.slice(i + 1) });
    }
    return { eventi, approssimati };
  }

  const lib = { pad, D, iso, addDays, diffDays, weekStart, minutes, pasqua, festivita, occorrenze, perGiorno, giornaliero, inICS, daICS };
  g.CalLib = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
