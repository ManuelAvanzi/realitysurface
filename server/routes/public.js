// Route pubbliche: portale, login, editor, viewer, redirezione QR, foglio di stampa.
import express from 'express';
import path from 'node:path';
import { db, ROOT } from '../db.js';
import { utenteDaRichiesta } from '../auth.js';

export const publicRouter = express.Router();
const PUB = path.join(ROOT, 'public');
const pagina = (f) => (req, res) => res.sendFile(path.join(PUB, f));
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

publicRouter.get(['/', '/index.html'], pagina('landing.html'));      // landing pubblica
publicRouter.get(['/stampati', '/stampati/'], pagina('index.html'));  // dashboard (richiede login lato client)
publicRouter.get(['/login', '/login/'], pagina('login.html'));
publicRouter.get(['/editor', '/editor/'], pagina('editor/index.html'));
publicRouter.get(['/v/:slug', '/v/:slug/:n'], pagina('viewer/index.html'));
publicRouter.get('/cattura/:token', pagina('cattura.html')); // pagina per il telefono: fotografa, raddrizza, carica

// /q/<id>: entra dal QR stampato → registra la scansione → viewer sulla pagina giusta.
publicRouter.get('/q/:qr', (req, res) => {
  const p = db.prepare(`SELECT p.id, p.ordine, s.slug FROM pagine p JOIN stampati s ON s.id = p.stampato_id
    WHERE p.qr_id = ?`).get(req.params.qr);
  if (!p) return res.status(404).send('<p style="font-family:sans-serif;padding:2em">QR non più valido.</p>');
  db.prepare('INSERT INTO scansioni (pagina_id, user_agent) VALUES (?, ?)').run(p.id, String(req.get('user-agent') || '').slice(0, 300));
  res.redirect(302, `/v/${p.slug}/${p.ordine}`);
});

// Foglio di stampa con i QR di tutte le pagine (da consegnare alla tipografia). Solo il proprietario.
publicRouter.get('/stampa/:id', (req, res) => {
  const u = utenteDaRichiesta(req);
  if (!u) return res.redirect(`/login?torna=${encodeURIComponent(req.originalUrl)}`);
  const s = db.prepare('SELECT * FROM stampati WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).send('Stampato non trovato');
  if (u.ruolo !== 'admin' && s.utente_id !== u.id) return res.status(403).send('Non autorizzato');
  const pagine = db.prepare('SELECT * FROM pagine WHERE stampato_id = ? ORDER BY ordine, id').all(s.id);
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>QR — ${esc(s.titolo)}</title>
<style>
 body{font-family:Inter,system-ui,sans-serif;margin:0;padding:12mm;color:#111;background:#fff}
 h1{font-size:18pt;margin:0 0 4mm} p.note{font-size:9pt;color:#555;margin:0 0 8mm}
 .griglia{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
 .qr{border:0.3mm solid #ccc;border-radius:2mm;padding:4mm;text-align:center;break-inside:avoid}
 .qr img{width:40mm;height:40mm;display:block;margin:0 auto 2mm}
 .qr b{display:block;font-size:10pt} .qr small{font-size:7pt;color:#666;word-break:break-all}
 .no-print a,.no-print button{font:inherit;margin-right:8px}
 @media print{.no-print{display:none}}
</style></head><body>
<p class="no-print"><a href="/editor/?s=${s.id}&passo=pubblica">← Torna all'editor</a> <button onclick="print()">Stampa</button></p>
<h1>${esc(s.titolo)} — QR code da stampare</h1>
<p class="note">Stampa a dimensione reale: ogni QR ha lato 40 mm con margine bianco (quiet zone) già incluso. Minimo consigliato 20 mm. Non modificare le proporzioni.${s.pubblicato ? '' : ' <b>Attenzione: lo stampato non è ancora pubblicato, i QR mostreranno un avviso.</b>'}</p>
<div class="griglia">${pagine.map((p) => `<div class="qr"><img src="/api/pagine/${p.id}/qr.png?size=600" alt="QR ${esc(p.titolo)}"><b>${p.ordine}. ${esc(p.titolo)}</b><small>${esc(base)}/q/${p.qr_id}</small></div>`).join('')}</div>
</body></html>`);
});
