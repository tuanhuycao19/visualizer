import './style.css';
import { vertexSource, fragmentSource } from './shader.js';
import { createRecorder } from './record/recorder.js';

const canvas = document.getElementById('waves');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });

if (!gl) {
  document.body.classList.add('no-webgl');
  throw new Error('WebGL2 is not supported in this browser.');
}

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);

// One triangle covering the whole viewport.
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const uRes = gl.getUniformLocation(program, 'uRes');
const uTime = gl.getUniformLocation(program, 'uTime');
const uMouse = gl.getUniformLocation(program, 'uMouse');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
});

const recorder = createRecorder({
  canvas,
  overlays: [document.querySelector('.poster')],
  name: 'new-act',
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const speed = reducedMotion ? 0.15 : 1;
const start = performance.now();

function frame(now) {
  resize();
  mouse.x += (mouse.tx - mouse.x) * 0.04;
  mouse.y += (mouse.ty - mouse.y) * 0.04;

  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform1f(uTime, ((now - start) / 1000) * speed);
  gl.uniform2f(uMouse, mouse.x, mouse.y);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  recorder.capture();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
