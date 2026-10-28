// Passo 3 — Contenuti: editor 3D della scena di una pagina (three.js + gizmo), elementi, asset, plastico.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ic } from '../js/icone.js';
import { $, $$, api, esc, toast } from '../js/comune.js';
import { TIPI_ELEMENTO, elementoDefault, costruisciElemento, applicaTrasformazione, aggiungiLuci, pianoPagina, nuovoId, costruisciRiferimento, animaElemento } from '../js/scena.js';

const ICONA_TIPO = { glb: 'cubo', sfera: 'sfera', testo: 'testo', immagine: 'immagine', personaggio: 'persona', blocco: 'blocco' };

export function initScena3d(ctx) {
  const stato = { pagina: null, selezionato: null, sporco: false, oggetti: new Map(), modo: 'translate', vistaAlto: false, avviato: false,
    puntoAttivo: null, anteprimaAnim: false, t: 0 };

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
    if (stato.puntoAttivo != null && el.anim?.percorso?.punti?.[stato.puntoAttivo]) {
      el.anim.percorso.punti[stato.puntoAttivo] = obj.position.toArray().map((v) => +v.toFixed(4));
      aggiornaLineaPercorso(el); segnaSporco(); aggiornaCampiTrasformazione();
      return;
    }
    el.pos = obj.position.toArray().map((v) => +v.toFixed(4));
    el.rot = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((r) => +THREE.MathUtils.radToDeg(r).toFixed(1));
    el.scala = obj.scale.toArray().map((v) => +v.toFixed(4));
    aggiornaLineaPercorso(el);
    segnaSporco(); aggiornaCampiTrasformazione();
  });
  const griglia = new THREE.GridHelper(4, 40, '#2a2f3a', '#1b1f28');
  griglia.rotation.x = Math.PI / 2; griglia.position.z = -0.002;
  scene.add(griglia);
  aggiungiLuci(scene);
  const radice = new THREE.Group(); radice.name = 'elementi'; scene.add(radice);
  const linee = new THREE.Group(); linee.name = 'percorsi'; scene.add(linee);
  let pagina3d = null, riferimento3d = null;

  function ridimensiona() {
    const w = vp.clientWidth, h = vp.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(ridimensiona).observe(vp);

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1); stato.t += dt;
    for (const obj of stato.oggetti.values()) {
      const el = obj.userData.elemento;
      if (stato.anteprimaAnim && stato.selezionato !== el.id) { animaElemento(obj, dt, stato.t); continue; }
      const a = el.anim || {};
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

  // ---------- percorsi (linee) ----------
  function aggiornaLineaPercorso(el) {
    const vecchia = linee.getObjectByName(`linea-${el.id}`); if (vecchia) { linee.remove(vecchia); vecchia.geometry.dispose(); }
    const p = el.anim?.percorso; if (!p?.punti?.length) return;
    const pts = [el.pos, ...p.punti]; if (p.loop !== false) pts.push(el.pos);
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(...q.map(Number)).add(new THREE.Vector3(0, 0, 0.003))));
    const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#ff8a4c', dashSize: 0.02, gapSize: 0.012 }));
    l.computeLineDistances(); l.name = `linea-${el.id}`; linee.add(l);
  }
  function aggiornaTutteLeLinee() { linee.clear(); (stato.pagina?.scena.elementi || []).forEach(aggiornaLineaPercorso); }

  // ---------- plastico: modello di riferimento ----------
  const isPlastico = () => ctx.stampato.tipo === 'plastico' || ctx.stampato.templateInfo?.plastico;
  async function aggiornaRiferimento() {
    if (riferimento3d) { scene.remove(riferimento3d); riferimento3d = null; }
    if (!isPlastico()) return;
    try { riferimento3d = await costruisciRiferimento(ctx.stampato.impostazioni, 'editor'); if (riferimento3d) scene.add(riferimento3d); }
    catch (e) { console.warn(e); toast('Modello di riferimento non caricato', 'err'); }
  }
  function renderPlastico() {
    const box = $('#plastico');
    if (!isPlastico()) { box.hidden = true; return; }
    box.hidden = false;
    const imp = ctx.stampato.impostazioni || {};
    const glb = ctx.stampato.asset.filter((a) => a.tipo === 'glb');
    box.innerHTML = `<h3>Plastico</h3>
      <div class="muto piccolo">Il modello fisico come riferimento: in trasparenza qui, invisibile ma occludente nel viewer.</div>
      <label>Modello di riferimento (GLB)</label>
      <select id="pl-rif"><option value="">nessuno</option>${glb.map((a) => `<option value="${esc(a.percorso)}" ${imp.riferimento === a.percorso ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select>
      <div class="riga"><div><label>Ingombro (unità)</label><input type="number" step="0.01" id="pl-larg" value="${imp.larghezza ?? 0.6}"></div>
      <div><label>Rotazione z</label><input type="number" step="1" id="pl-rot" value="${imp.rotazione ?? 0}"></div></div>
      <div class="riga"><div><label>Offset x</label><input type="number" step="0.01" id="pl-ox" value="${imp.offsetX ?? 0}"></div>
      <div><label>Offset y</label><input type="number" step="0.01" id="pl-oy" value="${imp.offsetY ?? 0}"></div></div>
      <button id="pl-salva" class="primario" style="justify-content:center;width:100%">${ic('salva')} Salva impostazioni plastico</button>`;
    $('#pl-salva').addEventListener('click', async () => {
      const b = { riferimento: $('#pl-rif').value, larghezza: Number($('#pl-larg').value) || 0.6, rotazione: Number($('#pl-rot').value) || 0,
        offsetX: Number($('#pl-ox').value) || 0, offsetY: Number($('#pl-oy').value) || 0 };
      const s = await api(`/api/stampati/${ctx.id}/impostazioni`, { method: 'PUT', body: JSON.stringify(b) });
      ctx.stampato.impostazioni = s.impostazioni; toast('Impostazioni del plastico salvate', 'ok'); aggiornaRiferimento();
    });
  }

  // ---------- pagine ----------
  async function apriPagina(p) {
    if (stato.sporco && p?.id !== stato.pagina?.id && !confirm('Modifiche non salvate: cambiare pagina?')) return;
    stato.pagina = p; stato.sporco = false; aggiornaBottoneSalva(); seleziona(null);
    radice.clear(); stato.oggetti.clear(); linee.clear();
    if (pagina3d) { scene.remove(pagina3d); pagina3d = null; }
    renderPagine(); renderElementi();
    if (!p) return;
    pagina3d = pianoPagina(p.immagine ? `/uploads/${p.immagine}` : null, p.larghezza_px || ctx.stampato.larghezza_mm, p.altezza_px || ctx.stampato.altezza_mm);
    scene.add(pagina3d);
    const u = new URL(location); u.searchParams.set('p', p.id); history.replaceState(null, '', u);
    for (const el of p.scena.elementi) await aggiungiOggetto(el);
    renderElementi(); aggiornaTutteLeLinee();
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
        <div class="info"><b>${p.ordine}. ${esc(p.titolo)}</b><small>${p.scena.elementi.length ? `${p.scena.elementi.length} elementi` : 'vuota'}${!p.immagine ? ' · senza immagine' : (p.target && p.target_hash === p.immagine ? '' : ' · senza target')}</small></div>
      </div>`).join('') : `<div class="vuoto">Nessuna pagina: caricale nel passo 1.</div>`;
    $$('.pagina', box).forEach((d) => d.addEventListener('click', () => apriPagina(pagine.find((p) => p.id === Number(d.dataset.id)))));
  }

  // ---------- elementi ----------
  $('#aggiungi').innerHTML = Object.entries(TIPI_ELEMENTO).map(([k, v]) => `<button data-tipo="${k}">${ic(ICONA_TIPO[k])} ${v}</button>`).join('');
  $('#aggiungi').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tipo]'); if (!b || !stato.pagina) return;
    const el = elementoDefault(b.dataset.tipo, Number(ctx.stampato.impostazioni?.scalaContenuti) || 1);
    stato.pagina.scena.elementi.push(el);
    await aggiungiOggetto(el);
    segnaSporco(); renderElementi(); seleziona(el.id); aggiornaLineaPercorso(el);
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
    if (stato.selezionato && stato.selezionato !== id) {
      const prev = stato.oggetti.get(stato.selezionato); const elp = prev?.userData.elemento;
      if (prev && elp) applicaTrasformazione(prev, elp);
    }
    stato.selezionato = id; stato.puntoAttivo = null;
    const obj = id ? stato.oggetti.get(id) : null;
    if (obj) { applicaTrasformazione(obj, obj.userData.elemento); gizmo.attach(obj); } else gizmo.detach();
    renderElementi(); renderProprieta();
  }

  function eliminaElemento(id) {
    const obj = stato.oggetti.get(id);
    if (obj) { if (gizmo.object === obj) gizmo.detach(); radice.remove(obj); stato.oggetti.delete(id); }
    const el = stato.pagina.scena.elementi.find((e) => e.id === id);
    stato.pagina.scena.elementi = stato.pagina.scena.elementi.filter((e) => e.id !== id);
    if (el) { const l = linee.getObjectByName(`linea-${el.id}`); if (l) linee.remove(l); }
    if (stato.selezionato === id) stato.selezionato = null;
    segnaSporco(); renderElementi(); renderProprieta();
  }
  async function duplicaElemento(id) {
    const src = stato.pagina.scena.elementi.find((e) => e.id === id); if (!src) return;
    const el = JSON.parse(JSON.stringify(src)); el.id = nuovoId(); el.nome = `${src.nome} copia`;
    el.pos = [el.pos[0] + 0.08, el.pos[1], el.pos[2]];
    stato.pagina.scena.elementi.push(el);
    await aggiungiOggetto(el); segnaSporco(); renderElementi(); seleziona(el.id); aggiornaLineaPercorso(el);
  }

  /** Ricostruisce il contenuto di un elemento (quando cambiano proprietà non di trasformazione). */
  async function ricostruisci(el) {
    const vecchio = stato.oggetti.get(el.id);
    const nuovo = await costruisciElemento(el);
    if (vecchio) { radice.remove(vecchio); if (gizmo.object === vecchio) gizmo.detach(); }
    radice.add(nuovo); stato.oggetti.set(el.id, nuovo);
    if (stato.selezionato === el.id) { gizmo.attach(nuovo); renderProprieta(); }
  }

  const campoNum = (lab, chiave, idx, step = 0.01) =>
    `<div><label>${lab}</label><input type="number" step="${step}" data-k="${chiave}" data-i="${idx}"></div>`;

  function renderProprieta() {
    const box = $('#proprieta');
    const el = stato.pagina?.scena.elementi.find((e) => e.id === stato.selezionato);
    if (!el) { box.className = 'vuoto'; box.textContent = 'Seleziona un elemento'; return; }
    box.className = '';
    const obj = stato.oggetti.get(el.id);
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
    if (el.tipo === 'personaggio') specifiche = `
      <div class="riga"><div><label>Vestito</label><input type="color" data-p="colore" value="${esc(el.colore || '#3b82f6')}"></div>
      <div><label>Pelle</label><input type="color" data-p="pelle" value="${esc(el.pelle || '#f1c27d')}"></div>
      <div><label>Altezza</label><input type="number" step="0.01" data-p="altezza" value="${el.altezza}"></div></div>`;
    if (el.tipo === 'blocco') specifiche = `
      <label>Colore</label><input type="color" data-p="colore" value="${esc(el.colore || '#9ca3af')}">
      <label>Dimensioni (larghezza, profondità, altezza)</label>
      <div class="prop">${campoNum('x', 'dim', 0)}${campoNum('y', 'dim', 1)}${campoNum('z', 'dim', 2)}</div>`;
    if (el.tipo === 'immagine') specifiche = `
      <label>Larghezza</label><input type="number" step="0.01" data-p="larghezza" value="${el.larghezza}">
      <label>File</label><input data-p="src" value="${esc(el.src || '')}" placeholder="scegli dalla libreria → Usa">`;
    if (el.tipo === 'glb') {
      const clips = obj?.getObjectByName('contenuto')?.userData.clips || [];
      specifiche = `
      <label>File GLB</label><input data-p="src" value="${esc(el.src || '')}" placeholder="scegli dalla libreria → Usa">
      ${clips.length ? `<label>Animazione del modello</label><select data-p="clip"><option value="">tutte</option>${clips.map((c) => `<option value="${esc(c.name)}" ${el.clip === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
      <label><input type="checkbox" data-p="normalizza" ${el.normalizza !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Normalizza a 1 unità e metti in piedi</label>`;
    }
    const a = el.anim || {};
    const pc = a.percorso;
    box.innerHTML = `
      <label>Nome</label><input data-p="nome" value="${esc(el.nome)}">
      ${specifiche}
      <label>Posizione (unità pagina: larghezza = 1)${pc ? ' · punto di partenza' : ''}</label>
      <div class="prop">${campoNum('x', 'pos', 0)}${campoNum('y', 'pos', 1)}${campoNum('z (altezza)', 'pos', 2)}</div>
      <label>Rotazione (gradi)</label>
      <div class="prop">${campoNum('x', 'rot', 0, 1)}${campoNum('y', 'rot', 1, 1)}${campoNum('z', 'rot', 2, 1)}</div>
      <label>Scala</label>
      <div class="prop">${campoNum('x', 'scala', 0)}${campoNum('y', 'scala', 1)}${campoNum('z', 'scala', 2)}</div>
      <details open><summary>Percorso (cammina tra i punti)</summary>
        <div id="punti"></div>
        <div class="riga" style="margin-top:6px"><button id="btn-punto">${ic('plus')} Aggiungi punto</button>
        <button id="btn-anteprima-anim" class="${stato.anteprimaAnim ? 'primario' : ''}">${ic('play')} ${stato.anteprimaAnim ? 'Ferma anteprima' : 'Anteprima'}</button></div>
        ${pc ? `<div class="riga"><div><label>Velocità (unità/s)</label><input type="number" step="0.01" data-a="percorso.velocita" value="${pc.velocita ?? 0.06}"></div>
        <div><label>Rotazione extra</label><input type="number" step="15" data-a="percorso.offsetRot" value="${pc.offsetRot ?? 0}"></div></div>
        <label><input type="checkbox" data-a="percorso.loop" ${pc.loop !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Torna al punto di partenza (ciclo)</label>
        <label><input type="checkbox" data-a="percorso.orienta" ${pc.orienta !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Guarda nella direzione del movimento</label>` : ''}
      </details>
      <details><summary>Altre animazioni</summary>
        <div class="riga"><div><label>Rotazione: asse</label><select data-a="rotazione.asse"><option value="">nessuna</option><option value="z">z (in piano)</option><option value="y">y</option><option value="x">x</option></select></div>
        <div><label>giri/min</label><input type="number" step="0.1" data-a="rotazione.giri" value="${a.rotazione?.giri ?? 2}"></div></div>
        <div class="riga"><div><label>Fluttua: ampiezza</label><input type="number" step="0.005" data-a="fluttua.ampiezza" value="${a.fluttua?.ampiezza ?? ''}" placeholder="vuoto = no"></div>
        <div><label>periodo (s)</label><input type="number" step="0.5" data-a="fluttua.periodo" value="${a.fluttua?.periodo ?? 3}"></div></div>
        <div class="riga"><div><label>Orbita: raggio</label><input type="number" step="0.01" data-a="orbita.raggio" value="${a.orbita?.raggio ?? ''}" placeholder="vuoto = no"></div>
        <div><label>periodo (s)</label><input type="number" step="0.5" data-a="orbita.periodo" value="${a.orbita?.periodo ?? 8}"></div></div>
      </details>`;
    $('[data-a="rotazione.asse"]', box).value = a.rotazione?.asse || '';
    renderPunti(el);
    aggiornaCampiTrasformazione();
    $$('[data-k]', box).forEach((inp) => inp.addEventListener('input', async () => {
      el[inp.dataset.k][Number(inp.dataset.i)] = Number(inp.value) || 0;
      if (inp.dataset.k === 'dim') { await ricostruisci(el); segnaSporco(); return; }
      const o = stato.oggetti.get(el.id); if (o && stato.puntoAttivo == null) applicaTrasformazione(o, el);
      aggiornaLineaPercorso(el); segnaSporco();
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
      const v = inp.type === 'checkbox' ? inp.checked : (inp.value === '' ? null : (inp.type === 'number' ? Number(inp.value) : inp.value));
      el.anim[gruppo] = el.anim[gruppo] || {};
      if (v === null && (chiave === 'asse' || chiave === 'ampiezza' || chiave === 'raggio')) delete el.anim[gruppo];
      else el.anim[gruppo][chiave] = v;
      if (gruppo === 'rotazione' && el.anim.rotazione && !el.anim.rotazione.asse) delete el.anim.rotazione;
      if (gruppo === 'fluttua' && el.anim.fluttua && !el.anim.fluttua.ampiezza) delete el.anim.fluttua;
      if (gruppo === 'orbita' && el.anim.orbita && !el.anim.orbita.raggio) delete el.anim.orbita;
      if (!el.anim[gruppo]) { const o = stato.oggetti.get(el.id); if (o) applicaTrasformazione(o, el); }
      aggiornaLineaPercorso(el); segnaSporco();
    }));
    $('#btn-punto', box).addEventListener('click', () => {
      el.anim = el.anim || {};
      if (!el.anim.percorso) el.anim.percorso = { punti: [], velocita: 0.06, loop: true, orienta: true, offsetRot: el.tipo === 'glb' ? 90 : 0 };
      const ultimo = el.anim.percorso.punti.at(-1) || el.pos;
      el.anim.percorso.punti.push([+(Number(ultimo[0]) + 0.15).toFixed(3), Number(ultimo[1]), Number(ultimo[2])]);
      stato.puntoAttivo = el.anim.percorso.punti.length - 1;
      segnaSporco(); renderProprieta(); aggiornaLineaPercorso(el); mostraPuntoAttivo(el);
    });
    $('#btn-anteprima-anim', box).addEventListener('click', () => { stato.anteprimaAnim = !stato.anteprimaAnim; stato.t = 0; if (!stato.anteprimaAnim) ripristinaTutti(); renderProprieta(); });
  }

  function renderPunti(el) {
    const box = $('#punti'); if (!box) return;
    const punti = el.anim?.percorso?.punti || [];
    if (!punti.length) { box.innerHTML = `<div class="muto piccolo">Nessun punto: l'elemento sta fermo. “Aggiungi punto” e poi spostalo col gizmo.</div>`; return; }
    box.innerHTML = punti.map((q, i) => `<div class="punto ${stato.puntoAttivo === i ? 'attivo' : ''}" data-i="${i}">
      <button class="icona" data-sel="${i}" title="Sposta questo punto col gizmo">${ic('sposta')}</button>
      <span>${i + 1}</span><small class="muto">${q.map((v) => Number(v).toFixed(2)).join(', ')}</small>
      <button class="icona pericolo" data-rm="${i}" title="Elimina punto">${ic('cestino')}</button></div>`).join('')
      + `<div class="muto piccolo" style="margin-top:4px">${stato.puntoAttivo != null ? `Il gizmo sposta il punto ${stato.puntoAttivo + 1}.` : 'Il gizmo sposta il punto di partenza.'}</div>`;
    $$('[data-sel]', box).forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.sel);
      stato.puntoAttivo = stato.puntoAttivo === i ? null : i;
      mostraPuntoAttivo(el); renderPunti(el);
    }));
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => {
      el.anim.percorso.punti.splice(Number(b.dataset.rm), 1);
      if (!el.anim.percorso.punti.length) delete el.anim.percorso;
      stato.puntoAttivo = null; mostraPuntoAttivo(el); segnaSporco(); renderProprieta(); aggiornaLineaPercorso(el);
    }));
  }
  /** Porta l'oggetto selezionato sul punto attivo (o alla partenza) così il gizmo lo sposta. */
  function mostraPuntoAttivo(el) {
    const obj = stato.oggetti.get(el.id); if (!obj) return;
    applicaTrasformazione(obj, el);
    const q = stato.puntoAttivo != null ? el.anim?.percorso?.punti?.[stato.puntoAttivo] : null;
    if (q) obj.position.fromArray(q.map(Number));
  }
  function ripristinaTutti() { for (const obj of stato.oggetti.values()) applicaTrasformazione(obj, obj.userData.elemento); const el = stato.pagina?.scena.elementi.find((e) => e.id === stato.selezionato); if (el) mostraPuntoAttivo(el); }
  function aggiornaCampiTrasformazione() {
    const el = stato.pagina?.scena.elementi.find((e) => e.id === stato.selezionato); if (!el) return;
    $$('#proprieta [data-k]').forEach((inp) => { if (document.activeElement !== inp) inp.value = el[inp.dataset.k][Number(inp.dataset.i)]; });
    if (stato.puntoAttivo != null) renderPunti(el);
  }

  // ---------- asset ----------
  $('#lbl-asset').insertAdjacentHTML('afterbegin', `${ic('upload')} Carica GLB o immagine`);
  $('#file-asset').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const a = await api(`/api/stampati/${ctx.id}/asset`, { method: 'POST', body: fd });
      ctx.stampato.asset.push(a); renderAsset(); renderPlastico(); toast(`Caricato ${a.nome}`, 'ok');
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
        el = elementoDefault(a.tipo === 'glb' ? 'glb' : 'immagine', Number(ctx.stampato.impostazioni?.scalaContenuti) || 1);
        el.nome = a.nome.replace(/\.[^.]+$/, '');
        stato.pagina.scena.elementi.push(el); await aggiungiOggetto(el); renderElementi();
      }
      el.src = a.percorso; await ricostruisci(el); segnaSporco(); seleziona(el.id);
    }));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Eliminare l’asset? Gli elementi che lo usano resteranno vuoti.')) return;
      await api(`/api/asset/${b.dataset.del}`, { method: 'DELETE' });
      ctx.stampato.asset = lista.filter((x) => x.id !== Number(b.dataset.del)); renderAsset(); renderPlastico();
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
      ridimensiona(); renderAsset(); renderPlastico(); aggiornaRiferimento();
      const pagine = ctx.stampato.pagine;
      const p = pagine.find((x) => x.id === Number(extra.p)) || pagine.find((x) => x.id === stato.pagina?.id) || pagine[0] || null;
      if (p && stato.pagina?.id === p.id && !stato.sporco) stato.pagina = p;
      if (!stato.pagina || stato.pagina.id !== p?.id) await apriPagina(p); else renderPagine();
    },
    sporco: () => stato.sporco,
    scartaModifiche: () => { stato.sporco = false; aggiornaBottoneSalva(); },
    step: (n = 1) => { for (let i = 0; i < n; i++) frame(); },
    stato, scene, camera,
  };
}
