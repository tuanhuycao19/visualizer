import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Butterfly, PALETTES } from './butterfly.js';
import { createScenery } from './scenery.js';
import { createRibbon, createSparkles, createTrail } from './effects.js';
import { createRecorder } from '../record/recorder.js';

const canvas = document.getElementById('scene');
const titleEl = document.getElementById('title');
const captionEl = document.getElementById('caption');
const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.classList.add('no-webgl');
  throw err;
}
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;
scene.add(new THREE.HemisphereLight('#fff1dc', '#2a2420', 0.8));
const key = new THREE.DirectionalLight('#fff1d0', 1.4);
key.position.set(3, 6, 8);
scene.add(key);

const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const camBase = new THREE.Vector3(0, 0, 14);

const scenery = createScenery();
scene.add(scenery.group);

// ---------- The pair ----------
const pair = [new Butterfly(PALETTES.violet, 0), new Butterfly(PALETTES.golden, 1)];
const trails = pair.map((b) => createTrail(b.palette.trail));
const thread = createRibbon(64, '#ffd98a', 1.2);
const sparkles = createSparkles(1000);
for (const t of trails) scene.add(t.mesh);
scene.add(thread.mesh);
for (const b of pair) scene.add(b.group);
scene.add(sparkles.points);

// ---------- Post-processing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 0.93));
composer.addPass(new OutputPass());

// ---------- Layout ----------
// Like an album cover: a wreath of clouds in the middle with the title at its
// top, the pair flying inside it, and a golden fan rising from the bottom.
let width = 1;
let height = 1;
const stage = { hw: 1, hh: 1, ringX: 0, ringY: 0, rx: 3, ry: 3, fanY: -5, fanR: 3 };
let flight = { x: 0, y: 0, sx: 1, sy: 1, size: 1 };

function fit() {
  width = window.innerWidth;
  height = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pr);
  composer.setSize(width, height);

  camera.aspect = width / height;
  // Always show at least a 7.2 × 10.5 unit stage.
  camBase.z = Math.max(10.5 / (2 * TAN), 7.2 / camera.aspect / (2 * TAN));
  camera.updateProjectionMatrix();

  const hh = TAN * camBase.z;
  const hw = hh * camera.aspect;
  const fanR = Math.min(hw * 1.02, hh * 0.62);
  const fanY = -hh - fanR * 0.12;
  const fanTop = fanY + fanR;
  const top = hh - 0.3;
  const ry = Math.min(((top - fanTop) / 2) * 1.0, hw * 1.35);
  const rx = Math.min(hw * (camera.aspect < 0.8 ? 0.8 : 0.9), ry * 1.05);
  const ringY = fanTop - fanR * 0.1 + ry * 0.92;
  Object.assign(stage, { hw, hh, ringX: 0, ringY, rx, ry, fanY, fanR });

  const s = Math.min(rx, ry) / 3.4;
  flight = { x: 0, y: ringY - ry * 0.32, sx: rx / 3.8, sy: ry / 5, size: THREE.MathUtils.clamp(s, 0.7, 1.15) };
  for (const b of pair) b.group.scale.setScalar(flight.size);

  scenery.layout(stage, width * pr, height * pr, pr, camBase.z, FOV);
  sparkles.material.uniforms.uPixelRatio.value = pr;

  // Pin the HTML title and caption to the wreath and the fan.
  const toPx = (y) => height / 2 - (y / hh) * (height / 2);
  const unit = height / (2 * hh); // px per world unit
  root.style.setProperty('--title-y', `${toPx(ringY + ry * 0.42)}px`);
  root.style.setProperty('--title-size', `${Math.min(rx, ry) * unit * 0.2}px`);
  root.style.setProperty('--caption-y', `${toPx(fanY + fanR * 0.6)}px`);
  root.style.setProperty('--caption-size', `${Math.min(fanR * unit * 0.13, width * 0.085)}px`);
}

// ---------- Interaction ----------
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / width) * 2 - 1;
  mouse.ty = -((e.clientY / height) * 2 - 1);
});

// Tap / click: the two draw close together for a moment in a burst of gold.
let together = 0;
let embraceUntil = -1;
const clock = new THREE.Timer();
canvas.addEventListener('pointerdown', () => {
  embraceUntil = clock.getElapsed() + 2.4;
  const mid = pair[0].group.position.clone().lerp(pair[1].group.position, 0.5);
  for (let i = 0; i < 140; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(0.6 + Math.random() * 1.6);
    sparkles.emit(mid, v, { hue: Math.random() < 0.3 ? 1 : 0, size: 1.2, lifeTime: 2.2 });
  }
  document.body.classList.add('has-tapped');
});

let introStart = 0;
function restart() {
  introStart = clock.getElapsed();
  for (const t of trails) t.reset();
  sparkles.clear();
}

// ---------- Flight path ----------
const U = new THREE.Vector3(1, 0, 0);
const V = new THREE.Vector3(0, 0.78, 0.62).normalize();
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const FLY_IN = [1.2, 4.6]; // seconds after the intro starts

// Both circle a slowly wandering centre on opposite sides of the same orbit,
// so they always chase each other; the radius breathes and shrinks when they
// "embrace". Everything is scaled to the wreath.
function positionAt(i, t, local, out) {
  const s = i === 0 ? 1 : -1;
  const { sx, sy } = flight;
  const theta = t * 0.85 + 0.35 * Math.sin(t * 0.37);
  const radius = (1.6 + 0.45 * Math.sin(t * 0.29)) * (1 - 0.62 * together);
  out.set(
    flight.x + Math.sin(t * 0.19) * 0.7 * sx,
    flight.y + Math.sin(t * 0.15 + 1.0) * 0.5 * sy,
    Math.sin(t * 0.11) * 0.6,
  );
  out.x += s * radius * Math.cos(theta) * U.x * sx;
  out.y += s * radius * Math.sin(theta) * V.y * sy;
  out.z += s * radius * Math.sin(theta) * V.z;
  // Individual flutter so the two never move in perfect lockstep.
  out.x += Math.sin(t * 1.7 + i * 2.0) * 0.15 * sx;
  out.y += Math.sin(t * 2.3 + i * 4.0) * 0.14 * sy;
  out.z += Math.sin(t * 1.3 + i) * 0.15;

  // Intro: each flies in from its own side along an arc.
  if (local < FLY_IN[1]) {
    const k = easeInOut(Math.max(0, local - FLY_IN[0]) / (FLY_IN[1] - FLY_IN[0]));
    const fromX = -s * (stage.hw + 2);
    const fromY = flight.y + (i === 0 ? 0.8 : -1.2) * sy;
    out.x = THREE.MathUtils.lerp(fromX, out.x, k);
    out.y = THREE.MathUtils.lerp(fromY, out.y, k) + Math.sin(k * Math.PI) * (i === 0 ? 0.5 : -0.8) * sy;
    out.z = THREE.MathUtils.lerp(-1.5, out.z, k);
  }
  return out;
}

// ---------- Loop ----------
const pos = [new THREE.Vector3(), new THREE.Vector3()];
const next = new THREE.Vector3();
const vel = new THREE.Vector3();
const threadPts = Array.from({ length: 48 }, () => new THREE.Vector3());
const ctrl = new THREE.Vector3();
const tmp = new THREE.Vector3();
let emitAcc = 0;

const recorder = createRecorder({
  canvas,
  overlays: [titleEl, captionEl],
  name: 'moi-duyen-vang',
  onStart: restart,
});

function frame(ts) {
  clock.update(ts);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsed();
  const motion = reducedMotion ? 0.25 : 1;
  const ft = t * motion; // flight time
  const local = reducedMotion ? 99 : t - introStart;

  mouse.x += (mouse.tx - mouse.x) * 0.04;
  mouse.y += (mouse.ty - mouse.y) * 0.04;
  together += ((t < embraceUntil ? 1 : 0) - together) * Math.min(1, dt * 2.2);

  // Small parallax only, so the HTML title stays on the wreath.
  camera.position.set(mouse.x * 0.25 + Math.sin(t * 0.1) * 0.12 * motion, mouse.y * 0.18, camBase.z);
  camera.lookAt(0, 0, 0);

  scenery.update(dt, t, local, motion);

  pair.forEach((b, i) => {
    positionAt(i, ft, local, pos[i]);
    positionAt(i, ft + 0.02, local + 0.02, next);
    vel.subVectors(next, pos[i]).divideScalar(0.02);
    b.update(dt, t, pos[i], vel, camera.position);
    trails[i].push(b.group.position, t, camera.position);
  });

  // The golden thread between them: a gently swaying curve with pulses of
  // light running along it.
  const a = pair[0].group.position;
  const c = pair[1].group.position;
  ctrl.addVectors(a, c).multiplyScalar(0.5);
  tmp.subVectors(c, a);
  ctrl.x += -tmp.y * 0.25 * Math.sin(t * 0.8);
  ctrl.y += tmp.x * 0.25 * Math.sin(t * 0.8) - 0.35;
  for (let i = 0; i < threadPts.length; i++) {
    const k = i / (threadPts.length - 1);
    const u = 1 - k;
    threadPts[i].set(
      u * u * a.x + 2 * u * k * ctrl.x + k * k * c.x,
      u * u * a.y + 2 * u * k * ctrl.y + k * k * c.y,
      u * u * a.z + 2 * u * k * ctrl.z + k * k * c.z,
    );
  }
  const threadIn = Math.min(1, Math.max(0, (local - FLY_IN[1] + 0.8) / 1.5));
  thread.set(
    threadPts,
    camera.position,
    (i, n) => 0.014 + 0.012 * Math.sin((i / (n - 1)) * Math.PI),
    (i, n) => {
      const k = i / (n - 1);
      const p1 = (t * 0.35) % 1;
      const p2 = (t * 0.35 + 0.5) % 1;
      const pulse = Math.exp(-((k - p1) ** 2) / 0.006) + Math.exp(-((k - p2) ** 2) / 0.006);
      const ends = Math.min(1, k * 8, (1 - k) * 8);
      return threadIn * ends * (0.35 + 0.15 * together + pulse * 0.9);
    },
  );

  // Glitter shed from the wings.
  emitAcc += dt * 60 * (reducedMotion ? 0.3 : 1);
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const b = pair[Math.random() < 0.5 ? 0 : 1];
    const p = b.randomWingPoint(tmp);
    sparkles.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3), {
      hue: b === pair[1] ? 0.85 : 0.1,
      size: 0.7,
      lifeTime: 1.8,
    });
  }
  sparkles.update(dt, t);

  composer.render();
  recorder.capture();
  requestAnimationFrame(frame);
}

fit();
window.addEventListener('resize', fit);
document.fonts?.ready.then(fit);
requestAnimationFrame(frame);
