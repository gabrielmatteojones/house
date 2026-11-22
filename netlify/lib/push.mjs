// Notifiche push (Web Push). Le chiavi VAPID si creano da sole alla prima richiesta e restano in Netlify Blobs,
// a meno che tu non imposti VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.
import webpush from "web-push";
import { store } from "./zoho.mjs";

export async function vapid() {
  let k = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : await store().get("vapid", { type: "json" });
  if (!k) { k = webpush.generateVAPIDKeys(); await store().setJSON("vapid", k); }
  const subject = process.env.VAPID_SUBJECT || process.env.URL || "mailto:admin@example.com";
  webpush.setVapidDetails(subject, k.publicKey, k.privateKey);
  return k;
}

export async function notifyAll(payload) {
  await vapid();
  const subs = (await store().get("subs", { type: "json" })) || [];
  const dead = new Set();
  await Promise.all(subs.map((sub) =>
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((e) => { if ([404, 410].includes(e.statusCode)) dead.add(sub.endpoint); })));
  if (dead.size) await store().setJSON("subs", subs.filter((x) => !dead.has(x.endpoint)));
  return subs.length - dead.size;
}
