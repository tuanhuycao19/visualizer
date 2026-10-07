import fixWebmDuration from 'fix-webm-duration';
import './recorder.css';
import { paintDom } from './paint-dom.js';

// Records the page as a video: every frame the WebGL canvas is copied onto an
// offscreen 2D canvas, the HTML overlay is painted on top (see paint-dom.js)
// and that canvas is streamed into a MediaRecorder. Nothing leaves the
// browser; the result is offered as a download.
//
// Usage: const rec = createRecorder({ canvas, overlays, name });
//        ...render the frame...; rec.capture();   // once per frame

const BITRATE = 16_000_000;
const MAX_SIDE = 3840;
const MIME_TYPES = [
  'video/mp4;codecs=avc1.640033',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4', // Safari: no WebM recording, H.264 by default
];
const DURATIONS = [
  { value: 0, label: 'Dừng tay' },
  { value: 5, label: '5 giây' },
  { value: 10, label: '10 giây' },
  { value: 15, label: '15 giây' },
  { value: 30, label: '30 giây' },
  { value: 60, label: '60 giây' },
];
const DEFAULT_DURATION = 10;

export function createRecorder({ canvas, overlays = [], name = 'video', onStart }) {
  const supported =
    typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const mimeType = supported ? (MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '') : '';

  // ---------- UI ----------
  const ui = document.createElement('div');
  ui.className = 'rec';
  ui.dataset.recordIgnore = '';
  ui.innerHTML = `
    <div class="rec__bar">
      <button class="rec__btn" type="button">
        <span class="rec__dot" aria-hidden="true"></span>
        <span class="rec__label">Quay video</span>
      </button>
      <label class="rec__dur">
        <span class="rec__sr">Thời lượng</span>
        <select></select>
      </label>
    </div>
    <div class="rec__result" hidden>
      <video class="rec__preview" controls playsinline muted loop></video>
      <div class="rec__actions">
        <a class="rec__download" download>Tải về</a>
        <button class="rec__close" type="button" aria-label="Đóng">✕</button>
      </div>
      <p class="rec__meta"></p>
    </div>`;
  document.body.append(ui);

  const btn = ui.querySelector('.rec__btn');
  const label = ui.querySelector('.rec__label');
  const select = ui.querySelector('select');
  const result = ui.querySelector('.rec__result');
  const preview = ui.querySelector('.rec__preview');
  const download = ui.querySelector('.rec__download');
  const meta = ui.querySelector('.rec__meta');

  for (const d of DURATIONS) select.add(new Option(d.label, d.value, false, d.value === DEFAULT_DURATION));
  btn.title = 'Quay màn hình thành video (phím R)';

  if (!supported) {
    btn.disabled = true;
    select.disabled = true;
    btn.title = 'Trình duyệt này không hỗ trợ quay video (MediaRecorder).';
  }

  let session = null;
  let lastUrl = '';

  btn.addEventListener('click', () => (session ? stop() : start()));
  ui.querySelector('.rec__close').addEventListener('click', () => {
    result.hidden = true;
    preview.pause();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (!btn.disabled) btn.click();
  });

  function start() {
    let w = canvas.width;
    let h = canvas.height;
    const fit = Math.min(1, MAX_SIDE / Math.max(w, h));
    // Encoders want even dimensions.
    w = Math.max(2, Math.floor((w * fit) / 2) * 2);
    h = Math.max(2, Math.floor((h * fit) / 2) * 2);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { alpha: false });
    // Frame rate 0 + requestFrame(): one video frame per composited page
    // frame, instead of relying on the browser to notice the canvas changed.
    const stream = out.captureStream(0);
    const track = stream.getVideoTracks()[0];

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: BITRATE });
    } catch (err) {
      console.error(err);
      alert('Không khởi tạo được trình quay video trên trình duyệt này.');
      return;
    }

    const current = { out, ctx, track, recorder, startedAt: 0, limit: Number(select.value) };
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => finish(chunks, recorder.mimeType || mimeType, w, h, performance.now() - current.startedAt);
    session = current;

    // Start the page's intro from the beginning so the video does too.
    restartCssAnimations();
    onStart?.();

    result.hidden = true;
    preview.pause();
    ui.classList.add('is-recording');
    select.disabled = true;
    label.textContent = 'Dừng · 00:00';
    btn.title = 'Dừng quay (phím R)';

    recorder.start(1000);
    current.startedAt = performance.now();
  }

  function stop() {
    if (!session) return;
    const { recorder } = session;
    session = null;
    if (recorder.state !== 'inactive') recorder.stop();
    ui.classList.remove('is-recording');
    select.disabled = false;
    label.textContent = 'Đang xử lý…';
    btn.disabled = true;
  }

  async function finish(chunks, type, w, h, durationMs) {
    let blob = new Blob(chunks, { type: type.split(';')[0] || 'video/webm' });
    // MediaRecorder writes WebM without a duration, which breaks seeking.
    if (blob.size && blob.type === 'video/webm') blob = await fixWebmDuration(blob, durationMs, { logger: false });

    btn.disabled = false;
    label.textContent = 'Quay video';
    btn.title = 'Quay màn hình thành video (phím R)';
    if (!blob.size) return;

    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);

    const filename = `${name}-${timestamp()}.${ext}`;
    download.href = lastUrl;
    download.download = filename;
    download.textContent = `Tải về .${ext}`;
    meta.textContent = `${w}×${h} · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
    preview.src = lastUrl;
    result.hidden = false;
    preview.play().catch(() => {});

    download.click();
  }

  // Call once per frame, right after the WebGL scene has been rendered (the
  // drawing buffer is only guaranteed to be readable until the frame ends).
  function capture() {
    if (!session) return;
    const { out, ctx, track, startedAt, limit } = session;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    paintDom(ctx, overlays, out.width / window.innerWidth);
    track.requestFrame?.();

    const elapsed = (performance.now() - startedAt) / 1000;
    label.textContent = `Dừng · ${clock(elapsed)}${limit ? ` / ${clock(limit)}` : ''}`;
    if (limit && elapsed >= limit) stop();
  }

  return {
    capture,
    get recording() {
      return Boolean(session);
    },
  };
}

function restartCssAnimations() {
  for (const a of document.getAnimations?.() ?? []) {
    if (a.effect?.target?.closest?.('.rec')) continue;
    a.cancel();
    a.play();
  }
}

function clock(seconds) {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
