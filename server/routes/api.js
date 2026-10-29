// API REST di REALITYSURFACE: stampati, pagine, asset, target, QR. Tutto protetto da login tranne config e viewer.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';
import { db, UPLOADS_DIR, TIPI_STAMPATO, nuovoQrId, slugUnico } from '../db.js';
import { richiediLogin, utenteDaRichiesta } from '../auth.js';
import { TEMPLATE, templateDaId } from '../template.js';

export const api = express.Router();

// ---------- utilità ----------
export function urlPubblico(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
function nomeSicuro(nome) {
  const base = path.basename(nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  return `${Date.now().toString(36)}-${base}`;
}
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOADS_DIR, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) { cb(null, nomeSicuro(file.originalname)); },
});
const upload = multer({ storage, limits: { fileSize: 80 * 1024 * 1024 } });

// Dimensioni PNG/JPEG senza dipendenze (fallback se il client non le manda).
function dimensioniImmagine(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* ignora */ }
  return { w: null, h: null };
}
const tipoAsset = (nome) => {
  const e = path.extname(nome).toLowerCase();
  if (['.glb', '.gltf'].includes(e)) return 'glb';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(e)) return 'immagine';
  if (['.mp3', '.ogg', '.wav', '.m4a'].includes(e)) return 'audio';
  if (['.mp4', '.webm'].includes(e)) return 'video';
  return 'altro';
};
const rel = (abs) => path.relative(UPLOADS_DIR, abs).split(path.sep).join('/');
function rimuoviFile(p) { if (p) { try { fs.unlinkSync(path.join(UPLOADS_DIR, p)); } catch { /* assente */ } } }
function errore(msg, status) { const e = new Error(msg); e.status = status; return e; }

/** Stampato dell'utente (o qualsiasi, se admin). */
function stampato(id, req) {
  const s = db.prepare('SELECT * FROM stampati WHERE id = ?').get(id);
  if (!s) throw errore('Stampato non trovato', 404);
  if (req.utente.ruolo !== 'admin' && s.utente_id !== req.utente.id) throw errore('Non autorizzato', 403);
  return s;
}
function pagina(id, req) {
  const p = db.prepare('SELECT * FROM pagine WHERE id = ?').get(id);
  if (!p) throw errore('Pagina non trovata', 404);
  stampato(p.stampato_id, req);
  return p;
}
const conScena = (p) => ({ ...p, scena: JSON.parse(p.scena || '{"elementi":[]}') });
const conImpostazioni = (s) => ({ ...s, impostazioni: JSON.parse(s.impostazioni || '{}') });
function nuovoQr() {
  let qr = nuovoQrId();
  while (db.prepare('SELECT 1 FROM pagine WHERE qr_id = ?').get(qr)) qr = nuovoQrId();
  return qr;
}
const tocca = (sid) => db.prepare(`UPDATE stampati SET updated_at = datetime('now') WHERE id = ?`).run(sid);
// Per gli upload sulle pagine: multer salva nella cartella dello stampato (req.params.id).
const idStampatoDellaPagina = (req, res, next) => { req.params.id = String(pagina(req.params.pid, req).stampato_id); next(); };

api.get('/config', (req, res) => res.json({ publicUrl: urlPubblico(req), tipi: TIPI_STAMPATO, template: TEMPLATE }));

// ---------- viewer (pubblico: stampati pubblicati, o del proprietario loggato) ----------
api.get('/viewer/:slug', (req, res) => {
  const s = db.prepare('SELECT id, slug, titolo, tipo, descrizione, larghezza_mm, altezza_mm, pubblicato, utente_id, template, impostazioni FROM stampati WHERE slug = ?').get(req.params.slug);
  if (!s) return res.status(404).json({ errore: 'Stampato non trovato' });
  const u = utenteDaRichiesta(req);
  const proprietario = u && (u.ruolo === 'admin' || u.id === s.utente_id);
  if (!s.pubblicato && !proprietario) return res.status(403).json({ errore: 'Questo stampato non è ancora pubblicato', nonPubblicato: true });
  const pagine = db.prepare(`SELECT id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, target, scena
    FROM pagine WHERE stampato_id = ? ORDER BY ordine, id`).all(s.id).map(conScena);
  const { utente_id, ...resto } = conImpostazioni(s);
  res.json({ ...resto, anteprima: !s.pubblicato, pagine });
});

// Da qui in poi: solo utenti loggati.
// ---------- cattura dal telefono (pubblico: autenticato dal token, valido 30 minuti) ----------
const CATTURA_MINUTI = 30;
function cattura(token) {
  db.prepare(`DELETE FROM catture WHERE creato < datetime('now', '-1 day')`).run();
  const c = db.prepare(`SELECT c.*, s.titolo AS stampato_titolo, s.larghezza_mm, s.altezza_mm, p.titolo AS pagina_titolo, p.ordine, p.immagine,
      (julianday('now') - julianday(c.creato)) * 1440 AS eta
    FROM catture c JOIN stampati s ON s.id = c.stampato_id LEFT JOIN pagine p ON p.id = c.pagina_id WHERE c.token = ?`).get(token);
  if (!c) throw errore('Link di cattura non valido', 404);
  if (c.eta > CATTURA_MINUTI) throw errore('Link di cattura scaduto: generane uno nuovo dall’editor', 410);
  return c;
}
api.get('/cattura/:token', (req, res) => {
  const c = cattura(req.params.token);
  res.json({ stampato: c.stampato_titolo, pagina: c.pagina_titolo || 'nuova pagina', ordine: c.ordine, usato: !!c.usato, immagine: c.immagine,
    minutiRestanti: Math.max(0, Math.round(CATTURA_MINUTI - c.eta)) });
});
// Il telefono manda la foto (già raddrizzata): finisce sulla pagina del token, o su una pagina nuova.
const idStampatoDellaCattura = (req, res, next) => { req.params.id = String(cattura(req.params.token).stampato_id); next(); };
api.post('/cattura/:token', idStampatoDellaCattura, upload.single('immagine'), (req, res) => {
  const c = cattura(req.params.token);
  if (!req.file) return res.status(400).json({ errore: 'Immagine mancante' });
  let w = Number(req.body?.larghezza_px) || null, h = Number(req.body?.altezza_px) || null;
  if (!w || !h) ({ w, h } = dimensioniImmagine(req.file.path));
  const qualita = req.body?.qualita !== undefined ? Number(req.body.qualita) : null;
  let pid = c.pagina_id;
  if (pid && !db.prepare('SELECT 1 FROM pagine WHERE id = ?').get(pid)) pid = null;
  if (pid) {
    const p = db.prepare('SELECT * FROM pagine WHERE id = ?').get(pid);
    rimuoviFile(p.immagine); rimuoviFile(p.target);
    db.prepare(`UPDATE pagine SET immagine = ?, larghezza_px = ?, altezza_px = ?, target = NULL, target_hash = NULL, qualita = ?,
      updated_at = datetime('now') WHERE id = ?`).run(rel(req.file.path), w, h, qualita, pid);
  } else {
    const max = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM pagine WHERE stampato_id = ?').get(c.stampato_id).m;
    pid = db.prepare(`INSERT INTO pagine (stampato_id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, scena, qualita)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{"elementi":[]}', ?)`).run(c.stampato_id, max + 1, req.body?.titolo || `Pagina ${max + 1}`, nuovoQr(), rel(req.file.path), w, h, qualita).lastInsertRowid;
  }
  db.prepare(`UPDATE catture SET usato = datetime('now'), pagina_id = ? WHERE token = ?`).run(pid, c.token);
  tocca(c.stampato_id);
  res.status(201).json({ ok: true, pagina_id: pid, immagine: rel(req.file.path) });
});

api.use(richiediLogin);

// ---------- stampati ----------
api.get('/stampati', (req, res) => {
  const filtro = req.utente.ruolo === 'admin' ? '' : 'WHERE s.utente_id = ?';
  const rows = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM pagine p WHERE p.stampato_id = s.id) AS n_pagine,
           (SELECT COUNT(*) FROM pagine p WHERE p.stampato_id = s.id AND p.immagine IS NOT NULL) AS n_con_immagine,
           (SELECT COUNT(*) FROM pagine p WHERE p.stampato_id = s.id AND p.target IS NOT NULL AND p.target_hash = p.immagine) AS n_target,
           (SELECT COUNT(*) FROM pagine p WHERE p.stampato_id = s.id AND json_array_length(p.scena, '$.elementi') > 0) AS n_con_contenuti,
           (SELECT immagine FROM pagine p WHERE p.stampato_id = s.id ORDER BY ordine LIMIT 1) AS copertina,
           (SELECT COUNT(*) FROM scansioni x JOIN pagine p ON p.id = x.pagina_id WHERE p.stampato_id = s.id) AS n_scansioni,
           (SELECT email FROM utenti u WHERE u.id = s.utente_id) AS proprietario
    FROM stampati s ${filtro} ORDER BY updated_at DESC`).all(...(filtro ? [req.utente.id] : []));
  res.json(rows);
});

api.post('/stampati', (req, res) => {
  const b = req.body || {};
  const t = templateDaId(b.template);
  const titolo = (b.titolo || '').trim();
  if (!titolo) return res.status(400).json({ errore: 'Titolo obbligatorio' });
  const tipo = TIPI_STAMPATO.includes(b.tipo) ? b.tipo : (t?.tipo || 'altro');
  const w = Number(b.larghezza_mm) || t?.larghezza_mm || 210, h = Number(b.altezza_mm) || t?.altezza_mm || 297;
  const slug = slugUnico(titolo);
  const creazione = db.transaction(() => {
    const info = db.prepare(`INSERT INTO stampati (slug, titolo, tipo, descrizione, larghezza_mm, altezza_mm, utente_id, template, impostazioni)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slug, titolo, tipo, b.descrizione || '', w, h, req.utente.id, t?.id || null,
      JSON.stringify({ scalaContenuti: t?.scalaContenuti || 1 }));
    const sid = info.lastInsertRowid;
    // Pagine iniziali vuote (senza immagine) dal template, se richieste.
    if (t && b.pagineIniziali !== false) {
      const ins = db.prepare('INSERT INTO pagine (stampato_id, ordine, titolo, qr_id) VALUES (?, ?, ?, ?)');
      t.pagine.forEach((nome, i) => ins.run(sid, i + 1, nome, nuovoQr()));
    }
    return sid;
  });
  res.status(201).json(stampato(creazione(), req));
});

// Impostazioni specifiche (es. plastico: modello di riferimento GLB, scala, offset).
api.put('/stampati/:id/impostazioni', (req, res) => {
  const s = stampato(req.params.id, req);
  const nuove = { ...JSON.parse(s.impostazioni || '{}'), ...(req.body || {}) };
  db.prepare(`UPDATE stampati SET impostazioni = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(nuove), s.id);
  res.json(conImpostazioni(stampato(s.id, req)));
});

api.get('/stampati/:id', (req, res) => {
  const s = stampato(req.params.id, req);
  const pagine = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM scansioni x WHERE x.pagina_id = p.id) AS n_scansioni
    FROM pagine p WHERE stampato_id = ? ORDER BY ordine, id`).all(s.id).map(conScena);
  const asset = db.prepare('SELECT * FROM asset WHERE stampato_id = ? ORDER BY id').all(s.id);
  res.json({ ...conImpostazioni(s), pagine, asset, templateInfo: templateDaId(s.template) });
});

api.put('/stampati/:id', (req, res) => {
  const s = stampato(req.params.id, req);
  const b = req.body || {};
  db.prepare(`UPDATE stampati SET titolo = ?, tipo = ?, descrizione = ?, larghezza_mm = ?, altezza_mm = ?, pubblicato = ?,
    updated_at = datetime('now') WHERE id = ?`).run(
    (b.titolo ?? s.titolo).trim() || s.titolo, TIPI_STAMPATO.includes(b.tipo) ? b.tipo : s.tipo,
    b.descrizione ?? s.descrizione, Number(b.larghezza_mm) || s.larghezza_mm, Number(b.altezza_mm) || s.altezza_mm,
    b.pubblicato === undefined ? s.pubblicato : (b.pubblicato ? 1 : 0), s.id);
  res.json(stampato(s.id, req));
});

api.delete('/stampati/:id', (req, res) => {
  const s = stampato(req.params.id, req);
  db.prepare('DELETE FROM stampati WHERE id = ?').run(s.id);
  fs.rmSync(path.join(UPLOADS_DIR, String(s.id)), { recursive: true, force: true });
  res.json({ ok: true });
});

// Riordino pagine: { ids: [id1, id2, ...] } nell'ordine voluto.
api.put('/stampati/:id/ordine', (req, res) => {
  const s = stampato(req.params.id, req);
  const ids = (req.body?.ids || []).map(Number);
  const upd = db.prepare('UPDATE pagine SET ordine = ? WHERE id = ? AND stampato_id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id, s.id)))();
  tocca(s.id);
  res.json({ ok: true });
});

// ---------- pagine ----------
api.post('/stampati/:id/pagine', upload.single('immagine'), (req, res) => {
  const s = stampato(req.params.id, req);
  const max = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM pagine WHERE stampato_id = ?').get(s.id).m;
  let immagine = null, w = Number(req.body?.larghezza_px) || null, h = Number(req.body?.altezza_px) || null;
  if (req.file) {
    immagine = rel(req.file.path);
    if (!w || !h) ({ w, h } = dimensioniImmagine(req.file.path));
  }
  const qr = nuovoQr();
  const info = db.prepare(`INSERT INTO pagine (stampato_id, ordine, titolo, qr_id, immagine, larghezza_px, altezza_px, scena, qualita)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, max + 1, req.body?.titolo || `Pagina ${max + 1}`, qr, immagine, w, h,
    req.body?.scena || '{"elementi":[]}', req.body?.qualita !== undefined ? Number(req.body.qualita) : null);
  tocca(s.id);
  res.status(201).json(conScena(pagina(info.lastInsertRowid, req)));
});

api.put('/pagine/:id', (req, res) => {
  const p = pagina(req.params.id, req);
  const b = req.body || {};
  const scena = b.scena !== undefined ? (typeof b.scena === 'string' ? b.scena : JSON.stringify(b.scena)) : p.scena;
  try { JSON.parse(scena); } catch { return res.status(400).json({ errore: 'Scena non è JSON valido' }); }
  db.prepare(`UPDATE pagine SET titolo = ?, ordine = ?, scena = ?, qualita = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(b.titolo ?? p.titolo, Number(b.ordine) || p.ordine, scena, b.qualita !== undefined ? Number(b.qualita) : p.qualita, p.id);
  tocca(p.stampato_id);
  res.json(conScena(pagina(p.id, req)));
});

api.delete('/pagine/:id', (req, res) => {
  const p = pagina(req.params.id, req);
  db.prepare('DELETE FROM pagine WHERE id = ?').run(p.id);
  rimuoviFile(p.immagine); rimuoviFile(p.target);
  // Ricompatta l'ordine.
  const rest = db.prepare('SELECT id FROM pagine WHERE stampato_id = ? ORDER BY ordine, id').all(p.stampato_id);
  const upd = db.prepare('UPDATE pagine SET ordine = ? WHERE id = ?');
  db.transaction(() => rest.forEach((r, i) => upd.run(i + 1, r.id)))();
  tocca(p.stampato_id);
  res.json({ ok: true });
});

// Sostituisce l'immagine della pagina (il target va ricompilato).
api.post('/pagine/:pid/immagine', idStampatoDellaPagina, upload.single('immagine'), (req, res) => {
  const p = pagina(req.params.pid, req);
  if (!req.file) return res.status(400).json({ errore: 'Immagine mancante' });
  let w = Number(req.body?.larghezza_px) || null, h = Number(req.body?.altezza_px) || null;
  if (!w || !h) ({ w, h } = dimensioniImmagine(req.file.path));
  rimuoviFile(p.immagine); rimuoviFile(p.target);
  db.prepare(`UPDATE pagine SET immagine = ?, larghezza_px = ?, altezza_px = ?, target = NULL, target_hash = NULL, qualita = ?,
    updated_at = datetime('now') WHERE id = ?`).run(rel(req.file.path), w, h, req.body?.qualita !== undefined ? Number(req.body.qualita) : null, p.id);
  tocca(p.stampato_id);
  res.json(conScena(pagina(p.id, req)));
});

// Target MindAR (.mind) compilato nel browser dall'editor.
api.post('/pagine/:pid/target', idStampatoDellaPagina, upload.single('target'), (req, res) => {
  const p = pagina(req.params.pid, req);
  if (!req.file) return res.status(400).json({ errore: 'File target mancante' });
  rimuoviFile(p.target);
  db.prepare(`UPDATE pagine SET target = ?, target_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(rel(req.file.path), req.body?.hash || p.immagine, p.id);
  tocca(p.stampato_id);
  res.json(conScena(pagina(p.id, req)));
});

// QR: punta a /q/<id> (redirezione) così il contenuto può cambiare dopo la stampa.
api.get('/pagine/:id/qr.:fmt', async (req, res) => {
  const p = pagina(req.params.id, req);
  const url = `${urlPubblico(req)}/q/${p.qr_id}`;
  const size = Math.min(2048, Math.max(128, Number(req.query.size) || 512));
  if (req.params.fmt === 'svg') {
    res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }));
  } else {
    res.type('image/png').send(await QRCode.toBuffer(url, { type: 'png', width: size, margin: 2, errorCorrectionLevel: 'M' }));
  }
});

// ---------- cattura dal telefono: creazione del token (proprietario) ----------
/** Indirizzi da cui il telefono può raggiungere questo server: PUBLIC_URL (tunnel) e gli IP della rete locale. */
function indirizziCattura(req) {
  const porta = (req.get('host') || '').split(':')[1] || process.env.PORT || 5500;
  const lan = [];
  for (const lista of Object.values(os.networkInterfaces())) for (const i of lista || []) {
    if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254')) lan.push(`http://${i.address}:${porta}`);
  }
  const pubblico = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : null;
  const base = [];
  if (pubblico) base.push({ url: pubblico, tipo: 'tunnel', nome: 'Indirizzo pubblico (PUBLIC_URL)' });
  for (const u of lan) base.push({ url: u, tipo: 'lan', nome: `Rete locale ${u.replace(/^https?:\/\//, '')}` });
  if (!base.length) base.push({ url: urlPubblico(req), tipo: 'locale', nome: 'Questo PC' });
  return base;
}
api.post('/stampati/:id/cattura', (req, res) => {
  const s = stampato(req.params.id, req);
  const pid = req.body?.pagina_id ? pagina(req.body.pagina_id, req).id : null;
  let token = nuovoQrId(10);
  while (db.prepare('SELECT 1 FROM catture WHERE token = ?').get(token)) token = nuovoQrId(10);
  db.prepare('INSERT INTO catture (token, stampato_id, pagina_id, utente_id) VALUES (?, ?, ?, ?)').run(token, s.id, pid, req.utente.id);
  res.status(201).json({ token, percorso: `/cattura/${token}`, basi: indirizziCattura(req), minuti: CATTURA_MINUTI });
});
api.get('/stampati/:id/cattura/:token', (req, res) => {
  stampato(req.params.id, req);
  const c = db.prepare('SELECT token, pagina_id, usato FROM catture WHERE token = ? AND stampato_id = ?').get(req.params.token, req.params.id);
  if (!c) return res.status(404).json({ errore: 'Token non trovato' });
  res.json({ usato: !!c.usato, pagina_id: c.pagina_id });
});
api.get('/stampati/:id/cattura/:token/qr.png', async (req, res) => {
  stampato(req.params.id, req);
  const basi = indirizziCattura(req).map((b) => b.url);
  const base = basi.includes(req.query.base) ? req.query.base : basi[0];
  res.type('image/png').send(await QRCode.toBuffer(`${base}/cattura/${req.params.token}`, { type: 'png', width: 320, margin: 2, errorCorrectionLevel: 'M' }));
});

// ---------- asset (GLB, immagini, audio, video) ----------
api.post('/stampati/:id/asset', upload.single('file'), (req, res) => {
  const s = stampato(req.params.id, req);
  if (!req.file) return res.status(400).json({ errore: 'File mancante' });
  const info = db.prepare('INSERT INTO asset (stampato_id, nome, tipo, percorso, dimensione) VALUES (?, ?, ?, ?, ?)')
    .run(s.id, req.file.originalname, tipoAsset(req.file.originalname), rel(req.file.path), req.file.size);
  res.status(201).json(db.prepare('SELECT * FROM asset WHERE id = ?').get(info.lastInsertRowid));
});

api.delete('/asset/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM asset WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ errore: 'Asset non trovato' });
  stampato(a.stampato_id, req);
  db.prepare('DELETE FROM asset WHERE id = ?').run(a.id);
  rimuoviFile(a.percorso);
  res.json({ ok: true });
});

// ---------- demo ----------
api.post('/demo/pianeti', async (req, res, next) => {
  try {
    const { creaDemoPianeti } = await import('../../tools/demo-pianeti.mjs');
    res.status(201).json(await creaDemoPianeti({ baseUrl: urlPubblico(req), utenteId: req.utente.id }));
  } catch (e) { next(e); }
});
api.post('/demo/biglietto', async (req, res, next) => {
  try {
    const { creaDemoBiglietto } = await import('../../tools/demo-biglietto.mjs');
    res.status(201).json(await creaDemoBiglietto({ baseUrl: urlPubblico(req), utenteId: req.utente.id }));
  } catch (e) { next(e); }
});
api.post('/demo/plastico', async (req, res, next) => {
  try {
    const { creaDemoPlastico } = await import('../../tools/demo-plastico.mjs');
    res.status(201).json(await creaDemoPlastico({ baseUrl: urlPubblico(req), utenteId: req.utente.id }));
  } catch (e) { next(e); }
});
