import * as THREE from 'three';

// Wing colours. `fill` runs from the wing root to the margin; `trim` is the
// border band, `vein` the vein lines, `spot` the eye spot rings.
export const PALETTES = {
  violet: {
    fill: ['#1c1838', '#3d3a7a', '#7579bd', '#bfc2ec'],
    trim: '#f3c768',
    vein: 'rgba(246, 210, 130, 0.55)',
    spot: ['#f8dc8c', '#3a0b6b', '#fff6dc'],
    body: '#2a0f45',
    trail: '#f6cf73',
  },
  golden: {
    fill: ['#4a2a05', '#a8711c', '#e7b44b', '#fde6a6'],
    trim: '#5a1f9e',
    vein: 'rgba(80, 26, 140, 0.5)',
    spot: ['#6c2bc4', '#fff1c2', '#3b0d6e'],
    body: '#8a5a17',
    trail: '#d9b0ff',
  },
};

const WING = 1.3; // wing length (body → tip), world units
const TEX = 1024;

export class Butterfly {
  constructor(palette, seed = 0) {
    this.palette = palette;
    this.seed = seed;
    this.phase = seed * 2.1;
    this.group = new THREE.Group();
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 1, 0);
    this.dorsal = new THREE.Vector3(0, 0, 1);
    this.bank = 0;

    const texture = new THREE.CanvasTexture(drawWings(palette));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    this.uniforms = { uFlap: { value: 0 }, uSheen: { value: 0 } };
    const material = makeWingMaterial(texture, this.uniforms);
    const geometry = new THREE.PlaneGeometry(WING, WING, 24, 24);
    geometry.translate(WING / 2, 0, 0);

    const right = new THREE.Mesh(geometry, material);
    const left = new THREE.Mesh(geometry, material);
    left.scale.x = -1;
    right.frustumCulled = left.frustumCulled = false;
    this.group.add(right, left, makeBody(palette));
  }

  // Positions the butterfly, faces it along `velocity` with its back turned
  // to the viewer, banks into turns and flaps.
  update(dt, time, position, velocity, viewer) {
    const speed = velocity.length();
    const f = speed > 1e-4 ? velocity.clone().divideScalar(speed) : this.forward.clone();
    const toViewer = viewer.clone().sub(position).normalize();
    const right = new THREE.Vector3().crossVectors(f, toViewer);
    if (right.lengthSq() > 0.02) {
      right.normalize();
      // Bank into the turn: sign of the turn as seen by the viewer.
      const turn = new THREE.Vector3().crossVectors(this.forward, f).dot(toViewer);
      this.bank += (THREE.MathUtils.clamp(turn * 18, -0.6, 0.6) - this.bank) * Math.min(1, dt * 3);
      this.forward.copy(f);
      const dorsal = new THREE.Vector3().crossVectors(right, f);
      const basis = new THREE.Matrix4().makeBasis(right, f, dorsal);
      const target = new THREE.Quaternion().setFromRotationMatrix(basis);
      target.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.bank));
      this.quat.slerp(target, 1 - Math.exp(-dt * 7));
      this.dorsal.copy(dorsal);
    }
    this.group.quaternion.copy(this.quat);

    // Flap faster when flying faster; glide now and then.
    const glide = 0.55 + 0.45 * Math.sin(time * 0.45 + this.seed * 5.0);
    this.phase += dt * (9 + speed * 1.2) * (0.75 + 0.25 * glide);
    const flap = 0.3 + (0.35 + 0.6 * glide) * Math.sin(this.phase);
    this.uniforms.uFlap.value = flap;
    this.uniforms.uSheen.value = 0.5 + 0.5 * Math.sin(this.phase - 0.8);

    // Body bobs against the downstroke.
    this.group.position.copy(position).addScaledVector(this.dorsal, -0.06 * Math.cos(this.phase));
  }

  // A random point on the (resting) wings, in world space.
  randomWingPoint(target) {
    const side = Math.random() < 0.5 ? -1 : 1;
    target.set(side * (0.15 + Math.random() * 0.95) * WING, (Math.random() - 0.45) * WING * 0.9, 0);
    return this.group.localToWorld(target);
  }
}

// Wings bend around the body axis (local Y): rotation grows towards the tip
// so they curve like real wings instead of flapping as flat cards.
function makeWingMaterial(map, uniforms) {
  const material = new THREE.MeshBasicMaterial({
    map,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlap;
        varying float vTip;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        float k = transformed.x / ${WING.toFixed(3)};
        // Hind wing (y < 0) trails the fore wing a little.
        float a = uFlap * (0.75 + 0.45 * k) - 0.12 * k * k + min(transformed.y, 0.0) * 0.18 * uFlap;
        transformed.z = sin(a) * transformed.x;
        transformed.x = cos(a) * transformed.x;
        vTip = k;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSheen;
        varying float vTip;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Iridescent sweep across the wing as it turns to the light, and a
        // lift on the gold so it blooms.
        float sweep = exp(-pow((vTip - uSheen * 1.2 + 0.1) / 0.18, 2.0));
        diffuseColor.rgb += vec3(0.55, 0.45, 0.8) * sweep * 0.22 * diffuseColor.a;
        diffuseColor.rgb *= 1.0 + 0.9 * smoothstep(0.38, 0.8, diffuseColor.g);`,
      );
  };
  return material;
}

function makeBody(palette) {
  const body = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: palette.body, metalness: 0.7, roughness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({
    color: '#f2c766',
    metalness: 1,
    roughness: 0.25,
    emissive: '#a8701c',
    emissiveIntensity: 0.35,
  });

  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.62, 6, 14), metal);
  abdomen.position.y = -0.18;
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), metal);
  thorax.position.y = 0.2;
  thorax.scale.set(1, 1.3, 1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), gold);
  head.position.y = 0.36;
  body.add(abdomen, thorax, head);

  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.02, 0.4, 0.02),
      new THREE.Vector3(side * 0.12, 0.62, 0.08),
      new THREE.Vector3(side * 0.26, 0.8, 0.05),
    ]);
    const antenna = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 5), gold);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), gold);
    tip.position.copy(curve.getPoint(1));
    body.add(antenna, tip);
  }
  return body;
}

// ---------- Wing artwork (right side; the left wing is a mirror) ----------

// Canvas space: x = 0 at the body, y = 0 at the head end. Units: 0..1.
function forewingPath(ctx, s) {
  const p = new Path2D();
  p.moveTo(0.02 * s, 0.44 * s);
  p.bezierCurveTo(0.2 * s, 0.2 * s, 0.55 * s, 0.05 * s, 0.95 * s, 0.09 * s);
  p.bezierCurveTo(0.99 * s, 0.22 * s, 0.9 * s, 0.4 * s, 0.76 * s, 0.5 * s);
  p.bezierCurveTo(0.58 * s, 0.57 * s, 0.3 * s, 0.56 * s, 0.02 * s, 0.54 * s);
  p.closePath();
  return p;
}

function hindwingPath(ctx, s) {
  const p = new Path2D();
  p.moveTo(0.02 * s, 0.5 * s);
  p.bezierCurveTo(0.3 * s, 0.5 * s, 0.62 * s, 0.52 * s, 0.71 * s, 0.65 * s);
  p.bezierCurveTo(0.78 * s, 0.76 * s, 0.67 * s, 0.84 * s, 0.57 * s, 0.86 * s);
  // swallowtail
  p.bezierCurveTo(0.53 * s, 0.92 * s, 0.51 * s, 0.97 * s, 0.45 * s, 0.995 * s);
  p.bezierCurveTo(0.42 * s, 0.95 * s, 0.42 * s, 0.9 * s, 0.38 * s, 0.86 * s);
  p.bezierCurveTo(0.24 * s, 0.8 * s, 0.1 * s, 0.7 * s, 0.02 * s, 0.6 * s);
  p.closePath();
  return p;
}

function drawWings(pal) {
  const s = TEX;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  const hind = hindwingPath(ctx, s);
  const fore = forewingPath(ctx, s);

  // Hind wing first so the fore wing overlaps it.
  paintWing(ctx, hind, pal, s, {
    root: [0.02, 0.56],
    reach: 0.8,
    veins: [
      [0.7, 0.66],
      [0.66, 0.78],
      [0.56, 0.86],
      [0.45, 0.97],
      [0.3, 0.8],
      [0.16, 0.7],
    ],
    spots: [[0.5, 0.72, 0.075]],
    dots: [
      [0.68, 0.7],
      [0.64, 0.79],
      [0.56, 0.83],
      [0.38, 0.81],
      [0.26, 0.75],
    ],
  });
  paintWing(ctx, fore, pal, s, {
    root: [0.02, 0.48],
    reach: 1.0,
    veins: [
      [0.95, 0.1],
      [0.92, 0.22],
      [0.86, 0.36],
      [0.76, 0.48],
      [0.55, 0.55],
      [0.6, 0.12],
      [0.35, 0.2],
    ],
    spots: [[0.66, 0.24, 0.05]],
    dots: [
      [0.89, 0.14],
      [0.9, 0.24],
      [0.86, 0.33],
      [0.8, 0.41],
      [0.71, 0.47],
      [0.6, 0.5],
    ],
  });
  return canvas;
}

function paintWing(ctx, path, pal, s, spec) {
  const [rx, ry] = spec.root;
  ctx.save();
  ctx.clip(path);

  const g = ctx.createRadialGradient(rx * s, ry * s, 0, rx * s, ry * s, spec.reach * s);
  g.addColorStop(0, pal.fill[0]);
  g.addColorStop(0.32, pal.fill[1]);
  g.addColorStop(0.68, pal.fill[2]);
  g.addColorStop(1, pal.fill[3]);
  ctx.fillStyle = g;
  ctx.fill(path);

  // Soft glossy band along the leading edge.
  const gloss = ctx.createLinearGradient(0, 0, 0.3 * s, 0.45 * s);
  gloss.addColorStop(0, 'rgba(255,255,255,0.25)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fill(path);

  // Veins: gently curved lines from the root to the margin.
  ctx.strokeStyle = pal.vein;
  ctx.lineCap = 'round';
  for (const [vx, vy] of spec.veins) {
    ctx.lineWidth = 0.006 * s;
    ctx.beginPath();
    ctx.moveTo(rx * s, ry * s);
    const mx = (rx + vx) / 2;
    const my = (ry + vy) / 2 + (vy < ry ? 0.04 : -0.04);
    ctx.quadraticCurveTo(mx * s, my * s, vx * s, vy * s);
    ctx.stroke();
  }

  // Border band (the outer half of a thick stroke falls outside the clip).
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 0.075 * s;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.082 * s;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.35;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 0.06 * s;
  ctx.stroke(path);

  // Pearl dots inside the band.
  for (const [dx, dy] of spec.dots) {
    ctx.fillStyle = pal.spot[2];
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, 0.012 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye spots.
  for (const [ex, ey, er] of spec.spots) {
    const rings = [
      [er, pal.spot[0]],
      [er * 0.72, pal.spot[1]],
      [er * 0.32, pal.spot[2]],
    ];
    for (const [r, c] of rings) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(ex * s, ey * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Fine gold outline.
  ctx.strokeStyle = '#ffe7a6';
  ctx.lineWidth = 0.006 * s;
  ctx.stroke(path);
}
