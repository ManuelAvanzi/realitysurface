// Pagina per il telefono (/cattura/<token>): fotografa il foglio, trascina i 4 angoli, raddrizza e carica.
// Nessun login: autentica il token. La foto raddrizzata diventa l'immagine della pagina nell'editor.
import { ic } from './icone.js';
import { $, $$, esc, toast, qualitaImmagine } from './comune.js';

const token = location.pathname.split('/').pop();
const main = $('#main');
const LATO_MAX_SORGENTE = 2400; // px: le foto dei telefoni sono enormi, qui basta meno
const LATO_MAX_USCITA = 1800;

let info = null;
let sorgente = null; // canvas con la foto ridotta
let angoli = [];     // 4 punti in pixel della sorgente: alto-sx, alto-dx, basso-dx, basso-sx

async function avvia() {
  const r = await fetch(`/api/cattura/${token}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { main.innerHTML = `<h2>Link non valido</h2><p class="errore">${esc(j.errore || r.statusText)}</p><p class="muto">Genera un nuovo QR dall’editor, passo 1, “Scatta dal telefono”.</p>`; return; }
  info = j;
  schermataScatto();
}

function schermataScatto() {
  $('#badge-stato').textContent = `${info.minutiRestanti} min`;
  main.innerHTML = `<h2>${esc(info.stampato)}</h2>
    <p class="muto">Pagina: <b>${esc(info.pagina)}</b>${info.usato ? ' · già caricata: una nuova foto la sostituisce' : ''}</p>
    <div class="grandi">
      <label class="btn primario">${ic('camera')} Scatta la foto<input type="file" accept="image/*" capture="environment" hidden id="f-scatta"></label>
      <label class="btn">${ic('immagine')} Scegli dalla galleria<input type="file" accept="image/*" hidden id="f-galleria"></label>
    </div>
    <p class="muto piccolo">Appoggia il foglio piatto, luce uniforme, senza ombre e riflessi. Inquadra tutto il foglio con un po’ di margine: gli angoli li sistemi dopo.</p>`;
  $('#f-scatta').addEventListener('change', (e) => e.target.files[0] && caricaFoto(e.target.files[0]));
  $('#f-galleria').addEventListener('change', (e) => e.target.files[0] && caricaFoto(e.target.files[0]));
}

async function caricaFoto(file) {
  main.innerHTML = '<p class="muto">Preparo la foto…</p>';
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = URL.createObjectURL(file); });
  const k = Math.min(1, LATO_MAX_SORGENTE / Math.max(img.naturalWidth, img.naturalHeight));
  sorgente = document.createElement('canvas');
  sorgente.width = Math.round(img.naturalWidth * k); sorgente.height = Math.round(img.naturalHeight * k);
  sorgente.getContext('2d').drawImage(img, 0, 0, sorgente.width, sorgente.height);
  URL.revokeObjectURL(img.src);
  const W = sorgente.width, H = sorgente.height, m = 0.08;
  angoli = [[W * m, H * m], [W * (1 - m), H * m], [W * (1 - m), H * (1 - m)], [W * m, H * (1 - m)]];
  schermataAngoli();
}

function schermataAngoli() {
  main.innerHTML = `<h2>Sistema gli angoli</h2>
    <p class="muto piccolo">Trascina i quattro punti sugli angoli del foglio: la foto viene raddrizzata come una scansione.</p>
    <div class="tappa" id="tappa"><canvas id="c-foto"></canvas><canvas id="c-sopra" class="sopra"></canvas></div>
    <div class="azioni">
      <button id="b-rifai">${ic('aggiorna')} Rifai</button>
      <button id="b-tutta">Tutta la foto</button>
      <button class="primario" id="b-invia">${ic('upload')} Raddrizza e invia</button>
    </div>`;
  const foto = $('#c-foto'), sopra = $('#c-sopra');
  foto.width = sorgente.width; foto.height = sorgente.height;
  foto.getContext('2d').drawImage(sorgente, 0, 0);
  const disegna = () => {
    const rect = sopra.getBoundingClientRect();
    sopra.width = Math.round(rect.width * devicePixelRatio); sopra.height = Math.round(rect.height * devicePixelRatio);
    const g = sopra.getContext('2d'); const k = sopra.width / sorgente.width;
    g.clearRect(0, 0, sopra.width, sopra.height);
    // Zona fuori dal foglio scurita.
    g.fillStyle = '#000a'; g.beginPath(); g.rect(0, 0, sopra.width, sopra.height);
    g.moveTo(angoli[0][0] * k, angoli[0][1] * k); for (let i = 3; i >= 1; i--) g.lineTo(angoli[i][0] * k, angoli[i][1] * k); g.closePath(); g.fill('evenodd');
    g.strokeStyle = '#ff5900'; g.lineWidth = 2 * devicePixelRatio; g.beginPath();
    angoli.forEach((a, i) => (i ? g.lineTo(a[0] * k, a[1] * k) : g.moveTo(a[0] * k, a[1] * k))); g.closePath(); g.stroke();
    for (const a of angoli) { g.beginPath(); g.arc(a[0] * k, a[1] * k, 14 * devicePixelRatio, 0, Math.PI * 2); g.fillStyle = '#ff5900cc'; g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
  };
  disegna();
  addEventListener('resize', disegna);
  // Trascinamento degli angoli (mouse e dito).
  let preso = -1;
  const posizione = (e) => { const r = sopra.getBoundingClientRect(); const k = sorgente.width / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
  sopra.addEventListener('pointerdown', (e) => {
    const [x, y] = posizione(e); let best = -1, bd = Infinity;
    angoli.forEach((a, i) => { const d = Math.hypot(a[0] - x, a[1] - y); if (d < bd) { bd = d; best = i; } });
    const r = sopra.getBoundingClientRect();
    if (bd * r.width / sorgente.width < 40) { preso = best; sopra.setPointerCapture(e.pointerId); }
  });
  sopra.addEventListener('pointermove', (e) => {
    if (preso < 0) return;
    const [x, y] = posizione(e);
    angoli[preso] = [Math.max(0, Math.min(sorgente.width, x)), Math.max(0, Math.min(sorgente.height, y))];
    disegna();
  });
  const lascia = () => { preso = -1; };
  sopra.addEventListener('pointerup', lascia); sopra.addEventListener('pointercancel', lascia);
  $('#b-rifai').addEventListener('click', schermataScatto);
  $('#b-tutta').addEventListener('click', () => { const W = sorgente.width, H = sorgente.height; angoli = [[0, 0], [W, 0], [W, H], [0, H]]; disegna(); });
  $('#b-invia').addEventListener('click', raddrizzaEInvia);
}

/** Omografia che manda i 4 angoli di destinazione (0,0),(W,0),(W,H),(0,H) nei 4 punti sorgente. */
function omografia(W, H, dst) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Eliminazione di Gauss con pivot.
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k]; h[r] = s / A[r][r]; }
  return [...h, 1];
}

function raddrizza() {
  const [a, b, c, d] = angoli;
  const larg = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - d[0], c[1] - d[1])) / 2;
  const alt = (Math.hypot(d[0] - a[0], d[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
  const k = Math.min(1, LATO_MAX_USCITA / Math.max(larg, alt));
  const W = Math.max(64, Math.round(larg * k)), H = Math.max(64, Math.round(alt * k));
  const h = omografia(W, H, angoli);
  const sw = sorgente.width, sh = sorgente.height;
  const s = sorgente.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'); const o = g.createImageData(W, H); const od = o.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const den = h[6] * x + h[7] * y + 1;
    const u = (h[0] * x + h[1] * y + h[2]) / den, v = (h[3] * x + h[4] * y + h[5]) / den;
    const i = (y * W + x) * 4;
    if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { od[i] = od[i + 1] = od[i + 2] = 255; od[i + 3] = 255; continue; }
    const u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0;
    const p00 = (v0 * sw + u0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
    for (let ch = 0; ch < 3; ch++) {
      od[i + ch] = (s[p00 + ch] * (1 - fu) + s[p10 + ch] * fu) * (1 - fv) + (s[p01 + ch] * (1 - fu) + s[p11 + ch] * fu) * fv;
    }
    od[i + 3] = 255;
  }
  g.putImageData(o, 0, 0);
  return out;
}

async function raddrizzaEInvia() {
  $('#b-invia').disabled = true; $('#b-invia').textContent = 'Raddrizzo…';
  await new Promise((r) => setTimeout(r, 30)); // lascia ridisegnare il bottone
  try {
    const out = raddrizza();
    const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92));
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = URL.createObjectURL(blob); });
    const qualita = qualitaImmagine(img);
    const fd = new FormData();
    fd.append('immagine', blob, `foto-${token}.jpg`); fd.append('larghezza_px', out.width); fd.append('altezza_px', out.height); fd.append('qualita', qualita);
    $('#b-invia').textContent = 'Invio…';
    const r = await fetch(`/api/cattura/${token}`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.errore || r.statusText);
    info.usato = true;
    main.innerHTML = `<h2>Caricata</h2>
      <p class="muto">La pagina è nell’editor sul PC: <b>${esc(info.pagina)}</b> di <b>${esc(info.stampato)}</b>. Qualità stimata: ${qualita}/100${qualita < 35 ? ' (scarsa: serve più disegno o contrasto sul foglio)' : qualita < 60 ? ' (media)' : ' (buona)'}.</p>
      <div class="esito"><img src="${img.src}" alt="Pagina raddrizzata"></div>
      <div class="azioni"><button id="b-ancora">${ic('camera')} Rifai la foto</button></div>`;
    $('#badge-stato').textContent = 'fatto';
    $('#b-ancora').addEventListener('click', schermataScatto);
  } catch (e) {
    toast(e.message, 'err', 6000);
    $('#b-invia').disabled = false; $('#b-invia').innerHTML = `${ic('upload')} Raddrizza e invia`;
  }
}

avvia();
window.__cattura = { caricaFoto, angoliImposta: (a) => { angoli = a; }, raddrizzaEInvia }; // per il collaudo senza fotocamera
