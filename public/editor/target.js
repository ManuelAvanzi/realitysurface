// Passo 2 — Target: compilazione dei file .mind (MindAR) nel browser, uno per pagina.
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast, etichettaQualita } from '../js/comune.js';

export function initTarget(ctx) {
  let Compiler = null;
  let inCorso = false;
  const tabella = $('#tabella-target');
  const bar = $('#progress-target');
  $('#btn-compila-tutti').innerHTML = `${ic('compila')} Compila i target mancanti`;
  $('#btn-compila-tutti').addEventListener('click', () => compilaMancanti());
  $('#indietro-pagine').innerHTML = `${ic('indietro')} Pagine`;
  $('#indietro-pagine').addEventListener('click', () => ctx.vai('pagine'));
  $('#avanti-contenuti').innerHTML = `Avanti: contenuti 3D ${ic('avanti')}`;
  $('#avanti-contenuti').addEventListener('click', () => ctx.vai('contenuti'));

  const daFare = () => ctx.stampato.pagine.filter((p) => p.immagine && (!p.target || p.target_hash !== p.immagine));

  async function compila(p) {
    if (!p?.immagine) return toast('La pagina non ha un’immagine', 'err');
    inCorso = true; bar.hidden = false; const fill = bar.firstElementChild; fill.style.width = '2%';
    $('#stato-compilazione').textContent = `Compilo “${p.titolo}”… (${(p.larghezza_px || 0)}×${(p.altezza_px || 0)} px)`;
    render();
    try {
      if (!Compiler) ({ Compiler } = await import('/vendor/mind-ar/mindar-image.prod.js'));
      const img = new Image(); img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `/uploads/${p.immagine}`; });
      const compiler = new Compiler();
      const t0 = performance.now();
      await compiler.compileImageTargets([img], (prog) => { fill.style.width = `${Math.max(2, prog)}%`; });
      const buffer = await compiler.exportData();
      const fd = new FormData();
      fd.append('target', new Blob([buffer], { type: 'application/octet-stream' }), `pagina-${p.id}.mind`);
      fd.append('hash', p.immagine);
      await api(`/api/pagine/${p.id}/target`, { method: 'POST', body: fd });
      $('#stato-compilazione').textContent = `“${p.titolo}” compilata in ${((performance.now() - t0) / 1000).toFixed(1)} s (${(buffer.byteLength / 1024).toFixed(0)} KB).`;
    } catch (e) {
      console.error(e); toast(`Compilazione fallita: ${e.message || e}`, 'err');
      $('#stato-compilazione').textContent = `Errore su “${p.titolo}”: ${e.message || e}`;
    }
    inCorso = false; bar.hidden = true;
    await ctx.ricarica(); render();
  }

  async function compilaMancanti() {
    const lista = daFare();
    if (!lista.length) return toast('Tutti i target sono già pronti', 'ok');
    toast(`Compilo ${lista.length} target: circa 10 s l'uno`);
    for (const p of lista) await compila(ctx.stampato.pagine.find((x) => x.id === p.id));
    if (!daFare().length) toast('Tutti i target pronti', 'ok');
  }

  function render() {
    const pagine = ctx.stampato.pagine;
    if (!pagine.length) { tabella.innerHTML = `<tr><td class="muto">Nessuna pagina: caricale nel passo 1.</td></tr>`; return; }
    tabella.innerHTML = `<tr><th></th><th>Pagina</th><th>Qualità immagine</th><th>Target</th><th></th></tr>` + pagine.map((p) => {
      const q = etichettaQualita(p.qualita);
      let stato, cls;
      if (!p.immagine) { stato = 'senza immagine'; cls = 'err'; }
      else if (!p.target) { stato = 'da compilare'; cls = 'warn'; }
      else if (p.target_hash !== p.immagine) { stato = 'immagine cambiata: ricompila'; cls = 'warn'; }
      else { stato = 'pronto'; cls = 'ok'; }
      return `<tr data-id="${p.id}">
        <td><div class="thumb" style="background-image:url('/uploads/${esc(p.immagine)}')"></div></td>
        <td><b>${p.ordine}. ${esc(p.titolo)}</b><br><small class="muto">${p.larghezza_px || '?'}×${p.altezza_px || '?'} px</small></td>
        <td><span class="badge ${q.cls}">${q.testo}</span></td>
        <td><span class="badge ${cls}">${stato}</span></td>
        <td style="text-align:right"><button data-compila ${inCorso || !p.immagine ? 'disabled' : ''}>${ic('compila')} ${cls === 'ok' ? 'Ricompila' : 'Compila'}</button></td>
      </tr>`;
    }).join('');
    $$('[data-compila]', tabella).forEach((b) => b.addEventListener('click', () => compila(pagine.find((p) => p.id === Number(b.closest('tr').dataset.id)))));
    $('#btn-compila-tutti').disabled = inCorso || !daFare().length;
    $('#avanti-contenuti').disabled = !pagine.length;
  }

  return {
    mostra: async (extra = {}) => { render(); if (extra.compila) await compilaMancanti(); },
  };
}
