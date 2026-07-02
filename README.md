# File Progetti

App web che mostra i dati di un file Excel (scaricato da SharePoint e caricato manualmente),
permette di ordinare/filtrare/raggruppare le righe senza modificare il file originale, e aggiunge per
ogni riga colonne personalizzate (note, stato, priorita', ecc.) editabili e mantenute anche quando il
file viene ricaricato con dati aggiornati.

Non richiede alcuna registrazione su Azure AD / Microsoft Graph: il collegamento a SharePoint e' manuale
(scarichi il file, lo carichi nell'app), pensato per chi non ha accesso rapido alle risorse IT aziendali.

## Come funziona

- **Colonne del file Excel** (es. A-D): sola visualizzazione. L'app non scrive mai sul file originale.
- **Colonne personalizzate** (aggiunte dalle Impostazioni, a partire "dalla E in poi"): editabili, salvate
  in un database separato.
- Ogni riga viene identificata da una **chiave stabile** (una colonna a scelta, tipicamente un ID/codice
  progetto univoco; se non specificata si usa un hash del contenuto della riga). Ogni volta che carichi
  una nuova versione del file, l'app aggiorna solo le colonne sorgente delle righe riconosciute e lascia
  intatte le colonne personalizzate.
- **Aggiornamento dati**: manuale. Quando vuoi dati aggiornati, scarica il file da SharePoint e caricalo
  dal pulsante "Carica nuovo file Excel" in alto nella pagina. Non c'e' nessun collegamento automatico ne'
  job pianificato: tutto avviene quando tu lo decidi.

## 1. Database (dati custom e snapshot dati, condivisi)

I dati mostrati (ultimo file caricato + note/colonne personalizzate) sono salvati in un database Postgres
condiviso, cosi' restano disponibili a tutti gli utenti dell'app da qualunque postazione.

Opzione consigliata (gratuita per uso interno): [Neon](https://neon.tech) o [Supabase](https://supabase.com).

1. Crea un progetto/database Postgres.
2. Copia la connection string e impostala come `DATABASE_URL`.

## 2. Configurazione locale

```bash
npm install
cp .env.example .env
# compila .env con i valori ottenuti sopra
npx prisma db push          # crea le tabelle nel database
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000), fai login con `APP_PASSWORD`, poi (facoltativo) vai su
**Impostazioni** per indicare il nome del foglio da leggere e la colonna identificativa univoca, prima di
caricare il primo file.

## 3. Deploy su Vercel (gratuito)

1. Importa il repository su [vercel.com/new](https://vercel.com/new).
2. Collega un database Postgres (es. da Vercel > Storage > Create Database > Neon): imposta
   automaticamente `DATABASE_URL`.
3. Imposta manualmente le altre variabili d'ambiente di `.env.example` (`APP_PASSWORD`, `SESSION_SECRET`)
   nelle Project Settings > Environment Variables.
4. Deploy.

Il file `vercel.json` incluso imposta il comando di build su `prisma db push && next build`: le tabelle nel
database vengono create/sincronizzate automaticamente ad ogni deploy, senza bisogno di eseguire comandi a
mano contro il database di produzione.

Non serve alcun piano a pagamento ne' configurazione di Cron Job: l'aggiornamento dei dati e' sempre
manuale tramite il pulsante di upload.

## 4. Uso quotidiano

1. **Scarica** il file Excel aggiornato da SharePoint (Apri il file > File > Salva una copia / Scarica).
2. In alto nella pagina, clicca **"Carica nuovo file Excel"** e seleziona il file scaricato (.xlsx).
3. I dati sorgente (colonne del file) vengono aggiornati; le colonne personalizzate delle righe gia'
   presenti restano invariate.
4. **Ordinare/filtrare**: clicca sull'intestazione di una colonna per ordinare, usa il campo di ricerca
   sotto ogni colonna per filtrare, oppure il campo di ricerca globale in alto.
5. **Raggruppare**: scegli una colonna dal menu "Raggruppa per" in alto alla tabella.
6. **Note/colonne personalizzate**: clicca direttamente nella cella per modificarla; il salvataggio e'
   automatico (pochi istanti dopo aver smesso di digitare, o subito per select/checkbox/data).

Ordina/filtra/raggruppa avvengono solo nella visualizzazione dell'app: il file Excel scaricato da
SharePoint non viene mai toccato o ricaricato automaticamente.

## Impostazioni disponibili

- **Nome del foglio da leggere**: se il file ha piu' fogli, indica quale leggere (vuoto = primo foglio).
- **Colonna identificativa univoca**: lettera della colonna con un ID/codice univoco per riga (es. `A`).
  Consigliata: senza di essa l'app riconosce le righe dal contenuto delle celle, e se modifichi i valori
  di una riga tra un caricamento e l'altro l'app potrebbe trattarla come una riga nuova, "perdendo"
  temporaneamente il collegamento con le note gia' inserite.
- **Colonne personalizzate**: aggiungi/rimuovi colonne editabili (testo, testo lungo, scelta a tendina,
  data, numero, checkbox).

## Nota sulla sicurezza dei dati

I dati del file (una volta caricato) restano salvati nel database Postgres dell'app, non solo su
SharePoint: valuta con il tuo IT se il contenuto e' adatto ad essere copiato su questo servizio esterno,
e scegli un `APP_PASSWORD` robusto dato che protegge sia i dati del file sia le note inserite.

## Note tecniche

- Stack: Next.js (App Router) + TypeScript + Tailwind, Prisma + Postgres, ExcelJS (parsing del file .xlsx
  caricato), TanStack Table.
- Autenticazione all'app: password condivisa singola (`APP_PASSWORD`) con cookie di sessione firmato.
- In futuro, se diventa possibile ottenere un permesso Azure AD, si puo' reintrodurre un collegamento
  diretto a SharePoint via Microsoft Graph per automatizzare anche il caricamento (l'architettura dati
  attuale, con chiave di riga stabile e colonne custom separate, resterebbe identica).
