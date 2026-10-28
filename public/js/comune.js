// Funzioni condivise dal front-end: fetch API, toast, escape, utente corrente.
import { ic } from './icone.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toast(msg, tipo = '', ms = 3500) {
  const t = document.createElement('div'); t.className = `toast ${tipo}`; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  return t;
}

export async function api(url, opt = {}) {
  const isForm = opt.body instanceof FormData;
  const r = await fetch(url, { ...opt, headers: { ...(opt.body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { vaiAlLogin(); throw new Error('Accesso richiesto'); }
  if (!r.ok) throw new Error(j.errore || r.statusText);
  return j;
}

export function vaiAlLogin(extra = '') {
  location.href = `/login?torna=${encodeURIComponent(location.pathname + location.search)}${extra}`;
}

export async function utenteCorrente() {
  const r = await fetch('/api/auth/me');
  return r.json();
}

/** Richiede un utente loggato: altrimenti porta al login (o alla registrazione al primo avvio). */
export async function richiediUtente() {
  const m = await utenteCorrente();
  if (!m.utente) { vaiAlLogin(m.primoAvvio ? '&registrazione=1' : ''); return new Promise(() => {}); } // la pagina sta cambiando
  return m.utente;
}

/** Riempie un contenitore con nome utente e bottone di uscita. */
export function chipUtente(el, utente) {
  el.innerHTML = `<span class="chip-utente" title="${esc(utente.email)}">${esc(utente.nome || utente.email)}${utente.ruolo === 'admin' ? ' <span class="badge">admin</span>' : ''}</span>
    <button class="icona" id="btn-esci" title="Esci">${ic('chiudi')}</button>`;
  $('#btn-esci', el).addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/login'; });
}

export const TIPI_ETICHETTA = { libro: 'Libro', biglietto: 'Biglietto da visita', brochure: 'Brochure', copertina: 'Copertina', poster: 'Poster', plastico: 'Plastico', altro: 'Altro' };

/** Dimensioni di un File immagine. */
export function dimensioniFile(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight, img }); };
    img.onerror = () => res({ w: 0, h: 0, img: null });
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Stima di tracciabilità (0-100) di un'immagine: quanti bordi/dettagli ha e quanto sono distribuiti.
 * Pagine uniformi o con poco contrasto si tracciano male con MindAR.
 */
export function qualitaImmagine(img) {
  const W = 320, H = Math.max(32, Math.round(W * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const celle = new Array(16).fill(0); let forti = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = -g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1] + g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1];
    const gy = -g[i - W - 1] - 2 * g[i - W] - g[i - W + 1] + g[i + W - 1] + 2 * g[i + W] + g[i + W + 1];
    if (Math.hypot(gx, gy) > 120) { forti++; celle[Math.floor(y * 4 / H) * 4 + Math.floor(x * 4 / W)]++; }
  }
  const frazione = forti / (W * H);
  const area = W * H / 16;
  const coperte = celle.filter((n) => n / area > 0.015).length;
  const punteggio = 100 * (0.6 * Math.min(frazione / 0.10, 1) + 0.4 * coperte / 16);
  return Math.round(Math.max(0, Math.min(100, punteggio)));
}

export function etichettaQualita(q) {
  if (q == null) return { testo: 'non valutata', cls: '' };
  if (q >= 60) return { testo: `buona (${q})`, cls: 'ok' };
  if (q >= 35) return { testo: `media (${q})`, cls: 'warn' };
  return { testo: `scarsa (${q})`, cls: 'err' };
}
