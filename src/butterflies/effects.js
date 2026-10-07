import * as THREE from 'three';

// ---------- Ribbon: a camera-facing glowing strip through a list of points ----------

const ribbonVertex = /* glsl */ `
  attribute float aEdge;
  attribute float aAlpha;
  varying float vEdge;
  varying float vAlpha;
  void main() {
    vEdge = aEdge;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vEdge;
  varying float vAlpha;
  void main() {
    float across = 1.0 - vEdge * vEdge;
    float core = pow(across, 6.0);
    vec3 col = mix(uColor, vec3(1.0, 0.97, 0.9), core * 0.7);
    gl_FragColor = vec4(col * across * vAlpha * uIntensity, 1.0);
  }
`;

export function createRibbon(maxPoints, color, intensity = 1) {
  const positions = new Float32Array(maxPoints * 2 * 3);
  const edges = new Float32Array(maxPoints * 2);
  const alphas = new Float32Array(maxPoints * 2);
  for (let i = 0; i < maxPoints; i++) {
    edges[i * 2] = -1;
    edges[i * 2 + 1] = 1;
  }
  const index = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(edges, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    vertexShader: ribbonVertex,
    fragmentShader: ribbonFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const tangent = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const side = new THREE.Vector3();

  // points: Vector3[], width(i, n) and alpha(i, n) give the profile.
  function set(points, eye, width, alpha) {
    const n = Math.min(points.length, maxPoints);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      tangent.subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]);
      toEye.subVectors(eye, p);
      side.crossVectors(tangent, toEye);
      const len = side.length();
      if (len > 1e-6) side.multiplyScalar(width(i, n) / len);
      else side.set(0, 0, 0);
      positions.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
      const a = alpha(i, n);
      alphas[i * 2] = alphas[i * 2 + 1] = a;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  return { mesh, set };
}

// A fading trail of where the butterfly was during the last `seconds`
// (time-based, so it looks the same at any frame rate).
export function createTrail(color, seconds = 1.6, maxPoints = 160) {
  const ribbon = createRibbon(maxPoints, color, 1.1);
  const points = [];
  const times = [];
  return {
    mesh: ribbon.mesh,
    reset() {
      points.length = 0;
      times.length = 0;
    },
    push(p, time, eye) {
      points.unshift(p.clone());
      times.unshift(time);
      while (points.length > maxPoints || (times.length && time - times[times.length - 1] > seconds)) {
        points.pop();
        times.pop();
      }
      const age = (i) => Math.min(1, (time - times[i]) / seconds);
      ribbon.set(
        points,
        eye,
        (i) => 0.045 * (1 - age(i)) * Math.min(1, i / 3 + 0.3),
        (i) => Math.pow(1 - age(i), 1.6),
      );
    },
  };
}

// ---------- Sparkles: short-lived glints with a soft core and a star cross ----------

const sparkVertex = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aAlpha;
  attribute float aSize;
  attribute float aHue;
  varying float vAlpha;
  varying float vHue;
  void main() {
    vAlpha = aAlpha;
    vHue = aHue;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (260.0 / -mv.z);
  }
`;

const sparkFragment = /* glsl */ `
  varying float vAlpha;
  varying float vHue;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float core = exp(-r2 * 60.0);
    float halo = exp(-r2 * 14.0) * 0.35;
    float star = exp(-abs(d.x) * 50.0) * exp(-abs(d.y) * 7.0) + exp(-abs(d.y) * 50.0) * exp(-abs(d.x) * 7.0);
    vec3 gold = vec3(1.0, 0.72, 0.3);
    vec3 lilac = vec3(0.72, 0.5, 1.0);
    vec3 col = mix(gold, lilac, vHue) * (halo + star * 0.6) + vec3(1.0, 0.95, 0.85) * core;
    gl_FragColor = vec4(col * vAlpha, 1.0);
  }
`;

export function createSparkles(count = 900) {
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const hues = new Float32Array(count);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count); // remaining seconds
  const span = new Float32Array(count); // total seconds
  const seed = new Float32Array(count);
  const baseSize = new Float32Array(count);
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: sparkVertex,
    fragmentShader: sparkFragment,
    uniforms: { uPixelRatio: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  function emit(p, v, { hue = 0, size = 1, lifeTime = 2 } = {}) {
    const i = cursor;
    cursor = (cursor + 1) % count;
    positions.set([p.x, p.y, p.z], i * 3);
    vel.set([v.x, v.y, v.z], i * 3);
    life[i] = span[i] = lifeTime * (0.6 + Math.random() * 0.8);
    seed[i] = Math.random() * 100;
    baseSize[i] = size * (0.5 + Math.random());
    hues[i] = hue;
    geometry.attributes.aHue.needsUpdate = true;
  }

  function update(dt, time) {
    const drag = Math.exp(-dt * 1.2);
    for (let i = 0; i < count; i++) {
      if (life[i] <= 0) {
        alphas[i] = 0;
        continue;
      }
      life[i] -= dt;
      const k = i * 3;
      vel[k] *= drag;
      vel[k + 1] = vel[k + 1] * drag - dt * 0.12;
      vel[k + 2] *= drag;
      positions[k] += vel[k] * dt;
      positions[k + 1] += vel[k + 1] * dt;
      positions[k + 2] += vel[k + 2] * dt;
      const t = Math.max(0, life[i] / span[i]);
      const twinkle = 0.55 + 0.45 * Math.sin(time * 9 + seed[i]);
      alphas[i] = Math.min(1, t * 2.5) * t * twinkle;
      sizes[i] = baseSize[i] * (0.6 + 0.4 * t);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  }

  function clear() {
    life.fill(0);
    alphas.fill(0);
  }

  return { points, emit, update, clear, material };
}
