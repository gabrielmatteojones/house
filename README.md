# Jones House · portale di Gabriel Jones

Portale privato in Jekyll, pubblicato su Netlify. Contiene: Drive (file e documenti con carta intestata), iframe delle amministrazioni dei siti,
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

## Drive e carta intestata

- **Drive** (`/drive/`): cartelle, caricamento (anche trascinando file o intere cartelle), recenti, preferiti, cestino (30 giorni).
  Nessuna funzione di condivisione. Anteprima di PDF, PowerPoint (.pptx), Word (.docx), immagini, video, audio e testo.
  I file Word si possono aprire come documento modificabile; i vecchi .ppt/.doc si possono solo scaricare.
- **Documenti**: editor con carta intestata. Si attiva/disattiva per ogni documento; si modifica da ⚙ nell'editor o dal pulsante
  «Carta intestata» del Drive (nome, mittente, indirizzo, contatti, piè di pagina, con anteprima).
  Stampa/PDF ripete intestazione e piè di pagina su ogni pagina; «Scarica Word» crea un vero `.docx` con gli stessi elementi.
- I file stanno in Netlify Blobs (store `drive`, a pezzi da 4 MB, funzione `netlify/functions/files.mjs`); limite 100 MB a file.
  In locale con `jekyll serve` restano nel browser (IndexedDB).
- Le librerie per le anteprime sono in `assets/vendor/` (nessun CDN) e si caricano solo quando servono.

## Provarlo in locale

- `bundle install && bundle exec jekyll serve` — solo interfaccia. I dati restano nel browser e la lettura
  da link non funziona.
- `npm install && npx netlify dev` — esperienza completa (dati, estrazione dai link, password).

## Dove mettere le mani

- Menu: `_data/nav.yml` (il nome del sito è in `_config.yml`)
- Colori e caratteri: variabili all'inizio di `assets/css/portal.css`
- Un file `assets/js/<pagina>.js` per ogni pagina; funzioni comuni in `assets/js/core.js`
- Accessi iniziali (Zoho, Outlook, Claude): `SEED_UTILI` in `core.js`

## Note

- Alcuni servizi (Netlify, Zoho, Google) vietano di essere incorporati in iframe: per quelli usa il pulsante ↗.
  Le amministrazioni dei tuoi siti funzionano se non inviano `X-Frame-Options` o `frame-ancestors` restrittivi.
  Se il login nell'iframe non regge, è il blocco dei cookie di terze parti del browser: apri il sito in una scheda.
- Il backup della Home contiene documenti, cartelle, elenchi e impostazioni, ma non i file caricati nel Drive.
