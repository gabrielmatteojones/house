// Presenze in rete: registrazioni di entrata e uscita (badge).
// Archivio: Netlify Blobs, store "presenze", un documento per mese (chiave "mese/AAAA-MM").
//
//  GET  /api/presenze?mese=AAAA-MM  protetto dalla password del portale  -> { registrazioni }
//  PUT  /api/presenze               protetto dalla password del portale  -> unisce { registrazioni }
//  POST /api/presenze-ingest        protetto dal token PRESENZE_TOKEN    -> come PUT, per il file offline
//                                   (CORS aperto: il file sta sul computer, non sul sito)
//
// Regole di unione: vince la versione con "modificato" più recente; le eliminazioni restano come
// "lapidi" così una copia vecchia, inviata in ritardo da un dispositivo offline, non le fa risorgere.
import { getStore } from "@netlify/blobs";

const MAX_BODY = 1_000_000;
const MAX_BATCH = 300;
const MESE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const GIORNO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const FONTI = ["web", "offline", "manuale"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

const reply = (body, status = 200, cors = false) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...(cors ? CORS : {}) } });

const env = k => (typeof Netlify !== "undefined" ? Netlify.env.get(k) : process.env[k]);

// Confronto a tempo costante (come in auth.js)
const same = (a, b) => {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
};

const dateOk = s => typeof s === "string" && s.length <= 40 && !Number.isNaN(Date.parse(s));
// La data del turno è quella di Roma al momento dell'entrata: decide il server, non il dispositivo.
const giornoRoma = iso => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

function pulisci(r) {
  if (!r || typeof r !== "object" || !ID.test(String(r.id ?? ""))) return { err: "id non valido" };
  const luogo = String(r.luogo ?? "").trim().slice(0, 80);
  if (!luogo) return { err: "luogo mancante" };
  if (!dateOk(r.entrata)) return { err: "entrata non valida" };
  const entrata = new Date(r.entrata).toISOString();
  if (entrata < "2020-01-01" || entrata > "2100-01-01") return { err: "entrata fuori intervallo" };
  let uscita = null;
  if (r.uscita) {
    if (!dateOk(r.uscita)) return { err: "uscita non valida" };
    uscita = new Date(r.uscita).toISOString();
    if (uscita < entrata) return { err: "uscita prima dell'entrata" };
  }
  const rec = {
    id: String(r.id),
    luogo,
    data: giornoRoma(entrata),
    entrata,
    uscita,
    note: String(r.note ?? "").slice(0, 500),
    fonte: FONTI.includes(r.fonte) ? r.fonte : "web",
    dispositivo: String(r.dispositivo ?? "").slice(0, 40),
    modificato: dateOk(r.modificato) ? new Date(r.modificato).toISOString() : new Date().toISOString(),
    eliminato: r.eliminato === true,
  };
  // Se il turno è stato spostato in un altro mese, il client indica da dove arriva
  const prec = typeof r.precedente === "string" && GIORNO.test(r.precedente) ? r.precedente.slice(0, 7) : null;
  return { rec, prec };
}

// Legge-modifica-scrive un mese; con scritture condizionali se la libreria le supporta.
async function aggiornaMese(store, mese, fn) {
  const key = `mese/${mese}`;
  for (let i = 0; i < 6; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const lista = Array.isArray(cur?.data) ? cur.data : [];
    const next = fn(lista);
    if (next === null) return;
    const res = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return;
  }
  throw new Error("Archivio occupato, riprova tra poco");
}

async function unisci(store, items) {
  const accettate = [], rifiutate = [];
  const perMese = new Map();   // mese -> registrazioni da scrivere
  const lapidi = new Map();    // mese -> lapidi per turni spostati altrove

  for (const raw of items.slice(0, MAX_BATCH)) {
    const { rec, prec, err } = pulisci(raw);
    if (err) { rifiutate.push({ id: String(raw?.id ?? "").slice(0, 64), motivo: err }); continue; }
    const mese = rec.data.slice(0, 7);
    if (!perMese.has(mese)) perMese.set(mese, []);
    perMese.get(mese).push(rec);
    if (prec && prec !== mese) {
      if (!lapidi.has(prec)) lapidi.set(prec, []);
      lapidi.get(prec).push({ ...rec, eliminato: true });
    }
    accettate.push(rec.id);
  }

  const applica = recs => lista => {
    const m = new Map(lista.map(x => [x.id, x]));
    let cambiato = false;
    for (const r of recs) {
      const old = m.get(r.id);
      if (old && old.modificato >= r.modificato) continue;
      m.set(r.id, r);
      cambiato = true;
    }
    return cambiato ? [...m.values()] : null;
  };

  // Prima i mesi di destinazione, poi le lapidi nei mesi di partenza
  for (const [mese, recs] of perMese) await aggiornaMese(store, mese, applica(recs));
  for (const [mese, recs] of lapidi) await aggiornaMese(store, mese, applica(recs));
  return { accettate, rifiutate };
}

async function leggiBody(req) {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return { err: reply({ error: "Richiesta troppo grande" }, 413) };
  const testo = await req.text();
  if (testo.length > MAX_BODY) return { err: reply({ error: "Richiesta troppo grande" }, 413) };
  try {
    const body = JSON.parse(testo);
    if (!body || typeof body !== "object") throw new Error();
    return { body };
  } catch { return { err: reply({ error: "JSON non valido" }, 400) }; }
}

export default async (req) => {
  const url = new URL(req.url);
  const ingest = url.pathname.endsWith("/presenze-ingest");
  const store = getStore("presenze");

  /* ---- File offline: token proprio, CORS aperto ---- */
  if (ingest) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return reply({ error: "Metodo non consentito" }, 405, true);

    const token = env("PRESENZE_TOKEN");
    if (!token) return reply({ error: "PRESENZE_TOKEN non impostato su Netlify" }, 503, true);
    const dato = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!dato || !same(dato, token)) return reply({ error: "Token non valido" }, 401, true);

    const { body, err } = await leggiBody(req);
    if (err) { Object.entries(CORS).forEach(([k, v]) => err.headers.set(k, v)); return err; }
    try {
      const esito = await unisci(store, Array.isArray(body.registrazioni) ? body.registrazioni : []);
      const conf = await getStore("portale").get("presenze-config", { type: "json" });
      return reply({ ok: true, ...esito, luoghi: Array.isArray(conf?.luoghi) ? conf.luoghi : [], server: new Date().toISOString() }, 200, true);
    } catch (e) { return reply({ error: e.message || "Errore del server" }, 500, true); }
  }

  /* ---- Pagina del portale (già dietro la password) ---- */
  if (req.method === "GET") {
    const mese = url.searchParams.get("mese") || "";
    if (!MESE.test(mese)) return reply({ error: "Mese non valido (AAAA-MM)" }, 400);
    const lista = await store.get(`mese/${mese}`, { type: "json" });
    const registrazioni = (Array.isArray(lista) ? lista : [])
      .filter(r => !r.eliminato)
      .sort((a, b) => b.entrata.localeCompare(a.entrata));
    return reply({ registrazioni });
  }

  if (req.method === "PUT") {
    const { body, err } = await leggiBody(req);
    if (err) return err;
    try {
      return reply({ ok: true, ...(await unisci(store, Array.isArray(body.registrazioni) ? body.registrazioni : [])) });
    } catch (e) { return reply({ error: e.message || "Errore del server" }, 500); }
  }

  return reply({ error: "Metodo non consentito" }, 405);
};

export const config = { path: ["/api/presenze", "/api/presenze-ingest"] };
