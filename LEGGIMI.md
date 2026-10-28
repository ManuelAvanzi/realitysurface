# REALITYPAPER v0.2 — AR sopra la carta stampata

Piattaforma web (editor + viewer) per far comparire contenuti 3D sopra pagine stampate: libri,
biglietti da visita, brochure, copertine. Nessuna app da installare: si scansiona il QR e si
inquadra la pagina col telefono.

## Avvio
1. Doppio click su `AVVIA.bat` (oppure `npm install` e `npm start`). Portale: http://localhost:5500
2. Al primo avvio la piattaforma chiede di creare l'account amministratore. Gli account successivi
   si registrano da soli e vedono solo i propri stampati; l'amministratore li vede tutti.
3. Nel portale: **Crea demo Pianeti** → tre pagine pronte, con target da compilare (passo 2).

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
