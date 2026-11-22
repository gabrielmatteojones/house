# Jones House · portale unico di Gabriel Jones

Un solo sito Jekyll su Netlify, con una sola password e un solo archivio dati. Riunisce quelli che prima erano tre siti separati:

| Prima | Adesso |
|---|---|
| `house` (portale) | tutto il resto: Drive, Siti, Presenze, Raccolte, Registro… |
| `calendar` (calendar.joneshouse.it) | **/calendario/** |
| `webmail` (Zoho Mail) | **/posta/** |
| «Calendario» del portale (le lezioni) | **/lezioni/** |
| «Agenda personale» | assorbita dal Calendario (vedi sotto) |

## Novità dell'ultima unificazione

- **Timbra**: il pulsante «Avvia lezione» in alto è diventato **Timbra** (scorciatoia Alt+T). Apre una finestra che chiede in cosa entri (Scuola, Oratorio…) oppure, se sei in servizio, permette di uscire (anche «Esci ed entra altrove»). Stessi dati della pagina Presenze; la Home mostra lo stato. «Avvia una lezione» resta nella finestra e nel Registro. Codice: `assets/js/timbra.js`.
- **Due carte intestate, a scelta**: *Jones House* (fascia blu/rossa) e *Gabriel Jones* (logo, recapiti, filetto, piè con destinatario e oggetto). La carta predefinita e il testo di ciascuna si cambiano da ⚙ nell'editor o da «Carta intestata» nel Drive; ogni documento può usare l'una, l'altra o nessuna. Vale per editor, stampa/PDF, Word e per il resoconto presenze (che ha la sua scelta nella finestra «Scarica resoconto»). Codice: `assets/js/letterhead.js`. Il logo è in `assets/img/logo-gabriel.png`.
- **Un solo editor**: l'editor «Documenti» a parte (`docs.html`) è confluito nel Drive, che ora ha anche carattere, dimensione, colori, immagini, nuova pagina, data e zoom. `/docs.html` rimanda al Drive; il vecchio file è in `_archivio/`.

## Cosa è cambiato nell'unione precedente

- **Menu unico** (`_data/nav.yml`): Home · Drive · Posta · Calendario · Siti · Presenze in rete · Raccolte · Didattica. Corretti i link rotti (Timbra puntava a `/timbra/`, la pagina è `/presenze/timbra/`) e le voci doppie.
- **Calendario**: il calendario completo (viste giorno/settimana/mese/agenda, ripetizioni, festività, .ics) sta su `/calendario/`. La vecchia pagina delle lezioni ora è `/lezioni/`.
- **Agenda → Calendario**: la prima volta che apri `/calendario/`, gli impegni della vecchia Agenda vengono copiati nel Calendario (categorie → colori). Gli originali restano in una copia di sicurezza (collezione `agenda-migrata`).
- **Posta**: la versione più recente della webmail (allegati, formattazione, alias, notifiche push).
- **Impostazioni della posta** (firma, suono, notifiche) ora stanno in `mail-impostazioni`. Prima la webmail usava il nome `impostazioni`, lo stesso della carta intestata del Drive: unendo i siti si sarebbero sovrascritte a vicenda.
- **«Esci»** è nella barra in alto e vale per tutto il portale.
- Una sola copia di `core.js`, `portal.css`, `auth.js`, `data.mjs` (prima erano tre, già leggermente diverse). La grafica specifica sta in `assets/css/calendar.css` e `assets/css/webmail.css`, caricati solo dalle rispettive pagine (`styles:` nell'intestazione della pagina).
- Il backup della Home ora include anche calendario e impostazioni della posta.
- Un solo `/documenti/` (era definito due volte): è un redirect al Drive.
- I file doppi, vecchi o non usati sono in `_archivio/` (non pubblicato; vedi `_archivio/LEGGIMI.txt`).

## Pubblicazione su Netlify

Variabili d'ambiente (ambito **Functions**):

| Variabile | A cosa serve |
|---|---|
| `PORTAL_USER`, `PORTAL_PASSWORD` | accesso al portale. Senza, il sito resta chiuso (503) |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC` | la Posta (`ZOHO_DC` = `eu`, `com`, `in`…) |
| `PRESENZE_TOKEN` | facoltativa: token del file offline «Presenze in rete» |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | facoltative: notifiche push (se mancano si creano da sole) |

Impostazioni di build in `netlify.toml` (`bundle exec jekyll build`, cartella `_site`).

### Zoho
In **api-console.zoho.eu**, tra gli *Authorized Redirect URIs* del client aggiungi
`https://IL-TUO-SITO/api/zoho/callback` (l'indirizzo di questo sito). Poi apri **/posta/** e premi «Collega con Zoho».

## Passare dai vecchi siti a questo

1. **Calendario**: sul vecchio sito calendar premi *Esporta .ics*; su `/calendario/` qui premi *Importa .ics*. (I dati dei vecchi siti stanno nei loro archivi Netlify e non si spostano da soli.)
2. **Posta**: copia le variabili Zoho su questo sito, aggiungi l'URI di reindirizzamento, ricollega. Firma e notifiche vanno reimpostate da ⚙ Impostazioni.
3. **Domini** (facoltativo): aggiungi `calendar.joneshouse.it` come alias di dominio di questo sito e attiva il blocco `[[redirects]]` in fondo a `netlify.toml`.
4. Quando tutto funziona, spegni i vecchi siti.

## Come funziona la privacy

- `netlify/edge-functions/auth.js` protegge ogni richiesta (pagine, file, dati, funzioni). Unica eccezione: `/api/presenze-ingest`, protetta dal suo token.
- Intestazioni `noindex`, `robots.txt` che vieta tutto, nessun frame esterno.
- Dati in Netlify Blobs: store `portale` (collezioni JSON), `drive` (file), `zoho` (token e iscrizioni push). Nessun dato nel repository.
- Il Client Secret di Zoho non è in nessun file: solo variabile d'ambiente.

## Provarlo in locale

- `bundle install && bundle exec jekyll serve` — solo interfaccia (dati nel browser).
- `cp .env.example .env`, poi `npm install && npx netlify dev` — esperienza completa (dati, Zoho, password).
  Le notifiche push programmate girano solo sul sito pubblicato.

## Dove mettere le mani

- Menu: `_data/nav.yml` · layout: `_layouts/default.html` · intestazione: `_includes/header.html`
- Un `assets/js/<pagina>.js` per pagina; funzioni comuni in `assets/js/core.js`
- Colori e caratteri: variabili all'inizio di `assets/css/portal.css`
- Calendario: logica in `calendar-lib.js` (senza DOM), interfaccia in `calendar.js`; festività in `festivitaAnno()`
- Posta: `assets/js/webmail.js`, server in `netlify/functions/zoho.mjs`, notifiche in `poll.mjs`, `push.mjs`, `sw.js`
- Estensioni: cartella `plugins/` (caricate in automatico)

## Note

- Alcuni servizi (Netlify, Zoho, Google) vietano di essere incorporati in iframe: per quelli usa il pulsante ↗.
- Il backup della Home non contiene i file caricati nel Drive.
- Su iPhone/iPad le notifiche push richiedono di aggiungere prima il portale alla schermata Home.
