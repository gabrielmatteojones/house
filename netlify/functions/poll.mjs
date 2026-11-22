// Ogni minuto controlla se è arrivata posta nuova nella Posta in arrivo e manda la notifica push,
// anche a portale chiuso. Gira solo sul sito pubblicato (non in anteprima né con `netlify dev`).
import { store, zget, decode } from "../lib/zoho.mjs";
import { notifyAll } from "../lib/push.mjs";

const ts = (m) => +(m.receivedTime || m.receivedtime || m.sentDateInGMT || 0);

export default async () => {
  const s = store();
  const subs = await s.get("subs", { type: "json" });
  if (!subs?.length) return; // nessun browser iscritto: non consumo chiamate a Zoho
  const st = (await s.get("poll", { type: "json" })) || {};
  if (!st.acc) { st.acc = (await zget("accounts"))?.data?.[0]?.accountId; if (!st.acc) return; }
  if (!st.inbox) {
    const list = (await zget(`accounts/${st.acc}/folders`))?.data || [];
    st.inbox = (list.find((f) => f.folderType === "Inbox" && /^inbox$/i.test(f.folderName)) || list.find((f) => f.folderType === "Inbox"))?.folderId;
    if (!st.inbox) return;
  }
  const msgs = (await zget(`accounts/${st.acc}/messages/view?folderId=${st.inbox}&status=unread&start=1&limit=10&includeto=true`))?.data || [];
  const last = st.last ?? Date.now(); // al primo giro non notifico la posta vecchia
  const fresh = msgs.filter((m) => ts(m) > last).sort((a, b) => ts(a) - ts(b));
  st.last = Math.max(last, ...msgs.map(ts));
  await s.setJSON("poll", st);

  if (fresh.length > 3) await notifyAll({ title: "Jones Mail", body: `${fresh.length} nuovi messaggi`, tag: "multi" });
  else for (const m of fresh) await notifyAll({ title: decode(m.sender || m.fromAddress), body: decode(m.subject || "(senza oggetto)"), tag: String(m.messageId) });
};

export const config = { schedule: "* * * * *" };
