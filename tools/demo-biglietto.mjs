// Demo "Biglietto da visita": fronte e retro 85×55 mm (1004×650 px a 300 dpi) con grafica ricca per il tracking,
// QR sul retro, scena con logo 3D che fluttua, didascalie e un personaggio che saluta. Usa node-canvas.
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
const NOME = 'Atelier Nord', RUOLO = 'Architettura · Plastici · Visualizzazione';

function sfondo(ctx, w, h, seme) {
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#13161d'); g.addColorStop(1, '#232838');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // trama isometrica: linee diagonali + triangoli pieni (ricca di feature, senza ripetersi troppo)
  ctx.strokeStyle = '#3a4152'; ctx.lineWidth = 2;
  for (let x = -h; x < w + h; x += 46) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h * 0.6, h); ctx.stroke(); }
  for (let k = 0; k < 70; k++) {
    const x = hash(k, 1, seme) * w, y = hash(k, 2, seme) * h, s = 14 + hash(k, 3, seme) * 40;
    ctx.fillStyle = `rgba(255,89,0,${0.08 + hash(k, 4, seme) * 0.35})`;
    ctx.beginPath(); ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.closePath(); ctx.fill();
  }
}
function logo(ctx, x, y, s) {
  // marchio: tre blocchi isometrici impilati
  const b = (dx, dy, c1, c2) => {
    ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x + dx, y + dy - s); ctx.lineTo(x + dx + s, y + dy - s / 2); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx - s, y + dy - s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + dx - s, y + dy - s / 2); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx, y + dy + s); ctx.lineTo(x + dx - s, y + dy + s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff8a4c'; ctx.beginPath(); ctx.moveTo(x + dx + s, y + dy - s / 2); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx, y + dy + s); ctx.lineTo(x + dx + s, y + dy + s / 2); ctx.closePath(); ctx.fill();
  };
  b(0, 0, '#ffb36b', '#ff5900'); b(-s, s * 1.5, '#ffb36b', '#c94400'); b(s, s * 1.5, '#ffb36b', '#c94400');
}

async function fronte(canvas, w = 1004, h = 650) {
  const c = canvas.createCanvas(w, h), ctx = c.getContext('2d');
  sfondo(ctx, w, h, 3);
  logo(ctx, 150, 250, 58);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 86px sans-serif'; ctx.fillText(NOME, 300, 270);
  ctx.font = '34px sans-serif'; ctx.fillStyle = '#ffb36b'; ctx.fillText(RUOLO, 302, 322);
  ctx.strokeStyle = '#ff5900'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(300, 360); ctx.lineTo(700, 360); ctx.stroke();
  ctx.fillStyle = '#e6e8ee'; ctx.font = '600 34px sans-serif';
  ctx.fillText('Giulia Ferrante', 300, 420); ctx.font = '28px sans-serif'; ctx.fillStyle = '#9aa3b2';
  ctx.fillText('architetto · responsabile modelli', 300, 460);
  ctx.fillText('giulia@ateliernord.example · +39 0438 00 00 00', 300, 500);
  ctx.fillStyle = '#5b6474'; ctx.font = '24px sans-serif'; ctx.fillText('Inquadra il biglietto col telefono: il nostro ultimo progetto prende forma', 60, 600);
  return c;
}
async function retro(canvas, qrPng, w = 1004, h = 650) {
  const c = canvas.createCanvas(w, h), ctx = c.getContext('2d');
  sfondo(ctx, w, h, 9);
  const qr = await canvas.loadImage(qrPng);
  const qs = 400, qx = 80, qy = (h - qs) / 2;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(qx - 18, qy - 18, qs + 36, qs + 36, 24); ctx.fill();
  ctx.drawImage(qr, qx, qy, qs, qs);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('Scansiona', 560, 250);
  ctx.fillText('e guarda', 560, 320);
  ctx.fillStyle = '#ffb36b'; ctx.font = '30px sans-serif'; ctx.fillText('il progetto in 3D', 562, 370);
  ctx.fillStyle = '#9aa3b2'; ctx.font = '26px sans-serif'; ctx.fillText('sopra questo biglietto', 562, 410);
  logo(ctx, 640, 520, 30);
  ctx.fillStyle = '#e6e8ee'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(NOME, 700, 540);
  return c;
}

export async function creaDemoBiglietto({ baseUrl = 'http://localhost:5500', utenteId = null } = {}) {
  const canvas = await caricaCanvas();
  const titolo = 'Biglietto Atelier Nord';
  const slug = slugUnico(titolo);
  const info = db.prepare(`INSERT INTO stampati (slug, titolo, tipo, descrizione, larghezza_mm, altezza_mm, utente_id, template, impostazioni)
    VALUES (?, ?, 'biglietto', ?, 85, 55, ?, 'biglietto', ?)`)
    .run(slug, titolo, 'Demo: biglietto da visita di uno studio di architettura. Fronte riconoscibile, QR sul retro, scena con logo 3D, plastico in miniatura e personaggio.',
      utenteId, JSON.stringify({ scalaContenuti: 0.5 }));
  const sid = info.lastInsertRowid;
  const dir = path.join(UPLOADS_DIR, String(sid)); fs.mkdirSync(dir, { recursive: true });
  const qrF = nuovoQrId(), qrR = nuovoQrId();
  const qrPng = await QRCode.toBuffer(`${baseUrl.replace(/\/+$/, '')}/q/${qrF}`, { type: 'png', width: 440, margin: 1, errorCorrectionLevel: 'M' });
  const f = await fronte(canvas), r = await retro(canvas, qrPng);
  fs.writeFileSync(path.join(dir, 'fronte.png'), f.toBuffer('image/png'));
  fs.writeFileSync(path.join(dir, 'retro.png'), r.toBuffer('image/png'));
  const blocco = (id, nome, colore, dim, pos) => ({ id, tipo: 'blocco', nome, colore, dim, pos, rot: [0, 0, 0], scala: [1, 1, 1], anim: {} });
  const scenaFronte = { elementi: [
    // mini plastico di un edificio che cresce sul biglietto
    blocco('b1', 'Corpo basso', '#cfc6b8', [0.22, 0.14, 0.05], [-0.22, -0.05, 0]),
    blocco('b2', 'Torre', '#e6ddcc', [0.09, 0.09, 0.2], [-0.16, 0.0, 0]),
    blocco('b3', 'Ala', '#bfb5a4', [0.1, 0.18, 0.08], [-0.3, 0.06, 0]),
    { id: 'logo', tipo: 'sfera', nome: 'Logo', src: '', colore: '#ff5900', raggio: 0.05, pos: [0.3, 0.12, 0.14], rot: [0, 0, 0], scala: [1, 1, 1],
      anim: { rotazione: { asse: 'z', giri: 6 }, fluttua: { ampiezza: 0.02, periodo: 2.5 } } },
    { id: 'sat', tipo: 'sfera', nome: 'Satellite', src: '', colore: '#ffb36b', raggio: 0.015, pos: [0.3, 0.12, 0.14], rot: [0, 0, 0], scala: [1, 1, 1],
      anim: { orbita: { raggio: 0.09, periodo: 3, asse: 'z' } } },
    { id: 't1', tipo: 'testo', nome: 'Didascalia', testo: 'Nuova sede · consegna 2027', colore: '#ffffff', sfondo: '#1b1f2acc', altezza: 0.03, pos: [-0.18, -0.2, 0.03], rot: [0, 0, 0], scala: [1, 1, 1], anim: {} },
    { id: 'npc', tipo: 'personaggio', nome: 'Giulia', colore: '#ff5900', pelle: '#f1c27d', altezza: 0.07, pos: [0.08, -0.18, 0], rot: [0, 0, 0], scala: [1, 1, 1],
      anim: { percorso: { punti: [[0.08, 0.1, 0], [0.2, 0.1, 0], [0.2, -0.18, 0]], velocita: 0.05, loop: true, orienta: true, offsetRot: 0 } } },
  ] };
  const scenaRetro = { elementi: [
    { id: 'r1', tipo: 'testo', nome: 'Benvenuto', testo: 'Ciao! Sono il biglietto\ndi Atelier Nord', colore: '#ffffff', sfondo: '#1b1f2acc', altezza: 0.035, pos: [0.15, 0.1, 0.06], rot: [0, 0, 0], scala: [1, 1, 1], anim: { fluttua: { ampiezza: 0.01, periodo: 3 } } },
    { id: 'r2', tipo: 'personaggio', nome: 'Guida', colore: '#2563eb', pelle: '#f1c27d', altezza: 0.09, pos: [0.15, -0.12, 0], rot: [0, 0, 90], scala: [1, 1, 1], anim: {} },
    { id: 'r3', tipo: 'sfera', nome: 'Logo', src: '', colore: '#ff5900', raggio: 0.04, pos: [-0.28, 0.0, 0.3], rot: [0, 0, 0], scala: [1, 1, 1], anim: { rotazione: { asse: 'z', giri: 4 } } },
  ] };
  const ins = db.prepare(`INSERT INTO pagine (stampato_id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, scena, qualita) VALUES (?, ?, ?, ?, ?, 1004, 650, ?, 88)`);
  ins.run(sid, 1, 'Fronte', qrF, `${sid}/fronte.png`, JSON.stringify(scenaFronte));
  ins.run(sid, 2, 'Retro', qrR, `${sid}/retro.png`, JSON.stringify(scenaRetro));
  return db.prepare('SELECT * FROM stampati WHERE id = ?').get(sid);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--url');
  const baseUrl = i > -1 ? process.argv[i + 1] : (process.env.PUBLIC_URL || 'http://localhost:5500');
  creaDemoBiglietto({ baseUrl }).then((s) => console.log(`Demo creata: "${s.titolo}" (id ${s.id}, slug ${s.slug}).`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
