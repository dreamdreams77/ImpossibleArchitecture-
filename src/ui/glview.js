// The WebGL view: one canvas that is either the traveller's walk or the
// architect's model. It reads the Session and never writes the structure; clicks
// are handed back to the app as intents (turn, walk, select a room).

import { WorldRenderer, webglAvailable, DOOR_COLORS } from '../render3d/world.js';
import { Walker } from '../render3d/walker.js';
import { halfWidth } from '../render3d/frames.js';
import { rulesFor } from '../campaign/chapters.js';
import { fpZoneFor } from '../render/firstperson.js';
import { connect } from '../topology/construction.js';
import { createPinch } from './pinch.js';

const QUALITY_ORDER = ['high', 'medium', 'low'];

export function glSupported() {
  return typeof document !== 'undefined' && webglAvailable();
}

// Creates the view, or returns null where WebGL is unavailable (the app then keeps its 2D views).
export function createGlView({ canvas, session, hud, debugEl, onWalkClick, onSelectRoom, onPickFace, onLost, onRestored, settings = {} }) {
  if (!glSupported()) return null;
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  let quality = params.get('quality') ?? settings.quality ?? 'high';
  const autoQuality = !params.has('quality') && (settings.quality ?? 'auto') === 'auto';
  if (quality === 'auto') quality = 'high';
  let world;
  try {
    world = new WorldRenderer(canvas, { quality, debug: params.has('debug') });
  } catch (err) {
    console.warn('WebGL view unavailable:', err);
    return null;
  }
  const walker = new Walker();
  walker.reduceMotion = !!settings.reduceMotion;
  const orbit = { azimuth: 0.62, elevation: 0.86, distance: 70, target: [0, 0, 0] };
  let mode = 'first';
  let visible = false;
  let lastStructure = null;
  let lastChapter = null;
  let lastTheme = null;
  let stateKey = '';
  let hudKey = '';
  let fit = true;
  let drag = null;
  let flash = 0;
  let autoOrbit = false;
  let frameMs = 16;
  let slow = 0;
  let debugOn = world.debug;
  const pinch = createPinch();
  let lost = false;
  // A lost context cannot draw. Say so, let the app fall back to the 2D views, and
  // rebuild the renderer's GPU resources if the browser gives the context back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; hud && (hud.hidden = true); onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => { world.recover(); lastStructure = null; lost = false; onRestored?.(); });

  function halfOf(id) {
    return halfWidth(session.structure.rooms.get(id)?.size ?? 1);
  }

  function context() {
    const chapter = session.chapter;
    const rules = chapter ? rulesFor(chapter) : { plates: [], cargo: [], pads: [] };
    return { sealed: session.ruleset?.sealedFaces ?? [], chapterId: chapter?.id ?? null, discipline: chapter?.discipline ?? null, themeName: session.themeName, plates: rules.plates, cargo: rules.cargo, pads: rules.pads };
  }

  function routePortals() {
    const set = new Set();
    const route = session.routeHighlight;
    const chapter = session.chapter ?? session.challengeAsChapter?.();
    if (!route || !chapter) return set;
    let room = chapter.start;
    for (const face of route.faces) {
      const exit = session.structure.exit(room, face);
      if (!exit) break;
      set.add(exit.portalId);
      room = exit.room;
    }
    return set;
  }

  function ensureSynced() {
    const chapterId = session.chapter?.id ?? null;
    if (session.structure !== lastStructure || chapterId !== lastChapter || session.themeName !== lastTheme) {
      lastStructure = session.structure;
      lastChapter = chapterId;
      lastTheme = session.themeName;
      world.sync(session.structure, context());
      stateKey = '';
      fit = true;
    }
    const walkerState = session.fpEnsure();
    const crates = session.cratePositions();
    const route = routePortals();
    const key = `${walkerState?.lit ?? 0}|${walkerState?.delivered ?? 0}|${JSON.stringify(crates)}|${[...route].join(',')}`;
    if (key !== stateKey) {
      stateKey = key;
      world.setState({ lit: walkerState?.lit ?? 0, delivered: walkerState?.delivered ?? 0, crates, routePortals: route });
    }
    world.setSelection(session.selection?.type === 'room' ? session.selection.id : null);
    if (mode === 'model') world.setMarkerState(session.pendingFace, world.markerState.hover);
    return walkerState;
  }

  function fitOrbit() {
    world.setLayout('plan');
    const box = world.extent();
    if (box.isEmpty()) return;
    const c = box.getCenter(new box.min.constructor());
    const s = box.getSize(new box.min.constructor());
    orbit.target = [c.x, 0, c.z];
    orbit.distance = Math.max(34, Math.max(s.x, s.z) * 0.95 + 10);
    fit = false;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    world.setSize(Math.floor(r.width), Math.floor(r.height), globalThis.devicePixelRatio || 1);
  }

  function setMode(next) {
    mode = next;
    fit = true;
    hudKey = '';
  }

  function setVisible(v) {
    visible = v;
    canvas.hidden = !v;
    if (v) {
      resize();
      lastStructure = null; // resync on show: the structure may have changed in the plan
    }
  }

  // ---- HUD ----------------------------------------------------------------

  const LEGEND = [
    [DOOR_COLORS.plain, 'two-way'],
    [DOOR_COLORS.oneWay, 'one-way'],
    [DOOR_COLORS.mirror, 'mirrors'],
    [DOOR_COLORS.twist, 'turns you'],
    [DOOR_COLORS.gate, 'shut'],
  ];

  function updateHud(walkerState) {
    if (!hud) return;
    const room = walkerState && session.structure.rooms.get(walkerState.room);
    const key = `${mode}|${previewNote}|${session.pendingFace?.room}${session.pendingFace?.face}|${walkerState?.room}|${walkerState?.heading}|${room?.label}|${walkerState?.carry}`;
    if (key === hudKey) return;
    hudKey = key;
    const chips = LEGEND.map(([c, t]) => `<span class="chip"><i style="background:${c}"></i>${t}</span>`).join('');
    if (mode === 'first') {
      hud.innerHTML = `<div class="gl-place"><strong>${esc(room?.label || walkerState?.room || '')}</strong><span>facing ${walkerState?.heading ?? ''}</span>${walkerState?.carry >= 0 ? `<span class="carry">carrying crate ${walkerState.carry + 1}</span>` : ''}</div>`
        + `<div class="gl-legend">${chips}</div>`
        + '<div class="gl-hint">drag to look · arrows or click the edges to turn · up or click the middle to walk</div>';
    } else {
      hud.innerHTML = '<div class="gl-place"><strong>Architect’s model</strong><span>rooms at their plan positions · arcs are the real connections</span></div>'
        + `<div class="gl-legend">${chips}</div>`
        + `<div class="gl-hint">${previewNote ? `<strong>${esc(previewNote)}</strong> · ` : ''}click a doorway ring, then another, to join them · drag to orbit · wheel to zoom · click a room to select it</div>`;
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---- frame ----------------------------------------------------------------

  let lastNow = null;
  function paint(now) {
    if (!visible) return;
    const dt = lastNow === null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const t = now / 1000;
    const walkerState = ensureSynced();
    if (canvas.width < 2) resize();
    walker.speed = 6.5 * (settings.speed?.() ?? 1);
    if (mode === 'first') {
      if (!walker.room || !session.structure.rooms.has(walker.room)) walker.key = null;
      walker.sync(session.structure, walkerState, halfOf);
      for (const ev of walker.update(dt)) {
        if (ev.type === 'cross' && (ev.mirror || ev.turns)) flash = 1;
      }
      world.state.flash = flash;
      flash = Math.max(0, flash - dt * 2.4);
      if (walker.room) world.renderWalk(walker.pose(), t);
    } else {
      if (fit) fitOrbit();
      if (autoOrbit) { orbit.azimuth += dt * 0.12; orbit.elevation += (0.62 - orbit.elevation) * Math.min(1, dt * 0.8); }
      world.renderOverview(orbit, t);
    }
    updateHud(walkerState);
    // Adapt: if frames are slow for a sustained spell, step the quality down once.
    frameMs += (dt * 1000 - frameMs) * 0.05;
    if (autoQuality && dt > 0) {
      slow = frameMs > 42 ? slow + 1 : Math.max(0, slow - 2);
      const i = QUALITY_ORDER.indexOf(world.quality);
      if (slow > 120 && i < QUALITY_ORDER.length - 1) {
        world.setQuality(QUALITY_ORDER[i + 1]);
        slow = 0;
      }
    }
  }

  // ---- input ----------------------------------------------------------------

  canvas.addEventListener('pointerdown', (evt) => {
    if (pinch.down(evt.pointerId, evt.clientX, evt.clientY)) { drag = null; return; }
    drag = { id: evt.pointerId, x: evt.clientX, y: evt.clientY, sx: evt.clientX, sy: evt.clientY, moved: false };
    canvas.setPointerCapture?.(evt.pointerId);
    walker.dragging = true;
  });
  // Model view: hovering a free face while another is picked previews the join, with
  // the engine's own verdict. Nothing is built until the second click.
  let previewKey = '';
  function updateHover(evt) {
    const r = canvas.getBoundingClientRect();
    const hit = world.pickMarker(((evt.clientX - r.left) / r.width) * 2 - 1, -(((evt.clientY - r.top) / r.height) * 2 - 1));
    const pending = session.pendingFace;
    world.setMarkerState(pending, hit);
    canvas.style.cursor = hit ? 'pointer' : '';
    let key = '';
    let note = '';
    if (pending && hit && !(hit.room === pending.room && hit.face === pending.face)) {
      const res = connect(session.structure, { a: pending.room, aFace: pending.face, b: hit.room, bFace: hit.face }, session.ruleset);
      const ok = !res.error;
      key = `${pending.room}${pending.face}${hit.room}${hit.face}${ok}`;
      note = ok ? 'Click to join these faces.' : (res.violations?.[0]?.message ?? res.message ?? 'That cannot be built.');
      if (key !== previewKey) world.setPreview(pending, hit, ok);
    } else if (previewKey) world.setPreview(null, null);
    previewKey = key;
    if (previewNote !== note) { previewNote = note; hudKey = ''; }
  }
  let previewNote = '';
  canvas.addEventListener('pointermove', (evt) => {
    if (mode === 'model' && !drag?.moved) updateHover(evt);
    const pz = pinch.move(evt.pointerId, evt.clientX, evt.clientY);
    if (pz && mode === 'model') { orbit.distance = clamp(orbit.distance / pz.factor, 14, 320); return; }
    if (pinch.active() || !drag || drag.id !== evt.pointerId) return;
    if (Math.hypot(evt.clientX - drag.sx, evt.clientY - drag.sy) > 5) drag.moved = true;
    const dx = evt.clientX - drag.x;
    const dy = evt.clientY - drag.y;
    drag.x = evt.clientX;
    drag.y = evt.clientY;
    if (!drag.moved) return;
    if (mode === 'first') walker.look(dx * 0.005, dy * 0.0035);
    else {
      orbit.azimuth -= dx * 0.006;
      orbit.elevation = clamp(orbit.elevation + dy * 0.005, 0.12, 1.5);
    }
  });
  const end = (evt) => {
    pinch.up(evt.pointerId);
    walker.dragging = false;
    if (drag?.id === evt.pointerId && !drag.moved && evt.type === 'pointerup') {
      const r = canvas.getBoundingClientRect();
      if (mode === 'first') onWalkClick?.(fpZoneFor(evt.clientX - r.left, r.width));
      else {
        const face = world.pickMarker(((evt.clientX - r.left) / r.width) * 2 - 1, -(((evt.clientY - r.top) / r.height) * 2 - 1));
        if (face) { onPickFace?.(face.room, face.face); previewKey = ''; world.setPreview(null, null); drag = null; return; }
        const id = world.pickRoom(((evt.clientX - r.left) / r.width) * 2 - 1, -(((evt.clientY - r.top) / r.height) * 2 - 1));
        onSelectRoom?.(id);
      }
    }
    if (drag?.id === evt.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (evt) => {
    if (mode !== 'model') return;
    evt.preventDefault();
    orbit.distance = clamp(orbit.distance * (evt.deltaY > 0 ? 1.1 : 0.9), 14, 320);
  }, { passive: false });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (visible) resize(); }).observe(canvas);

  return {
    world,
    walker,
    get mode() { return mode; },
    get lost() { return lost; },
    setMode,
    setVisible,
    resize,
    paint,
    // Keys for the model view: returns true when the key was used.
    key(k) {
      if (mode !== 'model') return false;
      if (k === 'arrowleft') orbit.azimuth -= 0.15;
      else if (k === 'arrowright') orbit.azimuth += 0.15;
      else if (k === 'arrowup') orbit.elevation = clamp(orbit.elevation + 0.08, 0.12, 1.5);
      else if (k === 'arrowdown') orbit.elevation = clamp(orbit.elevation - 0.08, 0.12, 1.5);
      else if (k === '+' || k === '=') orbit.distance = clamp(orbit.distance * 0.9, 14, 320);
      else if (k === '-') orbit.distance = clamp(orbit.distance * 1.1, 14, 320);
      else if (k === 'f') { orbit.azimuth = 0.62; orbit.elevation = 0.86; fit = true; }
      else return false;
      return true;
    },
    setAutoOrbit(on) { autoOrbit = !!on; if (on) { fit = true; world.cutaway = true; } },
    get cutaway() { return world.cutaway; },
    setCutaway(on) { world.cutaway = !!on; },
    setCutHeight(y) { world.cutY = y; },
    setQuality(q) { world.setQuality(q); },
    // Debug tint: passes are coloured by recursion depth so the portal budget is visible.
    setDebug(on) {
      debugOn = !!on;
      world.debug = debugOn;
    },
    bump(heading) { walker.bump(heading); },
    // Renders a frame and hands back the canvas as a PNG blob in the same task.
    capture(cb) {
      paint(performance.now());
      canvas.toBlob(cb, 'image/png');
    },
    get walkerBusy() { return walker.busy; },
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
