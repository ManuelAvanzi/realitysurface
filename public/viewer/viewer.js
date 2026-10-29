// Viewer REALITYSURFACE: MindAR (image tracking) con fallback 3D senza camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ic } from '../js/icone.js';
import { costruisciScena, aggiungiLuci, pianoPagina, costruisciRiferimento } from '../js/scena.js';

const $ = (s) => document.querySelector(s);
const m = location.pathname.match(/^\/v\/([^/]+)(?:\/(\d+))?/);
const SLUG = m?.[1]; const N = Number(m?.[2]) || 1;
const params = new URLSearchParams(location.search);
let modo = params.get('modo') === '3d' ? '3d' : 'ar';

const stato = { stampato: null, pagina: null, attivo: null };

function mostraMessaggio(titolo, testo, azioni = []) {
  $('#msg-ic').innerHTML = ic('attenzione'); $('#msg-titolo').textContent = titolo; $('#msg-testo').textContent = testo;
  $('#msg-azioni').innerHTML = '';
  azioni.forEach(([lab, fn, primario]) => { const b = document.createElement('button'); b.textContent = lab; if (primario) b.className = 'primario'; b.onclick = fn; $('#msg-azioni').appendChild(b); });
  $('#messaggio').hidden = false;
}
function nascondiMessaggio() { $('#messaggio').hidden = true; }

function vai(n, nuovoModo = modo) { location.href = `/v/${SLUG}/${n}?modo=${nuovoModo}`; }

// ---------- modalità 3D (senza camera) ----------
async function avvia3d() {
  const cont = $('#ar'); cont.innerHTML = '';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  cont.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  camera.up.set(0, 0, 1); camera.position.set(0, -1.0, 1.2);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.autoRotate = true; orbit.autoRotateSpeed = 0.6;
  aggiungiLuci(scene);
  const p = stato.pagina;
  scene.add(pianoPagina(p.immagine ? `/uploads/${p.immagine}` : null, p.larghezza_px, p.altezza_px));
  const gruppo = new THREE.Group(); scene.add(gruppo);
  try { const rif = await costruisciRiferimento(stato.stampato.impostazioni, 'editor'); if (rif) gruppo.add(rif); } catch (e) { console.warn(e); }
  const { aggiorna } = await costruisciScena(p.scena, gruppo);
  const ridim = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', ridim); ridim();
  const clock = new THREE.Clock(); let t = 0;
  const frame = () => { const dt = Math.min(clock.getDelta(), 0.1); t += dt; aggiorna(dt, t); orbit.update(); renderer.render(scene, camera); };
  renderer.setAnimationLoop(frame);
  stato.attivo = { tipo: '3d', renderer, scene, camera, frame };
  $('#ic-stato').innerHTML = ic('cubo3d');
  $('#btn-modo').innerHTML = `${ic('camera')} AR`;
}

// ---------- modalità AR (MindAR) ----------
async function avviaAr() {
  const p = stato.pagina;
  if (!p.target) return fallback('Questa pagina non ha ancora un target di tracciamento.', 'Aprila nell’editor e premi “Compila target”.');
  if (!navigator.mediaDevices?.getUserMedia) return fallback('Camera non disponibile', isSecureContext ? 'Il browser non espone la fotocamera.' : 'La fotocamera richiede HTTPS (o localhost).');
  const { MindARThree } = await import('/vendor/mind-ar/mindar-image-three.prod.js');
  const cont = $('#ar'); cont.innerHTML = '';
  const mindar = new MindARThree({
    container: cont, imageTargetSrc: `/uploads/${p.target}`, uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0005, filterBeta: 0.01, warmupTolerance: 3, missTolerance: 8,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const anchor = mindar.addAnchor(0);
  aggiungiLuci(anchor.group);
  try { const rif = await costruisciRiferimento(stato.stampato.impostazioni, 'viewer'); if (rif) anchor.group.add(rif); } catch (e) { console.warn(e); }
  const { aggiorna } = await costruisciScena(p.scena, anchor.group);
  anchor.onTargetFound = () => { $('#hint').hidden = true; };
  anchor.onTargetLost = () => { $('#hint').hidden = false; };
  $('#hint').hidden = false;
  try {
    await mindar.start();
  } catch (e) {
    console.warn('MindAR non avviato', e);
    return fallback('Fotocamera non accessibile', 'Consenti l’accesso alla fotocamera oppure apri la scena in 3D.');
  }
  const clock = new THREE.Clock(); let t = 0;
  const frame = () => { const dt = Math.min(clock.getDelta(), 0.1); t += dt; aggiorna(dt, t); renderer.render(scene, camera); };
  renderer.setAnimationLoop(frame);
  stato.attivo = { tipo: 'ar', mindar, renderer, scene, camera, frame };
  $('#ic-stato').innerHTML = ic('camera');
  $('#btn-modo').innerHTML = `${ic('cubo3d')} 3D`;
}

function fallback(titolo, testo) {
  mostraMessaggio(titolo, testo, [['Apri in 3D', () => { nascondiMessaggio(); modo = '3d'; avvia3d(); }, true], ['Riprova', () => location.reload()]]);
}

async function avvia() {
  if (!SLUG) return mostraMessaggio('Indirizzo non valido', 'Scansiona di nuovo il QR.');
  const r = await fetch(`/api/viewer/${SLUG}`);
  if (r.status === 403) return mostraMessaggio('Non ancora pubblicato', 'Il creatore non ha ancora attivato questo stampato. Riprova più tardi.');
  if (!r.ok) return mostraMessaggio('Stampato non trovato', 'Il QR non corrisponde a nessuna pubblicazione.');
  stato.stampato = await r.json();
  stato.pagina = stato.stampato.pagine.find((p) => p.ordine === N) || stato.stampato.pagine[0];
  if (!stato.pagina) return mostraMessaggio('Nessuna pagina', 'Questo stampato non ha ancora pagine.');
  $('#titolo').textContent = stato.stampato.titolo + (stato.stampato.anteprima ? ' (anteprima, non pubblicato)' : '');
  $('#pagina').textContent = `· ${stato.pagina.ordine}/${stato.stampato.pagine.length} ${stato.pagina.titolo}`;
  document.title = `${stato.pagina.titolo} — ${stato.stampato.titolo}`;
  $('#btn-prec').innerHTML = ic('indietro'); $('#btn-succ').innerHTML = ic('avanti');
  $('#btn-prec').disabled = stato.pagina.ordine <= 1; $('#btn-succ').disabled = stato.pagina.ordine >= stato.stampato.pagine.length;
  $('#btn-prec').onclick = () => vai(stato.pagina.ordine - 1);
  $('#btn-succ').onclick = () => vai(stato.pagina.ordine + 1);
  $('#btn-modo').onclick = () => vai(stato.pagina.ordine, stato.attivo?.tipo === 'ar' ? '3d' : 'ar');
  if (modo === '3d') await avvia3d(); else await avviaAr();
}
window.__rp = { stato, step: (n = 1) => { for (let i = 0; i < n; i++) stato.attivo?.frame(); } };
avvia().catch((e) => { console.error(e); mostraMessaggio('Errore', e.message); });
