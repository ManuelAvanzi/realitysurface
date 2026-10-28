// Portale: elenco degli stampati dell'utente, creazione da template, demo.
import { ic } from './icone.js';
import { $, $$, api, esc, toast, richiediUtente, chipUtente, TIPI_ETICHETTA } from './comune.js';
import { illustrazione } from './illustrazioni.js';

const utente = await richiediUtente();
chipUtente($('#utente'), utente);
$('#logo-ic').innerHTML = ic('cubo3d');
$('#btn-nuovo').innerHTML = `${ic('plus')} Nuovo stampato`;
$('#btn-demo').innerHTML = `${ic('sfera')} Demo`;
let config = null;

function barraAvanzamento(s) {
  const cls = (fatti, tot) => (tot && fatti === tot) ? 'fatto' : (fatti > 0 ? 'parziale' : '');
  return `<div class="avanzamento" title="Pagine · Target · Contenuti · Pubblicazione">
    <i class="${cls(s.n_con_immagine, s.n_pagine)}"></i><i class="${cls(s.n_target, s.n_pagine)}"></i>
    <i class="${cls(s.n_con_contenuti, s.n_pagine)}"></i><i class="${s.pubblicato ? 'fatto' : ''}"></i></div>`;
}

async function carica() {
  const lista = $('#lista');
  const rows = await api('/api/stampati');
  if (!rows.length) {
    lista.innerHTML = `<div class="vuoto" style="grid-column:1/-1">Nessuno stampato. Creane uno da un template oppure genera una demo per vedere il flusso completo.</div>`;
    return;
  }
  lista.innerHTML = rows.map((s) => `
    <article class="card stampato" data-id="${s.id}">
      <a class="cover" href="/editor/?s=${s.id}" ${s.copertina ? `style="background-image:url('/uploads/${esc(s.copertina)}')"` : ''}>${s.copertina ? '' : illustrazione(s.template || s.tipo)}
        <span class="badge stato ${s.pubblicato ? 'ok' : 'warn'}" style="background:#0f1115cc">${s.pubblicato ? 'Pubblicato' : 'Bozza'}</span></a>
      <div class="corpo">
        <h3>${esc(s.titolo)}</h3>
        <div class="meta">
          <span class="badge">${esc(TIPI_ETICHETTA[s.tipo] || s.tipo)}</span>
          <span class="badge">${s.larghezza_mm}×${s.altezza_mm} mm</span>
          ${utente.ruolo === 'admin' && s.proprietario !== utente.email ? `<span class="badge" title="proprietario">${esc(s.proprietario || '—')}</span>` : ''}
        </div>
        ${barraAvanzamento(s)}
        <div class="muto piccolo">${s.n_pagine} pagine · immagini ${s.n_con_immagine}/${s.n_pagine} · target ${s.n_target}/${s.n_pagine} · contenuti ${s.n_con_contenuti}/${s.n_pagine} · ${s.n_scansioni} scansioni</div>
        <div class="azioni">
          <a class="btn primario" href="/editor/?s=${s.id}">${ic('cubo')} Apri</a>
          <a class="btn" href="/v/${esc(s.slug)}/1?modo=3d" target="_blank">${ic('occhio')} Anteprima</a>
          <a class="btn" href="/editor/?s=${s.id}&passo=pubblica">${ic('qr')} QR e pubblicazione</a>
          <button class="pericolo" data-elimina="${s.id}">${ic('cestino')} Elimina</button>
        </div>
      </div>
    </article>`).join('');
  lista.querySelectorAll('[data-elimina]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Eliminare lo stampato con tutte le pagine e gli asset? I QR già stampati smetteranno di funzionare.')) return;
    await api(`/api/stampati/${b.dataset.elimina}`, { method: 'DELETE' });
    toast('Stampato eliminato'); carica();
  }));
}

// --- nuovo stampato da template ---
const dlg = $('#dlg-nuovo');
let templateScelto = null;
function renderTemplate() {
  $('#template').innerHTML = config.template.map((t) => `
    <button type="button" class="tpl ${templateScelto?.id === t.id ? 'attivo' : ''}" data-id="${t.id}">
      <span class="scatola">${illustrazione(t.id)}</span><b>${esc(t.nome)}</b><small>${t.larghezza_mm}×${t.altezza_mm} mm · ${t.pagine.length} ${t.pagine.length === 1 ? 'pagina' : 'pagine'}</small>
    </button>`).join('');
  $$('#template .tpl').forEach((b) => b.addEventListener('click', () => scegliTemplate(config.template.find((t) => t.id === b.dataset.id))));
}
function scegliTemplate(t) {
  templateScelto = t;
  $('#n-tipo').value = t.tipo; $('#n-w').value = t.larghezza_mm; $('#n-h').value = t.altezza_mm;
  $('#tpl-desc').innerHTML = `<p>${esc(t.descrizione)}</p><p class="muto piccolo">Pagine iniziali: ${t.pagine.map(esc).join(', ')}. ${t.plastico ? 'Il basamento stampato è il target; il modello 3D si carica come riferimento nell’editor.' : ''}</p>`;
  renderTemplate();
}
api('/api/config').then((c) => {
  config = c;
  $('#n-tipo').innerHTML = c.tipi.map((t) => `<option value="${t}">${TIPI_ETICHETTA[t] || t}</option>`).join('');
  scegliTemplate(c.template[2] || c.template[0]);
});
$('#btn-nuovo').addEventListener('click', () => { $('#n-titolo').value = ''; dlg.showModal(); });
$('#n-annulla').addEventListener('click', () => dlg.close());
$('#n-crea').addEventListener('click', async () => {
  try {
    const s = await api('/api/stampati', { method: 'POST', body: JSON.stringify({
      titolo: $('#n-titolo').value, tipo: $('#n-tipo').value, descrizione: $('#n-desc').value,
      larghezza_mm: $('#n-w').value, altezza_mm: $('#n-h').value, template: templateScelto?.id, pagineIniziali: $('#n-pagine').checked,
    }) });
    location.href = `/editor/?s=${s.id}&passo=pagine`;
  } catch (e) { toast(e.message, 'err'); }
});

// --- demo ---
$('#btn-demo').addEventListener('click', () => $('#dlg-demo').showModal());
$('#demo-annulla').addEventListener('click', () => $('#dlg-demo').close());
$$('[data-demo]').forEach((b) => b.addEventListener('click', async () => {
  b.disabled = true; const testo = b.innerHTML; b.innerHTML = `${ic('aggiorna')} Genero pagine e scene…`;
  try {
    const r = await api(`/api/demo/${b.dataset.demo}`, { method: 'POST', body: JSON.stringify({}) });
    toast('Demo creata: ora compila i target', 'ok');
    location.href = `/editor/?s=${r.id}&passo=target&compila=1`;
  } catch (e) { toast(e.message, 'err'); b.disabled = false; b.innerHTML = testo; }
}));

carica();
