// Full-screen fragment shader: grainy swirling "sand" background + glossy
// striated blue ribbons that flow over time.

export const vertexSource = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const fragmentSource = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;   // -1..1, eased
out vec4 outColor;

// ---------- noise ----------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}

// ---------- background: domain-warped marble rendered as sparkling grain ----------
vec3 background(vec2 p, vec2 frag, float t) {
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t * 0.05)),
                fbm(p * 1.4 + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(fbm(p * 1.4 + 3.5 * q + vec2(1.7, 9.2) + t * 0.06),
                fbm(p * 1.4 + 3.5 * q + vec2(8.3, 2.8) - t * 0.05));
  float f = fbm(p * 1.6 + 3.0 * r);

  // Thin bright "veins" where the warped field folds, plus softer body.
  float veins = pow(1.0 - abs(f * 2.0 - 1.0), 6.0);
  float body = smoothstep(0.3, 0.8, f) * 0.8 + veins * 1.1;
  body *= 0.6 + 0.6 * length(q);

  // Grain: per-pixel random dots whose density follows the marble pattern.
  vec2 cell = floor(frag / 1.5);
  float g = hash(cell);
  float twinkle = hash(cell + floor(t * 8.0));
  float speck = step(1.0 - clamp(body * 1.15, 0.0, 1.0) * 0.97, g);
  float bright = speck * (0.55 + 0.45 * twinkle);

  vec3 navy = vec3(0.006, 0.02, 0.085);
  vec3 dust = mix(vec3(0.05, 0.22, 0.72), vec3(0.45, 0.72, 1.0), hash(cell + 7.1));
  vec3 col = navy + body * vec3(0.015, 0.07, 0.26);   // soft haze
  col += dust * bright * 0.85;
  return col;
}

// ---------- ribbons: contour bands of a smooth flowing field ----------
// Returns rgb in .xyz and coverage in .w ; shadow written to sh.
vec4 ribbons(vec2 p, float t, out float sh) {
  vec2 m = uMouse * 0.08;
  float w = 0.30 * sin(p.y * 2.2 + t * 0.35 + m.y * 3.0)
          + 0.22 * sin(p.x * 1.6 - t * 0.27 + p.y * 1.3)
          + 0.16 * sin(length(p - vec2(0.9, -0.2) + m) * 4.0 - t * 0.45)
          + 0.08 * sin(p.x * 3.7 + p.y * 2.9 + t * 0.6);
  float F = p.x * 0.75 - p.y * 0.55 + w;

  float k = F * 3.2;
  float id = floor(k);
  float b = fract(k);

  // Each ribbon twists: its half-width breathes along its length.
  vec2 perp = vec2(0.55, 0.75);
  float twist = sin(dot(p, perp) * 2.4 + id * 1.7 - t * 0.5);
  float hw = 0.27 + 0.13 * twist;          // fraction of band period
  float center = 0.5;
  float s = (b - center) / hw;             // -1..1 inside ribbon
  float aa = fwidth(b) * 1.5 / hw;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0, abs(s));

  // Region where ribbons live: right side and bottom, like the poster.
  float region = max(smoothstep(0.05, 0.55, p.x + 0.12 * sin(p.y * 3.0 + t * 0.2)),
                     smoothstep(-0.28, -0.52, p.y + 0.08 * sin(p.x * 2.5 - t * 0.25)));
  // Some ribbon slots stay empty so they read as separate strands.
  float present = step(0.28, hash(vec2(id, 3.7)));
  float vis = region * present;

  // Soft contact shadow just outside a ribbon.
  float outside = clamp((abs(s) - 1.0) * hw * 6.0, 0.0, 1.0);
  sh = 1.0 - vis * (1.0 - outside) * 0.85 * (1.0 - inside);

  // Tube shading.
  float sc = clamp(s, -1.0, 1.0);
  float n = sqrt(max(1.0 - sc * sc, 0.0));
  float light = clamp(0.35 + 0.65 * n + 0.25 * sc * twist, 0.0, 1.0);
  vec3 deep  = vec3(0.0, 0.015, 0.22);
  vec3 royal = vec3(0.04, 0.13, 0.95);
  vec3 col = mix(deep, royal, pow(light, 1.4));

  // Fine striations running along the ribbon (anti-aliased).
  float stripeFreq = 45.0;
  float dk = fwidth(k) * stripeFreq;
  float stripes = 0.5 + 0.5 * sin(k * stripeFreq * 6.2831);
  stripes = mix(stripes, 0.5, clamp(dk * 1.5, 0.0, 1.0));
  col *= 0.62 + 0.55 * stripes;

  // Specular sheen sliding across the folds.
  float spec = pow(max(1.0 - abs(sc - 0.35 * twist), 0.0), 18.0);
  col += spec * vec3(0.25, 0.4, 1.0) * 0.55;

  // Ribbons fade into the dark where they recede.
  col *= 0.35 + 0.65 * smoothstep(0.0, 0.6, region);

  return vec4(col, inside * vis);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime;

  vec3 col = background(p, frag, t);

  float sh;
  vec4 rb = ribbons(p, t, sh);
  col *= sh;
  col = mix(col, rb.rgb, rb.a);

  // Vignette + gentle film grain.
  float vig = smoothstep(1.25, 0.25, length(p * vec2(0.9, 1.0)));
  col *= 0.55 + 0.45 * vig;
  col += (hash(frag + fract(t) * 91.0) - 0.5) * 0.025;

  outColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}
`;
