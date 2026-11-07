# Portale · Gabriel Jones

Portale privato in Jekyll, pubblicato su Netlify. Contiene: documenti, iframe delle amministrazioni dei siti,
accessi rapidi, catalogo libri, giochi, link, calendario delle lezioni e registro personale (senza nomi di studenti).

## Pubblicazione su Netlify

1. Carica questa cartella in un repository Git (GitHub, GitLab o Bitbucket).
2. Su Netlify: **Add new site → Import an existing project** e scegli il repository.
   Le impostazioni di build sono già in `netlify.toml` (`bundle exec jekyll build`, cartella `_site`).
3. In **Site configuration → Environment variables** crea due variabili con ambito **Functions**
   (le usano anche le edge function):
   - `PORTAL_USER` — il tuo nome utente
   - `PORTAL_PASSWORD` — una password lunga
4. Rilancia il deploy. Al primo accesso il browser chiede utente e password.

Finché le due variabili mancano, il sito resta chiuso (risponde 503): non può restare pubblico per errore.

## Come funziona la privacy

- `netlify/edge-functions/auth.js` protegge **ogni** richiesta: pagine, file, dati e funzioni.
- Intestazioni `noindex`, `robots.txt` che vieta tutto, nessun frame esterno ammesso.
- I dati stanno in Netlify Blobs del tuo sito (non in repository), quindi sono privati e uguali su ogni dispositivo.

## Provarlo in locale

- `bundle install && bundle exec jekyll serve` — solo interfaccia. I dati restano nel browser e la lettura
  da link non funziona.
- `npm install && npx netlify dev` — esperienza completa (dati, estrazione dai link, password).

## Dove mettere le mani

- Menu: `_data/nav.yml`
- Colori e caratteri: variabili all'inizio di `assets/css/portal.css`
- Un file `assets/js/<pagina>.js` per ogni pagina; funzioni comuni in `assets/js/core.js`
- Accessi iniziali (Zoho, Outlook, Claude): `SEED_UTILI` in `core.js`

## Note

- Alcuni servizi (Netlify, Zoho, Google) vietano di essere incorporati in iframe: per quelli usa il pulsante ↗.
  Le amministrazioni dei tuoi siti funzionano se non inviano `X-Frame-Options` o `frame-ancestors` restrittivi.
  Se il login nell'iframe non regge, è il blocco dei cookie di terze parti del browser: apri il sito in una scheda.
- Il backup completo si scarica dalla Home.
