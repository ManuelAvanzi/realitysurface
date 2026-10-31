// Editor REALITYSURFACE — shell a passi: Pagine → Target → Contenuti → Pubblica.
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast, richiediUtente, chipUtente, TIPI_ETICHETTA } from '../js/comune.js';
import { initPagine } from './pagine.js';
import { initTarget } from './target.js';
import { initScena3d } from './scena3d.js';
import { initPubblica } from './pubblica.js';

const params = new URLSearchParams(location.search);
const ID = Number(params.get('s'));
if (!ID) location.href = '/stampati';

const PASSI = [
  { id: 'pagine', nome: 'Pagine' },
  { id: 'target', nome: 'Target' },
  { id: 'contenuti', nome: 'Contenuti' },
  { id: 'pubblica', nome: 'Pubblica' },
];

/** Contesto condiviso tra i moduli dei passi. */
export const ctx = {
  id: ID, stampato: null, utente: null, config: null, passo: null, moduli: {},
  api, toast, esc, ic, $,
  /** Ricarica lo stampato dal server e aggiorna stepper. */
  async ricarica() {
    ctx.stampato = await api(`/api/stampati/${ID}`);
    aggiornaStepper();
    return ctx.stampato;
  },
  /** Stato dei passi, calcolato dai dati. */
  statoPassi() {
    const s = ctx.stampato; const n = s.pagine.length;
    const target = s.pagine.filter((p) => p.target && p.target_hash === p.immagine).length;
    const contenuti = s.pagine.filter((p) => p.scena.elementi.length > 0).length;
    const conImmagine = s.pagine.filter((p) => p.immagine).length;
    const cls = (f, t) => (t && f === t) ? 'fatto' : (f > 0 ? 'parziale' : '');
    return { pagine: cls(conImmagine, n), target: cls(target, n), contenuti: cls(contenuti, n), pubblica: s.pubblicato ? 'fatto' : '', n, nImmagini: conImmagine, nTarget: target, nContenuti: contenuti };
  },
  vai(passo, extra = {}) { mostraPasso(passo, extra); },
  aggiornaStepper,
};

function aggiornaStepper() {
  const st = ctx.statoPassi();
  $('#stepper').innerHTML = PASSI.map((p, i) => `<button data-passo="${p.id}" class="${st[p.id]} ${ctx.passo === p.id ? 'attivo' : ''}"><span class="num">${st[p.id] === 'fatto' ? ic('ok') : i + 1}</span>${p.nome}</button>`).join('');
  $$('#stepper [data-passo]').forEach((b) => b.addEventListener('click', () => mostraPasso(b.dataset.passo)));
  $('#badge-formato').textContent = `${TIPI_ETICHETTA[ctx.stampato.tipo] || ctx.stampato.tipo} · ${ctx.stampato.larghezza_mm}×${ctx.stampato.altezza_mm} mm`;
}

async function mostraPasso(passo, extra = {}) {
  if (!PASSI.some((p) => p.id === passo)) passo = 'pagine';
  if (ctx.passo === 'contenuti' && passo !== 'contenuti' && ctx.moduli.contenuti.sporco()) {
    if (!confirm('Ci sono modifiche non salvate nella scena. Uscire comunque?')) return;
    ctx.moduli.contenuti.scartaModifiche();
  }
  ctx.passo = passo;
  $$('.passo').forEach((s) => { s.hidden = s.id !== `passo-${passo}`; });
  $('#btn-salva').hidden = passo !== 'contenuti';
  const u = new URL(location); u.searchParams.set('passo', passo); u.searchParams.delete('compila');
  if (extra.p) u.searchParams.set('p', extra.p);
  history.replaceState(null, '', u);
  aggiornaStepper();
  await ctx.moduli[passo].mostra(extra);
}

// ---------- avvio ----------
ctx.utente = await richiediUtente();
chipUtente($('#utente'), ctx.utente);
$('#btn-home').innerHTML = ic('indietro');
$('#btn-salva').innerHTML = `${ic('salva')} Salva`;
ctx.config = await api('/api/config');
try { await ctx.ricarica(); } catch (e) { toast(e.message, 'err'); setTimeout(() => (location.href = '/stampati'), 1500); throw e; }
$('#titolo-stampato').value = ctx.stampato.titolo;
$('#titolo-stampato').addEventListener('change', async (e) => {
  const s = await api(`/api/stampati/${ID}`, { method: 'PUT', body: JSON.stringify({ titolo: e.target.value }) });
  ctx.stampato.titolo = s.titolo; e.target.value = s.titolo; toast('Titolo aggiornato', 'ok');
});

ctx.moduli.pagine = initPagine(ctx);
ctx.moduli.target = initTarget(ctx);
ctx.moduli.contenuti = initScena3d(ctx);
ctx.moduli.pubblica = initPubblica(ctx);

const passoIniziale = params.get('passo') || (ctx.stampato.pagine.length ? 'contenuti' : 'pagine');
await mostraPasso(passoIniziale, { p: Number(params.get('p')) || undefined, compila: params.get('compila') === '1' });

window.addEventListener('beforeunload', (e) => { if (ctx.moduli.contenuti.sporco()) { e.preventDefault(); e.returnValue = ''; } });
window.__rp = { ctx, step: (n = 1) => ctx.moduli.contenuti.step(n) };
