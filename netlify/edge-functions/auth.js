// Protegge TUTTO il portale (pagine, asset e funzioni /api/*) con utente e password.
// Imposta PORTAL_USER e PORTAL_PASSWORD nelle variabili d'ambiente di Netlify.
// Se mancano, il sito resta chiuso (fail closed).

const same = (a, b) => {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
};

export default async (request, context) => {
  const user = Deno.env.get("PORTAL_USER");
  const pass = Deno.env.get("PORTAL_PASSWORD");

  if (!user || !pass) {
    return new Response("Portale non configurato: imposta PORTAL_USER e PORTAL_PASSWORD su Netlify.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (same(u, user) && same(p, pass)) return context.next();
    } catch (_) { /* credenziali malformate */ }
  }

  return new Response("Accesso riservato", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Portale privato", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  });
};

export const config = { path: "/*" };
