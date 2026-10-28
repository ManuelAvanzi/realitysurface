// Passo 3 — Contenuti: editor 3D della scena di una pagina (three.js + gizmo), elementi, asset.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast } from '../js/comune.js';
import { TIPI_ELEMENTO, elementoDefault, costruisciElemento, applicaTrasformazione, aggiungiLuci, pianoPagina, nuovoId } from '../js/scena.js';

const ICONA_TIPO = { glb: 'cubo', sfera: 'sfera', testo: 'testo', immagine: 'immagine' };

export function initScena3d(ctx) {
  const stato = { pagina: null, selezionato: null, sporco: false, oggetti: new Map(), modo: 'translate', vistaAlto: false, avviato: false };

  // ---------- three.js ----------
  const vp = $('#viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  vp.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d12');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -1.5, 1.7);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, 0); orbit.enableDamping = true; orbit.dampingFactor = 0.12;
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSize(0.8);
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
  gizmo.addEventListener('objectChange', () => {
    const obj = gizmo.object; if (!obj) return;
    const el = obj.userData.elemento;
    el.pos = obj.position.toArray().map((v) => +v.toFixed(4));
    el.rot = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((r) => +THREE.MathUtils.radToDeg(r).toFixed(1));
    el.scala = obj.scale.toArray().map((v) => +v.toFixed(4));
    segnaSporco(); aggiornaCampiTrasformazione();
  });
  const griglia = new THREE.GridHelper(4, 40, '#2a2f3a', '#1b1f28');
  griglia.rotation.x = Math.PI / 2; griglia.position.z = -0.002;
  scene.add(griglia);
  aggiungiLuci(scene);
  const radice = new THREE.Group(); radice.name = 'elementi'; scene.add(radice);
  let pagina3d = null;

  function ridimensiona() {
    const w = vp.clientWidth, h = vp.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(ridimensiona).observe(vp);

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const obj of stato.oggetti.values()) {
      const a = obj.userData.elemento.anim || {};
      const cont = obj.getObjectByName('contenuto');
      if (a.rotazione && cont) cont.rotation[a.rotazione.asse || 'z'] += (Number(a.rotazione.giri) || 0) * Math.PI * 2 / 60 * dt;
      if (cont?.userData.mixer) cont.userData.mixer.update(dt);
    }
    orbit.update();
    renderer.render(scene, camera);
  }

  // Selezione con click (non durante il drag dell'orbit)
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
  let giu = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { giu = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 4 || gizmo.dragging) return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(radice.children, true);
    let trovato = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.elemento) o = o.parent;
      if (o) { trovato = o.userData.elemento.id; break; }
    }
    seleziona(trovato);
  });

  // ---------- pagine ----------
  async function apriPagina(p) {
    if (stato.sporco && p?.id !== stato.pagina?.id && !confirm('Modifiche non salvate: cambiare pagina?')) return;
    stato.pagina = p; stato.sporco = false; aggiornaBottoneSalva(); seleziona(null);
    radice.clear(); stato.oggetti.clear();
    if (pagina3d) { scene.remove(pagina3d); pagina3d = null; }
    renderPagine(); renderElementi();
    if (!p) return;
    pagina3d = pianoPagina(p.immagine ? `/uploads/${p.immagine}` : null, p.larghezza_px, p.altezza_px);
    scene.add(pagina3d);
    const u = new URL(location); u.searchParams.set('p', p.id); history.replaceState(null, '', u);
    for (const el of p.scena.elementi) await aggiungiOggetto(el);
    renderElementi();
  }

  async function aggiungiOggetto(el) {
    const obj = await costruisciElemento(el);
    radice.add(obj); stato.oggetti.set(el.id, obj);
    return obj;
  }

  function renderPagine() {
    const box = $('#pagine');
    const pagine = ctx.stampato.pagine;
    box.innerHTML = pagine.length ? pagine.map((p) => `
      <div class="pagina ${stato.pagina?.id === p.id ? 'attiva' : ''}" data-id="${p.id}">
        <div class="thumb" ${p.immagine ? `style="background-image:url('/uploads/${esc(p.immagine)}')"` : ''}></div>
        <div class="info"><b>${p.ordine}. ${esc(p.titolo)}</b><small>${p.scena.elementi.length ? `${p.scena.elementi.length} elementi` : 'vuota'}${p.target && p.target_hash === p.immagine ? '' : ' · senza target'}</small></div>
      </div>`).join('') : `<div class="vuoto">Nessuna pagina: caricale nel passo 1.</div>`;
    $$('.pagina', box).forEach((d) => d.addEventListener('click', () => apriPagina(pagine.find((p) => p.id === Number(d.dataset.id)))));
  }

  // ---------- elementi ----------
  $('#aggiungi').innerHTML = Object.entries(TIPI_ELEMENTO).map(([k, v]) => `<button data-tipo="${k}">${ic(ICONA_TIPO[k])} ${v}</button>`).join('');
  $('#aggiungi').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tipo]'); if (!b || !stato.pagina) return;
    const el = elementoDefault(b.dataset.tipo);
    stato.pagina.scena.elementi.push(el);
    await aggiungiOggetto(el);
    segnaSporco(); renderElementi(); seleziona(el.id);
    if ((el.tipo === 'glb' || el.tipo === 'immagine') && !el.src) toast('Scegli un file dalla libreria asset (“Usa”)');
  });

  function renderElementi() {
    const box = $('#elementi');
    const els = stato.pagina?.scena.elementi || [];
    box.innerHTML = els.length ? els.map((el) => `
      <div class="elemento ${stato.selezionato === el.id ? 'attivo' : ''}" data-id="${el.id}">${ic(ICONA_TIPO[el.tipo] || 'cubo')}<span>${esc(el.nome)}</span>
        <button class="icona" data-dup="${el.id}" title="Duplica">${ic('copia')}</button>
        <button class="icona pericolo" data-del="${el.id}" title="Elimina">${ic('cestino')}</button></div>`).join('')
      : `<div class="vuoto">${stato.pagina ? 'Nessun elemento: aggiungine uno qui sopra.' : 'Seleziona una pagina a sinistra.'}</div>`;
    $$('.elemento', box).forEach((d) => d.addEventListener('click', (e) => { if (!e.target.closest('button')) seleziona(d.dataset.id); }));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => eliminaElemento(b.dataset.del)));
    $$('[data-dup]', box).forEach((b) => b.addEventListener('click', () => duplicaElemento(b.dataset.dup)));
  }

  function seleziona(id) {
    stato.selezionato = id;
    const obj = id ? stato.oggetti.get(id) : null;
    if (obj) gizmo.attach(obj); else gizmo.detach();
    renderElementi(); renderProprieta();
  }

  function eliminaElemento(id) {
    const obj = stato.oggetti.get(id);
    if (obj) { if (gizmo.object === obj) gizmo.detach(); radice.remove(obj); stato.oggetti.delete(id); }
    stato.pagina.scena.elementi = stato.pagina.scena.elementi.filter((e) => e.id !== id);
    if (stato.selezionato === id) stato.selezionato = null;
    segnaSporco(); renderElementi(); renderProprieta();
  }
  async function duplicaElemento(id) {
    const src = stato.pagina.scena.elementi.find((e) => e.id === id); if (!src) return;
    const el = JSON.parse(JSON.stringify(src)); el.id = nuovoId(); el.nome = `${src.nome} copia`;
    el.pos = [el.pos[0] + 0.08, el.pos[1], el.pos[2]];
    stato.pagina.scena.elementi.push(el);
    await aggiungiOggetto(el); segnaSporco(); renderElementi(); seleziona(el.id);
  }

  /** Ricostruisce il contenuto di un elemento (quando cambiano proprietà non di trasformazione). */
  async function ricostruisci(el) {
    const vecchio = stato.oggetti.get(el.id);
    const nuovo = await costruisciElemento(el);
    if (vecchio) { radice.remove(vecchio); if (gizmo.object === vecchio) gizmo.detach(); }
    radice.add(nuovo); stato.oggetti.set(el.id, nuovo);
    if (stato.selezionato === el.id) gizmo.attach(nuovo);
  }

  const campoNum = (lab, chiave, idx, step = 0.01) =>
    `<div><label>${lab}</label><input type="number" step="${step}" data-k="${chiave}" data-i="${idx}"></div>`;

  function renderProprieta() {
    const box = $('#proprieta');
    const el = stato.pagina?.scena.elementi.find((e) => e.id === stato.selezionato);
    if (!el) { box.className = 'vuoto'; box.textContent = 'Seleziona un elemento'; return; }
    box.className = '';
    let specifiche = '';
    if (el.tipo === 'testo') specifiche = `
      <label>Testo</label><textarea rows="2" data-p="testo">${esc(el.testo)}</textarea>
      <div class="riga"><div><label>Colore</label><input type="color" data-p="colore" value="${esc((el.colore || '#ffffff').slice(0, 7))}"></div>
      <div><label>Sfondo</label><input data-p="sfondo" value="${esc(el.sfondo || '')}" placeholder="#1b1f2acc o none"></div>
      <div><label>Altezza riga</label><input type="number" step="0.01" data-p="altezza" value="${el.altezza}"></div></div>`;
    if (el.tipo === 'sfera') specifiche = `
      <div class="riga"><div><label>Raggio</label><input type="number" step="0.01" data-p="raggio" value="${el.raggio}"></div>
      <div><label>Colore (senza texture)</label><input type="color" data-p="colore" value="${esc(el.colore || '#c9622b')}"></div></div>
      <label>Texture (immagine equirettangolare)</label><input data-p="src" value="${esc(el.src || '')}" placeholder="scegli dalla libreria → Usa">`;
    if (el.tipo === 'immagine') specifiche = `
      <label>Larghezza</label><input type="number" step="0.01" data-p="larghezza" value="${el.larghezza}">
      <label>File</label><input data-p="src" value="${esc(el.src || '')}" placeholder="scegli dalla libreria → Usa">`;
    if (el.tipo === 'glb') specifiche = `
      <label>File GLB</label><input data-p="src" value="${esc(el.src || '')}" placeholder="scegli dalla libreria → Usa">
      <label><input type="checkbox" data-p="normalizza" ${el.normalizza !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Normalizza a 1 unità e metti in piedi</label>`;
    const a = el.anim || {};
    box.innerHTML = `
      <label>Nome</label><input data-p="nome" value="${esc(el.nome)}">
      ${specifiche}
      <label>Posizione (unità pagina: larghezza = 1)</label>
      <div class="prop">${campoNum('x', 'pos', 0)}${campoNum('y', 'pos', 1)}${campoNum('z (altezza)', 'pos', 2)}</div>
      <label>Rotazione (gradi)</label>
      <div class="prop">${campoNum('x', 'rot', 0, 1)}${campoNum('y', 'rot', 1, 1)}${campoNum('z', 'rot', 2, 1)}</div>
      <label>Scala</label>
      <div class="prop">${campoNum('x', 'scala', 0)}${campoNum('y', 'scala', 1)}${campoNum('z', 'scala', 2)}</div>
      <details open><summary>Animazione</summary>
        <div class="riga"><div><label>Rotazione: asse</label><select data-a="rotazione.asse"><option value="">nessuna</option><option value="z">z (in piano)</option><option value="y">y</option><option value="x">x</option></select></div>
        <div><label>giri/min</label><input type="number" step="0.1" data-a="rotazione.giri" value="${a.rotazione?.giri ?? 2}"></div></div>
        <div class="riga"><div><label>Fluttua: ampiezza</label><input type="number" step="0.005" data-a="fluttua.ampiezza" value="${a.fluttua?.ampiezza ?? ''}" placeholder="vuoto = no"></div>
        <div><label>periodo (s)</label><input type="number" step="0.5" data-a="fluttua.periodo" value="${a.fluttua?.periodo ?? 3}"></div></div>
        <div class="riga"><div><label>Orbita: raggio</label><input type="number" step="0.01" data-a="orbita.raggio" value="${a.orbita?.raggio ?? ''}" placeholder="vuoto = no"></div>
        <div><label>periodo (s)</label><input type="number" step="0.5" data-a="orbita.periodo" value="${a.orbita?.periodo ?? 8}"></div></div>
      </details>`;
    $('[data-a="rotazione.asse"]', box).value = a.rotazione?.asse || '';
    aggiornaCampiTrasformazione();
    $$('[data-k]', box).forEach((inp) => inp.addEventListener('input', () => {
      el[inp.dataset.k][Number(inp.dataset.i)] = Number(inp.value) || 0;
      const obj = stato.oggetti.get(el.id); if (obj) applicaTrasformazione(obj, el);
      segnaSporco();
    }));
    $$('[data-p]', box).forEach((inp) => inp.addEventListener('change', async () => {
      const k = inp.dataset.p;
      el[k] = inp.type === 'checkbox' ? inp.checked : (inp.type === 'number' ? Number(inp.value) : inp.value);
      if (k === 'nome') { stato.oggetti.get(el.id).name = el.nome; renderElementi(); }
      else await ricostruisci(el);
      segnaSporco();
    }));
    $$('[data-a]', box).forEach((inp) => inp.addEventListener('change', () => {
      const [gruppo, chiave] = inp.dataset.a.split('.');
      el.anim = el.anim || {};
      const v = inp.value === '' ? null : (inp.type === 'number' ? Number(inp.value) : inp.value);
      el.anim[gruppo] = el.anim[gruppo] || {};
      if (v === null && (chiave === 'asse' || chiave === 'ampiezza' || chiave === 'raggio')) delete el.anim[gruppo];
      else el.anim[gruppo][chiave] = v;
      if (gruppo === 'rotazione' && el.anim.rotazione && !el.anim.rotazione.asse) delete el.anim.rotazione;
      if (gruppo === 'fluttua' && el.anim.fluttua && !el.anim.fluttua.ampiezza) delete el.anim.fluttua;
      if (gruppo === 'orbita' && el.anim.orbita && !el.anim.orbita.raggio) delete el.anim.orbita;
      if (!el.anim[gruppo]) { const obj = stato.oggetti.get(el.id); if (obj) applicaTrasformazione(obj, el); }
      segnaSporco();
    }));
  }
  function aggiornaCampiTrasformazione() {
    const el = stato.pagina?.scena.elementi.find((e) => e.id === stato.selezionato); if (!el) return;
    $$('#proprieta [data-k]').forEach((inp) => { if (document.activeElement !== inp) inp.value = el[inp.dataset.k][Number(inp.dataset.i)]; });
  }

  // ---------- asset ----------
  $('#lbl-asset').insertAdjacentHTML('afterbegin', `${ic('upload')} Carica GLB o immagine`);
  $('#file-asset').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const a = await api(`/api/stampati/${ctx.id}/asset`, { method: 'POST', body: fd });
      ctx.stampato.asset.push(a); renderAsset(); toast(`Caricato ${a.nome}`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  });
  function renderAsset() {
    const box = $('#asset');
    const lista = ctx.stampato.asset;
    box.innerHTML = lista.length ? lista.map((a) => `
      <div class="asset">${ic(a.tipo === 'glb' ? 'cubo' : a.tipo === 'immagine' ? 'immagine' : 'play')}<span title="${esc(a.nome)}">${esc(a.nome)}</span>
        <small class="muto">${(a.dimensione / 1024).toFixed(0)} KB</small>
        <button data-usa="${a.id}" title="Assegna all’elemento selezionato (o creane uno nuovo)">Usa</button>
        <button class="icona pericolo" data-del="${a.id}" title="Elimina">${ic('cestino')}</button></div>`).join('')
      : `<div class="vuoto">Nessun asset: carica un GLB o un’immagine.</div>`;
    $$('[data-usa]', box).forEach((b) => b.addEventListener('click', async () => {
      const a = lista.find((x) => x.id === Number(b.dataset.usa));
      if (!stato.pagina) return toast('Seleziona una pagina', 'err');
      let el = stato.pagina.scena.elementi.find((e) => e.id === stato.selezionato);
      const compat = (el) => (a.tipo === 'glb' && el.tipo === 'glb') || (a.tipo === 'immagine' && (el.tipo === 'immagine' || el.tipo === 'sfera'));
      if (!el || !compat(el)) {
        if (a.tipo !== 'glb' && a.tipo !== 'immagine') return toast('Audio e video arrivano nella v0.3', 'err');
        el = elementoDefault(a.tipo === 'glb' ? 'glb' : 'immagine');
        el.nome = a.nome.replace(/\.[^.]+$/, '');
        stato.pagina.scena.elementi.push(el); await aggiungiOggetto(el); renderElementi();
      }
      el.src = a.percorso; await ricostruisci(el); segnaSporco(); seleziona(el.id);
    }));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Eliminare l’asset? Gli elementi che lo usano resteranno vuoti.')) return;
      await api(`/api/asset/${b.dataset.del}`, { method: 'DELETE' });
      ctx.stampato.asset = lista.filter((x) => x.id !== Number(b.dataset.del)); renderAsset();
    }));
  }

  // ---------- salvataggio ----------
  function aggiornaBottoneSalva() { $('#btn-salva').innerHTML = `${ic('salva')} Salva${stato.sporco ? ' •' : ''}`; }
  function segnaSporco() { stato.sporco = true; aggiornaBottoneSalva(); }
  async function salva() {
    if (!stato.pagina) return;
    try {
      const p = await api(`/api/pagine/${stato.pagina.id}`, { method: 'PUT', body: JSON.stringify({ titolo: stato.pagina.titolo, scena: stato.pagina.scena }) });
      Object.assign(stato.pagina, p);
      stato.sporco = false; aggiornaBottoneSalva();
      toast('Scena salvata', 'ok'); renderPagine(); ctx.aggiornaStepper();
    } catch (e) { toast(e.message, 'err'); }
  }
  $('#btn-salva').addEventListener('click', salva);
  $('#avanti-pubblica').innerHTML = `Avanti: pubblica e QR ${ic('avanti')}`;
  $('#avanti-pubblica').addEventListener('click', async () => { if (stato.sporco) await salva(); ctx.vai('pubblica'); });

  // ---------- strumenti e tastiera ----------
  $('#btn-vista').innerHTML = ic('camera');
  $$('.strumenti [data-modo]').forEach((b) => {
    b.innerHTML = ic({ translate: 'sposta', rotate: 'ruota', scale: 'scala' }[b.dataset.modo]);
    b.addEventListener('click', () => impostaModo(b.dataset.modo));
  });
  function impostaModo(m) {
    stato.modo = m; gizmo.setMode(m);
    $$('.strumenti [data-modo]').forEach((b) => b.classList.toggle('attivo', b.dataset.modo === m));
  }
  $('#btn-vista').addEventListener('click', () => {
    stato.vistaAlto = !stato.vistaAlto;
    if (stato.vistaAlto) camera.position.set(0, -0.001, 2.4); else camera.position.set(0, -1.5, 1.7);
    orbit.target.set(0, 0, 0);
  });
  window.addEventListener('keydown', (e) => {
    if (ctx.passo !== 'contenuti' || e.target.matches('input, textarea, select')) return;
    if (e.key === 'w' || e.key === 'W') impostaModo('translate');
    if (e.key === 'e' || e.key === 'E') impostaModo('rotate');
    if (e.key === 'r' || e.key === 'R') impostaModo('scale');
    if (e.key === 'Escape') seleziona(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && stato.selezionato) eliminaElemento(stato.selezionato);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && stato.selezionato) { e.preventDefault(); duplicaElemento(stato.selezionato); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salva(); }
  });

  return {
    async mostra(extra = {}) {
      if (!stato.avviato) { stato.avviato = true; renderer.setAnimationLoop(frame); }
      ridimensiona(); renderAsset();
      const pagine = ctx.stampato.pagine;
      const p = pagine.find((x) => x.id === Number(extra.p)) || pagine.find((x) => x.id === stato.pagina?.id) || pagine[0] || null;
      // Riallinea con i dati freschi (titoli/ordine possono essere cambiati negli altri passi).
      if (p && stato.pagina?.id === p.id && !stato.sporco) stato.pagina = p;
      if (!stato.pagina || stato.pagina.id !== p?.id) await apriPagina(p); else renderPagine();
    },
    sporco: () => stato.sporco,
    scartaModifiche: () => { stato.sporco = false; aggiornaBottoneSalva(); },
    step: (n = 1) => { for (let i = 0; i < n; i++) frame(); },
    stato, scene, camera,
  };
}
