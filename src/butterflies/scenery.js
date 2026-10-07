import * as THREE from 'three';

// Everything around the butterflies, laid out like an album cover: a charcoal
// backdrop, a wreath of watercolour swirl-clouds, a golden folding fan rising
// from the bottom edge and tropical leaves with peach flowers peeking out
// from behind it.

// Watercolour palettes: [wash, line, highlight].
const INKS = {
  cream: ['#e8d7b0', '#8f6f45', '#fff7e2'],
  lavender: ['#8e94c4', '#454a7c', '#e1e3f8'],
  terracotta: ['#bf6c4a', '#6a2c1c', '#f3c5a8'],
  rose: ['#d2a192', '#7a463c', '#f7e0d5'],
  ochre: ['#d0a55a', '#77531f', '#f8e4b3'],
};
// Order around the wreath, starting at the top and going anticlockwise.
const WREATH = [
  'lavender', 'cream', 'rose', 'ochre', 'cream', 'terracotta',
  'lavender', 'rose', 'terracotta', 'cream', 'ochre',
];

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// ---------- Backdrop ----------

const backdropVertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const backdropFragment = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform vec2 uCenter; // ring centre, pixels
  uniform float uRadius; // ring radius, pixels
  uniform float uTime;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec2 px = gl_FragCoord.xy;
    vec2 p = px / uRes.y;
    float d = length(px - uCenter) / max(uRadius, 1.0);

    vec3 dark = lin(vec3(0.085, 0.085, 0.095));
    vec3 mid = lin(vec3(0.24, 0.235, 0.245));
    vec3 col = mix(mid, dark, smoothstep(0.2, 1.9, d));

    // Paper / ink-wash mottling, drifting very slowly.
    float n = fbm(p * 3.0 + vec2(uTime * 0.01, -uTime * 0.007));
    col *= 0.9 + 0.2 * n;
    // Faint warm light from the top.
    col += lin(vec3(0.2, 0.17, 0.13)) * 0.25 * smoothstep(0.4, 1.0, px.y / uRes.y) * (1.0 - smoothstep(0.0, 1.6, d));

    float vig = smoothstep(1.45, 0.3, length((px / uRes - 0.5) * vec2(1.0, 1.1)));
    col *= mix(0.55, 1.0, vig);
    col += (hash(px + fract(uTime) * 61.0) - 0.5) * 0.008;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    vertexShader: backdropVertex,
    fragmentShader: backdropFragment,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 1 },
      uTime: { value: 0 },
    },
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------- Canvas helpers ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const canBlur = 'filter' in CanvasRenderingContext2D.prototype;

// A tapered stroke along a list of points: width goes w0 → w1.
function taper(ctx, pts, w0, w1, color, alpha = 1) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function spiral(cx, cy, r0, r1, turns, a0, dir = 1, steps = 120) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const a = a0 + dir * k * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * k;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ---------- Watercolour swirl-cloud ----------
// A long body that swells from a wispy tail (left) to a rolled curl (right),
// washed in soft colour with brush-line details.
function drawSwirl(ink, seed) {
  const [wash, line, light] = INKS[ink];
  const W = 1024;
  const H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  const rand = rng(seed * 7919 + 13);

  const N = 90;
  const amp = 50 + rand() * 40;
  const ph = rand() * Math.PI * 2;
  const spine = [];
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    spine.push({
      x: 50 + k * 640,
      y: 270 + Math.sin(k * Math.PI * 1.4 + ph) * amp * (1 - k * 0.7),
      r: 4 + Math.pow(k, 1.5) * (82 + rand() * 4),
    });
  }
  const head = spine[N - 1];
  const hx = head.x + 40;
  const hy = head.y - 10;
  const hr = 118;

  const body = new Path2D();
  for (const s of spine) {
    body.moveTo(s.x + s.r, s.y);
    body.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  }
  body.moveTo(hx + hr, hy);
  body.arc(hx, hy, hr, 0, Math.PI * 2);

  // Wash: a blurred bleed, then the body, then a lighter top light.
  ctx.save();
  if (canBlur) ctx.filter = 'blur(10px)';
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = wash;
  ctx.fill(body);
  ctx.restore();

  const g = ctx.createLinearGradient(40, 0, hx + hr, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.18, wash);
  g.addColorStop(1, wash);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.clip(body);
  if (canBlur) ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = light;
  for (const s of spine.filter((_, i) => i % 6 === 0)) {
    ctx.beginPath();
    ctx.arc(s.x, s.y - s.r * 0.45, s.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(hx - 20, hy - 40, hr * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Pigment pooling along the underside.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = line;
  for (const s of spine.filter((_, i) => i % 5 === 0)) {
    ctx.beginPath();
    ctx.arc(s.x, s.y + s.r * 0.8, s.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Grain.
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = line;
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = 0.05 + rand() * 0.07;
    ctx.fillRect(rand() * W, rand() * H, 1.5 + rand() * 2, 1.5 + rand() * 2);
  }
  ctx.restore();

  // The rolled curl at the head: a light band and two ink lines.
  taper(ctx, spiral(hx, hy, hr * 0.9, hr * 0.08, 1.8, -Math.PI * 0.4, -1), 20, 4, light, 0.5);
  taper(ctx, spiral(hx, hy, hr * 0.78, hr * 0.06, 1.75, -Math.PI * 0.42, -1), 5, 2, line, 0.85);
  taper(ctx, spiral(hx, hy, hr * 1.0, hr * 0.5, 0.7, -Math.PI * 0.35, -1), 4, 1.5, line, 0.6);

  // A smaller curl rising off the back.
  const mid = spine[Math.floor(N * 0.62)];
  const sx = mid.x - 10;
  const sy = mid.y - mid.r * 0.7;
  taper(ctx, spiral(sx, sy, 38, 4, 1.4, Math.PI * 0.6, -1), 14, 3, light, 0.7);
  taper(ctx, spiral(sx, sy, 32, 3, 1.4, Math.PI * 0.6, -1), 3.5, 1.5, line, 0.8);

  // Brush lines following the body.
  for (const off of [-0.45, 0.05, 0.5]) {
    const pts = spine.slice(Math.floor(N * 0.25), N - 4).map((s) => [s.x, s.y + s.r * off]);
    taper(ctx, pts, 1.2, 3.2, off < 0 ? light : line, off < 0 ? 0.8 : 0.55);
  }

  // Wispy tail strands.
  for (let j = 0; j < 3; j++) {
    const pts = [];
    const dy = (j - 1) * 14;
    for (let i = 0; i < 30; i++) {
      const k = i / 29;
      pts.push([60 + k * 260, 270 + dy + Math.sin(k * 5 + ph + j) * 12 + Math.sin(ph) * amp * (1 - k) * 0.6]);
    }
    taper(ctx, pts, 0.8, 3, j === 1 ? line : wash, 0.6);
  }
  return canvas;
}

// ---------- Folding fan ----------

const fanVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fanFragment = /* glsl */ `
  uniform float uOpen;
  uniform float uTime;
  varying vec2 vPos;
  const float PI = 3.14159265;
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    float r = length(vPos);
    float th = atan(vPos.y, vPos.x);
    float span = max(uOpen * PI, 0.001);
    // Opens from the right-hand guard stick anticlockwise.
    if (th < 0.0 || th > span || r > 1.0) discard;
    float u = th / span;

    vec3 light = lin(vec3(0.96, 0.8, 0.47));
    vec3 midc = lin(vec3(0.83, 0.62, 0.27));
    vec3 deep = lin(vec3(0.52, 0.34, 0.12));
    vec3 brown = lin(vec3(0.28, 0.16, 0.06));

    float folds = 26.0;
    float f = fract(u * folds);
    float face = step(0.5, f);
    float pleat = 1.0 - abs(f - 0.5) * 2.0;

    vec3 col = mix(midc, light, smoothstep(0.3, 0.98, r));
    col *= mix(0.8, 1.06, face * 0.65 + pleat * 0.35);
    // Fine paper lines and crease shadows.
    col *= 0.95 + 0.05 * sin(u * folds * 40.0);
    col *= 1.0 - 0.3 * smoothstep(0.05, 0.0, min(f, 1.0 - f));

    // Rim band.
    col = mix(col, deep, smoothstep(0.952, 0.962, r));
    col += light * 0.5 * smoothstep(0.01, 0.0, abs(r - 0.952));

    // Inner ribs and hub.
    float inner = 1.0 - smoothstep(0.27, 0.29, r);
    vec3 ribs = mix(brown, deep, 0.5 + 0.5 * cos(u * folds * 6.2831853));
    col = mix(col, ribs, inner);
    col += light * 0.35 * smoothstep(0.008, 0.0, abs(r - 0.28));
    col = mix(col, light * 1.1, 1.0 - smoothstep(0.055, 0.065, r));

    // Guard sticks at both edges.
    float edge = min(th, span - th) * r;
    col = mix(col, deep, smoothstep(0.012, 0.004, edge));

    // A slow sheen sweeping across the leaf.
    float sweep = exp(-pow((u - (fract(uTime * 0.07) * 1.8 - 0.4)) / 0.07, 2.0));
    col += light * sweep * 0.3 * smoothstep(0.3, 0.6, r);

    float alpha = 1.0 - smoothstep(0.994, 1.0, r);
    gl_FragColor = vec4(col, alpha);
  }
`;

function createFan() {
  const material = new THREE.ShaderMaterial({
    vertexShader: fanVertex,
    fragmentShader: fanFragment,
    uniforms: { uOpen: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 180, 0, Math.PI), material);
  mesh.renderOrder = 3;
  return mesh;
}

// ---------- Foliage corner (bottom-left; mirrored for the right) ----------

function broadLeaf(ctx, x, y, angle, len, width, tone) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(len * 0.18, -width, len * 0.72, -width * 0.95, len, 0);
  p.bezierCurveTo(len * 0.72, width * 0.95, len * 0.18, width, 0, 0);
  const g = ctx.createLinearGradient(0, -width, len, width);
  g.addColorStop(0, tone[0]);
  g.addColorStop(0.55, tone[1]);
  g.addColorStop(1, tone[2]);
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  const shade = ctx.createLinearGradient(0, -width, 0, width);
  shade.addColorStop(0, 'rgba(255,255,230,0.18)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,20,0,0.3)');
  ctx.fillStyle = shade;
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(214, 236, 170, 0.45)';
  ctx.lineWidth = 3;
  for (let k = 1; k <= 7; k++) {
    const t = k / 8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(len * t * 0.9, 0);
      ctx.quadraticCurveTo(len * (t * 0.9 + 0.08), s * width * 0.4, len * (t * 0.9 + 0.15), s * width * 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(226, 244, 190, 0.75)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, width * 0.08, len * 0.97, 0);
  ctx.stroke();
  ctx.restore();
}

function flower(ctx, x, y, r, rand) {
  const layers = [
    { n: 9, len: 1.0, w: 0.42, c: ['#f6c6a3', '#e9906b'] },
    { n: 8, len: 0.78, w: 0.38, c: ['#fbd9bd', '#f0a582'] },
    { n: 7, len: 0.52, w: 0.34, c: ['#fde9d4', '#f6bd98'] },
  ];
  layers.forEach((layer, li) => {
    for (let i = 0; i < layer.n; i++) {
      const a = (i / layer.n) * Math.PI * 2 + li * 0.35 + rand() * 0.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const pl = r * layer.len;
      const pw = r * layer.w;
      const p = new Path2D();
      p.moveTo(0, 0);
      p.bezierCurveTo(pl * 0.3, -pw, pl * 0.9, -pw * 0.9, pl, 0);
      p.bezierCurveTo(pl * 0.9, pw * 0.9, pl * 0.3, pw, 0, 0);
      const g = ctx.createLinearGradient(0, 0, pl, 0);
      g.addColorStop(0, layer.c[1]);
      g.addColorStop(1, layer.c[0]);
      ctx.fillStyle = g;
      ctx.fill(p);
      ctx.strokeStyle = 'rgba(180, 90, 60, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke(p);
      ctx.restore();
    }
  });
  const c = ctx.createRadialGradient(x, y, 0, x, y, r * 0.2);
  c.addColorStop(0, '#f7dd8a');
  c.addColorStop(1, '#d99a3a');
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff1b8';
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.16;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const GREENS = [
  ['#16361f', '#2f6a35', '#6fa253'],
  ['#1b402a', '#3b7c45', '#8fbd66'],
  ['#12301c', '#275c30', '#5b8f45'],
];

function drawFoliage(seed) {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = rng(seed);
  const leaves = [
    [-1.45, 640, 150],
    [-1.15, 700, 165],
    [-0.85, 660, 160],
    [-0.55, 600, 150],
    [-0.28, 560, 140],
    [-1.3, 470, 120],
    [-0.7, 480, 125],
    [-0.12, 430, 110],
  ];
  leaves.forEach(([a, len, w], i) => {
    broadLeaf(ctx, 20 + rand() * 40, S - 10 - rand() * 30, a + (rand() - 0.5) * 0.12, len, w, GREENS[i % 3]);
  });
  flower(ctx, 360, S - 300, 170, rand);
  flower(ctx, 640, S - 120, 110, rand);
  // A bud.
  ctx.save();
  ctx.translate(180, S - 470);
  ctx.rotate(-0.5);
  const bud = ctx.createLinearGradient(0, -60, 0, 60);
  bud.addColorStop(0, '#fbd5b7');
  bud.addColorStop(1, '#e7906c');
  ctx.fillStyle = bud;
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return canvas;
}

function drawPetal() {
  const [canvas, ctx] = makeCanvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#ea946f');
  g.addColorStop(1, '#fbdcc2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(10, 64);
  ctx.bezierCurveTo(70, 4, 210, 8, 246, 64);
  ctx.bezierCurveTo(210, 120, 70, 124, 10, 64);
  ctx.fill();
  return canvas;
}

// ---------- Scenery ----------

export function createScenery() {
  const group = new THREE.Group();
  const backdrop = createBackdrop();
  group.add(backdrop);

  // Layout in world units at z = 0, filled in by layout().
  const L = { hw: 1, hh: 1, ringX: 0, ringY: 0, rx: 3, ry: 3, fanY: -5, fanR: 3, camZ: 14, fov: 35 };
  const halfH = (z) => Math.tan(THREE.MathUtils.degToRad(L.fov / 2)) * (L.camZ - z);

  // Cloud wreath.
  const swirlTextures = {};
  const swirlTex = (ink, variant) => {
    const key = `${ink}${variant}`;
    swirlTextures[key] ??= texture(drawSwirl(ink, Object.keys(INKS).indexOf(ink) * 3 + variant + 1));
    return swirlTextures[key];
  };
  const cloudGeo = new THREE.PlaneGeometry(1, 0.5);
  const clouds = WREATH.map((ink, i) => {
    const mesh = new THREE.Mesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({ map: swirlTex(ink, i % 2), transparent: true, depthWrite: false }),
    );
    mesh.userData = {
      angle: Math.PI / 2 + (i / WREATH.length) * Math.PI * 2,
      radial: 0.9 + (((i * 37) % 9) / 9) * 0.22,
      size: 2.1 + (((i * 53) % 7) / 7) * 1.4,
      flip: [1, -1, 1, 1, -1, 1, -1, -1, 1, -1, 1][i % 11], // curl inwards or outwards
      tilt: (((i * 29) % 11) / 11 - 0.5) * 0.9, // some clouds lean out of the ring
      z: -0.6 - (i % 4) * 0.25,
      seed: i * 1.7,
    };
    mesh.renderOrder = 1;
    group.add(mesh);
    return mesh;
  });

  const fan = createFan();
  group.add(fan);

  const foliageTex = [texture(drawFoliage(11)), texture(drawFoliage(29))];
  const foliageGeo = new THREE.PlaneGeometry(1, 1);
  foliageGeo.translate(0.5, 0.5, 0);
  const foliage = [-1, 1].map((side, i) => {
    const mesh = new THREE.Mesh(
      foliageGeo,
      new THREE.MeshBasicMaterial({ map: foliageTex[i], transparent: true, depthWrite: false }),
    );
    mesh.userData = { side, phase: i * 2.3 };
    mesh.position.z = 0.15;
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  });

  // Falling petals.
  const petalTex = texture(drawPetal());
  const petalGeo = new THREE.PlaneGeometry(0.34, 0.17);
  const petals = Array.from({ length: 9 }, (_, i) => {
    const mesh = new THREE.Mesh(
      petalGeo,
      new THREE.MeshBasicMaterial({
        map: petalTex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.85,
      }),
    );
    mesh.position.z = -0.5 - Math.random() * 3;
    mesh.userData = {
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      vy: 0.1 + Math.random() * 0.12,
      spin: [0.6 + Math.random(), 0.4 + Math.random(), 0.3 + Math.random() * 0.5],
      seed: i * 3.1,
    };
    mesh.renderOrder = 4;
    group.add(mesh);
    return mesh;
  });

  // Faint warm dust.
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 24, -1 - Math.random() * 10], i * 3);
    dustSeed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.06 + aSeed * 0.15) + 12.0, 24.0) - 12.0;
          p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 4.0) * uPixelRatio * (12.0 / -mv.z);
          vAlpha = (0.25 + 0.75 * fract(aSeed * 17.3)) * (0.5 + 0.5 * sin(uTime * 1.1 + aSeed * 60.0));
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a * vAlpha * 0.35, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  group.add(dust);

  // next: { hw, hh, ringX, ringY, rx, ry, fanY, fanR } in world units at z = 0.
  function layout(next, pxW, pxH, pixelRatio, camZ, fov) {
    Object.assign(L, next, { camZ, fov });
    const u = backdrop.material.uniforms;
    u.uRes.value.set(pxW, pxH);
    u.uCenter.value.set(((L.ringX / L.hw) * 0.5 + 0.5) * pxW, ((L.ringY / L.hh) * 0.5 + 0.5) * pxH);
    u.uRadius.value = (Math.max(L.rx, L.ry) / L.hh) * 0.5 * pxH;
    dust.material.uniforms.uPixelRatio.value = pixelRatio;

    fan.position.set(L.ringX, L.fanY, 0.5);
    fan.scale.setScalar(L.fanR);
    const size = Math.min(L.hw * 1.05, L.hh * 0.75);
    for (const f of foliage) {
      const side = f.userData.side;
      f.scale.set(-side * size, size, 1);
      f.position.x = side * (L.hw + size * 0.05);
      // Sit just above the fan's edge where it meets the screen edge, so the
      // leaves still peek out when the fan is wider than the screen.
      const edgeY = L.fanY + Math.sqrt(Math.max(0, L.fanR * L.fanR - L.hw * L.hw));
      f.position.y = Math.max(-L.hh - size * 0.06, edgeY - size * 0.45);
    }
  }

  function update(dt, t, local, motion) {
    backdrop.material.uniforms.uTime.value = t;
    dust.material.uniforms.uTime.value = t;
    const fu = fan.material.uniforms;
    fu.uOpen.value = ease((local - 0.6) / 1.8);
    fu.uTime.value = t;

    // Wreath: clouds sweep into place one after another, then the whole ring
    // turns very slowly while each cloud breathes.
    const turn = t * 0.012 * motion;
    const unit = (Math.PI * (L.rx + L.ry)) / clouds.length;
    clouds.forEach((c, i) => {
      const d = c.userData;
      const k = ease((local - 0.1 - i * 0.09) / 1.3);
      const a = d.angle + turn - (1 - k) * 0.9;
      const breathe = 1 + Math.sin(t * 0.5 + d.seed) * 0.035 * motion;
      const rr = d.radial + Math.sin(t * 0.3 + d.seed) * 0.015;
      c.position.set(L.ringX + Math.cos(a) * L.rx * rr, L.ringY + Math.sin(a) * L.ry * rr, d.z);
      // Follow the ellipse's tangent so each cloud flows around the ring.
      const tangent = Math.atan2(Math.cos(a) * L.ry, -Math.sin(a) * L.rx);
      c.rotation.z = tangent + d.tilt + Math.sin(t * 0.4 + d.seed) * 0.04 * motion;
      const len = unit * d.size * (0.7 + 0.3 * k) * breathe;
      c.scale.set(len, len * d.flip, 1);
      c.material.opacity = k;
    });

    for (const f of foliage) {
      const d = f.userData;
      f.rotation.z = -d.side * Math.sin(t * 0.5 + d.phase) * 0.02 * motion;
    }

    for (const p of petals) {
      const d = p.userData;
      const hh = halfH(p.position.z);
      const hw = hh * (L.hw / L.hh);
      d.y -= (d.vy * dt * motion) / hh;
      if (d.y < -1.1) {
        d.y = 1.1;
        d.x = Math.random() * 2 - 1;
      }
      p.position.x = d.x * hw + Math.sin(t * 0.5 + d.seed) * 0.6;
      p.position.y = d.y * hh;
      p.rotation.set(
        Math.sin(t * d.spin[0] + d.seed) * 1.2,
        t * d.spin[1] * motion + d.seed,
        Math.sin(t * d.spin[2] + d.seed) * 0.9,
      );
    }
  }

  return { group, layout, update };
}
