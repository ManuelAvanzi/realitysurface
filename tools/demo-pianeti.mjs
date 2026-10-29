// Demo "Il libro dei pianeti": genera 3 pagine stampabili (con QR incorporato), le texture dei pianeti
// e le scene AR. Usa node-canvas (installato come dipendenza di mind-ar).
// CLI:  npm run demo [-- --url http://192.168.1.10:5500]      API: POST /api/demo/pianeti
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { db, UPLOADS_DIR, nuovoQrId, slugUnico } from '../server/db.js';

let canvasLib = null;
async function caricaCanvas() {
  if (canvasLib) return canvasLib;
  try { canvasLib = await import('canvas'); } catch {
    throw new Error('Il modulo "canvas" non è disponibile: esegui `npm install canvas` per generare la demo.');
  }
  return canvasLib;
}

// ---------- rumore (value noise + fbm) deterministico ----------
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
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
function sfumatura(colori, t) {
  const n = colori.length - 1, p = Math.min(Math.max(t, 0), 0.9999) * n, i = Math.floor(p);
  return mix(colori[i], colori[i + 1], p - i);
}

export const PIANETI = [
  {
    nome: 'Marte', sottotitolo: 'Il pianeta rosso', seme: 11, colore: '#c1440e',
    bande: [[120, 40, 20], [193, 68, 14], [222, 130, 70], [160, 60, 30], [230, 190, 160]], bandeFreq: 1.2, turb: 0.9,
    fatti: ['Quarto pianeta dal Sole', 'Diametro: 6.792 km (metà della Terra)', 'Un giorno dura 24 h e 37 min', 'Il monte Olimpo è alto 21 km', 'Due lune: Phobos e Deimos'],
  },
  {
    nome: 'Giove', sottotitolo: 'Il gigante gassoso', seme: 23, colore: '#c8a070',
    bande: [[232, 210, 170], [160, 110, 70], [240, 225, 200], [190, 130, 90], [225, 205, 175], [140, 90, 60], [235, 215, 185]], bandeFreq: 6, turb: 0.25,
    fatti: ['Quinto pianeta dal Sole', 'Diametro: 139.820 km (11 Terre)', 'Un giorno dura meno di 10 ore', 'La Grande Macchia Rossa è una tempesta', 'Oltre 90 lune conosciute'],
    macchia: true, lune: true,
  },
  {
    nome: 'Saturno', sottotitolo: 'Il signore degli anelli', seme: 37, colore: '#d9c38a',
    bande: [[225, 200, 140], [200, 170, 110], [240, 225, 180], [190, 160, 100], [235, 215, 165]], bandeFreq: 5, turb: 0.2,
    fatti: ['Sesto pianeta dal Sole', 'Diametro: 116.460 km', 'Anelli larghi 280.000 km, spessi pochi metri', 'Meno denso dell’acqua', 'Oltre 140 lune conosciute'],
    anelli: true,
  },
];

/** Texture equirettangolare 1024x512 di un pianeta. Ritorna il canvas. */
function texturaPianeta(canvas, p, w = 1024, h = 512) {
  const c = canvas.createCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const turb = (fbm(u * 6, lat * 6, p.seme, 5) - 0.5) * p.turb;
      const t = (Math.sin((lat + turb) * Math.PI * p.bandeFreq) + 1) / 2;
      let col = sfumatura(p.bande, t);
      const grana = (fbm(u * 40, lat * 40, p.seme + 99, 3) - 0.5) * 40;
      col = col.map((v) => Math.max(0, Math.min(255, v + grana)));
      if (p.macchia) {
        const dx = (u - 0.3) * 2.2, dy = (lat - 0.62) * 4.5, r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.22) col = mix(col, [190, 70, 50], (1 - r / 0.22) * 0.9);
      }
      const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** PNG 1024x1024 degli anelli di Saturno (trasparente al centro). */
function texturaAnelli(canvas, size = 1024) {
  const c = canvas.createCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data, cx = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x - cx, y - cx) / cx; // 0..1
    const i = (y * size + x) * 4;
    if (r < 0.42 || r > 0.98) { d[i + 3] = 0; continue; }
    const t = (r - 0.42) / 0.56;
    const dens = 0.35 + 0.65 * Math.abs(Math.sin(t * 28) * 0.6 + Math.sin(t * 7) * 0.4);
    const gap = (t > 0.62 && t < 0.68) ? 0.15 : 1; // divisione di Cassini
    const col = sfumatura([[200, 180, 140], [235, 220, 190], [170, 150, 110]], t);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * dens * gap * 0.9);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Pagina stampabile 1200x1600 con cielo stellato, pianeta renderizzato dalla texture, testi e QR. */
async function paginaStampabile(canvas, p, tex, qrPng, numero, w = 1200, h = 1600) {
  const c = canvas.createCanvas(w, h), ctx = c.getContext('2d');
  // sfondo
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#060a1a'); g.addColorStop(1, '#0d1430');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // nebulose
  for (let k = 0; k < 4; k++) {
    const x = hash(k, 1, p.seme) * w, y = hash(k, 2, p.seme) * h, r = 250 + hash(k, 3, p.seme) * 300;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = [[90, 60, 160], [40, 90, 160], [150, 60, 110]][k % 3];
    rg.addColorStop(0, `rgba(${col},0.35)`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }
  // stelle
  for (let k = 0; k < 900; k++) {
    const x = hash(k, 10, p.seme) * w, y = hash(k, 11, p.seme) * h, s = hash(k, 12, p.seme);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s * 0.7})`;
    ctx.beginPath(); ctx.arc(x, y, s < 0.9 ? 1 + s : 2.5 + s * 2, 0, Math.PI * 2); ctx.fill();
  }
  // costellazione decorativa (linee) per dare feature tracciabili
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  let px = 120, py = 1180;
  ctx.beginPath(); ctx.moveTo(px, py);
  for (let k = 0; k < 7; k++) { px += 60 + hash(k, 20, p.seme) * 90; py += (hash(k, 21, p.seme) - 0.5) * 160; ctx.lineTo(px, py); }
  ctx.stroke();
  // pianeta
  const R = 330, cx = w / 2, cy = 665;
  const tw = tex.width, th = tex.height, td = tex.getContext('2d').getImageData(0, 0, tw, th).data;
  const disco = ctx.createImageData(R * 2, R * 2), dd = disco.data;
  const luce = [-0.5, -0.6, 0.62];
  for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
    const nx = (x - R) / R, ny = (y - R) / R, r2 = nx * nx + ny * ny, i = (y * R * 2 + x) * 4;
    if (r2 > 1) { dd[i + 3] = 0; continue; }
    const nz = Math.sqrt(1 - r2);
    const lon = Math.atan2(nx, nz), lat = Math.asin(ny);
    const u = ((lon / Math.PI + 1) / 2 + 0.25) % 1, v = lat / Math.PI + 0.5;
    const ti = ((Math.floor(v * (th - 1)) * tw) + Math.floor(u * (tw - 1))) * 4;
    let l = Math.max(0.08, nx * luce[0] + ny * luce[1] + nz * luce[2]);
    l = Math.min(1.15, l * 1.1 + 0.1);
    const bordo = Math.min(1, (1 - r2) * 12);
    dd[i] = td[ti] * l; dd[i + 1] = td[ti + 1] * l; dd[i + 2] = td[ti + 2] * l; dd[i + 3] = 255 * bordo;
  }
  // alone
  const alone = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.25);
  alone.addColorStop(0, `rgba(${[...sfumatura(p.bande, 0.5)]},0.45)`); alone.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = alone; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();
  if (p.anelli) {
    const an = texturaAnelli(canvas, 1024);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.32); ctx.drawImage(an, -R * 2.3, -R * 2.3, R * 4.6, R * 4.6); ctx.restore();
  }
  // putImageData non compone con lo sfondo: passo da un canvas temporaneo
  const tmp = canvas.createCanvas(R * 2, R * 2); tmp.getContext('2d').putImageData(disco, 0, 0);
  ctx.drawImage(tmp, cx - R, cy - R);
  if (p.anelli) { // parte anteriore degli anelli sopra il pianeta
    const an = texturaAnelli(canvas, 1024);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.32);
    ctx.beginPath(); ctx.rect(-R * 2.3, 0, R * 4.6, R * 2.3); ctx.clip();
    ctx.drawImage(an, -R * 2.3, -R * 2.3, R * 4.6, R * 4.6); ctx.restore();
  }
  // testi
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
  ctx.font = 'bold 150px sans-serif'; ctx.fillText(p.nome.toUpperCase(), 90, 90);
  ctx.font = '48px sans-serif'; ctx.fillStyle = '#ffb36b'; ctx.fillText(p.sottotitolo, 96, 255);
  ctx.font = '600 34px sans-serif'; ctx.fillStyle = '#e6e8ee';
  p.fatti.forEach((f, i) => {
    ctx.fillStyle = '#ff5900'; ctx.beginPath(); ctx.arc(110, 1090 + i * 64 + 18, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6e8ee'; ctx.fillText(f, 135, 1090 + i * 64);
  });
  // QR con cornice bianca + istruzione
  const qr = await canvas.loadImage(qrPng);
  const qs = 230, qx = w - qs - 90, qy = h - qs - 110;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(qx - 14, qy - 14, qs + 28, qs + 28, 16); ctx.fill();
  ctx.drawImage(qr, qx, qy, qs, qs);
  ctx.fillStyle = '#9aa3b2'; ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Inquadra il QR: il pianeta', qx + qs / 2, qy + qs + 28);
  ctx.fillText('esce dalla pagina', qx + qs / 2, qy + qs + 60);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5b6474'; ctx.font = '26px sans-serif'; ctx.fillText(`${numero}  ·  IL LIBRO DEI PIANETI  ·  demo REALITYSURFACE`, 90, h - 60);
  return c;
}

/** Crea lo stampato demo nel database e i file in uploads/. Ritorna lo stampato. */
export async function creaDemoPianeti({ baseUrl = 'http://localhost:5500', utenteId = null } = {}) {
  const canvas = await caricaCanvas();
  const titolo = 'Il libro dei pianeti';
  const slug = slugUnico(titolo);
  const info = db.prepare(`INSERT INTO stampati (slug, titolo, tipo, descrizione, larghezza_mm, altezza_mm, utente_id) VALUES (?, ?, 'libro', ?, 210, 280, ?)`)
    .run(slug, titolo, 'Demo generata automaticamente: tre pagine, un pianeta per pagina, QR incorporato nella grafica.', utenteId);
  const sid = info.lastInsertRowid;
  const dir = path.join(UPLOADS_DIR, String(sid)); fs.mkdirSync(dir, { recursive: true });
  const salva = (nome, c) => { fs.writeFileSync(path.join(dir, nome), c.toBuffer('image/png')); return `${sid}/${nome}`; };
  const addAsset = (nome, percorso) => db.prepare('INSERT INTO asset (stampato_id, nome, tipo, percorso, dimensione) VALUES (?, ?, ?, ?, ?)')
    .run(sid, nome, 'immagine', percorso, fs.statSync(path.join(UPLOADS_DIR, percorso)).size);

  let anelli = null;
  for (let i = 0; i < PIANETI.length; i++) {
    const p = PIANETI[i];
    const tex = texturaPianeta(canvas, p);
    const texPath = salva(`texture-${p.nome.toLowerCase()}.png`, tex); addAsset(`texture-${p.nome.toLowerCase()}.png`, texPath);
    let qr = nuovoQrId(); while (db.prepare('SELECT 1 FROM pagine WHERE qr_id = ?').get(qr)) qr = nuovoQrId();
    const qrPng = await QRCode.toBuffer(`${baseUrl.replace(/\/+$/, '')}/q/${qr}`, { type: 'png', width: 460, margin: 1, errorCorrectionLevel: 'M' });
    const pag = await paginaStampabile(canvas, p, tex, qrPng, i + 1);
    const pagPath = salva(`pagina-${i + 1}-${p.nome.toLowerCase()}.png`, pag);
    const elementi = [
      { id: `pianeta${i}`, tipo: 'sfera', nome: p.nome, src: texPath, colore: p.colore, raggio: 0.2, pos: [0, 0.1, 0.26], rot: [0, 0, 0], scala: [1, 1, 1],
        anim: { rotazione: { asse: 'z', giri: 1.5 }, fluttua: { ampiezza: 0.015, periodo: 4 } } },
      { id: `testo${i}`, tipo: 'testo', nome: 'Didascalia', testo: `${p.nome}\n${p.sottotitolo}`, colore: '#ffffff', sfondo: '#1b1f2acc', altezza: 0.05,
        pos: [0, -0.28, 0.03], rot: [0, 0, 0], scala: [1, 1, 1], anim: {} },
    ];
    if (p.lune) {
      elementi.push({ id: `luna${i}a`, tipo: 'sfera', nome: 'Io', src: '', colore: '#e0c070', raggio: 0.028, pos: [0, 0.1, 0.26], rot: [0, 0, 0], scala: [1, 1, 1],
        anim: { rotazione: { asse: 'z', giri: 4 }, orbita: { raggio: 0.3, periodo: 6, asse: 'z' } } });
      elementi.push({ id: `luna${i}b`, tipo: 'sfera', nome: 'Europa', src: '', colore: '#cfd8e6', raggio: 0.022, pos: [0, 0.1, 0.26], rot: [0, 0, 0], scala: [1, 1, 1],
        anim: { orbita: { raggio: 0.4, periodo: 11, asse: 'z' } } });
    }
    if (p.anelli) {
      if (!anelli) { anelli = salva('anelli-saturno.png', texturaAnelli(canvas)); addAsset('anelli-saturno.png', anelli); }
      elementi.push({ id: `anelli${i}`, tipo: 'immagine', nome: 'Anelli', src: anelli, larghezza: 0.95, pos: [0, 0.1, 0.26], rot: [0, 0, 0], scala: [1, 1, 1],
        anim: { rotazione: { asse: 'z', giri: 0.5 } } });
    }
    db.prepare(`INSERT INTO pagine (stampato_id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, scena, qualita) VALUES (?, ?, ?, ?, ?, 1200, 1600, ?, 85)`)
      .run(sid, i + 1, p.nome, qr, pagPath, JSON.stringify({ elementi }));
  }
  return db.prepare('SELECT * FROM stampati WHERE id = ?').get(sid);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--url');
  const baseUrl = i > -1 ? process.argv[i + 1] : (process.env.PUBLIC_URL || 'http://localhost:5500');
  creaDemoPianeti({ baseUrl }).then((s) => {
    console.log(`Demo creata: "${s.titolo}" (id ${s.id}, slug ${s.slug}). Apri http://localhost:5500/editor/?s=${s.id}&compila=1 per compilare i target.`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
