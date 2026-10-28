// Illustrazioni schematiche dei prodotti stampati, in proiezione isometrica su fondo bianco (stile catalogo di tipografia).
// Ogni illustrazione è generata da primitive (scatole, fogli) così restano coerenti tra loro.
const STROKE = '#3b4252', TOP = '#ffffff', SX = '#e9ecf1', DX = '#cfd5de', ACC = '#ff5900', ACC2 = '#ffb36b', CARTA = '#f6f7f9';
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);

/** Proiezione isometrica: x verso destra-giù, y verso sinistra-giù, z verso l'alto. */
function iso(x, y, z, ox, oy) { return [ox + (x - y) * C30, oy + (x + y) * S30 - z]; }
const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(pt).join(' ')}" fill="${fill}" stroke="${STROKE}" stroke-width="1.4" stroke-linejoin="round" ${extra}/>`;

/** Scatola con base in (x,y,z), dimensioni w (lungo x), d (lungo y), h (altezza). */
function box(o, x, y, z, w, d, h, c = {}) {
  const P = (a, b, cz) => iso(a, b, cz, o[0], o[1]);
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const dx = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)]; // faccia destra (verso +x)
  const sx = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)]; // faccia frontale (verso +y)
  return poly(dx, c.dx || DX) + poly(sx, c.sx || SX) + poly(top, c.top || TOP);
}
/** Righe di testo finte sulla faccia superiore (parallele a x). */
function righe(o, x, y, z, lunghezze, passo = 6, col = '#b8bfca') {
  return lunghezze.map((l, i) => {
    const a = iso(x, y + i * passo, z, o[0], o[1]), b = iso(x + l, y + i * passo, z, o[0], o[1]);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>`;
  }).join('');
}
/** Rettangolo pieno sulla faccia superiore. */
function patch(o, x, y, z, w, d, fill) {
  const P = (a, b) => iso(a, b, z, o[0], o[1]);
  return `<polygon points="${[P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d)].map(pt).join(' ')}" fill="${fill}"/>`;
}
/** Rettangolo pieno sulla faccia frontale (piano xz, a y fissa). */
function patchFront(o, x, y, z, w, h, fill) {
  const P = (a, cz) => iso(a, y, cz, o[0], o[1]);
  return `<polygon points="${[P(x, z), P(x + w, z), P(x + w, z + h), P(x, z + h)].map(pt).join(' ')}" fill="${fill}"/>`;
}
const ombra = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#0f1115" opacity=".08"/>`;
/** Piccolo contenuto AR: cubo arancione che fluttua sopra la superficie, con ombra. */
function cuboAR(o, x, y, z, s = 10) {
  return ombra(...iso(x + s / 2, y + s / 2, z, o[0], o[1]), s * 0.9, s * 0.4)
    + box(o, x, y, z + s * 0.9, s, s, s, { top: ACC2, sx: ACC, dx: '#c94400' });
}
const omino = (o, x, y, z, h = 9) => {
  const [bx, by] = iso(x, y, z, o[0], o[1]);
  return `<line x1="${bx}" y1="${by}" x2="${bx}" y2="${by - h * 0.6}" stroke="${STROKE}" stroke-width="2" stroke-linecap="round"/><circle cx="${bx}" cy="${by - h * 0.8}" r="${h * 0.22}" fill="${ACC}" stroke="${STROKE}" stroke-width="1.2"/>`;
};
const svg = (corpo) => `<svg class="ill" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="200" height="160" fill="#ffffff"/>${corpo}</svg>`;

export const ILLUSTRAZIONI = {
  biglietto: (() => {
    const o = [100, 70];
    return svg(ombra(100, 118, 70, 16)
      + box(o, -42, -20, 0, 76, 48, 2, { top: CARTA }) + righe(o, -30, -8, 2, [34, 26, 20], 7)
      + patch(o, 18, -12, 2.2, 10, 10, ACC)
      + box(o, -30, -4, 6, 76, 48, 2) + righe(o, -18, 8, 8, [30, 40, 22], 7)
      + patch(o, 24, 28, 8.2, 12, 12, '#1b1f2a') + patch(o, 26, 30, 8.4, 8, 8, '#fff') + patch(o, 28, 32, 8.6, 4, 4, '#1b1f2a')
      + cuboAR(o, -16, -26, 8, 12));
  })(),
  brochure: (() => {
    const o = [100, 96];
    const anta = (x, y, h, lin) => box(o, x, y, 0, 26, 2, h, { sx: CARTA }) + patchFront(o, x + 4, y, 6, 18, 12, lin ? '#dfe3ea' : ACC2) + patchFront(o, x + 4, y, 22, 18, 3, '#c5ccd6') + patchFront(o, x + 4, y, 28, 12, 3, '#c5ccd6');
    return svg(ombra(100, 110, 62, 12)
      + anta(-44, 0, 54, true) + anta(-18, 10, 58, false) + anta(8, 0, 54, true)
      + cuboAR(o, -8, -22, 58, 11));
  })(),
  libro: (() => {
    const o = [100, 70];
    return svg(ombra(100, 122, 66, 16)
      + box(o, -34, -22, 0, 62, 82, 12, { sx: '#f1f3f6', dx: '#2f3542', top: '#2f3542' })
      + patch(o, -30, -18, 12.2, 54, 74, '#3b4252') + patch(o, -26, -10, 12.4, 46, 16, ACC)
      + righe(o, -22, 14, 12.6, [30, 40, 24], 8, '#9aa3b2')
      + box(o, -14, -34, 12, 44, 60, 8, { top: CARTA }) + righe(o, -6, -24, 20.2, [26, 30, 18, 24], 8)
      + cuboAR(o, 6, 2, 20, 12));
  })(),
  poster: (() => {
    const o = [100, 112];
    return svg(ombra(100, 124, 50, 10)
      + box(o, -36, 0, 0, 72, 2, 98, { sx: CARTA })
      + patchFront(o, -30, 0, 44, 60, 46, '#dfe3ea') + patchFront(o, -30, 0, 44, 60, 46, ACC2)
      + patchFront(o, -24, 0, 56, 30, 24, ACC) + patchFront(o, -30, 0, 30, 44, 4, '#c5ccd6') + patchFront(o, -30, 0, 22, 30, 4, '#c5ccd6')
      + patchFront(o, 20, 0, 8, 12, 12, '#1b1f2a') + patchFront(o, 23, 0, 11, 6, 6, '#fff')
      + cuboAR(o, -10, -14, 98, 11));
  })(),
  plastico: (() => {
    const o = [100, 78];
    const base = box(o, -48, -34, 0, 96, 68, 5, { top: '#e4e7ec' });
    const strade = righe(o, -40, -2, 5.2, [80], 1, '#b8bfca') + `<line x1="${iso(0, -30, 5.2, 100, 78)[0]}" y1="${iso(0, -30, 5.2, 100, 78)[1]}" x2="${iso(0, 30, 5.2, 100, 78)[0]}" y2="${iso(0, 30, 5.2, 100, 78)[1]}" stroke="#b8bfca" stroke-width="2.2"/>`;
    const edifici = box(o, -36, -26, 5, 20, 16, 12, { top: CARTA }) + box(o, 8, -28, 5, 18, 18, 22, { top: CARTA }) + box(o, 14, -24, 27, 6, 6, 14, { top: ACC2, sx: ACC, dx: '#c94400' })
      + box(o, -30, 8, 5, 26, 14, 8, { top: CARTA }) + box(o, 12, 10, 5, 22, 18, 10, { top: CARTA }) + box(o, -8, -12, 5, 10, 10, 6, { top: CARTA });
    return svg(ombra(100, 120, 84, 14) + base + strade + edifici + omino(o, -14, 20, 5, 11) + omino(o, 30, -4, 5, 11) + omino(o, -2, 28, 5, 10)
      + patch(o, 34, 20, 5.2, 10, 10, '#1b1f2a') + patch(o, 36, 22, 5.4, 6, 6, '#fff'));
  })(),
  libero: (() => {
    const o = [100, 68];
    return svg(ombra(100, 124, 60, 14)
      + box(o, -32, -36, 0, 64, 86, 1.5, { top: CARTA })
      + righe(o, -24, -24, 1.7, [40, 48, 30, 44, 20], 9)
      + patch(o, 10, 30, 1.8, 16, 16, '#e4e7ec') + patch(o, 14, 34, 2, 8, 8, '#1b1f2a')
      + cuboAR(o, -10, 4, 2, 13));
  })(),
};
ILLUSTRAZIONI.altro = ILLUSTRAZIONI.libero;
ILLUSTRAZIONI.copertina = ILLUSTRAZIONI.libro;

export const illustrazione = (id) => ILLUSTRAZIONI[id] || ILLUSTRAZIONI.libero;
