// Demo "Plastico del borgo": basamento A3 stampabile (mappa del paese con QR) + scena con edifici come volumi,
// personaggi che camminano lungo percorsi ed etichette. Usa node-canvas (dipendenza di mind-ar).
// CLI:  node tools/demo-plastico.mjs [--url http://...]      API: POST /api/demo/plastico
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { db, UPLOADS_DIR, nuovoQrId, slugUnico } from '../server/db.js';

async function caricaCanvas() {
  try { return await import('canvas'); } catch {
    throw new Error('Il modulo "canvas" non è disponibile: esegui `npm install canvas` per generare la demo.');
  }
}
function hash(x, y, seme) {
  let h = (x * 374761393 + y * 668265263 + seme * 1446141) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const lisc = (t) => t * t * (3 - 2 * t);
function noise(x, y, seme) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, seme), b = hash(xi + 1, yi, seme), c = hash(xi, yi + 1, seme), d = hash(xi + 1, yi + 1, seme);
  const u = lisc(xf), v = lisc(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seme, ott = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < ott; i++) { v += amp * noise(x * f, y * f, seme + i * 7); amp *= 0.5; f *= 2.1; }
  return v;
}

// Pianta del borgo in unità pagina (larghezza = 1, origine al centro; y verso l'alto della pagina).
// Il basamento è A3 orizzontale: 1 × 0.707.
const EDIFICI = [
  { nome: 'Chiesa', x: 0.02, y: 0.17, w: 0.11, d: 0.08, h: 0.10, colore: '#e7d8b8' },
  { nome: 'Municipio', x: -0.2, y: 0.12, w: 0.13, d: 0.07, h: 0.07, colore: '#d9a066' },
  { nome: 'Mercato', x: 0.22, y: -0.08, w: 0.12, d: 0.09, h: 0.045, colore: '#b8c4a0' },
  { nome: 'Scuola', x: -0.26, y: -0.15, w: 0.14, d: 0.08, h: 0.05, colore: '#c9b7a6' },
  { nome: 'Torre', x: 0.31, y: 0.2, w: 0.045, d: 0.045, h: 0.16, colore: '#9a8a7a' },
  { nome: null, x: -0.05, y: -0.2, w: 0.08, d: 0.06, h: 0.045, colore: '#d2b48c' },
  { nome: null, x: 0.1, y: -0.22, w: 0.07, d: 0.05, h: 0.04, colore: '#c8a888' },
  { nome: null, x: -0.33, y: 0.0, w: 0.06, d: 0.06, h: 0.04, colore: '#cbb79e' },
  { nome: null, x: 0.27, y: -0.21, w: 0.07, d: 0.05, h: 0.045, colore: '#d4c2a4' },
];
const PIAZZA = { x: 0.02, y: 0.0, w: 0.2, d: 0.14 };
const STRADE = [
  [[-0.5, 0.0], [-0.12, 0.0], [0.12, 0.0], [0.5, 0.0]],
  [[0.02, -0.353], [0.02, -0.07], [0.02, 0.07], [0.02, 0.353]],
  [[-0.5, -0.25], [-0.15, -0.25], [0.3, -0.3], [0.5, -0.28]],
  [[-0.38, 0.353], [-0.2, 0.25], [0.12, 0.25], [0.31, 0.3]],
];
const FIUME = [[-0.5, 0.28], [-0.42, 0.2], [-0.4, 0.05], [-0.44, -0.1], [-0.41, -0.3], [-0.46, -0.353]];

/** Basamento 1684×1190 px (A3 orizzontale a ~100 dpi). */
async function basamento(canvas, qrPng, w = 1684, h = 1190) {
  const c = canvas.createCanvas(w, h), ctx = c.getContext('2d');
  const X = (u) => (u + 0.5) * w, Y = (v) => (0.3535 - v) * w; // unità pagina → pixel (altezza = 0.707)
  // terreno
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 300, y / 300, 5, 4), m = fbm(x / 60, y / 60, 9, 3);
    const i = (y * w + x) * 4;
    d[i] = 120 + n * 60 + m * 20; d[i + 1] = 150 + n * 50 + m * 20; d[i + 2] = 90 + n * 40 + m * 10; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // campi (strisce)
  ctx.globalAlpha = 0.25;
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = k % 2 ? '#c9b35a' : '#7da352';
    ctx.save(); ctx.translate(X(0.3 + k * 0.03), Y(-0.1)); ctx.rotate(-0.4); ctx.fillRect(0, 0, 40, 600); ctx.restore();
  }
  ctx.globalAlpha = 1;
  // fiume
  ctx.strokeStyle = '#4e86b8'; ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); FIUME.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
  ctx.strokeStyle = '#7db3dd'; ctx.lineWidth = 30; ctx.stroke();
  // strade
  for (const s of STRADE) {
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 40; ctx.beginPath(); s.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.setLineDash([24, 18]); ctx.stroke(); ctx.setLineDash([]);
  }
  // piazza
  ctx.fillStyle = '#c8bfae'; ctx.fillRect(X(PIAZZA.x - PIAZZA.w / 2), Y(PIAZZA.y + PIAZZA.d / 2), PIAZZA.w * w, PIAZZA.d * w);
  ctx.strokeStyle = '#8a8070'; ctx.lineWidth = 3;
  for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(X(PIAZZA.x - PIAZZA.w / 2) + k * PIAZZA.w * w / 6, Y(PIAZZA.y + PIAZZA.d / 2)); ctx.lineTo(X(PIAZZA.x - PIAZZA.w / 2) + k * PIAZZA.w * w / 6, Y(PIAZZA.y - PIAZZA.d / 2)); ctx.stroke(); }
  // impronte edifici (dove appoggia il modello)
  for (const e of EDIFICI) {
    ctx.fillStyle = e.colore; ctx.fillRect(X(e.x - e.w / 2), Y(e.y + e.d / 2), e.w * w, e.d * w);
    ctx.strokeStyle = '#3b3028'; ctx.lineWidth = 4; ctx.strokeRect(X(e.x - e.w / 2), Y(e.y + e.d / 2), e.w * w, e.d * w);
    ctx.strokeStyle = '#3b302866'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(e.x - e.w / 2), Y(e.y + e.d / 2)); ctx.lineTo(X(e.x + e.w / 2), Y(e.y - e.d / 2)); ctx.moveTo(X(e.x + e.w / 2), Y(e.y + e.d / 2)); ctx.lineTo(X(e.x - e.w / 2), Y(e.y - e.d / 2)); ctx.stroke();
    if (e.nome) { ctx.fillStyle = '#2b2118'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(e.nome.toUpperCase(), X(e.x), Y(e.y - e.d / 2) + 36); }
  }
  // alberi
  for (let k = 0; k < 90; k++) {
    const x = hash(k, 1, 3) * w, y = hash(k, 2, 3) * h;
    const dentro = EDIFICI.some((e) => Math.abs(x - X(e.x)) < e.w * w * 0.8 && Math.abs(y - Y(e.y)) < e.d * w * 0.8) || (Math.abs(x - X(PIAZZA.x)) < PIAZZA.w * w / 2 && Math.abs(y - Y(PIAZZA.y)) < PIAZZA.d * w / 2);
    if (dentro) continue;
    ctx.fillStyle = '#2f6b2f'; ctx.beginPath(); ctx.arc(x, y, 10 + hash(k, 3, 3) * 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c9a3c'; ctx.beginPath(); ctx.arc(x - 4, y - 4, 6 + hash(k, 4, 3) * 5, 0, Math.PI * 2); ctx.fill();
  }
  // cornice, titolo, bussola, legenda
  ctx.strokeStyle = '#1e1a16'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#1e1a16cc'; ctx.fillRect(40, 40, 560, 120);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = 'bold 56px sans-serif'; ctx.fillText('BORGO DI SAN PIETRO', 60, 100);
  ctx.font = '26px sans-serif'; ctx.fillStyle = '#ffb36b'; ctx.fillText('Plastico interattivo · scala 1:1000 · demo REALITYSURFACE', 60, 140);
  ctx.save(); ctx.translate(w - 110, 120); ctx.fillStyle = '#1e1a16cc'; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(14, 10); ctx.lineTo(0, 0); ctx.lineTo(-14, 10); ctx.fill();
  ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, 40); ctx.restore();
  // QR
  const qr = await canvas.loadImage(qrPng);
  const qs = 220, qx = w - qs - 50, qy = h - qs - 50;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(qx - 14, qy - 14, qs + 28, qs + 28, 14); ctx.fill();
  ctx.drawImage(qr, qx, qy, qs, qs);
  ctx.fillStyle = '#1e1a16'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Il borgo prende vita', qx + qs / 2, qy - 26);
  return c;
}

export async function creaDemoPlastico({ baseUrl = 'http://localhost:5500', utenteId = null } = {}) {
  const canvas = await caricaCanvas();
  const titolo = 'Plastico del borgo';
  const slug = slugUnico(titolo);
  const info = db.prepare(`INSERT INTO stampati (slug, titolo, tipo, descrizione, larghezza_mm, altezza_mm, utente_id, template, impostazioni)
    VALUES (?, ?, 'plastico', ?, 420, 297, ?, 'plastico', ?)`)
    .run(slug, titolo, 'Demo: basamento A3 di un borgo con edifici come volumi, personaggi che camminano ed etichette. Al posto dei volumi puoi caricare il GLB del plastico reale come riferimento.',
      utenteId, JSON.stringify({ scalaContenuti: 1 }));
  const sid = info.lastInsertRowid;
  const dir = path.join(UPLOADS_DIR, String(sid)); fs.mkdirSync(dir, { recursive: true });
  let qr = nuovoQrId(); while (db.prepare('SELECT 1 FROM pagine WHERE qr_id = ?').get(qr)) qr = nuovoQrId();
  const qrPng = await QRCode.toBuffer(`${baseUrl.replace(/\/+$/, '')}/q/${qr}`, { type: 'png', width: 440, margin: 1, errorCorrectionLevel: 'M' });
  const c = await basamento(canvas, qrPng);
  const nome = 'basamento-borgo.png';
  fs.writeFileSync(path.join(dir, nome), c.toBuffer('image/png'));

  const elementi = [];
  EDIFICI.forEach((e, i) => elementi.push({ id: `ed${i}`, tipo: 'blocco', nome: e.nome || `Casa ${i}`, colore: e.colore, dim: [e.w, e.d, e.h],
    pos: [e.x, e.y, 0], rot: [0, 0, 0], scala: [1, 1, 1], anim: {} }));
  // campanile della chiesa
  elementi.push({ id: 'campanile', tipo: 'blocco', nome: 'Campanile', colore: '#d8c9a8', dim: [0.03, 0.03, 0.17], pos: [0.085, 0.19, 0], rot: [0, 0, 0], scala: [1, 1, 1], anim: {} });
  const etich = (id, testo, x, y, z) => ({ id, tipo: 'testo', nome: testo, testo, colore: '#ffffff', sfondo: '#1b1f2acc', altezza: 0.028, pos: [x, y, z], rot: [0, 0, 0], scala: [1, 1, 1], anim: { fluttua: { ampiezza: 0.006, periodo: 3 } } });
  elementi.push(etich('lab-chiesa', 'Chiesa di San Pietro (1420)', 0.02, 0.17, 0.15));
  elementi.push(etich('lab-torre', 'Torre civica, 38 m', 0.31, 0.2, 0.2));
  elementi.push(etich('lab-piazza', 'Piazza del mercato', 0.02, 0.0, 0.08));
  const npc = (id, nome, colore, pos, punti, vel) => ({ id, tipo: 'personaggio', nome, colore, pelle: '#f1c27d', altezza: 0.045, pos, rot: [0, 0, 0], scala: [1, 1, 1],
    anim: { percorso: { punti, velocita: vel, loop: true, orienta: true, offsetRot: 0 } } });
  elementi.push(npc('npc1', 'Passante', '#2563eb', [-0.45, 0.02, 0], [[-0.14, 0.02], [-0.14, 0.09], [0.0, 0.09], [0.0, 0.23], [0.02, 0.23], [0.02, 0.33], [0.02, 0.23], [0.0, 0.09], [-0.14, 0.09]].map((q) => [...q, 0]), 0.05));
  elementi.push(npc('npc2', 'Mercante', '#dc2626', [0.45, -0.02, 0], [[0.14, -0.02], [0.1, -0.06], [-0.06, -0.06], [-0.06, 0.06], [0.1, 0.06], [0.14, -0.02]].map((q) => [...q, 0]), 0.04));
  elementi.push(npc('npc3', 'Studente', '#16a34a', [-0.26, -0.3, 0], [[-0.15, -0.25], [0.02, -0.25], [0.02, -0.08], [0.02, -0.25], [-0.15, -0.25]].map((q) => [...q, 0]), 0.06));
  elementi.push(npc('npc4', 'Turista', '#f59e0b', [0.31, 0.33, 0], [[0.31, 0.26], [0.12, 0.25], [0.02, 0.25], [0.02, 0.09], [0.02, 0.25], [0.12, 0.25]].map((q) => [...q, 0]), 0.045));

  db.prepare(`INSERT INTO pagine (stampato_id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, scena, qualita) VALUES (?, 1, 'Basamento', ?, ?, 1684, 1190, ?, 90)`)
    .run(sid, qr, `${sid}/${nome}`, JSON.stringify({ elementi }));
  return db.prepare('SELECT * FROM stampati WHERE id = ?').get(sid);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--url');
  const baseUrl = i > -1 ? process.argv[i + 1] : (process.env.PUBLIC_URL || 'http://localhost:5500');
  creaDemoPlastico({ baseUrl }).then((s) => console.log(`Demo creata: "${s.titolo}" (id ${s.id}, slug ${s.slug}).`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
