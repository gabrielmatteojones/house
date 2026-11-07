// Archivio dei dati del portale: una collezione JSON per nome, su Netlify Blobs.
// GET  /api/data/<nome>  -> contenuto (o null se non esiste ancora)
// PUT  /api/data/<nome>  -> sostituisce il contenuto
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const name = context.params.name;
  if (!/^[a-z0-9_-]{1,40}$/.test(name || "")) {
    return Response.json({ error: "Nome non valido" }, { status: 400 });
  }

  const store = getStore("portale");

  if (req.method === "GET") {
    const data = await store.get(name, { type: "json" });
    return Response.json(data ?? null, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "JSON non valido" }, { status: 400 }); }
    await store.setJSON(name, body);
    return Response.json({ ok: true });
  }

  return new Response("Metodo non consentito", { status: 405 });
};

export const config = { path: "/api/data/:name" };
