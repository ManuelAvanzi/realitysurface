# REALITYPAPER v0.3 — AR sopra la carta stampata

Piattaforma web (editor + viewer) per far comparire contenuti 3D sopra pagine stampate: libri,
biglietti da visita, brochure, copertine. Nessuna app da installare: si scansiona il QR e si
inquadra la pagina col telefono.

## Avvio
1. Doppio click su `AVVIA.bat` (oppure `npm install` e `npm start`). Portale: http://localhost:5500
2. Al primo avvio la piattaforma chiede di creare l'account amministratore. Gli account successivi
   si registrano da soli e vedono solo i propri stampati; l'amministratore li vede tutti.
3. Nel portale: **Demo** → "Il libro dei pianeti" (3 pagine), "Plastico del borgo" (basamento con edifici,
   personaggi che camminano, etichette) o "Biglietto da visita Atelier Nord". I target vanno compilati al passo 2.

## Template
**Nuovo stampato** parte da un template: biglietto da visita (85×55, fronte e retro), brochure pieghevole
(6 ante da 99×210), pagina di libro (A4), poster (A3), plastico (basamento A3 orizzontale), formato libero.
Il template imposta formato e crea le pagine iniziali vuote: nel passo Pagine trascini le immagini e vengono
assegnate in ordine. Ogni template ha i suoi consigli di stampa e di tracciamento, mostrati nel passo Pagine.

## Plastico
Il plastico lo costruisci con i tuoi strumenti (stampa 3D, Blender, cartone): REALITYPAPER non lo modella.
Il flusso è:
1. **Carica il GLB** del plastico nel passo Pagine (blocco "Modello del plastico"). Serve come riferimento
   nell'editor (in trasparenza) e come occlusore nel viewer AR: i personaggi spariscono dietro gli edifici veri.
2. **Genera basamento dal modello**: dal GLB viene prodotta la tavola stampabile (vista dall'alto, trama,
   cornice, bussola, QR). È il basamento che il telefono riconosce. In alternativa carica una tua mappa o pianta.
3. Stampa il basamento a dimensione reale e appoggia il plastico sulla sua impronta.
4. Nel passo Contenuti popola la scena: **Personaggi** (omini procedurali) che camminano lungo un **percorso
   a punti** (aggiungi un punto, spostalo col gizmo, premi Anteprima), **Blocchi** come volumi segnaposto,
   etichette, modelli GLB animati.

## Il flusso di lavoro (editor a 4 passi)
1. **Pagine** — trascina le grafiche definitive di stampa (JPG/PNG, anche più file insieme).
   Ogni pagina riceve un titolo, un numero d'ordine e una **stima di qualità**: immagini ricche
   di dettagli e contrasto si riconoscono bene, fondi uniformi no. Puoi riordinare, rinominare,
   sostituire l'immagine.
2. **Target** — per ogni pagina si compila nel browser il file di riconoscimento (circa 10 s).
   "Compila i target mancanti" li fa tutti in fila. Se cambi l'immagine, il target va rifatto.
3. **Contenuti** — editor 3D: scegli la pagina a sinistra, aggiungi modelli GLB, sfere con
   texture, testi e immagini; posizionali col gizmo (W sposta, E ruota, R scala), imposta le
   animazioni (rotazione, fluttuazione, orbita). **Salva** per ogni pagina (Ctrl+S).
   Unità di misura: larghezza della pagina = 1; z è l'altezza sopra la carta.
4. **Pubblica** — l'interruttore Bozza/Pubblicato attiva il viewer pubblico. Qui trovi il link,
   i QR per pagina (PNG/SVG) e il **foglio di stampa** con tutti i QR a 40 mm per la tipografia.
   Finché è in bozza, i QR mostrano un avviso ma tu vedi sempre l'anteprima.

I QR puntano a `/q/<id>` (redirezione): la scena si può cambiare anche dopo la stampa.

## Senza stampante: un quaderno, un foglio, un oggetto piatto
Non serve stampare nulla. Il QR serve solo ad aprire il link: lo inquadri sullo schermo del PC
o apri il link a mano. Il riconoscimento usa l'immagine della pagina, che può essere una **foto**.

1. Passo 1, **Scatta dal telefono** (o il bottone con il telefono sulla singola pagina): compare
   un QR. Inquadralo con la fotocamera del telefono: si apre una pagina senza login.
2. Scatta la foto del foglio (o scegline una dalla galleria), trascina i quattro punti sugli
   angoli del foglio e premi **Raddrizza e invia**: la foto viene raddrizzata come una scansione
   e arriva nell'editor, che si aggiorna da solo.
3. Compila il target e aggiungi i contenuti come sempre. Per vedere l'AR apri il link della
   pagina sul telefono e inquadra il foglio vero.

Il telefono deve raggiungere il PC: nella stessa Wi-Fi il dialogo propone l'indirizzo locale
(es. `http://192.168.1.6:5500`), e per scattare la foto NON serve HTTPS. Con il tunnel attivo
(`PUBLIC_URL`) funziona anche da fuori. Il link di cattura vale 30 minuti.

Cosa funziona e cosa no: il foglio deve avere qualcosa sopra, con contrasto (un disegno a
pennarello, una pagina scritta). Un foglio bianco o solo a righe/quadretti non si riconosce.
Tieni il foglio piatto: il riconoscimento è per superfici piane.

## Provare dal telefono (AR vera)
La fotocamera nel browser richiede HTTPS. Il modo più semplice è un tunnel:

    npx -y cloudflared tunnel --url http://localhost:5500

Poi avvia il server con `PUBLIC_URL` uguale all'indirizzo del tunnel, così i QR puntano lì
(in PowerShell: `$env:PUBLIC_URL="https://xxx.trycloudflare.com"; npm start`). Il passo
Pubblica avvisa se l'indirizzo pubblico è ancora localhost.

## Limiti attuali
- Un target per pagina (un QR per pagina). Il QR unico per tutto il libro arriva nella v0.3.
- Audio e video come elementi: v0.3.
- Su Meta Quest il browser non ha accesso alla camera: usare il viewer in 3D.
