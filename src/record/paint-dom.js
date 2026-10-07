// Paints a page's HTML overlay (text, simple boxes, inline SVG) onto a 2D
// canvas so it can be recorded together with the WebGL scene. Styles are read
// live from getComputedStyle every frame, so CSS animations (opacity,
// transforms, clip-path, filters, moving gradients) look in the video the way
// they look on screen.
//
// Supported on purpose, not in general: text (also gradient text via
// background-clip: text), backgrounds with a solid color or a linear/radial
// gradient, border-radius, the first outer box-shadow, text-shadow, inset()
// clip-paths, CSS filters and inline <svg>. Mark anything that should stay out
// of the video with `data-record-ignore`.

const IGNORE = '[data-record-ignore]';
const FALLBACK_ASCENT = 0.8;
const FALLBACK_DESCENT = 0.2;

const range = document.createRange();
const tileCache = new WeakMap();
const svgCache = new WeakMap();

export function paintDom(ctx, roots, scale) {
  for (const root of roots) {
    if (!root) continue;
    const { matrix, opacity } = ancestorState(root.parentElement);
    paintNode(ctx, root, matrix, opacity, scale);
  }
}

// Linear part (no translation) of the accumulated transforms and the opacity
// of everything above the overlay root.
function ancestorState(el) {
  const chain = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.unshift(n);
  let matrix = new DOMMatrix();
  let opacity = 1;
  for (const n of chain) {
    const cs = getComputedStyle(n);
    matrix = matrix.multiply(linearPart(cs.transform));
    opacity *= parseFloat(cs.opacity);
  }
  return { matrix, opacity };
}

function linearPart(transform) {
  if (!transform || transform === 'none') return new DOMMatrix();
  const m = new DOMMatrix(transform);
  return new DOMMatrix([m.a, m.b, m.c, m.d, 0, 0]);
}

function paintNode(ctx, el, parentMatrix, parentOpacity, S) {
  if (el.matches(IGNORE)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return;
  const opacity = parentOpacity * parseFloat(cs.opacity);
  if (opacity < 0.002) return;
  const L = parentMatrix.multiply(linearPart(cs.transform));
  const isSvg = el instanceof SVGElement;

  if (cs.visibility !== 'hidden') paintOwn(ctx, el, cs, L, opacity, S, isSvg);
  if (!isSvg) for (const child of el.children) paintNode(ctx, child, L, opacity, S);
}

function paintOwn(ctx, el, cs, L, opacity, S, isSvg) {
  const det = L.a * L.d - L.b * L.c;
  if (Math.abs(det) < 1e-4) return;

  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const w = isSvg ? parseFloat(cs.width) || rect.width : el.offsetWidth;
  const h = isSvg ? parseFloat(cs.height) || rect.height : el.offsetHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const inv = L.inverse();
  const toLocal = (x, y) => {
    const p = inv.transformPoint({ x: x - cx, y: y - cy });
    return [p.x + w / 2, p.y + h / 2];
  };

  const textClip = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
  const hasText = !isSvg && [...el.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.data));
  const hasBox = !textClip && (!isTransparent(cs.backgroundColor) || cs.backgroundImage !== 'none');
  if (!hasText && !hasBox && !isSvg) return;

  ctx.save();
  ctx.setTransform(new DOMMatrix().scale(S).translate(cx, cy).multiply(L).translate(-w / 2, -h / 2));
  ctx.globalAlpha = Math.min(1, opacity);
  if (!applyClipPath(ctx, cs.clipPath, w, h)) {
    ctx.restore();
    return;
  }
  if (cs.filter && cs.filter !== 'none' && 'filter' in ctx) ctx.filter = scaleLengths(cs.filter, S);

  if (hasBox) paintBox(ctx, el, cs, w, h, S);
  if (isSvg) paintSvg(ctx, el, cs, w, h, S);
  if (hasText) {
    const fill = textClip ? backgroundFill(ctx, el, cs, w, h) : cs.color;
    if (fill) paintText(ctx, el, cs, fill, toLocal, S);
  }
  ctx.restore();
}

// ---------- Text ----------

function paintText(ctx, el, cs, fill, toLocal, S) {
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fill;
  const shadow = parseShadows(cs.textShadow)[0];
  if (shadow) setShadow(ctx, shadow, S);

  const size = parseFloat(cs.fontSize);
  const caseOf = textCase(cs.textTransform);

  // Each word is drawn centred on where the browser laid it out, so wrapping,
  // alignment and inline siblings all line up without re-doing layout.
  for (const node of el.childNodes) {
    if (node.nodeType !== 3) continue;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(node.data))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      const word = caseOf(m[0]);
      const tm = ctx.measureText(word);
      const ascent = tm.fontBoundingBoxAscent ?? size * FALLBACK_ASCENT;
      const descent = tm.fontBoundingBoxDescent ?? size * FALLBACK_DESCENT;
      const [x, y] = toLocal(r.left + r.width / 2, r.top + r.height / 2);
      ctx.fillText(word, x, y - (ascent + descent) / 2 + ascent);
    }
  }
}

function textCase(transform) {
  if (transform === 'uppercase') return (s) => s.toLocaleUpperCase();
  if (transform === 'lowercase') return (s) => s.toLocaleLowerCase();
  if (transform === 'capitalize') return (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
  return (s) => s;
}

// ---------- Boxes ----------

function paintBox(ctx, el, cs, w, h, S) {
  const radius = Math.min(lengthOf(cs.borderTopLeftRadius, Math.min(w, h)), w / 2, h / 2);
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(0, 0, w, h, radius);
  else ctx.rect(0, 0, w, h);

  const shadow = parseShadows(cs.boxShadow).find((s) => !s.inset);
  if (shadow) setShadow(ctx, shadow, S);
  if (!isTransparent(cs.backgroundColor)) {
    ctx.fillStyle = cs.backgroundColor;
    ctx.fill();
    clearShadow(ctx);
  }
  const fill = cs.backgroundImage !== 'none' && backgroundFill(ctx, el, cs, w, h);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  clearShadow(ctx);
}

// The first background-image layer as a repeating pattern positioned like the
// CSS background (size + animated position), in the element's local space.
function backgroundFill(ctx, el, cs, w, h) {
  const layer = splitTop(cs.backgroundImage)[0];
  const gradient = parseGradient(layer);
  if (!gradient) return null;

  // For a gradient, "auto" (or a missing height) simply means the box size.
  const [sw, sh] = cs.backgroundSize.split(',')[0].trim().split(/\s+/);
  const tw = sizeOf(sw, w);
  const th = sizeOf(sh, h);

  const key = `${layer}|${tw.toFixed(1)}|${th.toFixed(1)}`;
  let cached = tileCache.get(el);
  if (!cached || cached.key !== key) {
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(tw);
    tile.height = Math.ceil(th);
    const tctx = tile.getContext('2d');
    tctx.fillStyle = gradient.create(tctx, tw, th);
    tctx.fillRect(0, 0, tile.width, tile.height);
    cached = { key, tile };
    tileCache.set(el, cached);
  }

  const pattern = ctx.createPattern(cached.tile, 'repeat');
  const [px = '0%', py = '0%'] = cs.backgroundPosition.split(',')[0].trim().split(/\s+/);
  const ox = positionOf(px, w - tw);
  const oy = positionOf(py, h - th);
  pattern.setTransform?.(new DOMMatrix([tw / cached.tile.width, 0, 0, th / cached.tile.height, ox, oy]));
  return pattern;
}

// ---------- Inline SVG ----------

function paintSvg(ctx, el, cs, w, h, S) {
  const pxW = Math.max(1, Math.round(w * S * 2));
  const pxH = Math.max(1, Math.round(h * S * 2));
  const key = `${cs.color}|${pxW}x${pxH}`;
  let cached = svgCache.get(el);
  if (!cached || cached.key !== key) {
    const clone = el.cloneNode(true);
    clone.setAttribute('width', pxW);
    clone.setAttribute('height', pxH);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const markup = new XMLSerializer().serializeToString(clone).replaceAll('currentColor', cs.color);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    cached = { key, img };
    svgCache.set(el, cached);
  }
  if (cached.img.complete && cached.img.naturalWidth) ctx.drawImage(cached.img, 0, 0, w, h);
}

// ---------- Gradients ----------

function parseGradient(str) {
  const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(str?.trim() ?? '');
  if (!m) return null;
  const parts = splitTop(m[2]);
  return m[1] === 'linear' ? linearGradient(parts) : radialGradient(parts);
}

function linearGradient(parts) {
  let angle = Math.PI; // 180deg, top → bottom
  const first = parts[0].trim();
  const deg = /^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(first);
  if (deg) {
    const v = parseFloat(deg[1]);
    angle = { deg: (v * Math.PI) / 180, rad: v, turn: v * 2 * Math.PI, grad: (v * Math.PI) / 200 }[deg[2]];
    parts = parts.slice(1);
  } else if (first.startsWith('to ')) {
    const sides = first.slice(3).split(/\s+/);
    const x = sides.includes('right') ? 1 : sides.includes('left') ? -1 : 0;
    const y = sides.includes('top') ? 1 : sides.includes('bottom') ? -1 : 0;
    angle = Math.atan2(x, y);
    parts = parts.slice(1);
  }
  const stops = parseStops(parts);
  return {
    create(ctx, w, h) {
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const g = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
      for (const s of stops) g.addColorStop(s.pos, s.color);
      return g;
    },
  };
}

function radialGradient(parts) {
  let at = ['50%', '50%'];
  const first = parts[0].trim();
  if (/^(circle|ellipse|closest|farthest|at\s)/.test(first) || /\sat\s/.test(first)) {
    const pos = /\bat\s+(\S+)(?:\s+(\S+))?/.exec(first);
    if (pos) at = [pos[1], pos[2] ?? '50%'];
    parts = parts.slice(1);
  }
  const stops = parseStops(parts);
  return {
    create(ctx, w, h) {
      const x = positionOf(at[0], w);
      const y = positionOf(at[1], h);
      const r = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(r, 0.001));
      for (const s of stops) g.addColorStop(s.pos, s.color);
      return g;
    },
  };
}

function parseStops(parts) {
  const stops = parts.map((p) => {
    const m = /^(.*?)(?:\s+(-?[\d.]+)%)?$/s.exec(p.trim());
    return { color: m[1], pos: m[2] === undefined ? null : parseFloat(m[2]) / 100 };
  });
  if (stops.length && stops[0].pos === null) stops[0].pos = 0;
  if (stops.length && stops.at(-1).pos === null) stops.at(-1).pos = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].pos !== null) continue;
    let j = i;
    while (stops[j].pos === null) j++;
    const a = stops[i - 1].pos;
    const b = stops[j].pos;
    for (let k = i; k < j; k++) stops[k].pos = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  let last = 0;
  for (const s of stops) {
    s.pos = Math.min(1, Math.max(last, s.pos));
    last = s.pos;
  }
  return stops;
}

// ---------- Small CSS value helpers ----------

// Split on commas that are not inside parentheses.
function splitTop(str) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(str.slice(start, i));
      start = i + 1;
    }
  }
  out.push(str.slice(start));
  return out;
}

function sizeOf(v, ref) {
  return Math.max(1, !v || /^(auto|cover|contain)$/.test(v) ? ref : lengthOf(v, ref));
}

function lengthOf(v, ref) {
  if (!v) return 0;
  if (v.endsWith('%')) return (parseFloat(v) / 100) * ref;
  return parseFloat(v) || 0;
}

// Percentages are of `ref` (the free space for background-position, the box
// for a radial gradient's "at").
function positionOf(v, ref) {
  const keywords = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  v = keywords[v] ?? v;
  if (v.endsWith('%')) return (parseFloat(v) / 100) * ref;
  return parseFloat(v) || 0;
}

function isTransparent(color) {
  return !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);
}

function parseShadows(str) {
  if (!str || str === 'none') return [];
  return splitTop(str).map((part) => {
    const color = /(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b)/i.exec(part)?.[0] ?? 'rgba(0,0,0,0.5)';
    const nums = part.replace(color, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    return { color, x: nums[0] ?? 0, y: nums[1] ?? 0, blur: nums[2] ?? 0, inset: /\binset\b/.test(part) };
  });
}

// Shadow offsets/blur are in canvas pixels, unaffected by the transform.
function setShadow(ctx, s, S) {
  ctx.shadowColor = s.color;
  ctx.shadowOffsetX = s.x * S;
  ctx.shadowOffsetY = s.y * S;
  ctx.shadowBlur = s.blur * S;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function scaleLengths(str, S) {
  return str.replace(/(-?[\d.]+)px/g, (_, n) => `${parseFloat(n) * S}px`);
}

// Only inset() is supported. Returns false when the element is fully clipped.
function applyClipPath(ctx, clip, w, h) {
  if (!clip || clip === 'none') return true;
  const m = /^inset\(([^)]*)\)/.exec(clip);
  if (!m) return true;
  const v = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
  const [t, r = t, b = t, l = r] = v;
  const top = lengthOf(t, h);
  const right = lengthOf(r, w);
  const bottom = lengthOf(b, h);
  const left = lengthOf(l, w);
  const cw = w - left - right;
  const ch = h - top - bottom;
  if (cw <= 0 || ch <= 0) return false;
  ctx.beginPath();
  ctx.rect(left, top, cw, ch);
  ctx.clip();
  return true;
}
