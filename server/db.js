// Database SQLite: schema di REALITYSURFACE (utenti, sessioni, stampati, pagine, asset, scansioni).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'realitysurface.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const TIPI_STAMPATO = ['libro', 'biglietto', 'brochure', 'copertina', 'poster', 'plastico', 'altro'];

db.exec(`
CREATE TABLE IF NOT EXISTS utenti (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  ruolo TEXT NOT NULL DEFAULT 'creatore',   -- creatore | admin (il primo registrato)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessioni (
  id TEXT PRIMARY KEY,
  utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  scadenza TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stampati (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  titolo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'libro',
  descrizione TEXT DEFAULT '',
  larghezza_mm REAL DEFAULT 210,
  altezza_mm REAL DEFAULT 297,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagine (
  id INTEGER PRIMARY KEY,
  stampato_id INTEGER NOT NULL REFERENCES stampati(id) ON DELETE CASCADE,
  ordine INTEGER NOT NULL DEFAULT 1,
  titolo TEXT NOT NULL DEFAULT '',
  qr_id TEXT UNIQUE NOT NULL,
  immagine TEXT,            -- percorso relativo in uploads/ dell'immagine della pagina
  larghezza_px INTEGER,
  altezza_px INTEGER,
  target TEXT,              -- percorso del file .mind compilato (MindAR)
  target_hash TEXT,         -- immagine da cui è stato compilato il target
  scena TEXT NOT NULL DEFAULT '{"elementi":[]}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pagine_stampato ON pagine(stampato_id, ordine);

CREATE TABLE IF NOT EXISTS asset (
  id INTEGER PRIMARY KEY,
  stampato_id INTEGER NOT NULL REFERENCES stampati(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,       -- glb | immagine | audio | video
  percorso TEXT NOT NULL,
  dimensione INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scansioni (
  id INTEGER PRIMARY KEY,
  pagina_id INTEGER NOT NULL REFERENCES pagine(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Migrazioni leggere (colonne aggiunte dopo la v0.1).
function aggiungiColonna(tabella, colonna, definizione) {
  const cols = db.prepare(`PRAGMA table_info(${tabella})`).all().map((c) => c.name);
  if (!cols.includes(colonna)) db.exec(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${definizione}`);
}
aggiungiColonna('stampati', 'utente_id', 'INTEGER REFERENCES utenti(id) ON DELETE CASCADE');
aggiungiColonna('stampati', 'pubblicato', 'INTEGER NOT NULL DEFAULT 0');
aggiungiColonna('pagine', 'qualita', 'REAL');   // 0-100: stima di tracciabilità dell'immagine
aggiungiColonna('stampati', 'template', 'TEXT');                       // id del template di partenza (server/template.js)
aggiungiColonna('stampati', 'impostazioni', "TEXT NOT NULL DEFAULT '{}'"); // JSON: es. plastico {riferimento, scala, offset}

// Token di cattura: il telefono fotografa la pagina e la carica senza login (v0.4).
db.exec(`CREATE TABLE IF NOT EXISTS catture (
  token TEXT PRIMARY KEY,
  stampato_id INTEGER NOT NULL REFERENCES stampati(id) ON DELETE CASCADE,
  pagina_id INTEGER REFERENCES pagine(id) ON DELETE CASCADE,
  utente_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
  creato TEXT NOT NULL DEFAULT (datetime('now')),
  usato TEXT
)`);

const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'; // senza caratteri ambigui (l, o, 0, 1)
export function nuovoQrId(len = 7) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'stampato';
}

export function slugUnico(base) {
  let slug = slugify(base), n = 2;
  const q = db.prepare('SELECT 1 FROM stampati WHERE slug = ?');
  while (q.get(slug)) slug = `${slugify(base)}-${n++}`;
  return slug;
}
