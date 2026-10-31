# REALITYSURFACE — AR sopra la carta stampata

Nome del progetto: REALITYSURFACE (prima REALITYPAPER; rinominato il 29/10/2026 quando e' nato il repo GitHub
ManuelAvanzi/realitysurface). La CARTELLA su disco si chiama ancora `TROVAZAMPA\REALITYPAPER`: Windows non l'ha lasciata
rinominare mentre la sessione la teneva aperta. Quando la si rinomina in REALITYSURFACE, aggiornare il percorso in
`TROVAZAMPA\.claude\launch.json` (voce `realitysurface`, porta 5500).

Progetto AUTONOMO (cartella propria, repo proprio, nessun legame con il portale Cucina UNESCO
nella cartella padre). Lingua di lavoro: italiano. Porta di sviluppo riservata: **5500**.

## Idea in una frase

Un portale con un **editor** in cui il creatore carica l'immagine di una superficie stampata
(biglietto da visita, brochure, copertina, pagina di un libro), ci appoggia sopra contenuti 3D/AR
(modelli GLB, testi, video, audio, link) e ottiene **QR code da stampare** + un **viewer web**
che, inquadrando la pagina con lo smartphone, mostra il contenuto ancorato sopra la carta.

Caso guida: libro illustrato sui pianeti, una pagina = un pianeta; scansioni il QR e il pianeta
ruota sopra la pagina, con didascalie e audio.

## Risposte alle domande di partenza (28/10/2026)

**Esiste già?** Sì, è un genere consolidato ("augmented print", "AR books"): Zappar, Blippar,
Artivive (arte), Overly, Aryel, Quiver (album da colorare). Ma il mercato si è mosso nel 2025-26:
- Adobe Aero è stato dismesso (app ritirate 6/11/2025, server spenti dicembre 2025).
- 8th Wall (Niantic) ha chiuso la piattaforma hosted il 28/2/2026 e ha rilasciato il codice
  open source (Image Targets compresi, SLAM/VPS esclusi); i progetti pubblicati restano online
  fino al 28/2/2027.
→ C'è spazio per uno strumento semplice, self-hosted, senza app da installare.

**È possibile?** Sì, tutto nel browser, senza app:
- Tracking dell'immagine (la pagina stessa è il "marker"): **MindAR** (open source MIT,
  image tracking + three.js, compilatore dei target che gira nel browser). Alternativa: il
  codice open source di 8th Wall.
- Senza tracking della pagina (fallback): WebXR `immersive-ar` + hit-test (Android Chrome,
  Quest) o AR Quick Look (USDZ) su iPhone: il contenuto si appoggia sul tavolo, non è
  agganciato alla pagina ma funziona ovunque.

**Bisogna stampare i QR?** Sì, ma servono solo come **porta d'ingresso** (aprire il link con
la fotocamera di sistema), non per il tracking: il tracking lo fa l'immagine della pagina.
Due strategie, entrambe supportate dall'editor:
1. **Un QR per pagina** (deep link `/v/<progetto>/<pagina>`): apertura immediata sulla pagina
   giusta, nessuna ambiguità. Consigliato per libri e brochure.
2. **Un solo QR per l'intero stampato** (copertina/biglietto): il viewer riconosce da solo
   quale pagina ha davanti (MindAR supporta più target nello stesso file `.mind`).
   Consigliato per biglietti da visita e cover.
Regole di stampa: QR ≥ 2 cm di lato, quiet zone 4 moduli, alto contrasto, URL corto su
dominio proprio con **redirezione indiretta** (il QR punta a `/q/<id>`, non al contenuto:
così il contenuto si aggiorna dopo la stampa senza ristampare).

**E in VR (Quest 3)?** Il browser del Quest NON ha accesso alla camera passthrough (niente
image tracking, niente lettura QR da WebXR). Quindi su visore: si apre il link (digitato,
inviato dal telefono, o con un'app QR di terze parti) e il viewer parte in modalità
WebXR AR con hit-test: il contenuto si posiziona sul tavolo/sulla pagina con un click.
Il tracking vero della pagina su Quest richiede un'app nativa (Passthrough Camera API) ed è
fuori scopo della v1.

## Architettura

```
REALITYSURFACE/
  server/index.js      Node + Express (porta 5500): /vendor/* da node_modules, /static, /uploads, cookie-parser
  server/db.js         SQLite data/realitysurface.db: utenti, sessioni, stampati (utente_id, pubblicato, template, impostazioni JSON), pagine (qr_id, immagine,
                       qualita 0-100, target .mind, target_hash, scena JSON), asset, scansioni; migrazioni con aggiungiColonna()
  server/template.js   CATALOGO TEMPLATE (biglietto 85x55, brochure 6 ante 99x210, libro A4, poster A3, plastico A3 oriz., libero):
                       formato, pagine iniziali vuote, consigli, scalaContenuti, flag plastico
  server/auth.js       registrazione/login/logout/me; cookie httpOnly rp_sessione -> tabella sessioni (30 gg); primo utente = admin
  server/routes/api.js tutto dietro richiediLogin tranne /config e /viewer/:slug (pubblico solo se pubblicato, o proprietario);
                       CRUD stampati/pagine/asset, POST /stampati con template (crea pagine vuote), PUT /stampati/:id/ordine e /impostazioni,
                       upload (multer), target, qr.png|svg, /demo/pianeti, /demo/plastico; /config espone il catalogo template
  server/routes/public.js  / LANDING pubblica, /stampati dashboard, /login, /editor/, /v/:slug/:n viewer, /q/:qr redirect+log,
                       /stampa/:id foglio QR (proprietario), /cattura/:token pagina telefono
  public/js/comune.js  api(), toast, richiediUtente() (-> /login), chipUtente, qualitaImmagine() (Sobel + copertura griglia 4x4)
  public/js/scena.js   MODULO CONDIVISO editor/viewer: JSON scena -> three.js (glb+clip, sfera, testo, immagine, personaggio procedurale,
                       blocco); anim rotazione/fluttua/orbita/PERCORSO (punti, velocita, loop, orienta, offsetRot); animaElemento();
                       costruisciRiferimento(impostazioni, 'editor'|'viewer') = GLB del plastico fantasma / occlusore (colorWrite false)
  public/js/illustrazioni.js  mockup ISOMETRICI schematici dei prodotti su fondo bianco (stile catalogo Pixartprinting, richiesto dall'utente):
                       primitive box()/righe()/patch() + cubo AR arancione; picker template a schede bianche e copertine vuote
  public/editor/basamento.js  generaBasamento(): vista dall'alto ortografica del GLB (three.js offscreen, colori per quota, spigoli) su tavola
                       decorata (griglia, punti, anelli, cornice, titolo, bussola, QR) -> PNG = immagine/target della pagina Basamento
  public/js/three-shim.js  "three" dell'importmap = three.module.js + sRGBEncoding (MindAR lo importa ancora)
  public/landing.html + public/js/landing.js  LANDING (31/10/2026): hero con immagine AI, 4 passi, 4 casi d'uso con immagini AI
                       (public/img/*.jpg generate con ComfyUI FLUX.2 klein 4B in locale), vantaggi, CTA; se loggato i bottoni portano a /stampati
  public/index.html + public/js/home.js  DASHBOARD "I tuoi stampati" (ora su /stampati; il logo porta alla landing)
  public/login.html    accesso/registrazione (al primo avvio forza la registrazione dell'admin); torna=/stampati di default
  public/editor/editor.js   SHELL A PASSI (?passo=pagine|target|contenuti|pubblica, ?p=<pagina>): ctx condiviso, stepper con stato
  public/editor/pagine.js   passo 1: consigli del template, blocco PLASTICO (carica GLB -> impostazioni.riferimento, ingombro, rotazione,
                       "Genera basamento dal modello"), drag&drop multiplo (riempie prima le pagine vuote), titoli, ordine, sostituisci/carica
                       immagine, pagina vuota, qualita (calcolata nel browser)
                       CATTURA DAL TELEFONO: bottone "Scatta dal telefono" (+ per pagina) -> POST /api/stampati/:id/cattura -> dialogo
                       con QR (basi: PUBLIC_URL e IP LAN) + poll ogni 2 s di /cattura/:token -> chiude e ricarica quando usato
  public/cattura.html + public/js/cattura.js  PAGINA TELEFONO /cattura/<token> (senza login, token valido 30 min): foto da
                       <input capture> (funziona anche in http), 4 angoli trascinabili, omografia 8x8 + bilineare (raddrizza come
                       uno scanner), qualita, POST /api/cattura/<token> (multipart) -> immagine della pagina (o pagina nuova);
                       window.__cattura per il collaudo senza fotocamera
  public/editor/target.js   passo 2: tabella pagine + compila .mind (MindAR Compiler nel browser), ?compila=1 compila i mancanti
  public/editor/scena3d.js  passo 3: editor three.js (OrbitControls + TransformControls), elementi, proprieta, asset, Salva/Ctrl+S;
                       pannello Plastico (GLB riferimento, ingombro, offset, rotazione); percorsi: lista punti, punto attivo spostato col gizmo,
                       linea tratteggiata, bottone Anteprima che anima tutti gli elementi tranne il selezionato
  public/editor/pubblica.js passo 4: interruttore Pubblicato/Bozza, link viewer, avvisi, QR per pagina (PNG/SVG), foglio di stampa
  public/viewer/       viewer: MindARThree (anchor 0) -> fallback 3D (OrbitControls); 403 "non pubblicato"; proprietario vede anteprima
  tools/demo-pianeti.mjs  genera "Il libro dei pianeti" (3 pagine PNG con QR incorporato + texture + scene) con node-canvas
  tools/demo-biglietto.mjs genera "Biglietto Atelier Nord": fronte/retro 85x55 (1004x650) con trama isometrica, logo, QR sul retro;
                       scena con mini plastico a blocchi, logo-sfera orbitante, personaggio in cammino
  tools/demo-plastico.mjs genera "Plastico del borgo": basamento A3 (mappa, strade, fiume, impronte edifici, QR) + 9 blocchi, campanile,
                       3 etichette, 4 personaggi con percorsi
  uploads/<id stampato>/  immagini pagina, .mind, texture, GLB      data/  database
```

**Stato 29/10/2026 sera: v0.3.2 CATTURA DAL TELEFONO** (risposta a "non ho una stampante: come faccio sul quaderno?"):
la pagina puo' essere una FOTO del foglio/quaderno (il target e' la foto, il QR si apre dallo schermo del PC). Tabella `catture`
(token, stampato_id, pagina_id nullable, usato), route pubbliche /cattura/:token (html) + /api/cattura/:token (GET info, POST foto),
protette POST /api/stampati/:id/cattura, GET .../cattura/:token (stato) e .../qr.png?base=. Il server propone come base PUBLIC_URL
e gli IP IPv4 della LAN (os.networkInterfaces): nella stessa Wi-Fi funziona SENZA tunnel perche' <input capture> non richiede HTTPS.
Collaudato nel pannello con foto sintetica in prospettiva (window.__cattura) e upload curl col token: dialogo chiuso da solo, card
aggiornata. Fix: .app grid-template-columns minmax(0,1fr) (la barra larga allargava i passi nel pannello stretto). Commit da fare.

**Stato 29/10/2026: v0.3.1** illustrazioni SVG delle superfici nel picker template e nelle copertine; FLUSSO PLASTICO ribaltato:
il plastico si costruisce ALTROVE (stampa 3D, Blender), qui si carica il GLB e si genera il basamento stampabile dal modello
(public/editor/basamento.js), oppure si carica una mappa propria; demo biglietto da visita. Collaudato con un GLB di prova generato
(scratchpad make-test-glb.mjs, senza normali -> computeVertexNormals). Commit da fare.
Geolocalizzazione stile Aero: NON implementata; risposta data all'utente (GPS+bussola fattibile nel browser con precisione di metri,
VPS preciso non disponibile sul web; alternativa robusta = targa stampata sul posto). Candidato template "Luogo" per v0.4.

**Stato 28/10/2026 notte: v0.3-template FATTA e collaudata**: catalogo template nella finestra Nuovo stampato (pagine iniziali vuote
da riempire col drag&drop, consigli nel passo Pagine), tipo "plastico" con basamento stampato come target + GLB di riferimento
(fantasma nell'editor, occlusore nel viewer AR, visibile nel viewer 3D), elementi personaggio (NPC procedurale che cammina) e blocco,
animazione percorso a punti editabile col gizmo, demo "Plastico del borgo". Commit da fare.

**Stato 28/10/2026 sera: v0.2 "piattaforma" FATTA e collaudata**: account (primo = admin), stampati per utente,
pubblicazione (bozza/pubblicato, viewer 403 se bozza), editor a 4 passi con stepper (Pagine -> Target -> Contenuti -> Pubblica),
upload multiplo con stima qualita, riordino, QR per pagina + foglio di stampa, conteggio scansioni, demo Pianeti.
Account di prova locale in .env.example. Tunnel cloudflared provato e funzionante (`npx -y cloudflared tunnel --url http://localhost:5500`)
ma la prova AR dal telefono e' stata RIMANDATA su richiesta dell'utente. Nessun git init.

Flusso:
1. Creatore → nuovo "stampato" (libro, biglietto, brochure) → aggiunge pagine caricando
   l'immagine di ciascuna (JPG/PNG, idealmente la grafica definitiva di stampa).
2. Per ogni pagina: compila il target MindAR nel browser (`.mind`), mostra il punteggio di
   tracciabilità (pagine troppo uniformi = avviso), poi posiziona i contenuti sul piano.
3. Salva → JSON di scena per pagina (`{targetIndex, elementi:[{tipo, src, pos, rot, scala,
   anim, trigger}]}`) nello stesso formato per editor e viewer.
4. Esporta → QR (uno per pagina o uno per stampato) + foglio PDF da consegnare alla tipografia.
5. Lettore → scansiona → `/q/<id>` → redirect al viewer → camera → contenuto sulla pagina.

Cascata del viewer (rilevata a runtime):
`MindAR image tracking` (telefoni, camera OK) → `WebXR AR hit-test` (Quest, Android senza
tracking) → `AR Quick Look` (iPhone, USDZ generato dal GLB) → `3D viewer non-AR` (desktop).

## Stack

- Node 20+, Express, better-sqlite3 (stesso stile di LOCALIA e del portale Cucina).
- three.js (ESM da CDN pinnato), MindAR (`mind-ar` npm, build three), QR: `qrcode` npm.
- Nessun framework front-end; moduli ES vanilla.
- Icone SVG a tratto, MAI emoji (vedi feedback design UI).

## Deploy (31/10/2026)
`Dockerfile` (node:20-bookworm-slim + lib runtime per canvas), `.dockerignore`, `fly.toml` (app realitysurface,
regione ams, volume `dati` su /data, auto-stop) e `render.yaml`. Env: `DATA_DIR`, `UPLOADS_DIR` (db.js, default
locali invariati), `CODICE_INVITO` (auth.js: dopo il primo utente la registrazione richiede il codice; /api/auth/me
espone `invitoRichiesto` e login.html mostra il campo). PUBLIC_URL resta facoltativo (fallback host richiesta).
ONLINE dal 31/10 sera: https://realitysurface.fly.dev (app `realitysurface`, org personal, ams, volume `dati`, 1 macchina
shared-cpu-1x 512 MB auto-stop; flyctl via winget in %LOCALAPPDATA%\Microsoft\WinGet\Links; codice d'invito in .env.fly).
Aggiornare con `flyctl deploy --ha=false --remote-only`. Guida passo-passo in docs/deploy.md. Collaudato in locale con PORT/DATA_DIR/CODICE_INVITO (health, admin senza
invito, secondo utente 403/201, demo pianeti su DATA_DIR). Docker e flyctl NON installati su questo PC.

## Roadmap

- v0.1 FATTA: server + editor + viewer MindAR + QR + demo "Pianeti".
- v0.2 FATTA: piattaforma (account, pubblicazione), editor a passi, qualita immagine, riordino, foglio di stampa.
- v0.3 FATTA (parte template): template di stampati, plastico con riferimento GLB/occlusore, personaggi NPC con percorso, blocchi.
- v0.3.2 FATTA: cattura della pagina dal telefono (foto raddrizzata = pagina), senza stampante.
- v0.3 resto: prova AR dal telefono; QR unico per tutto lo stampato (piu' target in un .mind); audio/video; GLB NPC con clip Walk;
  WebXR hit-test (Quest/Android), USDZ iPhone.
- v0.4: MODALITA' LENS (un solo link: legge QR/EAN esistenti via WebAssembly + riconosce la pagina per embedding visivo
  DINOv2/MobileCLIP lato server -> scena; vedi docs/ingresso-senza-qr.md), NFC documentato (tag con /q/<id>),
  template "Luogo" (installazione geolocalizzata: GPS + bussola + altezza, raggio di attivazione, fallback targa stampata),
  galleria pubblica, statistiche scansioni per periodo, deploy (Render/VPS + dominio).

## Gotcha / note di sviluppo

- MindAR richiede HTTPS per la camera: in locale va bene `localhost`; dal telefono serve un
  tunnel HTTPS (es. `npx localtunnel` / cloudflared) o certificato locale.
- Il compilatore `.mind` è pesante (TensorFlow.js): lanciarlo in un Web Worker con barra di
  avanzamento; cache del target per hash dell'immagine.
- Riferimento scala: nel JSON le misure sono in **unità pagina** (larghezza pagina = 1), così
  lo stesso progetto funziona qualsiasi sia il formato di stampa.
- Collaudo nel pannello: rAF può restare fermo → `__rp.step(n)` in editor e viewer; `__rp.stato` espone lo stato.
- Nel pannello la camera è bloccata: il viewer AR va in fallback "Fotocamera non accessibile" → "Apri in 3D" (atteso).
- MindAR 1.2.5 build three importa `sRGBEncoding` da "three" (rimosso in r155+): senza lo shim il modulo non linka.
- Un elemento `[hidden]` con `display:grid` in CSS resta visibile: aggiungere sempre `.x[hidden]{display:none}`.
- node-canvas `putImageData` non compone con lo sfondo: disegnare su canvas temporaneo e poi `drawImage`.
- `button[hidden]` resta visibile perche' rp.css gli da' display:inline-flex -> c'e' `[hidden]{display:none!important}` globale.
- Il pannello browser NON puo' caricare file: l'upload pagine si collauda via curl con cookie (-c/-b), vedi sessione 28/10.
- Plastico: il tracking e' SEMPRE del basamento stampato (immagine), mai del modello 3D; il GLB serve come occlusore/riferimento e
  come sorgente del basamento generato. GLB senza NORMAL rendono nero con materiali illuminati: computeVertexNormals() prima.
- Personaggio procedurale: in piedi lungo z, guarda verso +x (naso); il percorso ruota attorno a z con atan2(dy,dx)+offsetRot.
  Per un GLB (y-up, davanti +z) dopo il wrap x=90 il davanti e' -y: offsetRot 90 lo allinea.
- Convenzione sfera: asse polare lungo z (rotation.x = 90°) così `anim.rotazione.asse:'z'` = pianeta che gira in piano.
