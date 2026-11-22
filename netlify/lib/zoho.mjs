// Funzioni condivise tra l'API (zoho.mjs), le notifiche (push.mjs) e il controllo periodico (poll.mjs).
import { getStore } from "@netlify/blobs";

export const env = (k) => (process.env[k] || "").trim();
export const dc = () => env("ZOHO_DC") || "eu"; // eu, com, in, com.au, jp, sa, ca
export const accountsUrl = () => `https://accounts.zoho.${dc()}`;
export const mailUrl = () => `https://mail.zoho.${dc()}/api`;
export const store = () => getStore("zoho");

export async function token(params) {
  const body = new URLSearchParams({ client_id: env("ZOHO_CLIENT_ID"), client_secret: env("ZOHO_CLIENT_SECRET"), ...params });
  const r = await fetch(`${accountsUrl()}/oauth/v2/token`, { method: "POST", body });
  return r.json().catch(() => ({}));
}

export async function keep(t) {
  if (!t.refresh_token) return false;
  await store().setJSON("tokens", { refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (t.expires_in || 3600) * 1000 });
  return true;
}

export async function accessToken() {
  const t = await store().get("tokens", { type: "json" });
  if (!t?.refresh_token) return null;
  if (t.access_token && t.expires_at > Date.now() + 60000) return t.access_token;
  const n = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  if (!n.access_token) throw new Error(n.error || "refresh_failed");
  await store().setJSON("tokens", { ...t, access_token: n.access_token, expires_at: Date.now() + (n.expires_in || 3600) * 1000 });
  return n.access_token;
}

export async function zget(sub) {
  const tok = await accessToken();
  if (!tok) return null;
  const r = await fetch(`${mailUrl()}/${sub}`, { headers: { authorization: `Zoho-oauthtoken ${tok}`, accept: "application/json" } });
  return r.json().catch(() => null);
}

// Zoho restituisce oggetto, mittente e anteprima con entità HTML (&#39; ecc.): le trasformo in testo normale.
export const decode = (s) => String(s ?? "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
