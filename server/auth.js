// Account e sessioni: registrazione, login, logout; cookie httpOnly con id di sessione in tabella.
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

export const auth = express.Router();
const COOKIE = 'rp_sessione';
const GIORNI = 30;

export function utenteDaRichiesta(req) {
  const sid = req.cookies?.[COOKIE];
  if (!sid) return null;
  return db.prepare(`SELECT u.id, u.email, u.nome, u.ruolo FROM sessioni s JOIN utenti u ON u.id = s.utente_id
    WHERE s.id = ? AND s.scadenza > datetime('now')`).get(sid) || null;
}

/** Middleware: richiede un utente loggato (req.utente). */
export function richiediLogin(req, res, next) {
  req.utente = utenteDaRichiesta(req);
  if (!req.utente) return res.status(401).json({ errore: 'Accesso richiesto' });
  next();
}

function apriSessione(res, req, utenteId) {
  const id = crypto.randomBytes(24).toString('base64url');
  const scadenza = new Date(Date.now() + GIORNI * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('INSERT INTO sessioni (id, utente_id, scadenza) VALUES (?, ?, ?)').run(id, utenteId, scadenza);
  db.prepare(`DELETE FROM sessioni WHERE scadenza < datetime('now')`).run();
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: GIORNI * 864e5, path: '/' });
}
const pubblico = (u) => ({ id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo });

auth.post('/registrazione', async (req, res) => {
  const { email = '', password = '', nome = '' } = req.body || {};
  const e = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ errore: 'Email non valida' });
  if (String(password).length < 6) return res.status(400).json({ errore: 'Password di almeno 6 caratteri' });
  if (db.prepare('SELECT 1 FROM utenti WHERE email = ?').get(e)) return res.status(409).json({ errore: 'Email già registrata' });
  const primo = !db.prepare('SELECT 1 FROM utenti LIMIT 1').get();
  const info = db.prepare('INSERT INTO utenti (email, password_hash, nome, ruolo) VALUES (?, ?, ?, ?)')
    .run(e, await bcrypt.hash(String(password), 10), String(nome).trim().slice(0, 80), primo ? 'admin' : 'creatore');
  const u = db.prepare('SELECT * FROM utenti WHERE id = ?').get(info.lastInsertRowid);
  // Gli stampati creati prima dell'introduzione degli account passano al primo utente.
  if (primo) db.prepare('UPDATE stampati SET utente_id = ? WHERE utente_id IS NULL').run(u.id);
  apriSessione(res, req, u.id);
  res.status(201).json(pubblico(u));
});

auth.post('/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM utenti WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) return res.status(401).json({ errore: 'Email o password errati' });
  apriSessione(res, req, u.id);
  res.json(pubblico(u));
});

auth.post('/logout', (req, res) => {
  const sid = req.cookies?.[COOKIE];
  if (sid) db.prepare('DELETE FROM sessioni WHERE id = ?').run(sid);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

auth.get('/me', (req, res) => {
  const u = utenteDaRichiesta(req);
  const nUtenti = db.prepare('SELECT COUNT(*) AS n FROM utenti').get().n;
  res.json({ utente: u, primoAvvio: nUtenti === 0 });
});
