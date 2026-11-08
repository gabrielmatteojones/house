// Archivio dei file del Drive, su Netlify Blobs. Ogni file è diviso in pezzi (max ~4 MB),
// perché le funzioni Netlify accettano richieste di circa 6 MB al massimo.
// PUT    /api/files/<id>/<n>  -> salva il pezzo n
// GET    /api/files/<id>/<n>  -> restituisce il pezzo n
// DELETE /api/files/<id>      -> elimina tutti i pezzi del file
import { getStore } from "@netlify/blobs";

const MAX_CHUNK = 5 * 1024 * 1024;

export default async (req, context) => {
  const { id, n } = context.params;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id || "")) return Response.json({ error: "Identificativo non valido" }, { status: 400 });
  if (n !== undefined && !/^\d{1,4}$/.test(n)) return Response.json({ error: "Pezzo non valido" }, { status: 400 });

  const store = getStore("drive");

  if (req.method === "PUT" && n !== undefined) {
    const data = await req.arrayBuffer();
    if (data.byteLength > MAX_CHUNK) return Response.json({ error: "Pezzo troppo grande" }, { status: 413 });
    await store.set(`${id}/${n}`, data);
    return Response.json({ ok: true });
  }

  if (req.method === "GET" && n !== undefined) {
    const data = await store.get(`${id}/${n}`, { type: "arrayBuffer" });
    if (data === null) return new Response("Non trovato", { status: 404 });
    return new Response(data, {
      headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
    });
  }

  if (req.method === "DELETE" && n === undefined) {
    const { blobs } = await store.list({ prefix: `${id}/` });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return Response.json({ ok: true, eliminati: blobs.length });
  }

  return new Response("Metodo non consentito", { status: 405 });
};

export const config = { path: ["/api/files/:id", "/api/files/:id/:n"] };
