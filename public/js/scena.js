// Modulo condiviso editor/viewer: costruisce gli oggetti three.js dal JSON di scena di una pagina.
//
// Sistema di coordinate (identico a MindAR): origine al centro della pagina, larghezza pagina = 1 unità,
// x verso destra, y verso l'alto della pagina, z verso chi guarda (fuori dalla carta).
//
// Elemento: { id, nome, tipo, pos:[x,y,z], rot:[gradi x,y,z], scala:[x,y,z], anim:{...}, ...proprietà per tipo }
// Tipi: glb {src, normalizza}, sfera {src, colore, raggio}, testo {testo, colore, sfondo, altezza}, immagine {src, larghezza}
// Animazioni: anim.rotazione {asse:'x'|'y'|'z', giri (al minuto)}, anim.fluttua {ampiezza, periodo}, anim.orbita {raggio, periodo, asse}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const cacheGltf = new Map();

export const TIPI_ELEMENTO = {
  glb: 'Modello 3D (GLB)',
  sfera: 'Sfera con texture',
  testo: 'Testo',
  immagine: 'Immagine',
};

export function nuovoId() { return Math.random().toString(36).slice(2, 9); }

export function elementoDefault(tipo) {
  const base = { id: nuovoId(), tipo, nome: TIPI_ELEMENTO[tipo] || tipo, pos: [0, 0, 0.05], rot: [0, 0, 0], scala: [1, 1, 1], anim: {} };
  if (tipo === 'glb') return { ...base, src: '', normalizza: true, scala: [0.3, 0.3, 0.3], pos: [0, 0, 0.15] };
  if (tipo === 'sfera') return { ...base, src: '', colore: '#c9622b', raggio: 0.18, pos: [0, 0, 0.22], anim: { rotazione: { asse: 'z', giri: 2 } } };
  if (tipo === 'testo') return { ...base, testo: 'Testo', colore: '#ffffff', sfondo: '#1b1f2acc', altezza: 0.06, pos: [0, -0.3, 0.03] };
  if (tipo === 'immagine') return { ...base, src: '', larghezza: 0.3, pos: [0, 0, 0.02] };
  return base;
}

export function urlAsset(src) {
  if (!src) return '';
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:')) return src;
  return `/uploads/${src}`;
}

function loadGltf(url) {
  if (!cacheGltf.has(url)) cacheGltf.set(url, gltfLoader.loadAsync(url));
  return cacheGltf.get(url);
}

function texturaCanvas(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function creaTesto(el) {
  const testo = String(el.testo || ' ');
  const righe = testo.split('\n');
  const fontPx = 64;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  const pad = 28;
  const w = Math.max(...righe.map((r) => ctx.measureText(r).width)) + pad * 2;
  const h = righe.length * fontPx * 1.25 + pad * 2;
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  if (el.sfondo && el.sfondo !== 'none') {
    ctx.fillStyle = el.sfondo;
    const r = 24;
    ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, r); ctx.fill();
  }
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = el.colore || '#fff';
  ctx.textBaseline = 'top';
  righe.forEach((r, i) => ctx.fillText(r, pad, pad + i * fontPx * 1.25));
  const alt = Number(el.altezza) || 0.06;
  const altTot = alt * righe.length + (pad * 2 / fontPx) * alt * 0.8;
  const larg = altTot * (c.width / c.height);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(larg, altTot),
    new THREE.MeshBasicMaterial({ map: texturaCanvas(c), transparent: true, side: THREE.DoubleSide }));
  return mesh;
}

async function creaContenuto(el) {
  if (el.tipo === 'sfera') {
    const mat = new THREE.MeshStandardMaterial({ color: el.src ? '#ffffff' : (el.colore || '#c9622b'), roughness: 0.85, metalness: 0 });
    if (el.src) {
      try {
        const t = await texLoader.loadAsync(urlAsset(el.src));
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mat.map = t;
      } catch (e) { console.warn('Texture non caricata', el.src, e); mat.color.set(el.colore || '#c9622b'); }
    }
    const m = new THREE.Mesh(new THREE.SphereGeometry(Number(el.raggio) || 0.18, 48, 32), mat);
    // Asse polare della sfera lungo z (fuori dalla pagina): un pianeta appoggiato sul libro gira "in piano".
    m.rotation.x = Math.PI / 2;
    const g = new THREE.Group(); g.add(m);
    return g;
  }
  if (el.tipo === 'testo') return creaTesto(el);
  if (el.tipo === 'immagine') {
    const g = new THREE.Group();
    if (el.src) {
      try {
        const t = await texLoader.loadAsync(urlAsset(el.src));
        t.colorSpace = THREE.SRGBColorSpace;
        const w = Number(el.larghezza) || 0.3, h = w * (t.image.height / t.image.width);
        g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide })));
      } catch (e) { console.warn('Immagine non caricata', el.src, e); g.add(segnaposto()); }
    } else g.add(segnaposto());
    return g;
  }
  if (el.tipo === 'glb') {
    const g = new THREE.Group();
    if (!el.src) { g.add(segnaposto()); return g; }
    try {
      const gltf = await loadGltf(urlAsset(el.src));
      const modello = gltf.scene.clone(true);
      if (el.normalizza !== false) {
        const box = new THREE.Box3().setFromObject(modello);
        const size = new THREE.Vector3(); box.getSize(size);
        const max = Math.max(size.x, size.y, size.z) || 1;
        const centro = new THREE.Vector3(); box.getCenter(centro);
        modello.position.sub(centro);
        modello.scale.setScalar(1 / max);
        // I GLB hanno y verso l'alto: li ruotiamo perché "in piedi" sulla pagina significhi lungo z.
        const wrap = new THREE.Group(); wrap.add(modello); wrap.rotation.x = Math.PI / 2;
        wrap.position.z = 0; g.add(wrap);
      } else g.add(modello);
      g.userData.clips = gltf.animations;
      if (gltf.animations?.length) {
        g.userData.mixer = new THREE.AnimationMixer(g);
        gltf.animations.forEach((clip) => g.userData.mixer.clipAction(clip).play());
      }
    } catch (e) { console.warn('GLB non caricato', el.src, e); g.add(segnaposto()); }
    return g;
  }
  return segnaposto();
}

function segnaposto() {
  return new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: '#888', wireframe: true }));
}

export function applicaTrasformazione(obj, el) {
  obj.position.fromArray((el.pos || [0, 0, 0]).map(Number));
  const r = (el.rot || [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(Number(d) || 0));
  obj.rotation.set(r[0], r[1], r[2]);
  obj.scale.fromArray((el.scala || [1, 1, 1]).map((v) => Number(v) || 1));
}

/** Crea l'Object3D di un elemento (gruppo esterno = trasformazione, figlio = contenuto). */
export async function costruisciElemento(el) {
  const radice = new THREE.Group();
  radice.name = el.nome || el.tipo;
  radice.userData.elemento = el;
  applicaTrasformazione(radice, el);
  const contenuto = await creaContenuto(el);
  contenuto.name = 'contenuto';
  radice.add(contenuto);
  return radice;
}

/** Luci standard per la pagina (dentro il gruppo ancorato, così seguono la carta). */
export function aggiungiLuci(gruppo) {
  const amb = new THREE.HemisphereLight('#ffffff', '#6b7280', 1.1);
  const sole = new THREE.DirectionalLight('#ffffff', 2.0);
  sole.position.set(0.6, 0.8, 1.4);
  gruppo.add(amb, sole);
  return { amb, sole };
}

/** Piano della pagina con la sua immagine (nell'editor e nel viewer non-AR). */
export function pianoPagina(urlImmagine, w, h) {
  const altezza = (h && w) ? h / w : 1.414;
  const geo = new THREE.PlaneGeometry(1, altezza);
  const mat = new THREE.MeshBasicMaterial({ color: '#e5e7eb' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pagina';
  if (urlImmagine) texLoader.loadAsync(urlImmagine).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    mat.map = t; mat.color.set('#ffffff'); mat.needsUpdate = true;
  }).catch(() => {});
  return mesh;
}

/**
 * Costruisce tutta la scena di una pagina dentro `gruppo`.
 * Ritorna { oggetti: Map(id → Object3D), aggiorna(dt, t) } dove aggiorna applica le animazioni.
 */
export async function costruisciScena(scena, gruppo) {
  const oggetti = new Map();
  const elementi = scena?.elementi || [];
  const creati = await Promise.all(elementi.map((el) => costruisciElemento(el)));
  creati.forEach((obj, i) => { gruppo.add(obj); oggetti.set(elementi[i].id, obj); });
  const basePos = new Map(elementi.map((el) => [el.id, [...(el.pos || [0, 0, 0])]]));
  function aggiorna(dt, t) {
    for (const [id, obj] of oggetti) {
      const el = obj.userData.elemento;
      const cont = obj.getObjectByName('contenuto');
      const a = el.anim || {};
      if (a.rotazione && cont) {
        const vel = (Number(a.rotazione.giri) || 0) * Math.PI * 2 / 60;
        cont.rotation[a.rotazione.asse || 'z'] += vel * dt;
      }
      const base = basePos.get(id) || el.pos;
      let dx = 0, dy = 0, dz = 0;
      if (a.fluttua) {
        const per = Number(a.fluttua.periodo) || 3;
        dz += (Number(a.fluttua.ampiezza) || 0.02) * Math.sin(t * Math.PI * 2 / per);
      }
      if (a.orbita) {
        const per = Number(a.orbita.periodo) || 8, r = Number(a.orbita.raggio) || 0.3;
        const ang = t * Math.PI * 2 / per;
        if ((a.orbita.asse || 'z') === 'z') { dx += Math.cos(ang) * r; dy += Math.sin(ang) * r; }
        else { dx += Math.cos(ang) * r; dz += Math.sin(ang) * r; }
      }
      if (a.fluttua || a.orbita) obj.position.set(Number(base[0]) + dx, Number(base[1]) + dy, Number(base[2]) + dz);
      if (cont?.userData.mixer) cont.userData.mixer.update(dt);
    }
  }
  return { oggetti, aggiorna, basePos };
}
