//   GET  /api/push/key          -> chiave pubblica per iscrivere il browser
//   POST /api/push/subscribe    -> salva l'iscrizione di questo browser
//   POST /api/push/unsubscribe  -> la rimuove
//   POST /api/push/test         -> invia una notifica di prova a tutti i browser iscritti
import { store } from "../lib/zoho.mjs";
import { vapid, notifyAll } from "../lib/push.mjs";

const json = (d, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/push\/?/, "");
  if (path === "key" && req.method === "GET") return json({ key: (await vapid()).publicKey });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const body = await req.json().catch(() => ({}));
  const subs = ((await store().get("subs", { type: "json" })) || []).filter((x) => x.endpoint !== body.endpoint);

  if (path === "subscribe") {
    if (!/^https:\/\//.test(body.endpoint || "") || !body.keys?.p256dh || !body.keys?.auth) return json({ error: "Iscrizione non valida" }, 400);
    subs.push({ endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
    await store().setJSON("subs", subs);
    return json({ ok: true });
  }
  if (path === "unsubscribe") { await store().setJSON("subs", subs); return json({ ok: true }); }
  if (path === "test") return json({ sent: await notifyAll({ title: "Jones Mail", body: "Le notifiche funzionano.", tag: "test" }) });
  return json({ error: "Non trovato" }, 404);
};

export const config = { path: "/api/push/*" };
