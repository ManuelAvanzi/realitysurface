# REALITYPAPER — AR sopra la carta stampata

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
REALITYPAPER/
  server/index.js      Node + Express (porta 5500): /vendor/* da node_modules, /static, /uploads, cookie-parser
  server/db.js         SQLite data/realitypaper.db: utenti, sessioni, stampati (utente_id, pubblicato), pagine (qr_id, immagine,
                       qualita 0-100, target .mind, target_hash, scena JSON), asset, scansioni; migrazioni con aggiungiColonna()
  server/auth.js       registrazione/login/logout/me; cookie httpOnly rp_sessione -> tabella sessioni (30 gg); primo utente = admin
  server/routes/api.js tutto dietro richiediLogin tranne /config e /viewer/:slug (pubblico solo se pubblicato, o proprietario);
                       CRUD stampati/pagine/asset, PUT /stampati/:id/ordine, upload (multer), target, qr.png|svg, /demo/pianeti
  server/routes/public.js  / portale, /login, /editor/, /v/:slug/:n viewer, /q/:qr redirect+log, /stampa/:id foglio QR (proprietario)
  public/js/comune.js  api(), toast, richiediUtente() (-> /login), chipUtente, qualitaImmagine() (Sobel + copertura griglia 4x4)
  public/js/scena.js   MODULO CONDIVISO editor/viewer: JSON scena -> three.js (glb, sfera, testo, immagine; anim rotazione/fluttua/orbita)
  public/js/three-shim.js  "three" dell'importmap = three.module.js + sRGBEncoding (MindAR lo importa ancora)
  public/login.html    accesso/registrazione (al primo avvio forza la registrazione dell'admin)
  public/editor/editor.js   SHELL A PASSI (?passo=pagine|target|contenuti|pubblica, ?p=<pagina>): ctx condiviso, stepper con stato
  public/editor/pagine.js   passo 1: drag&drop multiplo, titoli, ordine (su/giu), sostituisci immagine, qualita (calcolata nel browser)
  public/editor/target.js   passo 2: tabella pagine + compila .mind (MindAR Compiler nel browser), ?compila=1 compila i mancanti
  public/editor/scena3d.js  passo 3: editor three.js (OrbitControls + TransformControls), elementi, proprieta, asset, Salva/Ctrl+S
  public/editor/pubblica.js passo 4: interruttore Pubblicato/Bozza, link viewer, avvisi, QR per pagina (PNG/SVG), foglio di stampa
  public/viewer/       viewer: MindARThree (anchor 0) -> fallback 3D (OrbitControls); 403 "non pubblicato"; proprietario vede anteprima
  tools/demo-pianeti.mjs  genera "Il libro dei pianeti" (3 pagine PNG con QR incorporato + texture + scene) con node-canvas
  uploads/<id stampato>/  immagini pagina, .mind, texture, GLB      data/  database
```

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

## Roadmap

- v0.1 FATTA: server + editor + viewer MindAR + QR + demo "Pianeti".
- v0.2 FATTA: piattaforma (account, pubblicazione), editor a passi, qualita immagine, riordino, foglio di stampa.
- v0.3: prova AR dal telefono; QR unico per tutto lo stampato (piu' target in un .mind); audio/video; WebXR hit-test (Quest/Android), USDZ iPhone.
- v0.4: galleria pubblica, statistiche scansioni per periodo, template di stampati (biglietto, brochure), deploy (Render/VPS + dominio).

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
- Convenzione sfera: asse polare lungo z (rotation.x = 90°) così `anim.rotazione.asse:'z'` = pianeta che gira in piano.
