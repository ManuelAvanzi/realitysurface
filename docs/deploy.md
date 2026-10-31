# Mettere REALITYSURFACE online (primo link testabile)

Obiettivo: un indirizzo **https** raggiungibile dal telefono, stabile nel tempo, con database e
upload che sopravvivono ai riavvii. Il server è un unico processo Node (Express + SQLite + file su
disco), quindi serve un hosting con **disco persistente**: il `Dockerfile` in radice va bene per
Fly.io, Railway, Render o un VPS qualsiasi con Docker.

Cosa prevede già il codice:
- `PORT`: porta di ascolto (l'immagine Docker usa 8080).
- `DATA_DIR` / `UPLOADS_DIR`: cartelle del database e degli upload (nell'immagine: `/data` e `/data/uploads`,
  da montare su un volume). Senza variabili restano `data/` e `uploads/` del progetto, come in locale.
- `PUBLIC_URL`: facoltativo. Se manca, i QR e i link usano l'host della richiesta (dietro proxy
  funziona perché `trust proxy` è attivo), quindi su Fly non serve impostarlo.
- `CODICE_INVITO`: se impostato, dopo il primo account (l'amministratore) ci si registra solo con
  quel codice. Consigliato su un'istanza pubblica di prova.
- `/health` per i controlli dell'hosting.

## Istanza attiva (31/10/2026)
App Fly `realitysurface` (org personal, regione ams, volume `dati` 1 GB): **https://realitysurface.fly.dev**.
Il codice d'invito è nel file locale `.env.fly` (ignorato da git). Aggiornare dopo un push:
`flyctl deploy --ha=false --remote-only` dalla cartella del progetto (flyctl installato con winget).

## Percorso consigliato: Fly.io (Amsterdam)

Costo indicativo: una macchina `shared-cpu-1x` da 512 MB con volume da 1 GB, che si spegne da sola
quando nessuno la usa (`auto_stop_machines`), resta nell'ordine di 2–4 € al mese. Serve una carta
sul profilo Fly.

1. Installa flyctl (PowerShell):

       pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

   e accedi con `fly auth signup` (o `fly auth login`).

2. Dalla cartella del progetto crea l'app a partire dal `fly.toml` già pronto (cambia il nome se
   "realitysurface" è occupato, l'URL sarà `https://<nome>.fly.dev`):

       fly launch --copy-config --no-deploy

3. Crea il volume per database e upload nella stessa regione dell'app:

       fly volumes create dati --region ams --size 1

4. Imposta il codice d'invito (una parola a tua scelta) e pubblica:

       fly secrets set CODICE_INVITO=scegli-una-parola
       fly deploy

5. Apri `https://<nome>.fly.dev`, premi **Inizia gratis** e crea il primo account: è l'amministratore.
   Da **Demo** genera "Il libro dei pianeti" (o il biglietto), compila i target al passo 2, metti
   lo stampato su **Pubblicato** e inquadra il QR col telefono: la fotocamera si apre perché il sito
   è in https.

Comandi utili: `fly logs` (log in diretta), `fly ssh console` (shell nella macchina, i dati sono in
`/data`), `fly deploy` dopo ogni `git push` per aggiornare, `fly scale memory 1024` se il compile
delle demo lato server andasse in out-of-memory.

Backup: `fly ssh sftp get /data/realitysurface.db` scarica il database; gli upload stanno in
`/data/uploads`.

## Alternative con lo stesso Dockerfile
- **Render**: `render.yaml` è un Blueprint pronto (piano Starter, disco da 1 GB su `/data`). Nella
  dashboard: New → Blueprint → repo GitHub `ManuelAvanzi/realitysurface`; imposta `CODICE_INVITO`.
- **Railway**: nuovo progetto da GitHub, aggiungi un Volume montato su `/data`, variabili
  `DATA_DIR=/data`, `UPLOADS_DIR=/data/uploads`, `CODICE_INVITO=...`; Railway rileva il Dockerfile.
- **VPS** (Hetzner, ecc.): `docker build -t realitysurface . && docker run -d -p 8080:8080 -v /srv/rs:/data -e CODICE_INVITO=... realitysurface`,
  poi un reverse proxy con certificato (Caddy fa tutto da solo con `reverse_proxy :8080`).

## Prova veloce senza hosting (link temporaneo)
Per un test di un'ora basta il tunnel dal PC, che però cambia indirizzo a ogni avvio e funziona
solo mentre il PC è acceso:

    npx -y cloudflared tunnel --url http://localhost:5500

e server riavviato con `PUBLIC_URL` uguale all'indirizzo del tunnel.

## Cosa manca per andare oltre la prova
- Dominio proprio (`fly certs add ar.tuodominio.it` + record CNAME).
- Backup periodico del volume (snapshot Fly o cron con `sftp get`).
- Limiti di upload per utente e pulizia dei token di cattura scaduti (oggi: 30 minuti, cancellati
  dopo un giorno).
