// Genera il basamento stampabile di un plastico a partire dal suo GLB: vista dall'alto renderizzata con three.js
// su una tavola decorata (griglia, pattern, cornice, titolo, bussola, QR). Il risultato è l'immagine della pagina,
// cioè il target che il telefono riconosce. Il modello fisico si appoggia esattamente sulla sua impronta.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * @param {object} o
 * @param {string} o.glbUrl        URL del GLB di riferimento
 * @param {number} o.wMm, o.hMm    formato del basamento in mm (proporzioni)
 * @param {number} o.larghezza     ingombro del modello in unità pagina (larghezza = 1)
 * @param {number} o.rotazione     rotazione z in gradi; o.offsetX/o.offsetY spostamento
 * @param {string} o.titolo        titolo stampato
 * @param {string} [o.qrUrl]       immagine del QR da incorporare
 * @returns {Promise<{blob: Blob, w: number, h: number}>}
 */
export async function generaBasamento(o) {
  const W = 1684, H = Math.round(W * (o.hMm / o.wMm));
  const altezzaU = o.hMm / o.wMm; // altezza in unità pagina

  // --- render 3D dall'alto (ortografico), fondo trasparente ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, altezzaU / 2, -altezzaU / 2, 0.01, 50);
  cam.position.set(0, 0, 10); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#55606e', 1.2));
  const sole = new THREE.DirectionalLight('#ffffff', 2.2); sole.position.set(-0.6, 0.7, 1.5); scene.add(sole);

  const gltf = await new GLTFLoader().loadAsync(o.glbUrl);
  const modello = gltf.scene;
  const wrap = new THREE.Group(); wrap.add(modello); wrap.rotation.x = Math.PI / 2;
  const box = new THREE.Box3().setFromObject(wrap);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = (Number(o.larghezza) || 0.6) / (Math.max(size.x, size.y) || 1);
  const centro = new THREE.Vector3(); box.getCenter(centro);
  wrap.position.set(-centro.x * s, -centro.y * s, -box.min.z * s); wrap.scale.setScalar(s);
  const g = new THREE.Group(); g.add(wrap);
  g.position.set(Number(o.offsetX) || 0, Number(o.offsetY) || 0, 0);
  g.rotation.z = THREE.MathUtils.degToRad(Number(o.rotazione) || 0);
  scene.add(g); g.updateMatrixWorld(true);
  // Altezza massima del modello (unità pagina) per colorare in base alla quota: le parti alte più chiare,
  // così la vista dall'alto resta leggibile anche con un modello monocromo (stampa 3D).
  const bboxW = new THREE.Box3().setFromObject(g); const zMax = bboxW.max.z || 1;
  const cBasso = new THREE.Color('#9c8f7a'), cAlto = new THREE.Color('#fbf7ef'), tmp = new THREE.Color();
  g.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat?.map) {
      const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        tmp.copy(cBasso).lerp(cAlto, Math.min(1, Math.max(0, v.z / zMax)));
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    }
    const spigoli = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: '#3b3028' }));
    m.add(spigoli);
  });
  renderer.render(scene, cam);
  const render3d = renderer.domElement;

  // --- tavola 2D ---
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const fondo = ctx.createLinearGradient(0, 0, W, H); fondo.addColorStop(0, '#e9e2d3'); fondo.addColorStop(1, '#d6ccb8');
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
  // pattern: griglia + punti irregolari (danno "feature" al tracciamento)
  ctx.strokeStyle = '#b8ad98'; ctx.lineWidth = 1.5;
  const passo = W / 20;
  for (let x = passo; x < W; x += passo) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = passo; y < H; y += passo) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  let seme = 7;
  const rnd = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647; };
  for (let k = 0; k < 400; k++) {
    const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 6;
    ctx.fillStyle = `rgba(${60 + rnd() * 80 | 0},${50 + rnd() * 60 | 0},${40 + rnd() * 40 | 0},${0.15 + rnd() * 0.35})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // anelli concentrici attorno all'impronta
  const cx = (0.5 + (Number(o.offsetX) || 0)) * W, cy = (altezzaU / 2 - (Number(o.offsetY) || 0)) * W;
  ctx.strokeStyle = '#a89c86'; ctx.lineWidth = 2; ctx.setLineDash([14, 10]);
  for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.arc(cx, cy, (Number(o.larghezza) || 0.6) * W * (0.55 + r * 0.12), 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
  // ombra e modello
  ctx.save(); ctx.filter = 'blur(14px)'; ctx.globalAlpha = 0.45; ctx.drawImage(render3d, 10, 14); ctx.restore();
  ctx.drawImage(render3d, 0, 0);
  // cornice, titolo, bussola
  ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.fillStyle = '#2b2118dd'; ctx.fillRect(40, 40, Math.min(760, W - 400), 118);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(String(o.titolo || 'Plastico').toUpperCase().slice(0, 28), 62, 102);
  ctx.font = '26px sans-serif'; ctx.fillStyle = '#ffb36b'; ctx.fillText('Basamento REALITYSURFACE · appoggia il modello sulla sua impronta', 62, 140);
  ctx.save(); ctx.translate(W - 110, 120); ctx.fillStyle = '#2b2118dd'; ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(13, 10); ctx.lineTo(0, 0); ctx.lineTo(-13, 10); ctx.fill();
  ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, 40); ctx.restore();
  // QR
  if (o.qrUrl) {
    try {
      const qr = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = o.qrUrl; });
      const qs = Math.round(W * 0.13), qx = W - qs - 50, qy = H - qs - 50;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(qx - 14, qy - 14, qs + 28, qs + 28, 14); ctx.fill();
      ctx.drawImage(qr, qx, qy, qs, qs);
      ctx.fillStyle = '#2b2118'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Inquadra il plastico', qx + qs / 2, qy - 26);
    } catch { /* senza QR */ }
  }
  renderer.dispose();
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { blob, w: W, h: H };
}
