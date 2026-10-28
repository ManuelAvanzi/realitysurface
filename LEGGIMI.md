# REALITYPAPER v0.3 — AR sopra la carta stampata

Piattaforma web (editor + viewer) per far comparire contenuti 3D sopra pagine stampate: libri,
biglietti da visita, brochure, copertine. Nessuna app da installare: si scansiona il QR e si
inquadra la pagina col telefono.

## Avvio
1. Doppio click su `AVVIA.bat` (oppure `npm install` e `npm start`). Portale: http://localhost:5500
2. Al primo avvio la piattaforma chiede di creare l'account amministratore. Gli account successivi
   si registrano da soli e vedono solo i propri stampati; l'amministratore li vede tutti.
3. Nel portale: **Demo** → "Il libro dei pianeti" (3 pagine) oppure "Plastico del borgo" (basamento con
   edifici, personaggi che camminano, etichette). I target vanno compilati al passo 2.

## Template
**Nuovo stampato** parte da un template: biglietto da visita (85×55, fronte e retro), brochure pieghevole
(6 ante da 99×210), pagina di libro (A4), poster (A3), plastico (basamento A3 orizzontale), formato libero.
Il template imposta formato e crea le pagine iniziali vuote: nel passo Pagine trascini le immagini e vengono
assegnate in ordine. Ogni template ha i suoi consigli di stampa e di tracciamento, mostrati nel passo Pagine.

## Plastico
Il telefono riconosce il **basamento stampato** (una mappa, una pianta, una texture ricca di dettagli) su cui
appoggi il modello fisico, stampato in 3D o costruito. Nel passo Contenuti il pannello **Plastico** ti fa
caricare il GLB del modello come riferimento: nell'editor lo vedi in trasparenza per posizionare i contenuti,
nel viewer AR è invisibile ma nasconde i personaggi che gli passano dietro. Gli elementi **Personaggio** sono
omini procedurali che camminano lungo un **percorso a punti**: aggiungi un punto, spostalo col gizmo, premi
Anteprima per vederli muovere. I **Blocchi** sono volumi colorati utili come edifici segnaposto.

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
