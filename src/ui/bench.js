// Performance measurement. The numbers are only as good as the machine that produced them, so every
// report says which machine that was: in particular whether the "GPU" is a software renderer, in which
// case the frame times describe nothing about a phone. Nothing here pretends to measure thermal throttling
// from a short run: it reports how frame rate drifts over a sustained one, and leaves the reading to you.

// ---- pure statistics (tested) ------------------------------------------------------------------------

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

// Frame times in milliseconds -> the numbers a person can act on.
export function summarise(frameMs) {
  const times = frameMs.filter((t) => Number.isFinite(t) && t > 0);
  if (!times.length) return { frames: 0, avg: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, over33: 0, over50: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  return {
    frames: times.length,
    avg,
    fps: 1000 / avg,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    worst: sorted[sorted.length - 1],
    over33: times.filter((t) => t > 33.4).length / times.length, // fraction slower than 30 fps
    over50: times.filter((t) => t > 50).length / times.length,
  };
}

// Frame rate in consecutive windows of a sustained run (each window is `windowMs` of wall time).
export function windows(frameMs, windowMs = 10000) {
  const out = [];
  let t = 0; let n = 0; let sum = 0;
  for (const f of frameMs) {
    if (!(f > 0)) continue;
    t += f; n++; sum += f;
    if (t >= windowMs) { out.push({ fps: (1000 * n) / sum, frames: n }); t = 0; n = 0; sum = 0; }
  }
  if (n > 10) out.push({ fps: (1000 * n) / sum, frames: n });
  return out;
}

// How far the frame rate fell from the first window to the last, as a fraction (0.2 = lost a fifth).
export function drift(frameMs, windowMs = 10000) {
  const w = windows(frameMs, windowMs);
  if (w.length < 2) return { windows: w, lost: 0, enough: false };
  const first = w[0].fps; const last = w[w.length - 1].fps;
  return { windows: w, lost: Math.max(0, (first - last) / first), enough: true };
}

// Whether a renderer string names a software rasteriser.
export function isSoftwareRenderer(name = '') {
  return /swiftshader|llvmpipe|software|softpipe|basic render|microsoft basic/i.test(name);
}

// A starting preset for a device, from what it admits about itself. The game still adapts from there.
export function recommendPreset({ renderer = '', mobile = false, memoryGB = null, cores = null, dpr = 1 } = {}) {
  if (isSoftwareRenderer(renderer)) return 'low';
  if (/mali-4|mali-t|adreno \(tm\) (3|4)\d\d|powervr/i.test(renderer)) return 'low';
  if (mobile) {
    if ((memoryGB !== null && memoryGB <= 3) || (cores !== null && cores <= 4)) return 'low';
    return 'medium';
  }
  if ((memoryGB !== null && memoryGB < 4) || dpr > 2.5) return 'medium';
  return 'high';
}

// What a preset costs, judged from measured frame times: the action to take, in plain words.
export function verdict(s) {
  if (!s.frames) return 'no frames';
  if (s.p95 <= 18) return 'smooth (60 fps)';
  if (s.p95 <= 34) return 'playable (30 to 60 fps)';
  if (s.p95 <= 50) return 'choppy: use a lower preset';
  return 'too slow: use a lower preset';
}

export function formatReport(r) {
  const lines = [];
  lines.push('Impossible Architecture performance report');
  lines.push(`when: ${r.when}`);
  lines.push(`device: ${r.device.userAgent}`);
  lines.push(`screen: ${r.device.screen} @ ${r.device.dpr}x, ${r.device.cores ?? '?'} cores, ${r.device.memoryGB ?? '?'} GB reported`);
  lines.push(`gpu: ${r.device.renderer}${r.device.software ? '   <-- SOFTWARE RENDERER: these frame times say nothing about a phone' : ''}`);
  lines.push(`webgl: ${r.device.webgl}, max texture ${r.device.maxTexture}, timer query ${r.device.timerQuery ? 'yes' : 'no'}`);
  lines.push(`recommended preset: ${r.recommended}`);
  lines.push('');
  for (const p of r.presets) {
    const s = p.summary;
    lines.push(`${p.name.padEnd(7)} ${s.fps.toFixed(1)} fps avg · p50 ${s.p50.toFixed(1)} · p95 ${s.p95.toFixed(1)} · p99 ${s.p99.toFixed(1)} · worst ${s.worst.toFixed(0)} ms · ${(s.over33 * 100).toFixed(0)}% under 30 fps · ${verdict(s)}`);
    lines.push(`        draw calls ${p.draws} · triangles ${p.triangles} · passes ${p.passes} · scissor saved ${p.scissorSaved}% · geometries ${p.memory.geometries} · textures ${p.memory.textures}${p.heapMB != null ? ` · JS heap ${p.heapMB.toFixed(0)} MB` : ''}`);
  }
  if (r.sustained) {
    const d = r.sustained;
    lines.push('');
    lines.push(`sustained ${d.seconds}s at ${d.preset}: ${d.windows.map((w) => w.fps.toFixed(1)).join(' → ')} fps${d.enough ? `, lost ${(d.lost * 100).toFixed(0)}%${d.lost > 0.15 ? ' (a drop like this on a phone usually means thermal throttling)' : ''}` : ' (too short to judge drift)'}`);
  }
  if (r.touch) {
    lines.push('');
    lines.push(r.touch.samples ? `touch latency (input to next frame): median ${r.touch.p50.toFixed(0)} ms, p95 ${r.touch.p95.toFixed(0)} ms over ${r.touch.samples} events` : 'touch latency: no touch events were made during the test');
  }
  return lines.join('\n');
}

// ---- browser side ---------------------------------------------------------------------------------------

export function deviceInfo(canvas) {
  const nav = globalThis.navigator ?? {};
  let renderer = 'unknown'; let webgl = 'none'; let maxTexture = 0; let timerQuery = false;
  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      webgl = gl instanceof globalThis.WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      timerQuery = !!(gl.getExtension('EXT_disjoint_timer_query_webgl2') || gl.getExtension('EXT_disjoint_timer_query'));
    }
  } catch { /* leave unknown */ }
  const mobile = /android|iphone|ipad|mobile/i.test(nav.userAgent ?? '') || (nav.maxTouchPoints ?? 0) > 1;
  return {
    userAgent: nav.userAgent ?? 'unknown',
    screen: `${globalThis.screen?.width ?? '?'}x${globalThis.screen?.height ?? '?'}`,
    dpr: globalThis.devicePixelRatio ?? 1,
    cores: nav.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null,
    renderer, webgl, maxTexture, timerQuery, mobile,
    software: isSoftwareRenderer(renderer),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Measures `ms` of real frames (whatever the game is painting) and returns the frame times.
function collect(ms) {
  return new Promise((resolve) => {
    const times = [];
    let last = null;
    const t0 = performance.now();
    const tick = (now) => {
      if (last !== null) times.push(now - last);
      last = now;
      if (now - t0 < ms) requestAnimationFrame(tick); else resolve(times);
    };
    requestAnimationFrame(tick);
  });
}

// Runs the benchmark against the live game. `gl` is the glview, `session` the Session. The walk view must
// be showing. Returns the report object; `formatReport` makes it text.
export async function runBenchmark({ gl, canvas, seconds = 5, sustained = 0, touch = 0, onProgress = () => {} }) {
  const device = deviceInfo(document.createElement('canvas'));
  const report = { when: new Date().toISOString(), device, recommended: recommendPreset({ renderer: device.renderer, mobile: device.mobile, memoryGB: device.memoryGB, cores: device.cores, dpr: device.dpr }), presets: [], sustained: null, touch: null };
  const world = gl.world;
  const original = world.quality;
  gl.startBench?.();
  gl.setAdaptive?.(false); // a benchmark must not change presets under its own feet
  for (const name of ['low', 'medium', 'high']) {
    onProgress(`Measuring ${name}…`);
    gl.setQuality(name);
    gl.setResolutionScale?.(1);
    await wait(700); // let render targets and shaders settle
    const times = await collect(seconds * 1000);
    const info = world.renderer.info;
    report.presets.push({
      name,
      summary: summarise(times),
      draws: world.stats.drawCalls, triangles: world.stats.triangles, passes: world.stats.passes,
      scissorSaved: Math.round(((world.stats.areaSaved ?? 0) / Math.max(1, world.stats.scissored ?? 0)) * 100),
      memory: { geometries: info.memory.geometries, textures: info.memory.textures },
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    });
  }
  if (sustained > 0) {
    const pick = report.presets.find((p) => p.name === report.recommended) ?? report.presets[1];
    gl.setQuality(pick.name);
    onProgress(`Sustained run at ${pick.name}: ${sustained}s…`);
    const times = await collect(sustained * 1000);
    report.sustained = { preset: pick.name, seconds: sustained, ...drift(times, Math.max(2000, (sustained * 1000) / 6)) };
  }
  if (touch > 0) {
    onProgress(`Drag on the picture for ${touch}s…`);
    const lat = [];
    const onMove = (e) => requestAnimationFrame((now) => lat.push(now - e.timeStamp));
    canvas.addEventListener('pointermove', onMove);
    await wait(touch * 1000);
    canvas.removeEventListener('pointermove', onMove);
    const sorted = lat.filter((x) => x >= 0 && x < 1000).sort((a, b) => a - b);
    report.touch = { samples: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
  }
  gl.stopBench?.();
  gl.setQuality(original);
  gl.setAdaptive?.(true);
  return report;
}
