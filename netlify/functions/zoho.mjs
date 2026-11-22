// Collegamento a Zoho Mail: OAuth lato server + proxy verso le API.
// Client ID e secret stanno nelle variabili d'ambiente di Netlify: il browser non li vede mai.
// I token di accesso/aggiornamento sono salvati in Netlify Blobs (store "zoho").
//   GET  /api/zoho/status      -> { configured, connected, dc, redirect }
//   GET  /api/zoho/login       -> avvia l'autorizzazione su Zoho
//   GET  /api/zoho/callback    -> riceve il codice e salva i token
//   POST /api/zoho/code        -> collega con un codice "Self Client" { code }
//   POST /api/zoho/disconnect  -> revoca e dimentica i token
//   ANY  /api/zoho/mail/...    -> proxy verso https://mail.zoho.<dc>/api/... (anche allegati: scaricamento e caricamento)
import { env, dc, accountsUrl, mailUrl, store, token, keep, accessToken } from "../lib/zoho.mjs";

const SCOPES = "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.ALL";
const json = (d, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/zoho\/?/, "");
  const configured = !!(env("ZOHO_CLIENT_ID") && env("ZOHO_CLIENT_SECRET"));
  const redirect = `${url.origin}/api/zoho/callback`;
  const back = (q) => new Response(null, { status: 302, headers: { location: `/posta/?${q}` } });

  if (path === "status") {
    const t = configured ? await store().get("tokens", { type: "json" }) : null;
    return json({ configured, connected: !!t?.refresh_token, dc: dc(), redirect });
  }
  if (!configured) return json({ error: "Imposta ZOHO_CLIENT_ID e ZOHO_CLIENT_SECRET su Netlify." }, 503);

  if (path === "login") {
    const state = crypto.randomUUID();
    const q = new URLSearchParams({ scope: SCOPES, client_id: env("ZOHO_CLIENT_ID"), response_type: "code", access_type: "offline", prompt: "consent", redirect_uri: redirect, state });
    const secure = url.protocol === "https:" ? " Secure;" : "";
    return new Response(null, { status: 302, headers: { location: `${accountsUrl()}/oauth/v2/auth?${q}`, "set-cookie": `zstate=${state}; HttpOnly;${secure} SameSite=Lax; Path=/api/zoho; Max-Age=600` } });
  }

  if (path === "callback") {
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code");
    const okState = state && (req.headers.get("cookie") || "").includes(`zstate=${state}`);
    if (!okState || !code) return back("errore=" + encodeURIComponent(url.searchParams.get("error") || "autorizzazione non valida"));
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirect });
    return (await keep(t)) ? back("collegato=1") : back("errore=" + encodeURIComponent(t.error || "token non ricevuto"));
  }

  if (path === "code" && req.method === "POST") {
    const { code } = await req.json().catch(() => ({}));
    if (!code) return json({ error: "Codice mancante" }, 400);
    const t = await token({ grant_type: "authorization_code", code: String(code).trim() });
    return (await keep(t)) ? json({ ok: true }) : json({ error: t.error || "Codice non valido o scaduto" }, 400);
  }

  if (path === "disconnect" && req.method === "POST") {
    const t = await store().get("tokens", { type: "json" });
    if (t?.refresh_token) await fetch(`${accountsUrl()}/oauth/v2/token/revoke?token=${encodeURIComponent(t.refresh_token)}`, { method: "POST" }).catch(() => {});
    await store().delete("tokens");
    return json({ ok: true });
  }

  if (path.startsWith("mail/")) {
    const sub = path.slice(5);
    if (!/^accounts(\/[\w.-]+)*$/.test(sub)) return json({ error: "Percorso non valido" }, 400);
    let tok;
    try { tok = await accessToken(); } catch { return json({ error: "Sessione Zoho scaduta: ricollega l'account." }, 401); }
    if (!tok) return json({ error: "Zoho non collegato." }, 401);
    const q = new URLSearchParams(url.search), dl = q.get("dl"); q.delete("dl"); // dl = nome con cui scaricare un allegato
    const isFile = req.method === "GET" && /\/attachments\/[\w.-]+$/.test(sub);
    // per i file niente "Accept: json", altrimenti Zoho risponde 406
    const init = { method: req.method, headers: { authorization: `Zoho-oauthtoken ${tok}`, accept: isFile ? "*/*" : "application/json" } };
    if (!["GET", "HEAD"].includes(req.method)) { init.body = await req.arrayBuffer(); init.headers["content-type"] = req.headers.get("content-type") || "application/json"; }
    const r = await fetch(`${mailUrl()}/${sub}${String(q) ? "?" + q : ""}`, init);
    const h = { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" };
    if (isFile) {
      // Sicurezza: un allegato non deve mai poter eseguire codice sul portale. Solo immagini e PDF si aprono nel browser, il resto si scarica.
      const safe = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(h["content-type"].split(";")[0].trim());
      h["x-content-type-options"] = "nosniff";
      if (!safe) h["content-type"] = "application/octet-stream";
      if (dl || !safe) h["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(dl || "allegato")}`;
    }
    return new Response(r.body, { status: r.status, headers: h });
  }

  return json({ error: "Non trovato" }, 404);
};

export const config = { path: "/api/zoho/*" };
