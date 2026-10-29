// Drawing helpers shared by the plan, sightline and first-person renderers.

// Unit step for each compass face, in screen coordinates (y grows downwards).
export const FACE_DIR = Object.freeze({ N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] });

// A filled polygon. Points may be [x, y] pairs or { x, y } objects.
export function polygon(ctx, pts, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  tracePath(ctx, pts);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function strokeQuad(ctx, pts) {
  tracePath(ctx, pts);
  ctx.closePath();
  ctx.stroke();
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach((q, i) => {
    const [x, y] = Array.isArray(q) ? q : [q.x, q.y];
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
}

// Truncates a label with an ellipsis so it fits a fixed-width cell.
export function shorten(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// A soft darkening towards the edges of a view, so the eye settles on the middle.
export function vignette(ctx, width, height, strength = 0.45) {
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35,
    width / 2, height / 2, Math.max(width, height) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
