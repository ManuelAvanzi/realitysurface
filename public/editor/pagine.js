// Passo 1 — Pagine: caricamento multiplo, ordine, titoli, qualità dell'immagine, consigli del template.
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast, dimensioniFile, qualitaImmagine, etichettaQualita } from '../js/comune.js';
import { illustrazione } from '../js/illustrazioni.js';

export function initPagine(ctx) {
  const griglia = $('#griglia-pagine');
  const input = $('#file-pagine');
  const zona = $('#dropzone');
  $('#dropzone-ic').innerHTML = ic('upload');
  $('#avanti-target').innerHTML = `Avanti: compila i target ${ic('avanti')}`;
  $('#avanti-target').addEventListener('click', () => ctx.vai('target'));
  $('#btn-cattura').innerHTML = `${ic('telefono')} Scatta dal telefono`;
  $('#btn-cattura').addEventListener('click', () => apriCattura(ctx.stampato.pagine.find((p) => !p.immagine) || null));

  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('sopra'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('sopra'); }));
  zona.addEventListener('drop', (e) => carica([...e.dataTransfer.files]));
  input.addEventListener('change', (e) => { carica([...e.target.files]); e.target.value = ''; });

  async function datiFile(file) {
    const { w, h, img } = await dimensioniFile(file);
    const fd = new FormData();
    fd.append('immagine', file); fd.append('larghezza_px', w); fd.append('altezza_px', h);
    if (img) fd.append('qualita', qualitaImmagine(img));
    return fd;
  }

  /** Carica i file: prima riempie le pagine vuote (dal template) in ordine, poi crea pagine nuove. */
  async function carica(files) {
    files = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    if (!files.length) return toast('Scegli file immagine (JPG o PNG)', 'err');
    const vuote = ctx.stampato.pagine.filter((p) => !p.immagine);
    const t = toast(`Carico ${files.length} immagini…`, '', 60000);
    let n = 0;
    for (const file of files) {
      try {
        const fd = await datiFile(file);
        const vuota = vuote.shift();
        if (vuota) await api(`/api/pagine/${vuota.id}/immagine`, { method: 'POST', body: fd });
        else {
          fd.append('titolo', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
          await api(`/api/stampati/${ctx.id}/pagine`, { method: 'POST', body: fd });
        }
        n++;
      } catch (err) { toast(`${file.name}: ${err.message}`, 'err'); }
    }
    t.remove();
    await ctx.ricarica(); render();
    toast(`${n} immagini caricate`, 'ok');
  }

  async function sostituisci(p, file) {
    await api(`/api/pagine/${p.id}/immagine`, { method: 'POST', body: await datiFile(file) });
    await ctx.ricarica(); render(); toast(p.immagine ? 'Immagine sostituita: il target va ricompilato' : 'Immagine caricata', 'ok');
  }

  async function sposta(p, delta) {
    const ids = ctx.stampato.pagine.map((x) => x.id);
    const i = ids.indexOf(p.id), j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`/api/stampati/${ctx.id}/ordine`, { method: 'PUT', body: JSON.stringify({ ids }) });
    await ctx.ricarica(); render();
  }

  async function aggiungiVuota() {
    await api(`/api/stampati/${ctx.id}/pagine`, { method: 'POST', body: JSON.stringify({ titolo: `Pagina ${ctx.stampato.pagine.length + 1}` }) });
    await ctx.ricarica(); render();
  }

  // ---------- plastico: modello GLB + basamento generato ----------
  function renderPlastico() {
    const box = $('#blocco-plastico');
    if (!ctx.stampato.templateInfo?.plastico && ctx.stampato.tipo !== 'plastico') { box.hidden = true; return; }
    box.hidden = false;
    const imp = ctx.stampato.impostazioni || {};
    const glb = ctx.stampato.asset.filter((a) => a.tipo === 'glb');
    const corrente = glb.find((a) => a.percorso === imp.riferimento);
    box.innerHTML = `<div class="ill-box">${illustrazione('plastico')}</div>
      <div class="corpo">
        <h3>Modello del plastico</h3>
        <p class="muto">Il plastico lo costruisci con i tuoi strumenti (stampa 3D, Blender, cartone). Qui carichi il suo GLB: serve come riferimento nell’editor, come occlusore nel viewer e per generare il basamento stampabile, cioè l’immagine che il telefono riconosce.</p>
        <div class="riga avvolgi">
          <div class="fisso"><label>GLB caricato</label><select id="pl-glb"><option value="">nessuno</option>${glb.map((a) => `<option value="${esc(a.percorso)}" ${imp.riferimento === a.percorso ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
          <label class="btn fisso" style="align-self:flex-end">${ic('upload')} Carica GLB<input type="file" accept=".glb,.gltf" hidden id="pl-file"></label>
          <div class="fisso" style="width:120px"><label>Ingombro (0-1)</label><input type="number" step="0.05" min="0.1" max="1" id="pl-larg" value="${imp.larghezza ?? 0.6}"></div>
          <div class="fisso" style="width:110px"><label>Rotazione z</label><input type="number" step="15" id="pl-rot" value="${imp.rotazione ?? 0}"></div>
          <button class="primario fisso" id="pl-genera" style="align-self:flex-end" ${corrente ? '' : 'disabled'}>${ic('compila')} Genera basamento dal modello</button>
        </div>
        <div class="muto piccolo" id="pl-stato">${corrente ? `Modello: ${esc(corrente.nome)} (${(corrente.dimensione / 1024 / 1024).toFixed(1)} MB). Il basamento generato diventa l’immagine della pagina “Basamento”.` : 'Nessun modello: carica il GLB del plastico, oppure trascina sotto una tua mappa o pianta come basamento.'}</div>
      </div>`;
    $('#pl-file').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      const t = toast('Carico il modello…', '', 60000);
      try {
        const a = await api(`/api/stampati/${ctx.id}/asset`, { method: 'POST', body: fd });
        ctx.stampato.asset.push(a);
        await salvaImpostazioni({ riferimento: a.percorso });
        toast(`Modello ${a.nome} caricato`, 'ok');
      } catch (err) { toast(err.message, 'err'); }
      t.remove(); e.target.value = ''; renderPlastico();
    });
    $('#pl-glb').addEventListener('change', async (e) => { await salvaImpostazioni({ riferimento: e.target.value }); renderPlastico(); });
    $('#pl-larg').addEventListener('change', (e) => salvaImpostazioni({ larghezza: Number(e.target.value) || 0.6 }));
    $('#pl-rot').addEventListener('change', (e) => salvaImpostazioni({ rotazione: Number(e.target.value) || 0 }));
    $('#pl-genera').addEventListener('click', generaBasamentoPagina);
  }
  async function salvaImpostazioni(b) {
    const s = await api(`/api/stampati/${ctx.id}/impostazioni`, { method: 'PUT', body: JSON.stringify(b) });
    ctx.stampato.impostazioni = s.impostazioni;
  }
  async function generaBasamentoPagina() {
    const imp = ctx.stampato.impostazioni || {};
    if (!imp.riferimento) return toast('Carica prima il GLB del plastico', 'err');
    let p = ctx.stampato.pagine.find((x) => !x.immagine) || ctx.stampato.pagine[0];
    if (!p) { await api(`/api/stampati/${ctx.id}/pagine`, { method: 'POST', body: JSON.stringify({ titolo: 'Basamento' }) }); await ctx.ricarica(); p = ctx.stampato.pagine[0]; }
    if (p.immagine && !confirm(`Sostituire l’immagine della pagina “${p.titolo}” con il basamento generato? Il target andrà ricompilato.`)) return;
    const btn = $('#pl-genera'); btn.disabled = true; $('#pl-stato').textContent = 'Genero il basamento: vista dall’alto del modello, trama, cornice e QR…';
    try {
      const { generaBasamento } = await import('./basamento.js');
      const { blob, w, h } = await generaBasamento({
        glbUrl: `/uploads/${imp.riferimento}`, wMm: ctx.stampato.larghezza_mm, hMm: ctx.stampato.altezza_mm,
        larghezza: imp.larghezza ?? 0.6, rotazione: imp.rotazione ?? 0, offsetX: imp.offsetX ?? 0, offsetY: imp.offsetY ?? 0,
        titolo: ctx.stampato.titolo, qrUrl: `/api/pagine/${p.id}/qr.png?size=600`,
      });
      const file = new File([blob], `basamento-${ctx.stampato.slug}.png`, { type: 'image/png' });
      await api(`/api/pagine/${p.id}/immagine`, { method: 'POST', body: await datiFile(file) });
      await ctx.ricarica(); render();
      toast('Basamento generato: ora compila il target', 'ok');
    } catch (e) { console.error(e); toast(`Generazione fallita: ${e.message || e}`, 'err'); btn.disabled = false; }
  }

  // ---------- cattura dal telefono: QR → pagina /cattura/<token> → la foto raddrizzata arriva qui ----------
  let catturaTimer = null;
  async function apriCattura(p) {
    let dlg = $('#dlg-cattura');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-cattura'; dlg.className = 'dlg-cattura'; document.body.appendChild(dlg); }
    let c;
    try { c = await api(`/api/stampati/${ctx.id}/cattura`, { method: 'POST', body: JSON.stringify({ pagina_id: p?.id || null }) }); }
    catch (e) { return toast(e.message, 'err'); }
    const soloLocale = c.basi.every((b) => b.tipo === 'locale');
    const render = (base) => {
      const url = `${base}${c.percorso}`;
      dlg.innerHTML = `<h3>Fotografa la pagina dal telefono</h3>
        <p class="muto piccolo">Pagina: <b>${esc(p ? p.titolo : 'nuova pagina in coda')}</b>${p?.immagine ? ' · la foto sostituirà l’immagine attuale' : ''}</p>
        <div class="corpo">
          <div class="qr"><img src="/api/stampati/${ctx.id}/cattura/${c.token}/qr.png?base=${encodeURIComponent(base)}" alt="QR per il telefono"></div>
          <div class="testo">
            ${c.basi.length > 1 ? `<label>Il telefono raggiunge il PC tramite</label><select id="cat-base">${c.basi.map((b) => `<option value="${esc(b.url)}" ${b.url === base ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select>` : ''}
            <label>Link (vale ${c.minuti} minuti)</label><code>${esc(url)}</code>
            <p class="muto piccolo">Inquadra il QR con la fotocamera del telefono, scatta la foto del foglio, trascina i quattro angoli sui bordi e invia. Il foglio deve avere un disegno o del testo con contrasto: bianco o solo righe non si riconosce.</p>
            ${soloLocale ? `<p class="piccolo" style="color:var(--warn)">Il server risponde solo su questo PC: il telefono non lo raggiunge. Collega il PC alla rete Wi-Fi per avere un indirizzo locale, oppure avvia il tunnel e imposta PUBLIC_URL.</p>` : ''}
            <div class="stato"><span class="punto"></span><span id="cat-stato">In attesa della foto…</span></div>
          </div>
        </div>
        <div class="piede"><button id="cat-chiudi">Chiudi</button></div>`;
      $('#cat-base', dlg)?.addEventListener('change', (e) => render(e.target.value));
      $('#cat-chiudi', dlg).addEventListener('click', () => dlg.close());
    };
    render(c.basi[0].url);
    dlg.showModal();
    clearInterval(catturaTimer);
    catturaTimer = setInterval(async () => {
      if (!dlg.open) return clearInterval(catturaTimer);
      try {
        const st = await api(`/api/stampati/${ctx.id}/cattura/${c.token}`);
        if (st.usato) {
          clearInterval(catturaTimer); dlg.close();
          await ctx.ricarica(); render0();
          toast('Foto ricevuta dal telefono: la pagina è pronta, ora compila il target', 'ok', 5000);
        }
      } catch { /* token scaduto o rete: si riprova al prossimo giro */ }
    }, 2000);
    dlg.addEventListener('close', () => clearInterval(catturaTimer), { once: true });
  }
  const render0 = () => render();

  function renderConsigli() {
    const t = ctx.stampato.templateInfo; const box = $('#consigli-template');
    if (!t) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<summary>${ic('attenzione')} Consigli per: ${esc(t.nome)} (${t.larghezza_mm}×${t.altezza_mm} mm)</summary><ul>${t.consigli.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  }

  function render() {
    renderConsigli(); renderPlastico();
    const pagine = ctx.stampato.pagine;
    const senza = pagine.filter((p) => !p.immagine).length;
    const scarse = pagine.filter((p) => p.qualita != null && p.qualita < 35).length;
    $('#consiglio-pagine').textContent = pagine.length
      ? `${pagine.length} pagine${senza ? `, ${senza} ancora senza immagine: trascinale qui sopra, vengono assegnate in ordine` : ''}. ${scarse ? `${scarse} con qualità scarsa: fondi uniformi o pochi dettagli si riconoscono male.` : (senza ? '' : 'Le immagini hanno dettagli sufficienti per il riconoscimento.')}`
      : 'Consiglio: immagini ricche di dettagli e contrasto (foto, illustrazioni, testo grande) si riconoscono meglio di fondi uniformi.';
    griglia.innerHTML = pagine.map((p) => {
      const q = etichettaQualita(p.qualita);
      const target = p.target && p.target_hash === p.immagine;
      return `<article class="card pagina-card ${p.immagine ? '' : 'vuota'}" data-id="${p.id}">
        <div class="thumb" ${p.immagine ? `style="background-image:url('/uploads/${esc(p.immagine)}')"` : ''}><span class="num">${p.ordine}</span>
          ${p.immagine ? '' : `<label class="btn carica">${ic('upload')} Carica immagine<input type="file" accept="image/*" hidden data-sost></label><button class="btn carica tel" data-tel>${ic('telefono')} Dal telefono</button>`}</div>
        <div class="corpo">
          <input value="${esc(p.titolo)}" data-titolo title="Titolo della pagina">
          <div class="badges">${p.immagine ? `<span class="badge ${q.cls}" title="Stima di tracciabilità">qualità ${q.testo}</span>
            <span class="badge ${target ? 'ok' : 'warn'}">${target ? 'target pronto' : 'target da compilare'}</span>` : `<span class="badge err">senza immagine</span>`}
            ${p.scena.elementi.length ? `<span class="badge">${p.scena.elementi.length} elementi</span>` : ''}</div>
          <div class="azioni">
            <button data-su title="Sposta prima">${ic('indietro')}</button>
            <button data-giu title="Sposta dopo">${ic('avanti')}</button>
            ${p.immagine ? `<label class="btn" title="Sostituisci immagine">${ic('aggiorna')}<input type="file" accept="image/*" hidden data-sost></label>` : ''}
            ${p.immagine ? `<button data-tel title="Fotografa dal telefono (sostituisce l’immagine)">${ic('telefono')}</button>` : ''}
            <a class="btn" href="#" data-contenuti title="Vai ai contenuti di questa pagina">${ic('cubo')}</a>
            <button class="pericolo" data-del title="Elimina pagina" style="margin-left:auto">${ic('cestino')}</button>
          </div>
        </div></article>`;
    }).join('') + `<button class="card pagina-card aggiungi-pagina" id="btn-pagina-vuota">${ic('plus')}<span>Aggiungi pagina vuota</span></button>`;
    $$('[data-id]', griglia).forEach((card) => {
      const p = pagine.find((x) => x.id === Number(card.dataset.id));
      $('[data-titolo]', card).addEventListener('change', async (e) => {
        await api(`/api/pagine/${p.id}`, { method: 'PUT', body: JSON.stringify({ titolo: e.target.value }) });
        p.titolo = e.target.value; ctx.aggiornaStepper();
      });
      $('[data-su]', card).addEventListener('click', () => sposta(p, -1));
      $('[data-giu]', card).addEventListener('click', () => sposta(p, 1));
      $$('[data-tel]', card).forEach((b) => b.addEventListener('click', () => apriCattura(p)));
      $$('[data-sost]', card).forEach((i) => i.addEventListener('change', (e) => { if (e.target.files[0]) sostituisci(p, e.target.files[0]); }));
      $('[data-contenuti]', card).addEventListener('click', (e) => { e.preventDefault(); ctx.vai('contenuti', { p: p.id }); });
      $('[data-del]', card).addEventListener('click', async () => {
        if (!confirm(`Eliminare la pagina “${p.titolo}” con la sua scena? Il suo QR smetterà di funzionare.`)) return;
        await api(`/api/pagine/${p.id}`, { method: 'DELETE' });
        await ctx.ricarica(); render();
      });
    });
    $('#btn-pagina-vuota').addEventListener('click', aggiungiVuota);
    $('#avanti-target').disabled = !pagine.some((p) => p.immagine);
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
