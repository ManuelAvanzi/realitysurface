// Landing pubblica: icone SVG, stato di accesso (accedi / i tuoi stampati), liste generate.
import { ic } from './icone.js';
import { $, utenteCorrente } from './comune.js';

$('#logo-ic').innerHTML = ic('cubo3d');
$('#fl-a').innerHTML = ic('camera');
$('#fl-b').innerHTML = ic('qr');

$('#fiducia').innerHTML = [
  'Nel browser, senza app', 'QR, link o foto del foglio', 'Self-hosted, i tuoi dati restano tuoi',
].map((t) => `<span>${ic('ok')}${t}</span>`).join('');

$('#superfici').innerHTML = [
  ['biglietto', 'Biglietti da visita'], ['brochure', 'Brochure pieghevoli'], ['libro', 'Pagine di libro'], ['poster', 'Poster'],
  ['plastico', 'Plastici'], ['pagina', 'Fogli e quaderni'],
].map(([i, t]) => `<span>${ic(i)}${t}</span>`).join('');

$('#vantaggi-lista').innerHTML = [
  ['qr', 'Cambi la scena dopo la stampa', 'Il QR punta a un indirizzo di redirezione: aggiorni i contenuti senza ristampare nulla.'],
  ['telefono', 'Senza stampante', 'Fotografa un foglio o un quaderno dal telefono: la foto raddrizzata diventa la pagina da riconoscere.'],
  ['cubo3d', 'Modelli 3D veri', 'GLB con animazioni, sfere con texture, testi, immagini, personaggi che camminano su un percorso.'],
  ['plastico', 'Plastici e occlusione', 'Il modello del plastico nasconde ciò che gli sta dietro: i personaggi girano davvero tra le case.'],
  ['occhio', 'Anteprima subito', 'Il viewer funziona anche senza fotocamera: su PC vedi la scena in 3D, sul telefono in AR.'],
  ['stampa', 'Foglio per la tipografia', 'Tutti i QR a misura reale con quiet zone, pronti da consegnare per la stampa.'],
].map(([i, t, d]) => `<div class="vantaggio"><div class="ico">${ic(i)}</div><h3>${t}</h3><p>${d}</p></div>`).join('');

// Accesso: se l'utente è già dentro, i bottoni portano ai suoi stampati.
const m = await utenteCorrente().catch(() => ({}));
const box = $('#accesso');
if (m.utente) {
  box.innerHTML = `<a class="btn primario" href="/stampati">${ic('avanti')} I tuoi stampati</a>`;
  for (const id of ['cta-inizia', 'cta-demo']) { const a = $(`#${id}`); a.href = '/stampati'; a.textContent = 'Vai ai tuoi stampati'; }
  $('#cta-accedi').hidden = true;
} else {
  const reg = m.primoAvvio ? '/login?registrazione=1' : '/login';
  box.innerHTML = `<a class="btn btn-fantasma" href="/login">Accedi</a><a class="btn primario" href="${m.primoAvvio ? reg : '/login?registrazione=1'}">Inizia gratis</a>`;
}
