// Catalogo dei template di stampato: formato, pagine iniziali, consigli di stampa e di tracciamento.
// Le misure sono in mm. `pagine` sono i titoli delle pagine create vuote (senza immagine) alla creazione.

export const TEMPLATE = [
  {
    id: 'biglietto', nome: 'Biglietto da visita', tipo: 'biglietto', icona: 'biglietto',
    larghezza_mm: 85, altezza_mm: 55,
    descrizione: 'Fronte con logo e grafica, retro con il QR. La scena compare sopra il biglietto appoggiato sul tavolo.',
    pagine: ['Fronte', 'Retro'],
    consigli: [
      'Il fronte deve avere grafica ricca (logo grande, foto, pattern): è lui che viene riconosciuto.',
      'Metti il QR sul retro o in un angolo del fronte, almeno 15 mm di lato.',
      'Contenuti piccoli: raggio 0.1–0.2 (unità pagina) e altezza z bassa, così stanno nel campo della camera.',
    ],
    scalaContenuti: 0.5,
  },
  {
    id: 'brochure', nome: 'Brochure pieghevole', tipo: 'brochure', icona: 'brochure',
    larghezza_mm: 99, altezza_mm: 210,
    descrizione: 'Pieghevole a tre ante (A4 orizzontale piegato). Ogni anta è una pagina con il suo target e il suo QR.',
    pagine: ['Copertina', 'Retro', 'Aletta', 'Interno 1', 'Interno 2', 'Interno 3'],
    consigli: [
      'Esporta un’immagine per anta (99×210 mm), non l’intero foglio: le pieghe deformano il tracciamento.',
      'Un QR per anta è il più semplice; in alternativa un solo QR in copertina (v0.3).',
      'Evita grafica identica su più ante: il telefono le confonderebbe.',
    ],
    scalaContenuti: 0.8,
  },
  {
    id: 'libro', nome: 'Pagina di libro', tipo: 'libro', icona: 'libro',
    larghezza_mm: 210, altezza_mm: 297,
    descrizione: 'Libro o quaderno illustrato: una pagina = un target, un QR. Il caso guida è il libro dei pianeti.',
    pagine: ['Pagina 1', 'Pagina 2', 'Pagina 3'],
    consigli: [
      'Usa la grafica definitiva di stampa, dentro i margini: la piega centrale e il bordo tagliato vanno esclusi.',
      'Illustrazioni grandi e titoli grossi si riconoscono meglio del testo corrente.',
      'Carta opaca: la lucida riflette la luce e disturba la camera.',
    ],
    scalaContenuti: 1,
  },
  {
    id: 'poster', nome: 'Poster', tipo: 'poster', icona: 'poster',
    larghezza_mm: 297, altezza_mm: 420,
    descrizione: 'Manifesto o pannello da parete. Il pubblico inquadra da 1–2 metri: contenuti grandi e pochi.',
    pagine: ['Poster'],
    consigli: [
      'Il poster si inquadra da lontano: raggio dei contenuti 0.3–0.5 e testi con altezza riga 0.1.',
      'QR di almeno 40 mm, in basso, con spazio bianco attorno.',
      'Se il poster è dietro un vetro, il riflesso può impedire il riconoscimento: meglio stampa opaca.',
    ],
    scalaContenuti: 2,
  },
  {
    id: 'plastico', nome: 'Plastico', tipo: 'plastico', icona: 'plastico',
    larghezza_mm: 420, altezza_mm: 297,
    descrizione: 'Modello fisico (stampato in 3D o costruito) appoggiato su un basamento stampato. Il basamento è il target; sopra ci camminano personaggi e compaiono etichette.',
    pagine: ['Basamento'],
    consigli: [
      'Il telefono riconosce il BASAMENTO stampato (pianta, mappa, texture), non il modello 3D: disegnalo ricco di dettagli e lascialo visibile attorno al plastico.',
      'Carica il modello del plastico (GLB) come riferimento: nell’editor lo vedi in trasparenza, nel viewer è invisibile ma nasconde i personaggi che gli passano dietro.',
      'Un QR sul basamento o su un cartellino appoggiato: 30 mm bastano.',
      'I personaggi hanno un percorso a punti: aggiungi i punti con “Aggiungi punto qui” dopo averli spostati col gizmo.',
    ],
    scalaContenuti: 1,
    plastico: true,
  },
  {
    id: 'libero', nome: 'Formato libero', tipo: 'altro', icona: 'pagina',
    larghezza_mm: 210, altezza_mm: 210,
    descrizione: 'Qualsiasi superficie stampata: cartolina, etichetta, packaging, segnaposto.',
    pagine: ['Pagina 1'],
    consigli: ['Imposta il formato in mm per avere i QR in scala corretta sul foglio di stampa.'],
    scalaContenuti: 1,
  },
];

export const templateDaId = (id) => TEMPLATE.find((t) => t.id === id) || null;
