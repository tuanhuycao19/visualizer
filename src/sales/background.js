import * as THREE from 'three';

// Full-screen abstract backdrop: slow domain-warped fog in navy/blue with
// faint warm glows and drifting light ribbons. Drawn behind everything.
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
      p = r * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec2 p = uv + uMouse * 0.025;
    float t = uTime;

    // Domain-warped fog.
    vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t * 0.035)),
                  fbm(p * 1.3 + vec2(5.2, 1.3) - t * 0.03));
    float r = fbm(p * 1.6 + 2.2 * q + vec2(t * 0.02, -t * 0.015));

    vec3 deep = lin(vec3(0.012, 0.03, 0.10));
    vec3 navy = lin(vec3(0.04, 0.10, 0.30));
    vec3 royal = lin(vec3(0.10, 0.28, 0.80));
    vec3 cyan = lin(vec3(0.25, 0.70, 1.00));
    vec3 crimson = lin(vec3(0.55, 0.06, 0.20));
    vec3 amber = lin(vec3(0.90, 0.45, 0.12));

    vec3 col = mix(deep, navy, smoothstep(0.2, 0.85, r));
    col = mix(col, royal, smoothstep(0.55, 1.0, r) * 0.55);

    // Slowly orbiting soft glows.
    vec2 g1 = vec2(-0.55 + 0.12 * sin(t * 0.07), 0.38 + 0.08 * cos(t * 0.09));
    vec2 g2 = vec2(0.62 + 0.10 * cos(t * 0.06), -0.35 + 0.10 * sin(t * 0.08));
    vec2 g3 = vec2(0.15 * sin(t * 0.05), -0.55 + 0.05 * cos(t * 0.11));
    col += royal * 0.55 * exp(-4.0 * dot(p - g1, p - g1)) * (0.6 + 0.6 * q.x);
    col += crimson * 0.35 * exp(-5.0 * dot(p - g2, p - g2)) * (0.5 + 0.8 * q.y);
    col += amber * 0.10 * exp(-7.0 * dot(p - g3, p - g3));

    // Thin flowing light ribbons.
    float ribbons = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float y = p.y + 0.35 * sin(p.x * (1.2 + fi * 0.4) + t * (0.12 + fi * 0.03) + fi * 2.0)
                + 0.18 * (q.x - 0.5) - (fi - 1.0) * 0.32;
      ribbons += smoothstep(0.006, 0.0, abs(y)) * (0.35 + 0.65 * smoothstep(-0.9, 0.6, p.x + fi * 0.3));
      ribbons += smoothstep(0.09, 0.0, abs(y)) * 0.12;
    }
    col += cyan * ribbons * 0.12;

    // Vignette + film grain.
    float vig = smoothstep(1.35, 0.25, length(uv * vec2(0.85, 1.0)));
    col *= mix(0.45, 1.0, vig);
    col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createBackdrop() {
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

// Soft bokeh dust drifting upward through the depth of the scene.
const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float speed = 0.15 + aSeed * 0.35;
    p.y = mod(p.y + uTime * speed + 18.0, 36.0) - 18.0;
    p.x += sin(uTime * 0.2 + aSeed * 40.0) * 0.8;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed * 7.0) * uPixelRatio * (12.0 / -mv.z);
    float edge = 1.0 - smoothstep(14.0, 18.0, abs(p.y));
    vAlpha = edge * (0.25 + 0.75 * fract(aSeed * 13.7)) * (0.6 + 0.4 * sin(uTime * 0.8 + aSeed * 50.0));
  }
`;

const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * a * vAlpha * 0.55, 1.0);
  }
`;

export function createDust(count = 700) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 36;
    positions[i * 3 + 2] = -2 - Math.random() * 26;
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// A few large translucent rings floating far behind the chart.
export function createRings() {
  const group = new THREE.Group();
  const specs = [
    { r: 9, tube: 0.08, pos: [-16, 7, -24], color: '#4f86ff', opacity: 0.14 },
    { r: 6, tube: 0.35, pos: [18, -8, -24], color: '#2a4fd0', opacity: 0.18 },
    { r: 14, tube: 0.05, pos: [8, 4, -32], color: '#7fb4ff', opacity: 0.12 },
  ];
  for (const s of specs) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(s.r, s.tube, 24, 160),
      new THREE.MeshStandardMaterial({
        color: s.color,
        emissive: s.color,
        emissiveIntensity: 0.25,
        roughness: 0.35,
        metalness: 0.4,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
      }),
    );
    mesh.position.set(...s.pos);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.userData.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 0.06,
      (Math.random() - 0.5) * 0.06,
      (Math.random() - 0.5) * 0.04,
    );
    group.add(mesh);
  }
  return group;
}
