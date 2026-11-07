// GET /api/meta?url=<link o ISBN>
// Legge la pagina, estrae i metadati (JSON-LD, Open Graph, meta) e, se trova un ISBN,
// completa i dati del libro con Google Books e Open Library.

const UA = "Mozilla/5.0 (compatible; PortaleGJ/1.0; uso personale)";

const decode = (s = "") =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();

const cleanIsbn = (s = "") => String(s).replace(/[^0-9Xx]/g, "").toUpperCase();
const isIsbn = (s = "") => /^(97[89]\d{10}|\d{9}[\dX])$/.test(cleanIsbn(s));

function metaTag(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*?content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name|itemprop)=["']${k}["']`, "i");
  return decode((html.match(a) || html.match(b) || [])[1] || "");
}

function jsonLd(html) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") { out.push(n); if (n["@graph"]) walk(n["@graph"]); }
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch { /* blocco non valido */ }
  }
  return out;
}

const names = (v) =>
  Array.isArray(v) ? v.map(names).filter(Boolean).join(", ") : typeof v === "string" ? v : v?.name || "";
const firstImage = (v) => (Array.isArray(v) ? firstImage(v[0]) : typeof v === "string" ? v : v?.url || "");

export default async (req) => {
  const input = (new URL(req.url).searchParams.get("url") || "").trim();
  if (!input) return Response.json({ error: "Manca il link" }, { status: 400 });

  const out = { url: "", title: "", author: "", description: "", cover: "", isbn: "", publisher: "", year: "", pages: "", site: "" };
  let isbn = "";
  let html = "";
  let base = null;

  if (isIsbn(input)) {
    isbn = cleanIsbn(input);
  } else {
    try { base = new URL(/^[a-z]+:\/\//i.test(input) ? input : "https://" + input); }
    catch { return Response.json({ error: "Indirizzo non valido" }, { status: 400 }); }
    if (!/^https?:$/.test(base.protocol)) return Response.json({ error: "Sono ammessi solo link http/https" }, { status: 400 });
    out.url = base.href;

    try {
      const r = await fetch(base, {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*", "accept-language": "it-IT,it;q=0.9,en;q=0.6" },
        redirect: "follow",
        signal: AbortSignal.timeout(9000),
      });
      html = (await r.text()).slice(0, 700000);
    } catch { /* pagina non raggiungibile: proviamo comunque con l'ISBN nell'URL */ }

    const nodes = jsonLd(html);
    const book = nodes.find((n) => [].concat(n["@type"] || []).some((t) => /book/i.test(t)));
    const product = nodes.find((n) => [].concat(n["@type"] || []).some((t) => /product/i.test(t)));
    const ld = book || product || {};

    out.title = decode(names(ld.name) || metaTag(html, "og:title") || metaTag(html, "twitter:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    out.author = decode(names(ld.author) || metaTag(html, "book:author") || metaTag(html, "author") || "");
    out.description = decode(ld.description || metaTag(html, "og:description") || metaTag(html, "description") || "").slice(0, 700);
    out.publisher = decode(names(ld.publisher) || "");
    out.year = String(ld.datePublished || metaTag(html, "book:release_date") || "").slice(0, 4).replace(/\D/g, "");
    out.pages = String(ld.numberOfPages || "").replace(/\D/g, "");
    out.site = metaTag(html, "og:site_name");

    let cover = firstImage(ld.image) || metaTag(html, "og:image") || metaTag(html, "twitter:image");
    try { if (cover) cover = new URL(cover, base).href; } catch { cover = ""; }
    out.cover = cover;

    isbn = cleanIsbn(ld.isbn || metaTag(html, "book:isbn") || metaTag(html, "isbn") || "");
    if (!isIsbn(isbn)) {
      const m = html.match(/ISBN(?:-1[03])?\s*[:#]?\s*((?:97[89][- ]?)?\d[\d- ]{8,14}[\dXx])/i);
      isbn = m ? cleanIsbn(m[1]) : "";
    }
    if (!isIsbn(isbn)) {
      const m = base.pathname.match(/\/(?:dp|gp\/product|ean)\/(\d{9}[\dXx]|97[89]\d{10})/);
      isbn = m ? cleanIsbn(m[1]) : "";
    }
  }

  if (isIsbn(isbn)) {
    out.isbn = isbn;
    try {
      const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
      const v = g.items?.[0]?.volumeInfo;
      if (v) {
        out.title = v.title ? v.title + (v.subtitle ? ": " + v.subtitle : "") : out.title;
        out.author = (v.authors || []).join(", ") || out.author;
        out.publisher = v.publisher || out.publisher;
        out.year = (v.publishedDate || "").slice(0, 4) || out.year;
        out.pages = v.pageCount ? String(v.pageCount) : out.pages;
        out.description = out.description || decode(v.description || "").slice(0, 700);
        const thumb = (v.imageLinks?.thumbnail || "").replace(/^http:/, "https:").replace("&edge=curl", "").replace("zoom=1", "zoom=2");
        out.cover = out.cover || thumb;
      }
    } catch { /* Google Books non disponibile */ }

    if (!out.cover) {
      try {
        const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
        const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) });
        if (r.ok) out.cover = url;
      } catch { /* nessuna copertina */ }
    }
  }

  if (!out.title) return Response.json({ ...out, error: "Non ho trovato informazioni in questa pagina" }, { status: 422 });
  return Response.json(out);
};

export const config = { path: "/api/meta" };
