# Entrare nell'esperienza senza QR — indagine (28/10/2026)

Il QR in REALITYSURFACE è solo la **porta d'ingresso** (apre il link); il tracking lo fa l'immagine.
Quindi la domanda "c'è di meglio del QR?" riguarda solo come si arriva al link giusto.

## Le alternative, valutate

| Metodo | Serve stampare? | Funziona su | Precisione | Costo | Giudizio |
|---|---|---|---|---|---|
| QR (attuale) | sì, visibile | tutti i telefoni, fotocamera di sistema | certa | zero | resta il default per la carta |
| **NFC tag** adesivo con l'URL `/q/<id>` | no (adesivo invisibile) | iPhone XS+ e Android, senza app: notifica da toccare | certa | 0,2–0,5 € a tag | ottimo per oggetti, plastici, biglietti premium |
| **Modalità Lens**: un solo link, inquadri e l'app riconosce la pagina/oggetto | no | tutti (web) | alta se le grafiche sono diverse tra loro | sviluppo | la via "AI", copre oggetti senza codice |
| **Codice già esistente** (QR altrui, EAN/ISBN) letto dalla modalità Lens e usato come chiave | no | tutti (lettura via WebAssembly: iOS non ha BarcodeDetector) | certa | sviluppo piccolo | adotta oggetti che hanno già un codice |
| Target multipli MindAR in un solo `.mind` (QR unico per stampato) | un QR solo | tutti | buona entro decine di pagine | sviluppo piccolo | già in roadmap v0.3 |
| Watermark invisibile (Digimarc) | sì, invisibile | serve il loro SDK | certa | licenza proprietaria | non self-hosted: no per ora |
| Riconoscimento di oggetti 3D (Vuforia Model Targets, ARKit object) | no | solo app native | alta | licenza | fuori dal web: no |
| Geolocalizzazione (GPS+bussola) | no | web | metri | sviluppo | per installazioni grandi all'aperto, v0.4 |
| OCR del testo (Tesseract.js) | no | web | media | sviluppo | nicchia: titoli di libri |

## Come funzionerebbe la "Modalità Lens"

1. Un unico indirizzo (es. `/lens`, installabile come app sulla home): apri, inquadri.
2. Lettura di QR/EAN/Data Matrix dal flusso video (libreria WebAssembly tipo zxing-wasm,
   perché Safari iOS non espone l'API BarcodeDetector): se il codice è noto → scena.
   Un codice "altrui" (es. il barcode ISBN di un libro, il QR di un prodotto) si può
   **registrare** come chiave di una pagina: non cambi dove porta quel codice, ma la tua app lo riconosce.
3. Se non c'è codice: un fotogramma viene confrontato con le immagini di tutte le pagine
   registrate tramite **embedding visivi** (DINOv2 piccolo o MobileCLIP-S0, ~40 MB, disponibili
   in ONNX per transformers.js / onnxruntime-web; oppure lato server con onnxruntime-node,
   più semplice per i telefoni). Vince la pagina più simile sopra una soglia; sotto soglia si
   propone una lista. Poi parte MindAR con il target di quella pagina, come oggi.
4. Oggetti 3D senza grafica piana (una statuina, un prodotto): il riconoscimento dice *cosa*
   è, l'ancoraggio lo fa il basamento stampato o, in mancanza, WebXR hit-test sul tavolo.

Limiti onesti: pagine con la stessa grafica (ante di brochure identiche, pagine di solo testo)
sono indistinguibili per qualsiasi riconoscitore; servono grafiche diverse o un codice.

## Raccomandazione

- Tenere il QR come default per la carta (universale, gratis, zero attrito).
- Documentare subito l'NFC: basta scrivere `/q/<id>` sul tag con una qualsiasi app NFC; nessuna
  modifica al software.
- Costruire la Modalità Lens (codici esistenti + riconoscimento immagine lato server) come
  v0.4: rende il QR facoltativo e apre il caso "oggetto che non ha un codice".

Fonti: caniuse/WebKit su BarcodeDetector iOS (non supportato, flag rotto da iOS 18); Apple Core NFC
(lettura in background da iPhone XS, link https, notifica); MindAR multi-target (nessun limite
documentato, dipende dal dispositivo); DINOv2/MobileCLIP in ONNX per il browser; Digimarc = SDK proprietario.
