import * as THREE from 'three';

// Everything behind the butterflies: a silky purple backdrop with a golden
// glow, auspicious-cloud motifs (tường vân) drifting at different depths,
// leafy branches in two corners, a few loose leaves and golden dust.

const GOLD = '#f4cd78';
const LEAF_STYLES = {
  purple: ['#25093f', '#5a1fa3', '#a173ea'],
  plum: ['#3a0c42', '#7d2a88', '#c983d4'],
  gold: ['#6b420b', '#c38d2c', '#f7d98f'],
};

// ---------- Backdrop shader ----------

const backdropVertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const backdropFragment = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uMouse;

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
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = r * p * 2.03;
      a *= 0.5;
    }
    return v;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec2 q = p + uMouse * 0.02;
    float t = uTime;

    vec3 deep = lin(vec3(0.07, 0.02, 0.13));
    vec3 royal = lin(vec3(0.24, 0.07, 0.40));
    vec3 plum = lin(vec3(0.46, 0.14, 0.52));
    vec3 gold = lin(vec3(1.0, 0.76, 0.36));

    float warp = fbm(q * 1.6 - vec2(t * 0.02, t * 0.013));
    float n = fbm(q * 1.2 + vec2(t * 0.015, -t * 0.01) + warp * 1.4);
    vec3 col = mix(deep, royal, smoothstep(0.25, 0.8, n));
    col = mix(col, plum, smoothstep(0.6, 0.95, n) * 0.45);

    // Silk sheen: soft diagonal folds.
    float silk = sin((q.x * 0.9 + q.y) * 7.0 + warp * 5.0 + t * 0.12);
    col += royal * 0.25 * smoothstep(0.55, 1.0, silk);

    // Golden glow behind the pair, breathing slowly.
    float d = length(q - vec2(0.0, -0.03));
    col += gold * (0.07 + 0.02 * sin(t * 0.7)) * exp(-d * d * 7.0);
    col += plum * 0.18 * exp(-d * d * 1.5);

    float vig = smoothstep(1.3, 0.25, length(p * vec2(0.85, 1.05)));
    col *= mix(0.4, 1.0, vig);
    col += (hash(gl_FragCoord.xy + fract(t) * 71.0) - 0.5) * 0.01;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    vertexShader: backdropVertex,
    fragmentShader: backdropFragment,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
    },
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------- Canvas artwork ----------

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Auspicious cloud: overlapping round lobes with a gold outline, a spiral
// curl inside each lobe and a sweeping tail.
const CLOUDS = [
  { lobes: [[250, 300, 95], [370, 228, 122], [512, 250, 104], [632, 300, 84], [724, 334, 58]], tail: 1 },
  { lobes: [[220, 318, 70], [322, 258, 100], [452, 218, 116], [584, 250, 100], [694, 300, 80], [792, 334, 54]], tail: -1 },
  { lobes: [[330, 290, 104], [470, 246, 96], [596, 286, 82], [700, 318, 56]], tail: 1 },
];

function drawCloud(spec) {
  const [canvas, ctx] = makeCanvas(1024, 512);
  const outline = 8;
  const { lobes } = spec;

  // Tail: a tapering gold swoosh leaving the first or last lobe.
  const end = spec.tail > 0 ? lobes[0] : lobes[lobes.length - 1];
  const dir = spec.tail > 0 ? -1 : 1;
  ctx.strokeStyle = GOLD;
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const k = i / 17;
    ctx.lineWidth = 18 * (1 - k) + 2;
    ctx.globalAlpha = 1 - k * 0.6;
    const x0 = end[0] + dir * end[2] * 0.4 + dir * k * 170;
    const y0 = end[1] + end[2] * 0.75 - Math.sin(k * Math.PI * 0.9) * 40 - k * k * 30;
    const x1 = end[0] + dir * end[2] * 0.4 + dir * (k + 1 / 17) * 170;
    const k1 = k + 1 / 17;
    const y1 = end[1] + end[2] * 0.75 - Math.sin(k1 * Math.PI * 0.9) * 40 - k1 * k1 * 30;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = GOLD;
  for (const [x, y, r] of lobes) {
    ctx.beginPath();
    ctx.arc(x, y, r + outline, 0, Math.PI * 2);
    ctx.fill();
  }
  const fill = ctx.createLinearGradient(0, 120, 0, 420);
  fill.addColorStop(0, '#9b62e0');
  fill.addColorStop(0.55, '#5b1fa0');
  fill.addColorStop(1, '#2f0b5c');
  ctx.fillStyle = fill;
  for (const [x, y, r] of lobes) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spiral curls.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  lobes.forEach(([x, y, r], i) => {
    const turns = 1.7;
    const a0 = i * 1.3;
    ctx.beginPath();
    for (let a = 0; a <= turns * Math.PI * 2; a += 0.05) {
      const rr = r * (0.06 + 0.58 * (a / (turns * Math.PI * 2)));
      const px = x + Math.cos(a + a0) * rr * (spec.tail > 0 ? 1 : -1);
      const py = y + Math.sin(a + a0) * rr;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  return canvas;
}

function leafPath(len, width) {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(len * 0.25, -width * 0.9, len * 0.7, -width * 0.7, len, 0);
  p.bezierCurveTo(len * 0.7, width * 0.7, len * 0.25, width * 0.9, 0, 0);
  return p;
}

function drawLeaf(ctx, x, y, angle, len, width, style) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const path = leafPath(len, width);
  const g = ctx.createLinearGradient(0, -width / 2, len, width / 2);
  g.addColorStop(0, style[0]);
  g.addColorStop(0.5, style[1]);
  g.addColorStop(1, style[2]);
  ctx.fillStyle = g;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // Light from above: soft sheen on one half.
  const sheen = ctx.createLinearGradient(0, -width, 0, width);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(247, 214, 140, 0.55)';
  ctx.lineWidth = Math.max(1, width * 0.035);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(len * t, 0);
      ctx.quadraticCurveTo(len * (t + 0.08), s * width * 0.25, len * (t + 0.16), s * width * 0.55 * (1 - t * 0.6));
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1.5, width * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, width * 0.06, len * 0.97, 0);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, width * 0.035);
  ctx.stroke(path);
  ctx.restore();
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// A curving branch from the bottom-left corner towards the top-right.
const BRANCH_BASE = [40, 990];
function drawBranch(seed) {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const P = [BRANCH_BASE, [200, 640], [520, 420], [940, 300]];

  ctx.lineCap = 'round';
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const a = cubic(...P, i / steps);
    const b = cubic(...P, (i + 1) / steps);
    ctx.strokeStyle = i % 2 ? '#c8953a' : '#d9a649';
    ctx.lineWidth = 16 * (1 - i / steps) + 3;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }

  const styles = [LEAF_STYLES.purple, LEAF_STYLES.purple, LEAF_STYLES.plum, LEAF_STYLES.gold];
  let side = 1;
  for (let t = 0.1; t < 0.97; t += 0.085) {
    const [x, y] = cubic(...P, t);
    const [x2, y2] = cubic(...P, Math.min(1, t + 0.01));
    const tangent = Math.atan2(y2 - y, x2 - x);
    const len = 250 * (1 - t * 0.5) * (0.85 + rand() * 0.3);
    const angle = tangent + side * (0.7 + rand() * 0.35);
    // Short stalk.
    const sx = x + Math.cos(angle) * 14;
    const sy = y + Math.sin(angle) * 14;
    ctx.strokeStyle = '#c8953a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    drawLeaf(ctx, sx, sy, angle, len, len * 0.32, styles[Math.floor(rand() * styles.length)]);
    side = -side;
  }
  const [tx, ty] = cubic(...P, 1);
  drawLeaf(ctx, tx - 6, ty + 2, -0.25, 170, 52, LEAF_STYLES.gold);

  // Golden buds.
  for (const t of [0.22, 0.47, 0.71, 0.88]) {
    const [x, y] = cubic(...P, t);
    const glow = ctx.createRadialGradient(x, y - 14, 0, x, y - 14, 26);
    glow.addColorStop(0, 'rgba(255, 238, 190, 1)');
    glow.addColorStop(0.4, 'rgba(244, 205, 120, 0.9)');
    glow.addColorStop(1, 'rgba(244, 205, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 14, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function drawSingleLeaf(style) {
  const [canvas, ctx] = makeCanvas(512, 256);
  drawLeaf(ctx, 16, 128, 0, 480, 140, style);
  return canvas;
}

// ---------- Scenery ----------

export function createScenery() {
  const group = new THREE.Group();
  const backdrop = createBackdrop();
  group.add(backdrop);

  const view = { fov: 35, aspect: 1, camZ: 14 };
  const halfH = (z) => Math.tan(THREE.MathUtils.degToRad(view.fov / 2)) * (view.camZ - z);
  const halfW = (z) => halfH(z) * view.aspect;

  // Halo rings behind the pair.
  const halo = new THREE.Group();
  halo.position.z = -3;
  for (const [r, w, o] of [
    [3.1, 0.018, 0.5],
    [3.32, 0.008, 0.35],
    [2.7, 0.006, 0.25],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + w, 256),
      new THREE.MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: o,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.add(ring);
  }
  const beads = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 3.21, Math.sin(a) * 3.21, 0);
      }),
    ),
    new THREE.PointsMaterial({
      color: GOLD,
      size: 0.05,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.add(beads);
  group.add(halo);

  // Clouds.
  const cloudTextures = CLOUDS.map((c) => canvasTexture(drawCloud(c)));
  const cloudSpecs = [
    { tex: 0, z: -9, y: 0.62, s: 6.2, v: 0.07, o: 0.75, x: -0.6 },
    { tex: 1, z: -8, y: -0.7, s: 5.6, v: -0.06, o: 0.7, x: 0.5 },
    { tex: 2, z: -12, y: 0.05, s: 7.5, v: 0.04, o: 0.45, x: 0.9 },
    { tex: 1, z: -6.5, y: 0.45, s: 3.6, v: -0.09, o: 0.65, x: 0.75 },
    { tex: 0, z: -7, y: -0.35, s: 4.0, v: 0.08, o: 0.6, x: -0.85 },
    { tex: 2, z: -13, y: 0.85, s: 7, v: -0.035, o: 0.4, x: -0.1 },
    { tex: 0, z: -5, y: -0.85, s: 3.0, v: 0.1, o: 0.65, x: 0.1 },
  ];
  const clouds = cloudSpecs.map((spec) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.5),
      new THREE.MeshBasicMaterial({
        map: cloudTextures[spec.tex],
        transparent: true,
        opacity: spec.o,
        depthWrite: false,
      }),
    );
    mesh.scale.setScalar(spec.s);
    if (spec.v < 0) mesh.scale.x *= -1;
    mesh.position.z = spec.z;
    mesh.userData = { ...spec, offset: 0 };
    mesh.renderOrder = -5;
    group.add(mesh);
    return mesh;
  });

  // Branches in two corners.
  const branchTextures = [canvasTexture(drawBranch(7)), canvasTexture(drawBranch(31))];
  const branchGeo = new THREE.PlaneGeometry(1, 1);
  branchGeo.translate(0.5 - BRANCH_BASE[0] / 1024, 0.5 - (1 - BRANCH_BASE[1] / 1024), 0);
  const branches = [
    { corner: [-1, -1], rot: 0, z: -2.2, tex: 0, phase: 0 },
    { corner: [1, 1], rot: Math.PI, z: -2.6, tex: 1, phase: 2 },
  ].map((spec) => {
    const mesh = new THREE.Mesh(
      branchGeo,
      new THREE.MeshBasicMaterial({ map: branchTextures[spec.tex], transparent: true, depthWrite: false }),
    );
    mesh.position.z = spec.z;
    mesh.userData = spec;
    mesh.renderOrder = -2;
    group.add(mesh);
    return mesh;
  });

  // Loose leaves drifting and tumbling.
  const leafTextures = [LEAF_STYLES.purple, LEAF_STYLES.gold, LEAF_STYLES.plum].map((s) =>
    canvasTexture(drawSingleLeaf(s)),
  );
  const leafGeo = new THREE.PlaneGeometry(1, 0.5);
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(
      leafGeo,
      new THREE.MeshBasicMaterial({
        map: leafTextures[i % 3],
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.9,
      }),
    );
    mesh.scale.setScalar(0.55 + Math.random() * 0.45);
    mesh.position.z = -1.5 - Math.random() * 4.5;
    mesh.userData = {
      x: Math.random() * 2 - 1,
      y: Math.random() * 1.6 - 0.8,
      vx: 0.12 + Math.random() * 0.12,
      spin: [0.4 + Math.random() * 0.6, 0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4],
      seed: Math.random() * 10,
    };
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  });

  // Golden dust.
  const dustCount = 500;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 24, -1 - Math.random() * 16], i * 3);
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
          p.y = mod(p.y + uTime * (0.1 + aSeed * 0.25) + 12.0, 24.0) - 12.0;
          p.x += sin(uTime * 0.25 + aSeed * 30.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 6.0) * uPixelRatio * (12.0 / -mv.z);
          vAlpha = (0.3 + 0.7 * fract(aSeed * 17.3)) * (0.55 + 0.45 * sin(uTime * 1.3 + aSeed * 60.0));
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(1.0, 0.75, 0.38) * a * vAlpha * 0.6, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  group.add(dust);

  function resize(width, height, pixelRatio, camZ, stageY) {
    halo.position.y = stageY;
    view.aspect = width / height;
    view.camZ = camZ;
    backdrop.material.uniforms.uRes.value.set(width * pixelRatio, height * pixelRatio);
    dust.material.uniforms.uPixelRatio.value = pixelRatio;
    for (const b of branches) {
      const hw = halfW(b.position.z);
      const hh = halfH(b.position.z);
      const size = Math.min(hw * 0.8, hh * 1.3);
      b.scale.set(size, size, 1);
      b.position.x = b.userData.corner[0] * (hw + size * 0.04);
      b.position.y = b.userData.corner[1] * (hh + size * 0.04);
    }
  }

  function update(dt, t, mouse, motion) {
    backdrop.material.uniforms.uTime.value = t;
    backdrop.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
    dust.material.uniforms.uTime.value = t;
    halo.rotation.z = t * 0.03;
    halo.scale.setScalar(1 + Math.sin(t * 0.7) * 0.01);

    for (const c of clouds) {
      const d = c.userData;
      const hw = halfW(c.position.z) + d.s * 0.55;
      d.offset += d.v * dt * motion;
      let x = d.x * halfW(c.position.z) + d.offset;
      x = ((((x + hw) % (2 * hw)) + 2 * hw) % (2 * hw)) - hw;
      c.position.x = x;
      c.position.y = d.y * halfH(c.position.z) + Math.sin(t * 0.2 + d.s) * 0.12;
    }

    for (const b of branches) {
      const d = b.userData;
      b.rotation.z = d.rot + Math.sin(t * 0.55 + d.phase) * 0.03 * motion + mouse.x * 0.015;
    }

    for (const leaf of leaves) {
      const d = leaf.userData;
      const hw = halfW(leaf.position.z) + 1;
      d.x += (d.vx * dt * motion) / hw;
      if (d.x > 1) {
        d.x = -1;
        d.y = Math.random() * 1.6 - 0.8;
      }
      leaf.position.x = d.x * hw;
      leaf.position.y = d.y * halfH(leaf.position.z) + Math.sin(t * 0.6 + d.seed) * 0.5;
      leaf.rotation.set(
        Math.sin(t * d.spin[0] + d.seed) * 1.1,
        t * d.spin[1] * motion + d.seed,
        Math.sin(t * d.spin[2] + d.seed * 2) * 0.8,
      );
    }
  }

  return { group, resize, update };
}
