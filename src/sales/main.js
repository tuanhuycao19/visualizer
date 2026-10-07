import './style.css';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { sales, period } from './data.js';
import { createBackdrop, createDust, createRings } from './background.js';

const canvas = document.getElementById('scene');
const labelsEl = document.getElementById('labels');
const totalEl = document.getElementById('total');
const headerEl = document.querySelector('.header');
const footerEl = document.querySelector('.footer');
document.getElementById('period').textContent = period;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = new Intl.NumberFormat('vi-VN');

// ---------- Chart geometry (world units) ----------
const TRACK_LEN = 10;
const BAR_H = 0.62;
const BAR_D = 0.5;
const RADIUS = 0.1;
const MIN_LEN = 2 * RADIUS + 0.002;
const maxValue = Math.max(...sales.map((d) => d.value));

// Two layouts: labels beside the bars (wide screens) or above them (portrait).
const LAYOUTS = {
  wide: { gap: 1.12, left: 5.0, right: 1.9, extraTop: 0, rotY: -0.2, rotX: 0.1 },
  narrow: { gap: 1.8, left: 0.2, right: 1.7, extraTop: 0.75, rotY: -0.09, rotX: 0.08 },
};

// ---------- Renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.classList.add('no-webgl');
  throw err;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight('#9cc4ff', '#0a1030', 0.6));
const key = new THREE.DirectionalLight('#ffffff', 1.6);
key.position.set(-6, 8, 10);
scene.add(key);
const rim = new THREE.PointLight('#5a8dff', 40, 40, 1.6);
rim.position.set(12, -4, 6);
scene.add(rim);
const warm = new THREE.PointLight('#ff6a4a', 25, 30, 1.6);
warm.position.set(-8, 5, 4);
scene.add(warm);

const backdrop = createBackdrop();
scene.add(backdrop);
const dust = createDust();
scene.add(dust);
const rings = createRings();
scene.add(rings);

// ---------- Chart ----------
const chartRoot = new THREE.Group(); // rotates around the content centre
const chart = new THREE.Group(); // bars start at x = 0
chartRoot.add(chart);
scene.add(chartRoot);

// Frosted card behind the rows, like the panel in the original infographic.
const panelMat = new THREE.MeshPhysicalMaterial({
  color: '#6f8fe8',
  roughness: 0.25,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.2,
  transparent: true,
  opacity: 0.05,
  depthWrite: false,
});
const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), panelMat);
chart.add(panel);

const trackGeo = new RoundedBoxGeometry(TRACK_LEN, BAR_H, 0.22, 4, RADIUS);
trackGeo.translate(TRACK_LEN / 2, 0, -0.22);

// The fill bar is a tiny rounded box whose right half is pushed out in the
// vertex shader, so the corners stay round at every length while growing.
const fillGeo = new RoundedBoxGeometry(MIN_LEN, BAR_H, BAR_D, 5, RADIUS);
fillGeo.translate(MIN_LEN / 2, 0, 0);

function makeFillMaterial(d) {
  const uniforms = {
    uStretch: { value: 0 },
    uLen: { value: MIN_LEN },
    uSheen: { value: -5 },
    uAccent: { value: new THREE.Color(d.accent) },
    uGlow: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: d.color,
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    emissive: d.color,
    emissiveIntensity: 0.12,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uStretch;
        uniform float uLen;
        varying float vBarX;
        varying float vLocalX;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.x += step(${(MIN_LEN / 2 - 0.0005).toFixed(4)}, position.x) * uStretch;
        vLocalX = transformed.x;
        vBarX = transformed.x / max(uLen, 0.001);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSheen;
        uniform vec3 uAccent;
        uniform float uGlow;
        varying float vBarX;
        varying float vLocalX;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.78, 1.06, smoothstep(0.0, 1.0, vBarX));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sheen = exp(-pow((vLocalX - uSheen) / 0.35, 2.0));
        totalEmissiveRadiance += uAccent * (sheen * 0.9 + uGlow);`,
      );
  };
  return { mat, uniforms };
}

const rows = sales.map((d, i) => {
  const group = new THREE.Group();
  const holder = new THREE.Group(); // animated (hover lift, intro scale)
  group.add(holder);

  const trackMat = new THREE.MeshPhysicalMaterial({
    color: '#3a4f8f',
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.userData.index = i;
  track.renderOrder = 1;

  const { mat, uniforms } = makeFillMaterial(d);
  const fill = new THREE.Mesh(fillGeo, mat);
  fill.frustumCulled = false;
  fill.userData.index = i;
  fill.renderOrder = 2;

  holder.add(track, fill);
  chart.add(group);

  const label = document.createElement('div');
  label.className = 'row-label';
  label.setAttribute('role', 'listitem');
  label.innerHTML = `<span class="badge badge--${i + 1}">${i + 1}</span><span class="brand"></span>`;
  label.querySelector('.brand').textContent = d.brand;
  label.setAttribute('aria-label', `Hạng ${i + 1}: ${d.brand}, ${fmt.format(d.value)} xe`);

  const value = document.createElement('div');
  value.className = 'row-value';
  value.style.color = d.text;
  value.setAttribute('aria-hidden', 'true');
  value.textContent = '0';
  labelsEl.append(label, value);

  const finalLen = Math.max(MIN_LEN, (d.value / maxValue) * TRACK_LEN);
  return { d, i, group, holder, track, trackMat, fill, uniforms, label, value, finalLen, hover: 0, shown: -1 };
});

// ---------- Layout & camera fit ----------
let layoutName = '';
let layout = LAYOUTS.wide;
let pxPerUnit = 40;
let lookY = 0;
const size = { w: 1, h: 1 };

function applyLayout(name) {
  layoutName = name;
  layout = LAYOUTS[name];
  labelsEl.dataset.layout = name;
  const n = rows.length;
  rows.forEach((r) => {
    r.group.position.y = ((n - 1) / 2 - r.i) * layout.gap - layout.extraTop / 2;
  });
  const contentW = layout.left + TRACK_LEN + layout.right;
  chart.position.x = -(contentW / 2 - layout.left);
  const panelH = n * layout.gap + 0.5 + layout.extraTop;
  panel.scale.set(contentW + 0.6, panelH, 0.05);
  panel.position.set(contentW / 2 - layout.left, 0, -0.75);
}

function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  size.w = w;
  size.h = h;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  backdrop.material.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  dust.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();

  const name = w / h < 0.95 ? 'narrow' : 'wide';
  if (name !== layoutName) applyLayout(name);

  const top = headerEl.getBoundingClientRect().bottom + 12;
  const bottom = footerEl.getBoundingClientRect().top - 12;
  const availW = w - 32;
  const availH = Math.max(120, bottom - top);
  const contentW = (layout.left + TRACK_LEN + layout.right) * 1.08;
  const contentH = (rows.length * layout.gap + layout.extraTop + 0.4) * 1.06;
  pxPerUnit = Math.min(availW / contentW, availH / contentH);

  camera.aspect = w / h;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  camera.position.z = h / pxPerUnit / (2 * Math.tan(fovRad / 2));
  camera.updateProjectionMatrix();
  lookY = ((top + availH / 2) - h / 2) / pxPerUnit;
  document.documentElement.style.setProperty('--u', `${pxPerUnit.toFixed(2)}px`);
}

// ---------- Post-processing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- Interaction ----------
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const pointer = new THREE.Vector2(9, 9);
const raycaster = new THREE.Raycaster();
const pickables = rows.flatMap((r) => [r.track, r.fill]);
let hovered = -1;

window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / size.w) * 2 - 1;
  mouse.ty = -((e.clientY / size.h) * 2 - 1);
  pointer.set(mouse.tx, mouse.ty);
});
window.addEventListener('pointerleave', () => pointer.set(9, 9));

let introStart = 0;
const clock = new THREE.Timer();
function replay() {
  introStart = clock.getElapsed();
}
document.getElementById('replay').addEventListener('click', replay);

// ---------- Animation helpers ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeOutBack = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

const ROW_DELAY = 0.9;
const ROW_STAGGER = 0.14;
const GROW = 1.9;

const tmp = new THREE.Vector3();
function toScreen(obj, x, y, z) {
  tmp.set(x, y, z);
  obj.localToWorld(tmp);
  tmp.project(camera);
  return [(tmp.x * 0.5 + 0.5) * size.w, (-tmp.y * 0.5 + 0.5) * size.h];
}

function frame(ts) {
  clock.update(ts);
  const t = clock.getElapsed();
  const bgTime = t * (reducedMotion ? 0.2 : 1);
  const sway = reducedMotion ? 0.2 : 1;
  const local = reducedMotion ? 99 : t - introStart;

  mouse.x += (mouse.tx - mouse.x) * 0.04;
  mouse.y += (mouse.ty - mouse.y) * 0.04;

  backdrop.material.uniforms.uTime.value = bgTime;
  backdrop.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
  dust.material.uniforms.uTime.value = bgTime;
  for (const ring of rings.children) {
    ring.rotation.x += ring.userData.spin.x * 0.016 * sway;
    ring.rotation.y += ring.userData.spin.y * 0.016 * sway;
    ring.rotation.z += ring.userData.spin.z * 0.016 * sway;
  }

  // Gentle camera drift + mouse parallax.
  camera.position.x = (Math.sin(bgTime * 0.13) * 0.5 + mouse.x * 0.9) * sway;
  camera.position.y = lookY + (Math.cos(bgTime * 0.11) * 0.3 + mouse.y * 0.5) * sway;
  camera.lookAt(0, lookY, 0);

  // Chart enters tilted back, then settles into a slow sway.
  const enter = easeOutQuart(clamp01((local - 0.1) / 1.6));
  chartRoot.rotation.y = layout.rotY + (1 - enter) * -0.5 + Math.sin(bgTime * 0.21) * 0.04 * sway + mouse.x * 0.06;
  chartRoot.rotation.x = layout.rotX + (1 - enter) * 0.35 + Math.sin(bgTime * 0.17) * 0.025 * sway - mouse.y * 0.04;
  chartRoot.position.z = (1 - enter) * -4;
  panelMat.opacity = 0.05 * enter;

  // Hover picking.
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  const nextHover = hit ? hit.object.userData.index : -1;
  if (nextHover !== hovered) {
    if (hovered >= 0) rows[hovered].label.classList.remove('is-hover');
    if (nextHover >= 0) rows[nextHover].label.classList.add('is-hover');
    hovered = nextHover;
  }

  let runningTotal = 0;
  for (const r of rows) {
    const start = ROW_DELAY + r.i * ROW_STAGGER;
    const appear = clamp01((local - start) / 0.6);
    const grow = easeOutQuart(clamp01((local - start - 0.15) / GROW));

    r.hover += ((hovered === r.i ? 1 : 0) - r.hover) * 0.12;
    r.holder.scale.set(1, Math.max(0.001, easeOutBack(appear)), 1 + r.hover * 0.3);
    r.holder.position.z = Math.sin(bgTime * 0.9 + r.i * 0.7) * 0.06 * sway + r.hover * 0.45;
    r.trackMat.opacity = 0.28 * appear + r.hover * 0.12;

    const len = MIN_LEN + (r.finalLen - MIN_LEN) * grow;
    r.uniforms.uStretch.value = len - MIN_LEN;
    r.uniforms.uLen.value = len;
    r.fill.visible = appear > 0;

    // Periodic light sweep along each bar once the intro is done.
    const cycle = 7;
    const phase = ((local - start - GROW) - r.i * 0.18) % cycle;
    r.uniforms.uSheen.value = phase > 0 && phase < 1.6 ? -0.6 + (phase / 1.6) * (len + 1.2) : -5;
    r.uniforms.uGlow.value = r.hover * 0.25 + (r.i === 0 ? (0.5 + 0.5 * Math.sin(bgTime * 1.6)) * 0.08 : 0);

    const shown = Math.round(r.d.value * grow);
    runningTotal += shown;
    if (shown !== r.shown) {
      r.value.textContent = fmt.format(shown);
      r.shown = shown;
    }

    const op = appear.toFixed(3);
    const lift = r.hover * 0.45 + r.holder.position.z;
    if (layoutName === 'wide') {
      const [lx, ly] = toScreen(r.group, -0.35, 0, lift);
      r.label.style.transform = `translate3d(${lx}px, ${ly}px, 0) translate(-100%, -50%) translateX(${(1 - appear) * -24}px)`;
    } else {
      const [lx, ly] = toScreen(r.group, 0, BAR_H / 2 + 0.08, lift);
      r.label.style.transform = `translate3d(${lx}px, ${ly}px, 0) translate(0, -100%) translateY(${(1 - appear) * 12}px)`;
    }
    const [vx, vy] = toScreen(r.group, len + 0.28, 0, lift + BAR_D / 2);
    r.value.style.transform = `translate3d(${vx}px, ${vy}px, 0) translate(0, -50%) scale(${1 + r.hover * 0.12})`;
    r.label.style.opacity = op;
    r.value.style.opacity = op;
  }
  totalEl.textContent = fmt.format(runningTotal);

  composer.render();
  requestAnimationFrame(frame);
}

fit();
window.addEventListener('resize', fit);
document.fonts?.ready.then(fit);
requestAnimationFrame(frame);

