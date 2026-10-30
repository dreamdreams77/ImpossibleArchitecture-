// DOM shell. Translates pointer and keyboard input into Session actions and
// repaints. All rules live in src/game.js and src/topology; this file only
// decides which intent a gesture means.

import { Session } from '../game.js';
import { CHAPTERS, chapterById } from '../campaign/chapters.js';
import { DISCIPLINES, PREMISE, placeInChapter, isFirstOfChapter, isLastOfChapter, endingFor } from '../campaign/campaign.js';
import { encodeShare, decodeShare } from '../persistence/share.js';
import { hitTest, portalHit } from '../render/geometry.js';
import { drawPlan, drawGraph } from '../render/draw.js';
import { transitionKind, turnDirection, drawFirstPerson, firstPersonModel, describeFirstPerson, fpZoneFor } from '../render/firstperson.js';
import { drawModel, modelLayout, DEFAULT_ANGLE, coastAngle, describeModel } from '../render/model3d.js';
import { Sound } from './sound.js';
import { fitViewFor, transitionProgress, snapTo } from '../render/view.js';
import { sightlines } from '../topology/traversal.js';
import { themeFor } from '../render/themes.js';
import { sightCardModel, drawSightCards } from '../render/sightcards.js';
import { SaveSlots, encodeSave, decodeSave } from '../persistence/store.js';
import { encodeProgress, decodeProgress, SHARE_LIMIT } from '../persistence/share.js';
import { createPinch } from './pinch.js';
import { createGlView } from './glview.js';
import { debugReport } from './debugreport.js';
import { copyText, canvasRatio } from './platform.js';

const $ = (sel) => document.querySelector(sel);

const ARROW_STEPS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
const PAN_STEP = 40;      // screen pixels per arrow press when panning the plan
const MODEL_TURN = 0.15;  // radians per arrow press when turning the 3D model



export function boot() {
  const plan = $('#plan');
  const graph = $('#graph');
  const fpCanvas = $('#fp');
  const modelCanvas = $('#model');
  const mctx = modelCanvas.getContext('2d');
  const fctx = fpCanvas.getContext('2d');
  const pctx = plan.getContext('2d');
  const gctx = graph.getContext('2d');
  const slots = new SaveSlots(window.localStorage);
  const glCanvas = $('#gl');

  const saved = loadProgress();
  const session = new Session({ chapterId: saved?.lastChapter ?? CHAPTERS[0].id, progress: saved?.progress });
  session.tool = 'select';
  restoreWork(session);
  // A saved choice wins; otherwise the device's light or dark setting decides.
  let savedTheme = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  try {
    const t = localStorage.getItem('ia-theme');
    if (t === 'light' || t === 'dark') savedTheme = t;
  } catch { /* keep the device's choice */ }
  setTheme(savedTheme);
  // A share link in the address (#c=...) opens that construction at once.
  if (location.hash.startsWith('#c=')) {
    const shared = decodeShare(location.hash.slice(3));
    if (shared.structure) session.loadShared(shared.structure);
    else session.feedback = { kind: 'error', text: shared.error };
  }

  const view = { scale: 80, offsetX: 0, offsetY: 0 };
  let drag = null;
  const planPinch = createPinch();
  let showGraph = true;
  let viewMode = 'plan';
  let fpKey = null;        // identifies the walker's position, to start a transition
  let fpAnimStart = 0;
  let fpKind = 'step';     // 'step' zooms in on a move, 'turn' slides on a turn
  let fpDir = 0;
  let modelAngle = DEFAULT_ANGLE; // orbit of the 3D model, changed by dragging or the arrow keys
  let modelSpin = 0;       // angle still to coast after a drag is released
  let modelZoom = 1;       // magnification of the 3D model, from the wheel or + and -
  let walkSpeed = 1;       // route walks and playback: 0.5, 1 or 2 times normal
  let modelDrag = null;    // pointer id and last x while dragging
  let fpTickAt = 0;        // when the first-person route last advanced
  let lastSaveAt = 0;      // when progress (including time) was last saved
  const sound = new Sound(safeStorage());
  let snapOn = true;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Under reduced motion the pulses hold still; walking and turning still happen.

  // The WebGL walk and architect's model. Where WebGL is unavailable the 2D views below stay in use.
  let savedQuality = 'auto';
  try { savedQuality = localStorage.getItem('ia-quality') || 'auto'; } catch { /* default */ }
  const gl = createGlView({
    canvas: glCanvas,
    session,
    hud: $('#gl-hud'),
    
    settings: { quality: savedQuality, reduceMotion, speed: () => walkSpeed },
    onWalkClick: (zone) => {
      session.fpStopPlay();
      if (zone === 'forward') walkForward();
      else session.fpTurn(zone);
      render();
    },
    onSelectRoom: (id) => { session.selectRoom(id); render(); },
  });
  const glMode = () => gl && (viewMode === 'first' || viewMode === 'model');

  populateChapters();

  let ratio = canvasRatio(); // canvas pixels per CSS pixel, set by fitView

  function fitView() {
    ratio = canvasRatio(); // read once per resize, not once per frame
    const r = plan.getBoundingClientRect();
    plan.width = Math.max(1, Math.floor(r.width * ratio));
    plan.height = Math.max(1, Math.floor(r.height * ratio));
    pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    view.offsetX = r.width / 2;
    view.offsetY = r.height / 2;
    const g = graph.getBoundingClientRect();
    graph.width = Math.max(1, Math.floor(g.width * ratio));
    graph.height = Math.max(1, Math.floor(g.height * ratio));
    gctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const f = fpCanvas.getBoundingClientRect();
    fpCanvas.width = Math.max(1, Math.floor(f.width * ratio));
    fpCanvas.height = Math.max(1, Math.floor(f.height * ratio));
    fctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const m = modelCanvas.getBoundingClientRect();
    modelCanvas.width = Math.max(1, Math.floor(m.width * ratio));
    modelCanvas.height = Math.max(1, Math.floor(m.height * ratio));
    mctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // Switches between the plan and the first-person view. Both read the same
  // structure; the walker starts in the chapter's start room when first opened.
  function setView(mode) {
    viewMode = mode;
    try { localStorage.setItem('ia-view', mode); } catch { /* not remembered */ }
    plan.hidden = mode !== 'plan';
    const useGl = !!gl && (mode === 'first' || mode === 'model');
    fpCanvas.hidden = useGl || mode !== 'first';
    modelCanvas.hidden = useGl || mode !== 'model';
    gl?.setVisible(useGl);
    if (useGl) gl.setMode(mode);
    $('#gl-hud').hidden = !useGl;
    $('#gl-model-controls').hidden = !(useGl && mode === 'model');
    $('#fp-controls').hidden = mode !== 'first';
    graph.hidden = mode !== 'plan' || !showGraph;
    $('#view-plan').setAttribute('aria-pressed', String(mode === 'plan'));
    $('#view-first').setAttribute('aria-pressed', String(mode === 'first'));
    $('#view-model').setAttribute('aria-pressed', String(mode === 'model'));
    // Canvases measure themselves when shown, so size them after un-hiding.
    fitView();
    if (mode === 'first') session.fpEnsure();
    render();
  }

  // Fills the saved-slot picker from storage, but only when the names change.
  let slotNames = '';
  function refreshSlotList() {
    const entries = slots.describe();
    const key = JSON.stringify(entries);
    if (key === slotNames) return;
    slotNames = key;
    const title = (id) => (id ? CHAPTERS.find((c) => c.id === id)?.title ?? id : 'free construction');
    const list = $('#slot-list');
    list.replaceChildren(new Option('saved slots', ''), ...entries.map((e) => new Option(`${e.name} · ${title(e.chapterId)}`, e.name)));
  }

  // Clicking the first-person view: the outer thirds turn, the middle walks.
  fpCanvas.addEventListener('click', (evt) => {
    const r = fpCanvas.getBoundingClientRect();
    const zone = fpZoneFor(evt.clientX - r.left, r.width);
    session.fpStopPlay();
    if (zone === 'forward') walkForward();
    else session.fpTurn(zone);
    render();
  });

  // Whether the walker's next move passes through a gate. Read before the move.
  function gateAhead() {
    const walker = session.fp;
    return walker ? session.structure.exit(walker.room, walker.heading)?.gate != null : false;
  }

  // The cue for a move that went through: a plate struck, a gate passed, or a
  // plain step. Read before the move, because the gate belongs to the old room.
  function stepCue(gateBefore, litBefore) {
    if ((session.fp?.lit ?? 0) !== litBefore) return 'plate';
    return gateBefore ? 'gate' : 'step';
  }

  // One walk forward, with its cue: a step, a gate, a bump into a wall or a shut
  // gate, a one-way refusal, or a plate being struck.
  function walkForward() {
    const gateBefore = gateAhead();
    const litBefore = session.fp?.lit ?? 0;
    const ok = session.fpForward();
    if (!ok) {
      sound.play(/One way/.test(session.feedback?.text ?? '') ? 'oneway' : 'bump');
      if (glMode() && session.fp) gl.bump(session.fp.heading);
    } else {
      sound.play(stepCue(gateBefore, litBefore));
    }
    return ok;
  }

  function toWorld(evt) {
    const r = plan.getBoundingClientRect();
    const sx = evt.clientX - r.left;
    const sy = evt.clientY - r.top;
    return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale, sx, sy };
  }

  // Paint the canvases. Called every frame by the animation loop, so plates
  // pulse and the walker moves; the panel is refreshed only on state changes.
  function paint(now = 0) {
    const time = reduceMotion ? 0 : now;
    if (glMode()) { gl.paint(now); return; }
    if (viewMode === 'model') {
      const mr = modelCanvas.getBoundingClientRect();
      mctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const route = session.routeHighlight;
      const walker = session.walk && route ? { trail: route.trail, progress: session.walk.progress } : null;
      const selected = session.selection?.type === 'room' ? session.selection.id : null;
      drawModel(mctx, session.structure, { width: mr.width, height: mr.height }, themeFor(session.themeName), time,
        { angle: modelAngle, walker, zoom: modelZoom, selected });
      return;
    }
    if (viewMode === 'first') {
      const fr = fpCanvas.getBoundingClientRect();
      const walker = session.fpEnsure();
      const model = walker ? firstPersonModel(session.structure, walker, session.chapter?.plates ?? []) : null;
      const key = walker ? `${walker.room}|${walker.heading}|${walker.steps}` : 'empty';
      if (key !== fpKey) {
        fpKind = transitionKind(fpKey, key);
        fpDir = fpKind === 'turn' ? turnDirection(fpKey, key) : 0;
        fpKey = key;
        fpAnimStart = time;
        $('#fp-live').textContent = describeFirstPerson(model);
      }
      const progress = transitionProgress(time - fpAnimStart, 260, reduceMotion);
      fctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawFirstPerson(fctx, model, { width: fr.width, height: fr.height }, themeFor(session.themeName), time,
        { progress, kind: fpKind, dir: fpDir });
      return;
    }
    const pr = plan.getBoundingClientRect();
    pctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawPlan(pctx, view, session, { width: pr.width, height: pr.height }, time);

    if (showGraph) {
      const gr = graph.getBoundingClientRect();
      gctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawGraph(gctx, session.structure, session.selection, { width: gr.width, height: gr.height }, session.themeName);
    }
  }

  // Frames the whole construction in the plan view.
  // Centres the plan on one room, keeping the zoom.
  function centreOnRoom(id) {
    const room = session.structure.rooms.get(id);
    if (!room) return;
    const r = plan.getBoundingClientRect();
    view.offsetX = r.width / 2 - room.x * view.scale;
    view.offsetY = r.height / 2 - room.y * view.scale;
    render();
  }

  function fitPlan() {
    const r = plan.getBoundingClientRect();
    Object.assign(view, fitViewFor(session.structure, r.width, r.height));
    render();
  }

  // Saves whichever view is on screen as a PNG, named for its chapter.
  function saveImage() {
    const canvas = viewMode === 'first' ? fpCanvas : viewMode === 'model' ? modelCanvas : plan;
    const name = session.sandbox ? 'free-construction' : session.chapter.id;
    const toBlob = (cb) => (glMode() ? gl.capture(cb) : canvas.toBlob(cb, 'image/png'));
    toBlob((blob) => {
      if (!blob) {
        session.feedback = { kind: 'error', text: 'This browser could not make an image of the view.' };
        render();
        return;
      }
      const fileName = `${name}-${viewMode}.png`;
      const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
      // Phones offer the system share sheet, which can save to Photos or Files.
      if (file && navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: fileName }).catch(() => { /* cancelled */ });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function toggleSnap(force) {
    snapOn = force ?? !snapOn;
    $('#snap').setAttribute('aria-pressed', String(snapOn));
    session.feedback = { kind: 'info', text: snapOn ? 'Snapping to the grid is on.' : 'Snapping is off: rooms move freely.' };
    render();
  }

  // The page colours are remembered for this browser; the plan keeps its own palette.
  function setTheme(name) {
    document.documentElement.dataset.theme = name;
    $('#theme').textContent = name === 'light' ? 'Dark' : 'Light';
    try { localStorage.setItem('ia-theme', name); } catch { /* storage may be blocked */ }
  }

  // The keys panel is a dialog: focus moves in, Tab stays inside it, and closing
  // returns focus to whatever opened it.
  let keysReturnFocus = null;
  function toggleKeys(force) {
    const overlay = $('#keys-overlay');
    const open = force ?? overlay.hidden;
    if (open && overlay.hidden) keysReturnFocus = document.activeElement;
    overlay.hidden = !open;
    $('#keys-btn').setAttribute('aria-expanded', String(open));
    if (open) $('#keys-close').focus();
    else { keysReturnFocus?.focus?.(); keysReturnFocus = null; }
  }
  function trapTab(evt, root = $('#keys-overlay')) {
    const items = [...root.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (evt.shiftKey && document.activeElement === first) { evt.preventDefault(); last.focus(); }
    else if (!evt.shiftKey && document.activeElement === last) { evt.preventDefault(); first.focus(); }
  }

  // ---- menus ---------------------------------------------------------------
  // The title screen (at start), the pause menu (Escape), the chapter list, the
  // settings and the credits share one dialog, with one view showing at a time.
  // The completion card appears once, when a chapter is first completed.
  let menuView = 'title';
  let menuParent = 'title';
  let menuReturnFocus = null;
  const MENU_VIEWS = ['title', 'pause', 'chapters', 'settings', 'credits'];

  function showMenu(view = 'title') {
    const menu = $('#menu');
    if (menu.hidden) menuReturnFocus = document.activeElement;
    menu.hidden = false;
    showView(view);
  }

  function showView(view) {
    // Chapters, settings and credits return to whichever view opened them.
    if (['chapters', 'settings', 'credits'].includes(view) && menuView !== view) menuParent = menuView;
    menuView = view;
    for (const v of MENU_VIEWS) $(`#menu-${v}`).hidden = v !== view;
    if (view === 'chapters') fillChapterList();
    if (view === 'settings') syncSettings();
    $(`#menu-${view}`).querySelector('button, input')?.focus();
  }

  function closeMenu() {
    $('#menu').hidden = true;
    menuReturnFocus?.focus?.();
    menuReturnFocus = null;
  }

  function fillChapterList() {
    const box = $('#menu-chapter-buttons');
    box.innerHTML = '';
    for (const d of DISCIPLINES) {
      const done = d.challenges.filter((id) => session.progress.completed.includes(id)).length;
      const head = document.createElement('div');
      head.className = 'chapter-head';
      head.innerHTML = `<strong>Chapter ${d.no} · ${d.title}</strong><span>${done} / ${d.challenges.length}</span>`;
      box.appendChild(head);
      for (const id of d.challenges) {
        const c = chapterById(id);
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${session.progress.completed.includes(c.id) ? '✓ ' : ''}${c.title}`;
        b.addEventListener('click', () => { session.loadChapter(c.id); closeMenu(); render(); });
        box.appendChild(b);
      }
    }
  }

  function syncSettings() {
    $('#set-theme').textContent = `Theme: ${document.documentElement.dataset.theme === 'light' ? 'Light' : 'Dark'}`;
    $('#set-sound').textContent = `Sound: ${sound.enabled ? 'on' : 'off'}`;
    $('#set-volume').value = String(Math.round(sound.volume * 100));
    $('#set-speed').value = $('#speed').value;
    $('#set-quality').value = savedQuality;
    $('#set-quality').disabled = !gl;
  }

  function showComplete(chapterId) {
    if (session.isFinished() && !session.sandbox) { showEnding(); return; }
    const done = chapterById(chapterId);
    const next = session.nextChapterId();
    const nextTitle = next ? chapterById(next).title : null;
    $('#complete-heading').textContent = `${done?.title ?? 'Chapter'} complete`;
    $('#complete-text').textContent = next
      ? `Next: ${nextTitle}.`
      : session.isFinished()
        ? 'Every chapter is complete. The ending is open, and free construction stays available.'
        : 'That was the last chapter. The ending opens once every chapter is complete.';
    if (isLastOfChapter(chapterId)) {
      const d = placeInChapter(chapterId).chapter;
      $('#complete-heading').textContent = `Chapter ${d.no} complete: ${d.title}`;
      $('#complete-text').textContent = `${d.outro} ${nextTitle ? `Next: ${nextTitle}.` : ''}`;
    }
    $('#complete-next').hidden = !next;
    $('#complete').hidden = false;
    (next ? $('#complete-next') : $('#complete-stay')).focus();
  }

  function closeComplete() {
    $('#complete').hidden = true;
  }

  // ---- chapter cards -------------------------------------------------------
  // Each chapter opens with a short card the first time one of its challenges is
  // entered. It waits behind any dialog that is open.
  let seenChapters = [];
  try { seenChapters = JSON.parse(localStorage.getItem('ia-seen-chapters') ?? '[]'); } catch { /* none seen */ }
  let cardFor = null;
  let lastChallenge = null;
  let booted = false; // the title menu opens at the end of boot; no card may appear before it
  function maybeQueueCard() {
    const id = session.sandbox ? null : session.chapter?.id ?? null;
    if (id === lastChallenge) return;
    lastChallenge = id;
    if (id && isFirstOfChapter(id)) {
      const d = placeInChapter(id).chapter;
      if (!seenChapters.includes(d.no)) cardFor = d;
    }
  }
  function showCardIfReady() {
    if (!booted || !cardFor || !$('#menu').hidden || !$('#complete').hidden || !$('#ending-screen').hidden) return;
    const d = cardFor;
    cardFor = null;
    seenChapters.push(d.no);
    try { localStorage.setItem('ia-seen-chapters', JSON.stringify(seenChapters)); } catch { /* not remembered */ }
    $('#card-kicker').textContent = `Chapter ${d.no} of ${DISCIPLINES.length}`;
    $('#card-title').textContent = d.title;
    $('#card-text').textContent = d.no === 1 ? `${PREMISE} ${d.intro}` : d.intro;
    $('#chapter-card').hidden = false;
    $('#card-begin').focus();
  }
  $('#card-begin').addEventListener('click', () => { $('#chapter-card').hidden = true; });

  // ---- the ending ------------------------------------------------------------
  // The ending is made from what the player actually built in the last construction:
  // the model turns slowly above it while the facts of the building are read out.
  let endingTimers = [];
  function showEnding() {
    closeComplete();
    const e = endingFor(session.structure, session.progress, { timeMs: Object.values(session.progress.time ?? {}).reduce((a, b) => a + b, 0) });
    setView(gl ? 'model' : 'plan');
    gl?.setAutoOrbit(true);
    $('#ending-heading').textContent = e.heading;
    const lines = $('#ending-lines');
    lines.innerHTML = '';
    $('#ending-closing').textContent = '';
    $('#ending-actions').hidden = true;
    $('#ending-screen').hidden = false;
    endingTimers.forEach(clearTimeout);
    endingTimers = [];
    e.lines.forEach((text, i) => {
      endingTimers.push(setTimeout(() => {
        const p = document.createElement('p');
        p.textContent = text;
        lines.appendChild(p);
      }, reduceMotion ? 0 : 1400 + i * 2200));
    });
    endingTimers.push(setTimeout(() => {
      $('#ending-closing').textContent = e.closing;
      $('#ending-actions').hidden = false;
      $('#ending-walk').focus();
    }, reduceMotion ? 0 : 1400 + e.lines.length * 2200 + 1200));
  }
  function closeEnding() {
    endingTimers.forEach(clearTimeout);
    endingTimers = [];
    gl?.setAutoOrbit(false);
    $('#ending-screen').hidden = true;
  }
  $('#ending-walk').addEventListener('click', () => {
    closeEnding();
    session.testConstruction();
    setView('first');
    $('#fp-play').click();
  });
  $('#ending-credits').addEventListener('click', () => { closeEnding(); showMenu('credits'); });
  $('#ending-stay').addEventListener('click', closeEnding);
  $('#ending-again').addEventListener('click', () => { closeEnding(); showEnding(); });

  $('#menu-continue').addEventListener('click', () => { closeMenu(); render(); });
  $('#menu-new').addEventListener('click', () => {
    if (session.progress.completed.length && !confirm('Start a new game? Completed chapters and discoveries are cleared. Your current construction is kept.')) return;
    session.resetProgress();
    session.loadChapter(CHAPTERS[0].id);
    closeMenu();
    render();
  });
  $('#menu-chapters-open').addEventListener('click', () => showView('chapters'));
  $('#menu-sandbox').addEventListener('click', () => { session.startSandbox(); closeMenu(); render(); });
  $('#menu-settings-open').addEventListener('click', () => showView('settings'));
  $('#menu-credits-open').addEventListener('click', () => showView('credits'));
  $('#pause-resume').addEventListener('click', () => { closeMenu(); render(); });
  $('#pause-restart').addEventListener('click', () => { $('#reset').click(); closeMenu(); });
  $('#pause-chapters-open').addEventListener('click', () => showView('chapters'));
  $('#pause-settings-open').addEventListener('click', () => showView('settings'));
  $('#pause-title').addEventListener('click', () => showView('title'));
  $('#chapters-sandbox').addEventListener('click', () => { session.startSandbox(); closeMenu(); render(); });
  $('#chapters-back').addEventListener('click', () => showView(menuParent));
  $('#settings-back').addEventListener('click', () => showView(menuParent));
  $('#credits-back').addEventListener('click', () => showView(menuParent));
  $('#set-theme').addEventListener('click', () => { $('#theme').click(); syncSettings(); });
  $('#set-sound').addEventListener('click', () => { $('#sound').click(); syncSettings(); });
  $('#set-speed').addEventListener('change', (evt) => {
    $('#speed').value = evt.target.value;
    $('#speed').dispatchEvent(new Event('change'));
    syncSettings();
  });
  $('#set-quality').addEventListener('change', (evt) => {
    savedQuality = evt.target.value;
    try { localStorage.setItem('ia-quality', savedQuality); } catch { /* not remembered */ }
    gl?.setQuality(savedQuality === 'auto' ? 'high' : savedQuality);
  });
  $('#gl-cutaway').addEventListener('click', () => {
    const on = !gl.cutaway;
    gl.setCutaway(on);
    $('#gl-cutaway').setAttribute('aria-pressed', String(on));
  });
  $('#gl-cut-height').addEventListener('input', (evt) => gl?.setCutHeight(Number(evt.target.value)));
  $('#gl-reset-view').addEventListener('click', () => gl?.key('f'));
  $('#set-volume').addEventListener('input', (evt) => {
    $('#volume').value = evt.target.value;
    $('#volume').dispatchEvent(new Event('input'));
  });
  $('#complete-next').addEventListener('click', () => {
    const next = session.nextChapterId();
    closeComplete();
    if (next) session.loadChapter(next);
    render();
  });
  $('#complete-stay').addEventListener('click', () => { closeComplete(); render(); });

  // Developer overlay (F3): the engine's own account of the world, plus renderer stats.
  let debugOn = false;
  let debugAt = 0;
  function toggleDebugPanel() {
    debugOn = !debugOn;
    $('#debug-panel').hidden = !debugOn;
    gl?.setDebug(debugOn);
    if (debugOn) updateDebugPanel(true);
  }
  function updateDebugPanel(force = false) {
    if (!debugOn || (!force && lastTime - debugAt < 400)) return;
    debugAt = lastTime;
    const lines = debugReport(session);
    if (gl && (viewMode === 'first' || viewMode === 'model')) lines.push('-- renderer', ...gl.world.debugLines());
    $('#debug-panel').textContent = lines.join('\n');
  }

  function render() {
    if (session.justCompleted) {
      const done = session.justCompleted;
      session.justCompleted = null;
      showComplete(done);
    }
    maybeQueueCard();
    paint(lastTime);
    renderPanel();
    showCardIfReady();
  }

  // Animation loop: advances the traveller along the test route and keeps the
  // plates pulsing. Stops the walk when it reaches the exit.
  let lastTime = 0;
  let lastFrame = null;
  function frame(now) {
    const dt = lastFrame === null ? 0 : Math.min(100, now - lastFrame);
    lastFrame = now;
    lastTime = now;
    if (dt > 0 && document.visibilityState === 'visible') session.addTime(dt);
    if (!modelDrag && modelSpin !== 0) {
      ({ angle: modelAngle, spin: modelSpin } = coastAngle(modelAngle, modelSpin));
    }
    if (now - lastSaveAt > 10000) {
      lastSaveAt = now;
      render(); // also saves the time spent so far
    }
    if (session.fpPlay && now - fpTickAt > 650 / walkSpeed) {
      fpTickAt = now;
      const gateBefore = gateAhead();
      const litBefore = session.fp?.lit ?? 0;
      const more = session.fpPlayTick();
      sound.play(stepCue(gateBefore, litBefore));
      if (!more && session.feedback?.kind === 'success') sound.play('goal');
      render();
    }
    if (session.walk) {
      session.walk.progress += (dt / 700) * walkSpeed;
      const step = Math.min(Math.floor(session.walk.progress), session.walk.steps);
      if (step !== session.walk.announced) {
        session.walk.announced = step;
        announceStep(step);
      }
      if (session.walk.progress >= session.walk.steps + 0.6) {
        session.stopWalk();
        render();
      }
    }
    paint(now);
    updateDebugPanel();
    requestAnimationFrame(frame);
  }

  // Says where the traveller is on the route: the start, then each step.
  function announceStep(step) {
    const trail = session.routeHighlight?.trail ?? [];
    const room = session.structure.rooms.get(trail[step]);
    const name = room?.label || trail[step] || 'the route';
    session.feedback = { kind: 'info', text: step === 0 ? `Walking the route from ${name}.` : `Step ${step} of ${session.walk.steps}: now in ${name}.` };
    render();
  }

  function renderPanel() {
    const s = session.structure;
    refreshSlotList();
    modelCanvas.setAttribute('aria-label', describeModel(s));
    plan.setAttribute('aria-label', `Plan view: ${s.rooms.size} rooms, ${s.portals.size} portals. Double-click a room to rename it; arrow keys pan, or nudge the selected room.`);
    $('#chapter-title').textContent = session.sandbox ? 'Free construction' : session.chapter.title;
    $('#chapter-blurb').textContent = session.sandbox ? 'Build anything. No goal.' : session.chapter.blurb;
    const tests = session.sandbox || !session.chapter ? 0 : (session.progress.attempts[session.chapter.id] ?? 0);
    const spent = session.sandbox || !session.chapter ? 0 : (session.progress.time[session.chapter.id] ?? 0);
    const limit = (n, max) => (Number.isFinite(max) ? `${n} of ${max}` : `${n}`);
    $('#stats').textContent = `${limit(s.rooms.size, session.ruleset.maxRooms)} rooms · ${limit(s.portals.size, session.ruleset.maxPortals)} portals`
      + (tests ? ` · ${tests} ${tests === 1 ? 'test' : 'tests'} run` : '')
      + (spent > 0 ? ` · ${formatMinutes(spent)} here` : '');
    $('#undo').disabled = !session.history.canUndo;
    const back = session.history.index;
    const forward = session.history.stack.length - 1 - session.history.index;
    $('#undo').title = back ? `Undo (${back} step${back === 1 ? '' : 's'} back)` : 'Nothing to undo';
    $('#redo').title = forward ? `Redo (${forward} step${forward === 1 ? '' : 's'} forward)` : 'Nothing to redo';
    $('#hint').textContent = session.hintState && session.hintState.chapter === session.chapter?.id ? 'Show full hint' : 'Show hint';
    $('#redo').disabled = !session.history.canRedo;
    for (const btn of document.querySelectorAll('[data-tool]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === session.tool));
    }
    const sel = session.selection;
    $('#inspector').textContent = describeSelection(s, sel, session) + '\n\n' + analysisText(session)
      + (sel?.type === 'room' ? '\n\n' + sightText(s, sel.id) : '');
    $('#walk').disabled = !session.routeHighlight;
    $('#copy-route').disabled = !session.routeHighlight;
    $('#fp-play').disabled = !session.routeHighlight;
    $('#sound').textContent = sound.enabled ? 'Sound on' : 'Sound off';
    $('#sound').setAttribute('aria-pressed', String(sound.enabled));
    $('#volume').value = String(Math.round(sound.volume * 100));
    const notes = session.fieldNotes();
    $('#notes-section').hidden = notes.length === 0;
    const roomSel = sel?.type === 'room' ? s.rooms.get(sel.id) : null;
    $('#room-section').hidden = !roomSel;
    const labelInput = $('#room-label');
    if (roomSel && document.activeElement !== labelInput) labelInput.value = roomSel.label ?? '';
    if (roomSel) {
      $('#room-kind').value = roomSel.kind ?? 'chamber';
      $('#room-size').value = String(roomSel.size ?? 1);
    }
    const list = $('#notes');
    list.replaceChildren(...notes.map((n) => {
      const li = document.createElement('li');
      li.textContent = n.found ? `${n.title}: ${n.text}` : `${n.title}`;
      if (!n.found) li.className = 'undiscovered';
      return li;
    }));
    for (const o of $('#chapter-select').options) {
      const c = chapterById(o.value);
      if (!c) continue;
      const label = (session.progress.completed.includes(c.id) ? '✓ ' : '') + c.title;
      if (o.textContent !== label) o.textContent = label;
    }
    const sightSection = $('#sight-section');
    const showSight = sel?.type === 'room' && s.rooms.has(sel.id);
    sightSection.hidden = !showSight;
    if (showSight) {
      const sc = $('#sight');
      const sctx = sc.getContext('2d');
      const room = s.rooms.get(sel.id);
      drawSightCards(sctx, sightCardModel(s, sel.id), { width: sc.width, height: sc.height }, themeFor(session.themeName), room.label || room.id);
    }
    const stage = $('.stage');
    if (stage.dataset.chapter !== String(session.chapterIdValue)) {
      stage.dataset.chapter = String(session.chapterIdValue);
      stage.classList.remove('enter');
      void stage.offsetWidth;
      stage.classList.add('enter');
    }
    $('#portal-actions').hidden = !(sel && sel.type === 'portal');
    $('#feedback').textContent = session.feedback?.text ?? '';
    $('#feedback').dataset.kind = session.feedback?.kind ?? 'info';
    $('#next').hidden = !(session.chapter && session.progress.completed.includes(session.chapter.id) && session.nextChapterId());
    $('#prev').hidden = !(session.chapter && session.previousChapterId());
    $('#clear').disabled = !session.sandbox;
    persistWork();
    $('#ending').hidden = !(session.isFinished() && !session.sandbox);
    $('#chapter-select').value = session.sandbox ? '__sandbox' : session.chapter.id;
    const at = session.chapter ? CHAPTERS.findIndex((c) => c.id === session.chapter.id) + 1 : 0;
    $('#progress').textContent = `${session.progress.completed.length} / ${CHAPTERS.length} challenges complete · ${session.progress.discoveries.length} ${session.progress.discoveries.length === 1 ? 'discovery' : 'discoveries'}${at ? ` · chapter ${session.chapter.discipline}, challenge ${session.chapter.inChapter}` : ''}`;
    persistProgress();
  }

  // ---- pointer ----------------------------------------------------------

  plan.addEventListener('pointerdown', (evt) => {
    plan.setPointerCapture(evt.pointerId);
    const w = toWorld(evt);
    if (planPinch.down(evt.pointerId, w.sx, w.sy)) {
      // A second finger: stop any drag in progress and let the pinch take over.
      if (drag) session.endGesture();
      drag = null;
      render();
      return;
    }
    const hit = hitTest(session.structure, w.x, w.y);
    const portal = !hit || hit.type === 'room' ? portalHit(session.structure, w.x, w.y) : null;

    if (session.tool === 'add') {
      if (!hit) session.addRoomAt(snapTo(w.x, 0.5), snapTo(w.y, 0.5));
      render();
      return;
    }
    if (session.tool === 'connect') {
      if (hit?.type === 'face') session.pickFace(hit.room, hit.face);
      else session.feedback = { kind: 'info', text: 'Click a face (the small dots on a room edge) to connect.' };
      render();
      return;
    }
    // select tool
    if (hit?.type === 'room') {
      session.selectRoom(hit.id);
      session.beginGesture();
      drag = { id: hit.id, offX: w.x - session.structure.rooms.get(hit.id).x, offY: w.y - session.structure.rooms.get(hit.id).y, moved: false };
    } else if (portal) {
      session.selectPortal(portal.id);
    } else {
      session.selection = null;
      drag = { pan: true, sx: w.sx, sy: w.sy, ox: view.offsetX, oy: view.offsetY };
    }
    render();
  });

  plan.addEventListener('pointermove', (evt) => {
    const w = toWorld(evt);
    const pz = planPinch.move(evt.pointerId, w.sx, w.sy);
    if (pz) {
      zoomPlanAt(pz.cx, pz.cy, pz.factor);
      view.offsetX += pz.dx;
      view.offsetY += pz.dy;
      render();
      return;
    }
    if (!drag && !planPinch.active()) {
      plan.style.cursor = cursorFor(w);
      return;
    }
    if (planPinch.active() || !drag) return;
    if (drag.pan) {
      view.offsetX = drag.ox + (w.sx - drag.sx);
      view.offsetY = drag.oy + (w.sy - drag.sy);
    } else if (drag.id) {
      const nx = snapTo(w.x - drag.offX, snapOn ? 0.5 : 0);
      const ny = snapTo(w.y - drag.offY, snapOn ? 0.5 : 0);
      const cur = session.structure.rooms.get(drag.id);
      if (cur && (cur.x !== nx || cur.y !== ny)) {
        session.moveRoom(drag.id, nx, ny);
        drag.moved = true;
      }
    }
    render();
  });

  const endDrag = (evt) => { planPinch.up(evt.pointerId); drag = null; session.endGesture(); };
  plan.addEventListener('pointerup', endDrag);
  plan.addEventListener('pointercancel', endDrag);

  // What a click will do here, shown as the cursor.
  function cursorFor(w) {
    if (session.tool === 'add') return 'copy';
    const hit = hitTest(session.structure, w.x, w.y);
    if (session.tool === 'connect') return hit?.type === 'face' ? 'pointer' : 'default';
    if (hit?.type === 'face' || hit?.type === 'portal') return 'pointer';
    if (hit?.type === 'room') return 'move';
    return portalHit(session.structure, w.x, w.y) ? 'pointer' : 'grab';
  }

  // Double-clicking a room selects it and puts the cursor in its name.
  plan.addEventListener('dblclick', (evt) => {
    if (session.tool !== 'select') return;
    const w = toWorld(evt);
    const hit = hitTest(session.structure, w.x, w.y);
    if (hit?.type !== 'room') return;
    session.selectRoom(hit.id);
    render();
    const label = $('#room-label');
    label.focus();
    label.select();
  });

  plan.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    zoomPlanAt(evt.offsetX, evt.offsetY, evt.deltaY > 0 ? 0.9 : 1.1);
    render();
  }, { passive: false });

  // Zoom the plan about a screen point, so that point stays where it is.
  function zoomPlanAt(sx, sy, factor) {
    const old = view.scale;
    const next = Math.min(200, Math.max(30, old * factor));
    const wx = (sx - view.offsetX) / old;
    const wy = (sy - view.offsetY) / old;
    view.scale = next;
    view.offsetX = sx - wx * next;
    view.offsetY = sy - wy * next;
  }

  // ---- toolbar ----------------------------------------------------------

  for (const btn of document.querySelectorAll('[data-tool]')) {
    btn.addEventListener('click', () => {
      session.tool = btn.dataset.tool;
      session.pendingFace = null;
      render();
    });
  }

  $('#undo').addEventListener('click', () => { session.undo(); render(); });
  $('#redo').addEventListener('click', () => { session.redo(); render(); });
  $('#delete').addEventListener('click', () => { session.deleteSelection(); render(); });
  $('#test').addEventListener('click', () => {
    session.testConstruction();
    if (session.routeHighlight) sound.play('goal');
    render();
  });
  $('#sound').addEventListener('click', () => { sound.setEnabled(!sound.enabled); render(); });
  $('#walk').addEventListener('click', () => { session.startWalk(); render(); });
  $('#hint').addEventListener('click', () => { session.nextHint(); render(); });
  $('#view-plan').addEventListener('click', () => setView('plan'));
  $('#fit').addEventListener('click', () => fitPlan());
  $('#save-image').addEventListener('click', () => saveImage());
  $('#keys-btn').addEventListener('click', () => toggleKeys());
  $('#snap').addEventListener('click', () => toggleSnap());
  $('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('#describe').addEventListener('click', async () => {
    const ok = await copyText(session.describe());
    session.feedback = ok
      ? { kind: 'success', text: 'Description copied to the clipboard.' }
      : { kind: 'error', text: 'The browser would not copy the text. Select the inspector text instead.' };
    render();
  });
  $('#copy-notes').addEventListener('click', async () => {
    const text = session.fieldNotes().map((n) => (n.found ? `${n.title}: ${n.text}` : `${n.title} (not yet found)`)).join('\n');
    const ok = await copyText(text);
    session.feedback = ok
      ? { kind: 'success', text: 'Field notes copied to the clipboard.' }
      : { kind: 'error', text: 'The browser would not copy the notes. Select them instead.' };
    render();
  });
  $('#speed').addEventListener('change', (evt) => {
    walkSpeed = Number(evt.target.value);
    try { localStorage.setItem('ia-speed', String(walkSpeed)); } catch { /* not remembered */ }
  });
  $('#copy-route').addEventListener('click', async () => {
    const text = session.routeText();
    if (!text) {
      session.feedback = { kind: 'error', text: 'There is no passing route yet. Pass a chapter first.' };
      render();
      return;
    }
    const ok = await copyText(text);
    session.feedback = ok
      ? { kind: 'success', text: 'Route copied to the clipboard.' }
      : { kind: 'error', text: 'The browser would not copy the route. Select the text instead.' };
    render();
  });
  // Drag the 3D model to turn it around its vertical axis.
  modelCanvas.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    modelZoom = Math.min(3, Math.max(0.4, modelZoom * (evt.deltaY > 0 ? 0.9 : 1.1)));
    render();
  }, { passive: false });
  const modelPinch = createPinch();
  modelCanvas.addEventListener('pointerdown', (evt) => {
    if (modelPinch.down(evt.pointerId, evt.clientX, evt.clientY)) {
      modelDrag = null;
      return;
    }
    modelDrag = { id: evt.pointerId, x: evt.clientX, startX: evt.clientX, startY: evt.clientY, moved: false };
    modelCanvas.setPointerCapture?.(evt.pointerId);
    modelCanvas.style.cursor = 'grabbing';
  });
  modelCanvas.addEventListener('pointermove', (evt) => {
    const pz = modelPinch.move(evt.pointerId, evt.clientX, evt.clientY);
    if (pz) {
      modelZoom = Math.min(3, Math.max(0.4, modelZoom * pz.factor));
      render();
      return;
    }
    if (modelPinch.active() || !modelDrag || modelDrag.id !== evt.pointerId) return;
    if (Math.hypot(evt.clientX - modelDrag.startX, evt.clientY - modelDrag.startY) > 5) modelDrag.moved = true;
    const delta = (evt.clientX - modelDrag.x) * 0.01;
    modelAngle += delta;
    modelSpin = delta;
    modelDrag.x = evt.clientX;
  });
  const endModelDrag = (evt) => {
    modelPinch.up(evt.pointerId);
    if (modelDrag?.id === evt.pointerId && !modelDrag.moved && evt.type === 'pointerup') selectModelRoomAt(evt);
    if (modelDrag?.id === evt.pointerId) modelDrag = null;
    if (reduceMotion) modelSpin = 0;
    modelCanvas.style.cursor = '';
  };
  // Finds the room whose base is nearest the click, within a comfortable reach.
  function selectModelRoomAt(evt) {
    const r = modelCanvas.getBoundingClientRect();
    const layout = modelLayout(session.structure, r.width, r.height, modelAngle, modelZoom);
    const x = evt.clientX - r.left;
    const y = evt.clientY - r.top;
    let best = null;
    let bestD = 36;
    for (const [id, p] of layout.pts) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best) { session.selectRoom(best); render(); }
  }
  modelCanvas.addEventListener('pointerup', endModelDrag);
  modelCanvas.addEventListener('pointercancel', endModelDrag);
  $('#room-size').addEventListener('change', (evt) => {
    if (session.selection?.type === 'room') session.setRoomSize(session.selection.id, Number(evt.target.value));
    render();
  });
  $('#turn-room').addEventListener('click', () => {
    if (session.selection?.type === 'room') session.turnRoom(session.selection.id);
    render();
  });
  $('#room-kind').addEventListener('change', (evt) => {
    if (session.selection?.type === 'room') session.setRoomKind(session.selection.id, evt.target.value);
    render();
  });
  $('#room-label').addEventListener('change', (evt) => {
    const sel = session.selection;
    if (sel?.type === 'room') session.renameRoom(sel.id, evt.target.value);
    evt.target.blur(); // hand the keyboard back, so shortcuts work again
    render();
  });
  $('#keys-close').addEventListener('click', () => toggleKeys(false));
  $('#view-first').addEventListener('click', () => setView('first'));
  $('#view-model').addEventListener('click', () => setView('model'));
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('Clear completed chapters, discoveries, test counts and time? Your current construction is kept.')) return;
    session.resetProgress();
    render();
  });
  // Manual walking stops any route playback that is under way.
  $('#fp-left').addEventListener('click', () => { session.fpStopPlay(); session.fpTurn('left'); render(); });
  $('#fp-right').addEventListener('click', () => { session.fpStopPlay(); session.fpTurn('right'); render(); });
  $('#fp-forward').addEventListener('click', () => { session.fpStopPlay(); walkForward(); render(); });
  $('#fp-reset').addEventListener('click', () => { session.fpStopPlay(); session.startFirstPerson(); session.feedback = null; render(); });
  $('#fp-play').addEventListener('click', () => { session.fpPlayRoute(); fpTickAt = lastTime; render(); });
  $('#share').addEventListener('click', async () => {
    const code = encodeShare(session.structure);
    if (code.length > SHARE_LIMIT) {
      session.feedback = { kind: 'error', text: 'This construction is too large for a share link. Use Export JSON instead.' };
      render();
      return;
    }
    history.replaceState(null, '', `#c=${code}`);
    const copied = await copyText(`${location.origin}${location.pathname}#c=${code}`);
    session.feedback = { kind: 'success', text: copied ? 'Share link copied to the clipboard.' : 'Share link is in the address bar.' };
    render();
  });
  $('#oneway').addEventListener('click', () => { session.cycleOneWay(); render(); });
  $('#reverse').addEventListener('click', () => { session.reverseOneWay(); render(); });
  $('#duplicate').addEventListener('click', () => {
    if (session.selection?.type === 'room') session.duplicateRoom(session.selection.id);
    render();
  });
  $('#rotate').addEventListener('click', () => { session.rotateSelectedPortal(); render(); });
  $('#mirror').addEventListener('click', () => { session.mirrorSelectedPortal(); render(); });
  $('#move-end').addEventListener('click', () => {
    if (session.beginRetarget('b')) session.tool = 'connect';
    render();
  });
  $('#toggle-graph').addEventListener('click', () => { showGraph = !showGraph; $('#graph').hidden = !showGraph; render(); });
  $('#prev').addEventListener('click', () => {
    const prev = session.previousChapterId();
    if (prev) { session.loadChapter(prev); render(); }
  });
  $('#clear').addEventListener('click', () => {
    if (!confirm('Remove every room and portal from this free construction? Undo brings them back.')) return;
    session.clearConstruction();
    render();
  });
  $('#next').addEventListener('click', () => {
    const next = session.nextChapterId();
    if (next) { session.loadChapter(next); render(); }
  });
  $('#chapter-select').addEventListener('change', (evt) => {
    if (evt.target.value === '__sandbox') session.startSandbox();
    else session.loadChapter(evt.target.value);
    render();
  });
  $('#reset').addEventListener('click', () => {
    if (!session.sandbox && !confirm('Discard this construction and restart the chapter? Undo brings it back.')) return;
    if (session.sandbox || !session.restartChapter()) session.loadChapter(session.chapter ? session.chapter.id : CHAPTERS[0].id);
    render();
  });

  // Save and load: named local slots, plus JSON file export and import.
  $('#save').addEventListener('click', () => {
    const name = $('#slot-name').value.trim() || 'default';
    if (slots.has(name) && !confirm(`Overwrite the save in slot "${name}"?`)) return;
    slots.save(name, {
      chapterId: session.sandbox ? null : session.chapter.id,
      structure: session.structure,
      progress: session.progress,
    });
    session.feedback = { kind: 'success', text: `Saved to slot "${name}".` };
    render();
  });
  $('#slot-list').addEventListener('change', (evt) => {
    if (evt.target.value) $('#slot-name').value = evt.target.value;
  });
  $('#delete-slot').addEventListener('click', () => {
    const name = $('#slot-name').value.trim() || 'default';
    if (!slots.has(name)) { session.feedback = { kind: 'error', text: `No save in slot "${name}" to delete.` }; render(); return; }
    if (!confirm(`Delete the save in slot "${name}"? This cannot be undone.`)) return;
    slots.remove(name);
    session.feedback = { kind: 'success', text: `Deleted slot "${name}".` };
    render();
  });
  $('#load').addEventListener('click', () => {
    const name = $('#slot-name').value.trim() || 'default';
    try {
      const data = slots.load(name);
      if (!data) { session.feedback = { kind: 'error', text: `No save in slot "${name}".` }; }
      else {
        if (session.structure.rooms.size > 0 && !confirm('Replace the current construction with this save? Undo brings it back.')) return;
        session.loadStructure(data.structure, data.chapterId, { undoable: true });
        session.progress = data.progress;
      }
    } catch (e) {
      session.feedback = { kind: 'error', text: e.message };
    }
    render();
  });
  $('#copy-progress').addEventListener('click', async () => {
    const code = encodeProgress(session.progress);
    const ok = await copyText(code);
    session.feedback = ok
      ? { kind: 'success', text: 'Progress code copied. Paste it into Restore on any copy of the game.' }
      : { kind: 'error', text: 'The browser would not copy the progress code. Select the text instead.' };
    render();
  });
  $('#restore-progress').addEventListener('click', () => {
    const result = decodeProgress($('#progress-code').value.trim(), CHAPTERS.map((c) => c.id));
    if (result.error) { session.feedback = { kind: 'error', text: result.error }; }
    else {
      session.progress = result.progress;
      $('#progress-code').value = '';
      session.feedback = { kind: 'success', text: 'Progress restored.' };
    }
    render();
  });
  $('#volume').addEventListener('input', (evt) => {
    sound.setVolume(Number(evt.target.value) / 100);
  });
  $('#export').addEventListener('click', () => {
    const blob = new Blob([encodeSave({
      chapterId: session.sandbox ? null : session.chapter.id,
      structure: session.structure,
      progress: session.progress,
    })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'construction.impossible.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#import').addEventListener('change', async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    try {
      const data = decodeSave(await file.text());
      if (session.structure.rooms.size > 0 && !confirm('Replace the current construction with this file? Undo brings it back.')) {
        evt.target.value = '';
        return;
      }
      session.loadStructure(data.structure, data.chapterId, { undoable: true });
      session.progress = data.progress;
    } catch (e) {
      session.feedback = { kind: 'error', text: e.message };
    }
    evt.target.value = '';
    render();
  });

  // Keys in the plan view. Returns true when the key was used.
  //   + / -        zoom about the middle of the plan
  //   arrows       pan the plan, or nudge the selected room one grid step
  //   N E S W      while connecting with a room selected, pick that face
  //   A            add a room at the middle of the plan
  //   F2           rename the selected room
  function handlePlanKey(evt) {
    const k = evt.key.toLowerCase();
    const roomSelected = session.selection?.type === 'room';
    if (k === '+' || k === '=' || k === '-') {
      const r = plan.getBoundingClientRect();
      zoomPlanAt(r.width / 2, r.height / 2, k === '-' ? 0.9 : 1.1);
      render();
      return true;
    }
    const arrow = ARROW_STEPS[k];
    if (arrow) {
      evt.preventDefault();
      if (roomSelected) {
        session.nudgeRoom(session.selection.id, ...arrow);
      } else {
        view.offsetX -= arrow[0] * PAN_STEP;
        view.offsetY -= arrow[1] * PAN_STEP;
      }
      render();
      return true;
    }
    if (k === 'a' && !evt.shiftKey) {
      const r = plan.getBoundingClientRect();
      const x = (r.width / 2 - view.offsetX) / view.scale;
      const y = (r.height / 2 - view.offsetY) / view.scale;
      session.addRoomAt(snapTo(x, 0.5), snapTo(y, 0.5));
      render();
      return true;
    }
    if (evt.key === 'F2' && roomSelected) {
      evt.preventDefault();
      $('#room-label').focus();
      return true;
    }
    if (roomSelected && /^[nesw]$/.test(k) && session.tool === 'connect') {
      evt.preventDefault();
      session.pickFace(session.selection.id, k.toUpperCase());
      render();
      return true;
    }
    return false;
  }

  // Keyboard: Delete removes selection, Ctrl/Cmd-Z undo, Shift-redo, R rotate.
  window.addEventListener('keydown', (evt) => {
    // A dialog open on top of the game takes the keyboard: Tab stays inside it,
    // Escape closes it, and the game's shortcuts wait until it is closed.
    const dialog = !$('#complete').hidden ? $('#complete') : !$('#menu').hidden ? $('#menu') : null;
    if (dialog) {
      if (evt.key === 'Tab') { trapTab(evt, dialog); return; }
      if (evt.key === 'Escape') {
        evt.preventDefault();
        if (dialog.id === 'complete') closeComplete();
        else if (menuView === 'pause' || menuView === 'title') closeMenu();
        else showView(menuParent);
        render();
      }
      return;
    }
    if (evt.key === 'Tab' && !$('#keys-overlay').hidden) { trapTab(evt); return; }
    if (evt.target.matches('input, textarea, select')) return;
    const mod = evt.ctrlKey || evt.metaKey;
    if (viewMode === 'plan' && !mod && handlePlanKey(evt)) return;
    if (viewMode === 'model' && !mod && gl) {
      if (gl.key(evt.key.toLowerCase())) { evt.preventDefault(); return; }
    }
    if (evt.key === 'F3') { evt.preventDefault(); toggleDebugPanel(); return; }
    if (viewMode === 'model' && !mod && !gl) {
      const k = evt.key.toLowerCase();
      if (k === 'arrowleft' || k === 'arrowright') {
        evt.preventDefault();
        modelSpin = 0;
        modelAngle += k === 'arrowleft' ? -MODEL_TURN : MODEL_TURN;
        return;
      }
      if (k === 'f') {
        modelAngle = DEFAULT_ANGLE;
        modelSpin = 0;
        modelZoom = 1;
        return;
      }
      if (k === '+' || k === '=' || k === '-') {
        modelZoom = Math.min(3, Math.max(0.4, modelZoom * (k === '-' ? 0.9 : 1.1)));
        return;
      }
    }
    if (viewMode === 'first' && !mod) {
      const k = evt.key.toLowerCase();
      const fpKeys = { arrowleft: () => session.fpTurn('left'), q: () => session.fpTurn('left'),
        arrowright: () => session.fpTurn('right'), e: () => session.fpTurn('right'),
        arrowup: () => walkForward(), w: () => walkForward() };
      if (fpKeys[k]) {
        evt.preventDefault();
        session.fpStopPlay();
        fpKeys[k]();
        render();
        return;
      }
    }
    if (evt.key === '?') {
      evt.preventDefault();
      toggleKeys();
      return;
    }
    if (!mod && (evt.key === 'p' || evt.key === 'P') && session.routeHighlight) {
      setView('first');
      $('#fp-play').click();
      return;
    }
    if (!mod && viewMode === 'plan' && (evt.key === 'w' || evt.key === 'W')) {
      if (session.startWalk()) render();
      else { session.feedback = { kind: 'info', text: 'Pass a test first, then the route can be walked.' }; render(); }
      return;
    }
    if (!mod && (evt.key === 't' || evt.key === 'T')) {
      $('#test').click();
      return;
    }
    if (!mod && (evt.key === 'h' || evt.key === 'H')) {
      $('#hint').click();
      return;
    }
    if (evt.key === 'Escape' && (session.fpPlay || session.walk)) {
      session.fpStopPlay();
      session.stopWalk();
      session.feedback = { kind: 'info', text: 'Walk stopped.' };
      render();
      return;
    }
    if (evt.key === 'Escape' && !$('#keys-overlay').hidden) {
      toggleKeys(false);
      return;
    }
    if ((evt.key === '[' || evt.key === ']') && !mod && viewMode === 'plan') {
      session.selectRoomStep(evt.key === ']' ? 1 : -1);
      render();
      return;
    }
    if (evt.key.toLowerCase() === 'g' && !mod) {
      toggleSnap();
      return;
    }
    if (evt.key.toLowerCase() === 'f' && !mod && viewMode === 'plan') {
      if (session.selection?.type === 'room') centreOnRoom(session.selection.id);
      else fitPlan();
      return;
    }
    if (evt.key.toLowerCase() === 'o' && !mod) {
      session.cycleOneWay();
      render();
      return;
    }
    if (mod && evt.key.toLowerCase() === 'z') {
      evt.preventDefault();
      evt.shiftKey ? session.redo() : session.undo();
      render();
    } else if (mod && evt.key.toLowerCase() === 'y') {
      evt.preventDefault();
      session.redo();
      render();
    } else if (evt.key === 'Delete' || evt.key === 'Backspace') {
      session.deleteSelection();
      render();
    } else if (evt.key.toLowerCase() === 'r') {
      session.rotateSelectedPortal();
      render();
    } else if (evt.key.toLowerCase() === 'm') {
      session.mirrorSelectedPortal();
      render();
    } else if (evt.key === 'Escape') {
      // Escape first clears any half-finished action; with nothing to clear, it pauses.
      if (session.pendingFace || session.retarget || session.selection) {
        session.pendingFace = null;
        session.retarget = null;
        session.selection = null;
        render();
      } else {
        showMenu('pause');
      }
    }
  });

  // Refit whenever the stage changes size: a window resize, a rotation, a header
  // that wraps, or the controls being hidden. The window listener alone misses those.
  const refit = () => { fitView(); render(); };
  // Save the construction when the page is hidden or closed, not only every few seconds.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') render(); });
  window.addEventListener('pagehide', () => render());
  if (globalThis.ResizeObserver) new ResizeObserver(refit).observe($('.stage'));
  else window.addEventListener('resize', refit);
  function applyPanel(hidden) {
    document.body.classList.toggle('panel-hidden', hidden);
    $('#panel-toggle').textContent = hidden ? 'Show controls' : 'Hide controls';
    $('#panel-toggle').setAttribute('aria-expanded', String(!hidden));
    try { localStorage.setItem('ia-panel', hidden ? 'hidden' : 'shown'); } catch { /* not remembered */ }
  }
  $('#panel-toggle').addEventListener('click', () => applyPanel(!document.body.classList.contains('panel-hidden')));
  try { if (localStorage.getItem('ia-panel') === 'hidden') applyPanel(true); } catch { /* default: shown */ }

  // Speed and view are remembered between visits.
  try {
    const speed = Number(localStorage.getItem('ia-speed'));
    if ([0.5, 1, 2].includes(speed)) { walkSpeed = speed; $('#speed').value = String(speed); }
    const view = localStorage.getItem('ia-view');
    if (['plan', 'first', 'model'].includes(view) && view !== 'plan') { setView(view); }
  } catch { /* defaults */ }
  fitView();
  render();
  requestAnimationFrame(frame);
  showMenu('title');
  booted = true;
  window.__session = session; // exposed for manual inspection in devtools
  window.__ia = { showEnding, render, setView, gl }; // and for the end-to-end checks in tools/e2e.mjs
}

function populateChapters() {
  const sel = $('#chapter-select');
  sel.innerHTML = '';
  for (const d of DISCIPLINES) {
    const group = document.createElement('optgroup');
    group.label = `Chapter ${d.no} · ${d.title}`;
    for (const id of d.challenges) {
      const c = chapterById(id);
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.title;
      group.appendChild(o);
    }
    sel.appendChild(group);
  }
  const sb = document.createElement('option');
  sb.value = '__sandbox';
  sb.textContent = 'Free construction';
  sel.appendChild(sb);
}

function describeSelection(structure, sel, session) {
  if (!sel) {
    return session.pendingFace
      ? `Pending: ${session.pendingFace.room}.${session.pendingFace.face}`
      : 'Nothing selected.';
  }
  if (sel.type === 'room') {
    const r = structure.rooms.get(sel.id);
    if (!r) return 'Nothing selected.';
    const degree = structure.degree(sel.id);
    return `Room ${r.id}${r.label ? ` (${r.label})` : ''}\nplan position ${r.x}, ${r.y}\nportals attached: ${degree}`;
  }
  const p = structure.portals.get(sel.id);
  if (!p) return 'Nothing selected.';
  const oneWay = p.oneWay == null ? 'two-way'
    : `one way, from ${p.oneWay === 'a' ? `${p.a.room}.${p.a.face}` : `${p.b.room}.${p.b.face}`}`;
  return `Portal ${p.id}\n${p.a.room}.${p.a.face} ↔ ${p.b.room}.${p.b.face}\nquarter-turns: ${p.transform.turns}\nmirror: ${p.transform.mirror ? 'yes' : 'no'}\ndirection: ${oneWay}${p.fixed ? '\n(architecture: fixed)' : ''}`;
}

// Structural read-out for the inspector: what loops the construction contains
// and where the plan misleads about distance. Computed from the graph only.
function analysisText(session) {
  if (session.sandbox || !session.chapter) {
    const a = session.analysis();
    return summarise(a);
  }
  return summarise(session.analysis());
}

function summarise(a) {
  const lines = [];
  if (a.loops.length === 0) {
    lines.push(a.loopsComplete === false ? 'Loops: none found before the search stopped.' : 'Loops: none.');
  } else {
    lines.push(`Loops: ${a.loops.length}`);
    for (const l of a.loops.slice(0, 4)) {
      const kind = l.length === 1 ? 'self-loop' : `${l.length}-portal loop`;
      const twist = l.netTurns === 0 ? 'no net turn' : `net turn ${l.netTurns}/4`;
      const walk = !l.walkable ? ', cannot be walked round' : l.oneWayOnly ? ', walkable one way only' : '';
      lines.push(`  ${kind}: ${twist}${l.reflected ? ', reflected' : ''}${walk}`);
    }
    if (a.loops.length > 4) lines.push(`  …and ${a.loops.length - 4} more`);
    if (a.loopsComplete === false) {
      lines.push(a.loopsReason === 'limit' ? '  List capped; more loops may exist.' : '  Search stopped early; more loops may exist.');
    }
  }
  const contradictions = a.distances.filter((d) => d.contradictory);
  if (contradictions.length) {
    lines.push('Plan misleads:');
    for (const d of contradictions.slice(0, 3)) {
      lines.push(`  ${d.a} ↔ ${d.b}: ${Math.round(d.plan)} apart, ${d.steps} step`);
    }
  }
  return lines.join('\n');
}

// What a room's faces lead to, and the heading the traveller would arrive with.
function sightText(structure, roomId) {
  const lines = ['Sightlines'];
  for (const sl of sightlines(structure, roomId)) {
    if (sl.wall) {
      lines.push(`  ${sl.face}: wall`);
    } else {
      const gate = sl.gated ? ' (gated)' : '';
      lines.push(`  ${sl.face}: ${structure.rooms.get(sl.room).label || sl.room}, facing ${sl.arrival}${gate}`);
    }
  }
  return lines.join('\n');
}


// Time spent on a chapter, in whole minutes; under a minute reads as such.
function formatMinutes(ms) {
  if (ms < 60000) return 'under a minute';
  return `${Math.floor(ms / 60000)} min`;
}

// Local storage, or nothing where the browser blocks it.
function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem('ia-progress') ?? 'null');
  } catch {
    return null;
  }
}

// The construction in progress, saved with the manual-save format so the same
// reader can open it. A null chapter means free construction.
const WORK_KEY = 'ia-work';
const WORK_AT_KEY = 'ia-work-at';
let lastWork = null;

function persistWork() {
  const s = window.__session;
  if (!s) return;
  try {
    const text = encodeSave({ chapterId: s.sandbox ? null : s.chapter.id, structure: s.structure, progress: s.progress });
    if (text === lastWork) return;
    lastWork = text;
    localStorage.setItem(WORK_KEY, text);
    localStorage.setItem(WORK_AT_KEY, String(Date.now()));
  } catch { /* storage may be full or blocked */ }
}

// Puts back the construction that was in progress when the page last closed.
function restoreWork(session) {
  let data;
  try {
    const raw = localStorage.getItem(WORK_KEY);
    if (!raw) return;
    data = decodeSave(raw);
  } catch { return; }
  if (data.chapterId === null) {
    session.startSandbox();
    session.loadStructure(data.structure, null);
  } else if (data.chapterId === session.chapter?.id) {
    session.loadStructure(data.structure, data.chapterId);
  } else {
    return;
  }
  const at = Number(localStorage.getItem(WORK_AT_KEY));
  const when = Number.isFinite(at) && at > 0 ? ` from ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
  session.feedback = { kind: 'success', text: `Restored your last construction${when}.` };
}

function persistProgress() {
  try {
    localStorage.setItem('ia-progress', JSON.stringify({
      progress: window.__session?.progress,
      lastChapter: window.__session?.chapter?.id ?? null,
    }));
  } catch {
    // Storage may be unavailable (private mode). Progress still lives in memory.
  }
}

