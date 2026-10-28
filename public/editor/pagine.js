// Passo 1 — Pagine: caricamento multiplo, ordine, titoli, qualità dell'immagine.
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast, dimensioniFile, qualitaImmagine, etichettaQualita } from '../js/comune.js';

export function initPagine(ctx) {
  const griglia = $('#griglia-pagine');
  const input = $('#file-pagine');
  const zona = $('#dropzone');
  $('#dropzone-ic').innerHTML = ic('upload');
  $('#avanti-target').innerHTML = `Avanti: compila i target ${ic('avanti')}`;
  $('#avanti-target').addEventListener('click', () => ctx.vai('target'));

  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('sopra'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('sopra'); }));
  zona.addEventListener('drop', (e) => carica([...e.dataTransfer.files]));
  input.addEventListener('change', (e) => { carica([...e.target.files]); e.target.value = ''; });

  async function carica(files) {
    files = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    if (!files.length) return toast('Scegli file immagine (JPG o PNG)', 'err');
    const t = toast(`Carico ${files.length} pagine…`, '', 60000);
    for (const file of files) {
      try {
        const { w, h, img } = await dimensioniFile(file);
        const qualita = img ? qualitaImmagine(img) : null;
        const fd = new FormData();
        fd.append('immagine', file); fd.append('larghezza_px', w); fd.append('altezza_px', h);
        fd.append('titolo', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
        if (qualita != null) fd.append('qualita', qualita);
        await api(`/api/stampati/${ctx.id}/pagine`, { method: 'POST', body: fd });
      } catch (err) { toast(`${file.name}: ${err.message}`, 'err'); }
    }
    t.remove();
    await ctx.ricarica(); render();
    toast(`${files.length} pagine caricate`, 'ok');
  }

  async function sostituisci(p, file) {
    const { w, h, img } = await dimensioniFile(file);
    const fd = new FormData();
    fd.append('immagine', file); fd.append('larghezza_px', w); fd.append('altezza_px', h);
    if (img) fd.append('qualita', qualitaImmagine(img));
    await api(`/api/pagine/${p.id}/immagine`, { method: 'POST', body: fd });
    await ctx.ricarica(); render(); toast('Immagine sostituita: il target va ricompilato', 'ok');
  }

  async function sposta(p, delta) {
    const ids = ctx.stampato.pagine.map((x) => x.id);
    const i = ids.indexOf(p.id), j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`/api/stampati/${ctx.id}/ordine`, { method: 'PUT', body: JSON.stringify({ ids }) });
    await ctx.ricarica(); render();
  }

  function render() {
    const pagine = ctx.stampato.pagine;
    const scarse = pagine.filter((p) => p.qualita != null && p.qualita < 35).length;
    $('#consiglio-pagine').textContent = pagine.length
      ? `${pagine.length} pagine. ${scarse ? `${scarse} con qualità scarsa: fondi uniformi o pochi dettagli si riconoscono male. Meglio grafiche ricche di contrasto.` : 'Le immagini hanno dettagli sufficienti per il riconoscimento.'}`
      : 'Consiglio: immagini ricche di dettagli e contrasto (foto, illustrazioni, testo grande) si riconoscono meglio di fondi uniformi.';
    griglia.innerHTML = pagine.map((p) => {
      const q = etichettaQualita(p.qualita);
      const target = p.target && p.target_hash === p.immagine;
      return `<article class="card pagina-card" data-id="${p.id}">
        <div class="thumb" style="background-image:url('/uploads/${esc(p.immagine)}')"><span class="num">${p.ordine}</span></div>
        <div class="corpo">
          <input value="${esc(p.titolo)}" data-titolo title="Titolo della pagina">
          <div class="badges"><span class="badge ${q.cls}" title="Stima di tracciabilità">qualità ${q.testo}</span>
            <span class="badge ${target ? 'ok' : 'warn'}">${target ? 'target pronto' : 'target da compilare'}</span>
            ${p.scena.elementi.length ? `<span class="badge">${p.scena.elementi.length} elementi</span>` : ''}</div>
          <div class="azioni">
            <button data-su title="Sposta prima">${ic('indietro')}</button>
            <button data-giu title="Sposta dopo">${ic('avanti')}</button>
            <label class="btn" title="Sostituisci immagine">${ic('aggiorna')}<input type="file" accept="image/*" hidden data-sost></label>
            <a class="btn" href="#" data-contenuti title="Vai ai contenuti di questa pagina">${ic('cubo')}</a>
            <button class="pericolo" data-del title="Elimina pagina" style="margin-left:auto">${ic('cestino')}</button>
          </div>
        </div></article>`;
    }).join('');
    $$('[data-id]', griglia).forEach((card) => {
      const p = pagine.find((x) => x.id === Number(card.dataset.id));
      $('[data-titolo]', card).addEventListener('change', async (e) => {
        await api(`/api/pagine/${p.id}`, { method: 'PUT', body: JSON.stringify({ titolo: e.target.value }) });
        p.titolo = e.target.value; ctx.aggiornaStepper();
      });
      $('[data-su]', card).addEventListener('click', () => sposta(p, -1));
      $('[data-giu]', card).addEventListener('click', () => sposta(p, 1));
      $('[data-sost]', card).addEventListener('change', (e) => { if (e.target.files[0]) sostituisci(p, e.target.files[0]); });
      $('[data-contenuti]', card).addEventListener('click', (e) => { e.preventDefault(); ctx.vai('contenuti', { p: p.id }); });
      $('[data-del]', card).addEventListener('click', async () => {
        if (!confirm(`Eliminare la pagina “${p.titolo}” con la sua scena? Il suo QR smetterà di funzionare.`)) return;
        await api(`/api/pagine/${p.id}`, { method: 'DELETE' });
        await ctx.ricarica(); render();
      });
    });
    $('#avanti-target').disabled = !pagine.length;
  }

  /** Pagine senza punteggio (caricate prima della stima o dalla demo): lo calcola ora e lo salva. */
  async function valutaMancanti() {
    const daFare = ctx.stampato.pagine.filter((p) => p.qualita == null && p.immagine);
    for (const p of daFare) {
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `/uploads/${p.immagine}`; });
        const q = qualitaImmagine(img);
        await api(`/api/pagine/${p.id}`, { method: 'PUT', body: JSON.stringify({ qualita: q }) });
        p.qualita = q;
      } catch { /* immagine non leggibile: resta non valutata */ }
    }
    if (daFare.length) render();
  }

  return { mostra: async () => { render(); valutaMancanti(); } };
}
