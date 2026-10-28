// Passo 4 — Pubblica: stato di pubblicazione, link del viewer, QR per pagina, foglio di stampa.
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast } from '../js/comune.js';

export function initPubblica(ctx) {
  $('#btn-anteprima').innerHTML = `${ic('occhio')} Anteprima viewer`;
  $('#btn-foglio').innerHTML = `${ic('stampa')} Foglio di stampa`;
  $('#indietro-contenuti').innerHTML = `${ic('indietro')} Contenuti`;
  $('#indietro-contenuti').addEventListener('click', () => ctx.vai('contenuti'));
  $('#chk-pubblicato').addEventListener('change', async (e) => {
    try {
      const s = await api(`/api/stampati/${ctx.id}`, { method: 'PUT', body: JSON.stringify({ pubblicato: e.target.checked }) });
      ctx.stampato.pubblicato = s.pubblicato; ctx.aggiornaStepper(); render();
      toast(s.pubblicato ? 'Pubblicato: i QR portano al viewer' : 'Messo in bozza', 'ok');
    } catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; }
  });

  function render() {
    const s = ctx.stampato;
    const st = ctx.statoPassi();
    $('#chk-pubblicato').checked = !!s.pubblicato;
    $('#lbl-pubblicato').textContent = s.pubblicato ? 'Pubblicato' : 'Bozza';
    const base = ctx.config.publicUrl;
    $('#link-pubblico').textContent = `${base}/v/${s.slug}/1`;
    $('#btn-anteprima').href = `/v/${s.slug}/1?modo=3d`;
    $('#btn-foglio').href = `/stampa/${s.id}`;
    const avvisi = [];
    if (!st.n) avvisi.push(['Nessuna pagina caricata.', 'pagine', 'Carica le pagine']);
    if (st.n && st.nTarget < st.n) avvisi.push([`${st.n - st.nTarget} pagine senza target: il telefono non le riconoscerà.`, 'target', 'Compila i target']);
    if (st.n && st.nContenuti < st.n) avvisi.push([`${st.n - st.nContenuti} pagine senza contenuti 3D.`, 'contenuti', 'Aggiungi contenuti']);
    if (/localhost|127\.0\.0\.1/.test(base)) avvisi.push(['L’indirizzo pubblico è localhost: dal telefono i QR non funzioneranno. Avvia il server con PUBLIC_URL (vedi LEGGIMI).', null, null]);
    $('#avvisi-pubblica').innerHTML = avvisi.map(([t, passo, lab]) => `<div class="avviso">${ic('attenzione')}<span>${t}</span>${passo ? `<a href="#" data-vai="${passo}">${lab} →</a>` : ''}</div>`).join('');
    $$('[data-vai]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ctx.vai(a.dataset.vai); }));
    $('#griglia-qr').innerHTML = s.pagine.map((p) => `
      <div class="card qr-card">
        <img src="/api/pagine/${p.id}/qr.png?size=300" alt="QR ${esc(p.titolo)}">
        <b>${p.ordine}. ${esc(p.titolo)}</b>
        <small class="muto">${esc(base)}/q/${p.qr_id}</small>
        <small class="muto">${p.n_scansioni || 0} scansioni</small>
        <div class="riga">
          <a class="btn" href="/api/pagine/${p.id}/qr.png?size=1024" download="qr-${esc(s.slug)}-${p.ordine}.png">PNG</a>
          <a class="btn" href="/api/pagine/${p.id}/qr.svg" download="qr-${esc(s.slug)}-${p.ordine}.svg">SVG</a>
        </div>
      </div>`).join('') || `<div class="vuoto">Nessuna pagina.</div>`;
  }

  return { mostra: async () => { await ctx.ricarica(); render(); } };
}
