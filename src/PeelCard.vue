<!--
  PeelCard — a card you peel off by its edge (WebGL, Vue 3).

  <PeelCard :cards="cards" @change="i => current = i" />
  <PeelCard toggle :cards="[front, back]" @toggle="peeled => ..." ref="card" />

  Props
    cards       Array    [{ bg, back, html }]
                         bg   — front side color (CSS color, backdrop under the html)
                         back — back side paper color (#rrggbb)
                         html — card content, well-formed XHTML (closed tags, <br/>, &#160; instead of &nbsp;).
                                Styles only inside html (<style> or style=""); external files and fonts are unavailable.
    toggle      Boolean  "two cards" mode: the first action peels the top card, the second sticks it back
                         (read once on mount; to change the mode, recreate the component via :key)
    width       Number   card width in logical units (420)
    height      Number   card height (280)
    radius      Number   corner radius (18)
    background  String   "table" color; by default taken from the CSS of the nearest ancestor with a background
    padding     Number   gap between the card and the component edges (16)
    maxScale    Number   maximum zoom (1.35)
    hint        Boolean  show a wiggle hint on start (true)
    clickPeel   Boolean  a click or tap peels the card from the pressed edge (false)
    label       String   aria-label of the canvas
  Events
    grab        first touch of the card
    peel(i)     (normal mode) card i is fully peeled off
    change(i)   (normal mode) card i became the top card
    toggle(b)   (toggle mode) b = true — peeled, false — stuck back
  Methods (via ref)
    peel(angle) peel off; in toggle mode switches the state. angle: tilt in degrees, positive = upward (default 12, 0 = straight)
-->
<template>
  <div ref="root" :style="rootStyle">
    <canvas
      ref="canvas"
      tabindex="0"
      role="img"
      :aria-label="label"
      :style="canvasStyle"
      @focus="onFocus"
      @blur="focused = false"
    ></canvas>
    <div v-if="noGL" :style="noGLStyle"><slot name="fallback">WebGL is not available in this browser.</slot></div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

/* ───────── Curl physics ─────────
   Everything behind the fold line (t < Tf, where t is the coordinate along the pull direction U from the grab point G)
   wraps around a cylinder of radius R through angle Theta, then continues as a straight segment at angle Phi to the plane. */
const RMIN = 18, RBIG = 75, MAXANG = 1.0
const PEEL_ANGLE = 12   // default tilt of peel(), degrees

// How far the grab point moves when the fold is at distance s from it.
function Gfun(s, R, Th, phi) {
  return s <= Th * R ? s - R * Math.sin(s / R) : s - R * Math.sin(phi) + (s - Th * R) * Math.cos(phi)
}
// Inverse problem: find the fold position from the finger displacement d (bisection).
function solveS(d, R, Th, phi) {
  let lo = 0, hi = 4000
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (Gfun(m, R, Th, phi) < d) lo = m; else hi = m }
  return (lo + hi) / 2
}
function geom(d) {
  const R = RMIN + (RBIG - RMIN) * Math.exp(-d / 70)   // the curl starts gentle, then tightens
  const phi = 0.12 + 0.55 * Math.exp(-d / 140)         // edge lift angle
  const Th = Math.PI - phi
  return { R, phi, Th, tf: solveS(d, R, Th, phi), sp: Math.sin(phi), cp: Math.cos(phi) }
}
const dirOf = (nIn, ang) => { const a = Math.atan2(nIn[1], nIn[0]) + ang; return [Math.cos(a), Math.sin(a)] }
function smooth(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x) }
const hexRGB = h => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }

/* ───────── HTML card → SVG foreignObject ───────── */
const svgFor = (c, W, H) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<foreignObject width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:${c.bg || '#ffffff'}">${c.html || ''}</div></foreignObject></svg>`

/* ───────── Shaders ───────── */
const FLAP_UNIFORMS = `
uniform vec2 uG, uU, uHalf;
uniform float uTf, uR, uTheta, uSinPhi, uCosPhi;
`
const VS = `
attribute vec2 aPos;
${FLAP_UNIFORMS}
uniform vec2 uView; uniform float uScale;
varying vec2 vOrig, vXY; varying float vZ, vTh, vS;
void main(){
  float t = dot(aPos-uG, uU);
  float s = uTf - t;
  float tp = t, z = 0.0, th = 0.0;
  if(s > 0.0){
    float arc = uTheta*uR;
    if(s < arc){ th = s/uR; tp = uTf - uR*sin(th); z = uR*(1.0-cos(th)); }
    else{ float e = s-arc; th = uTheta; tp = uTf - uR*uSinPhi + e*uCosPhi; z = uR*(1.0+uCosPhi) + e*uSinPhi; }
  }
  vec2 pos = aPos + uU*(tp-t);
  vOrig = aPos; vXY = pos; vZ = z; vTh = th; vS = s;
  float k = 1.0/(1.0 - min(z,1500.0)/3200.0);
  vec2 xy = pos*uScale*k;
  gl_Position = vec4(xy*2.0/uView, -0.1 - min(z,600.0)*0.0015, 1.0);
}`

const common = RAD => `
precision highp float;
${FLAP_UNIFORMS}
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p)-b+r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float rectMask(vec2 p, float soft){ return smoothstep(-soft*0.5, soft, -sdRR(p, uHalf, ${RAD.toFixed(1)})); }
// Shadow of the folded part: which point of the original card hangs above point q.
float flapShadow(vec2 q){
  float tq = dot(q-uG, uU);
  float tL = uTf - uR, tA = uTf - uR*uSinPhi;
  float s, z, decay = 1.0;
  if(tq < tL){ s = uR*1.5707963; z = uR; decay = exp((tq-tL)/(uR*1.4+4.0)); }
  else if(tq < tA){ float sn = clamp((uTf-tq)/uR,-1.0,1.0); float th = 3.14159265 - asin(sn); s = uR*th; z = uR*(1.0-cos(th)); }
  else{ float e = (tq-tA)/uCosPhi; s = uTheta*uR + e; z = uR*(1.0+uCosPhi) + e*uSinPhi; }
  vec2 po = q + uU*((uTf - s) - tq);
  return rectMask(po, 3.0 + 0.3*z) * decay * exp(-z/110.0);
}`

const fsCard = RAD => `${common(RAD)}
uniform sampler2D uFront; uniform vec3 uBack; uniform float uScale, uAlpha;
varying vec2 vOrig, vXY; varying float vZ, vTh, vS;
void main(){
  float sd = sdRR(vOrig, uHalf, ${RAD.toFixed(1)});
  float a = clamp(0.5 - sd*uScale, 0.0, 1.0);
  if(a <= 0.0) discard;
  float c = cos(vTh);
  bool front = c >= 0.0;
  vec3 nF = vec3(uU*sin(vTh), c);
  vec3 N = front ? nF : -nF;
  vec3 col;
  if(front){ col = texture2D(uFront, vOrig/(2.0*uHalf)+0.5).rgb; }
  else{
    float g = hash(floor(vOrig*2.0));
    float hatch = smoothstep(0.44,0.5,abs(fract((vOrig.x+vOrig.y)/7.0)-0.5));
    col = uBack*(0.975 + 0.03*g - 0.025*hatch);
  }
  vec3 L = normalize(vec3(-0.35,0.5,0.78));
  col *= (0.58 + 0.5*max(dot(N,L),0.0)) / (0.58 + 0.5*L.z);
  vec3 Hh = normalize(L + vec3(0.0,0.0,1.0));
  col += max(pow(max(dot(N,Hh),0.0),48.0) - pow(Hh.z,48.0), 0.0)*0.2;
  if(front && vTh < 1.5707963) col *= 1.0 - 0.55*flapShadow(vXY)*exp(-vZ/16.0);
  gl_FragColor = vec4(col*a*uAlpha, a*uAlpha);
}`

const VS_FLOOR = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }`
const fsFloor = RAD => `${common(RAD)}
uniform sampler2D uBase; uniform vec2 uView; uniform float uScale, uAlpha; uniform vec3 uBg;
void main(){
  vec2 q = (gl_FragCoord.xy - 0.5*uView)/uScale;
  vec2 sc = gl_FragCoord.xy/uView - 0.5;
  vec3 col = uBg*(1.0 - 0.22*dot(sc,sc)*2.0) + (hash(gl_FragCoord.xy)-0.5)*0.012;
  float dsh = sdRR(q - vec2(0.0,-14.0), uHalf, ${RAD.toFixed(1)});
  col *= 1.0 - 0.30*(1.0 - smoothstep(-20.0, 34.0, dsh));
  float dc = sdRR(q - vec2(0.0,-2.0), uHalf, ${RAD.toFixed(1)});
  col *= 1.0 - 0.18*(1.0 - smoothstep(-2.0, 8.0, dc));
  float sd = sdRR(q, uHalf, ${RAD.toFixed(1)});
  float a = clamp(0.5 - sd*uScale, 0.0, 1.0);
  vec3 tex = texture2D(uBase, q/(2.0*uHalf)+0.5).rgb*0.97;
  col = mix(col, tex, a);
  col *= 1.0 - 0.55*flapShadow(q)*uAlpha;
  gl_FragColor = vec4(col,1.0);
}`

/* ───────── Component ───────── */
export default {
  name: 'PeelCard',
  props: {
    cards: { type: Array, required: true },
    toggle: { type: Boolean, default: false },
    width: { type: Number, default: 420 },
    height: { type: Number, default: 280 },
    radius: { type: Number, default: 18 },
    background: { type: String, default: '' },
    padding: { type: Number, default: 16 },
    maxScale: { type: Number, default: 1.35 },
    hint: { type: Boolean, default: true },
    clickPeel: { type: Boolean, default: false },
    label: { type: String, default: 'Card: drag the edge to peel it off' },
  },
  emits: ['grab', 'peel', 'change', 'toggle'],
  setup(props, { emit, expose }) {
    const root = ref(null)
    const canvas = ref(null)
    const grabbing = ref(false)
    const focused = ref(false)
    const noGL = ref(false)
    const rootStyle = { position: 'relative', width: '100%', height: '100%', minHeight: '200px' }
    const noGLStyle = { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', padding: '24px', textAlign: 'center', opacity: '.7' }
    const canvasStyle = computed(() => ({
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block',
      touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      cursor: grabbing.value ? 'grabbing' : 'grab',
      outline: focused.value ? '2px solid currentColor' : 'none', outlineOffset: '-4px',
    }))
    const onFocus = e => { try { focused.value = e.target.matches(':focus-visible') } catch (_) { focused.value = false } }
    let dispose = () => {}
    const api = { peel() {} }

    function init() {
      const cv = canvas.value
      const W = props.width, H = props.height, RAD = props.radius
      const TOG = props.toggle
      const gl = cv.getContext('webgl2', { antialias: true, alpha: false }) || cv.getContext('webgl', { antialias: true, alpha: false })
      if (!gl) { noGL.value = true; return }
      const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
      const N = () => (TOG ? 2 : props.cards.length)
      let alive = true
      const timers = []
      let raf = 0

      /* — programs — */
      const program = (vs, fs) => {
        const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s)
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s }
        const p = gl.createProgram()
        gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs))
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p))
        p.loc = {}
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
        for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; p.loc[nm] = gl.getUniformLocation(p, nm) }
        p.aPos = gl.getAttribLocation(p, 'aPos')
        return p
      }
      const pCard = program(VS, fsCard(RAD))
      const pFloor = program(VS_FLOOR, fsFloor(RAD))

      /* — card mesh (step ≈ 2.5, capped at ~60,000 vertices) — */
      const step = Math.max(2.5, Math.sqrt(((W + 4) * (H + 4)) / 60000))
      const NX = Math.round((W + 4) / step), NY = Math.round((H + 4) / step)
      const MX = W / 2 + 2, MY = H / 2 + 2
      const verts = new Float32Array((NX + 1) * (NY + 1) * 2)
      for (let j = 0, k = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { verts[k++] = -MX + 2 * MX * i / NX; verts[k++] = -MY + 2 * MY * j / NY }
      const idx = new Uint16Array(NX * NY * 6)
      for (let j = 0, k = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1
        idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c
      }
      const meshVB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, meshVB); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
      const meshIB = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
      const quadVB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadVB)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

      /* — textures: HTML → SVG → canvas → GL — */
      let texScale = 2, topIdx = 0
      const texCache = new Map()
      async function renderCard(c) {
        const cw = Math.round(W * texScale), ch = Math.round(H * texScale)
        const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch
        const ctx = c2.getContext('2d')
        let ok = false
        try {
          const img = new Image()
          const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej })
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(c, W, H))
          await loaded
          ctx.drawImage(img, 0, 0, cw, ch)
          ctx.getImageData(0, 0, 1, 1)                 // throws if the canvas is tainted
          ok = true
        } catch (e) { console.warn('[PeelCard] foreignObject unavailable, drawing fallback', e) }
        if (!ok) {                                      // fallback: background and plain text without layout
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.fillStyle = c.bg || '#ffffff'; ctx.fillRect(0, 0, cw, ch)
          const doc = new DOMParser().parseFromString(c.html || '', 'text/html')
          const lines = (doc.body.textContent || '').split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 6)
          ctx.scale(texScale, texScale); ctx.fillStyle = '#222'; ctx.font = '600 22px system-ui,sans-serif'
          lines.forEach((t, i) => ctx.fillText(t, 28, 50 + i * 34))
        }
        return c2
      }
      function ensure(i) {
        if (!N() || !props.cards.length) return Promise.resolve()
        i = ((i % N()) + N()) % N()
        if (texCache.has(i)) return texCache.get(i).promise
        const c = props.cards[i % props.cards.length]
        const entry = { tex: null, back: hexRGB(c.back || '#f2efe6') }
        entry.promise = renderCard(c).then(c2 => {
          if (!alive || texCache.get(i) !== entry) return
          const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          if (isGL2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR) }
          else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          entry.tex = t
        })
        texCache.set(i, entry)
        return entry.promise
      }
      function freeTextures(all) {
        const keep = all ? new Set() : new Set([topIdx, (topIdx + 1) % N(), (topIdx + 2) % N()])
        for (const [i, e] of texCache) if (!keep.has(i)) { if (e.tex) gl.deleteTexture(e.tex); texCache.delete(i) }
      }
      const warm = () => Promise.all([ensure(0), ensure(1), ensure(2)])

      /* — size and background color — */
      let dpr = 1, S = 1, cssW = 1, cssH = 1, cw = 1, ch = 1
      function resize() {
        const r = root.value.getBoundingClientRect()
        cssW = Math.max(1, r.width); cssH = Math.max(1, r.height)
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        cw = Math.round(cssW * dpr); ch = Math.round(cssH * dpr)
        cv.width = cw; cv.height = ch
        S = Math.max(0.3, Math.min(props.maxScale, (cssW - 2 * props.padding) / W, (cssH - 2 * props.padding) / H))
      }
      let bg = [0.9, 0.89, 0.85]
      function readBg() {
        let css = props.background
        if (!css) {
          for (let el = root.value; el; el = el.parentElement) {
            const c = getComputedStyle(el).backgroundColor
            if (c && !/rgba?\(.*,\s*0\)$/.test(c) && c !== 'transparent') { css = c; break }
          }
        }
        const m = (css || '').match(/[\d.]+/g)
        if (m && m.length >= 3) bg = [m[0] / 255, m[1] / 255, m[2] / 255]
      }

      /* — gesture and animation state — */
      const st = {
        mode: 'idle',            // idle | drag | settle | hint | complete | fade | rest
        d: 0, ang: 0, g: [-W / 2, 0], nIn: [1, 0], p0: [0, 0], dT: 0, angT: 0, angBase: 0,
        alpha: 1, t: 0, dEnd: 0, velU: 0, lastDT: 0, lastTime: 0, interacted: false,
        peeled: false, restick: false, pending: false, prog: false,
      }
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      const tap = { ok: false, x: 0, y: 0 }
      const CORNERS = [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]
      const proj = (g, u) => CORNERS.map(c => (c[0] - g[0]) * u[0] + (c[1] - g[1]) * u[1])
      const tmaxOf = (g, u) => Math.max(...proj(g, u))
      // pull distance at which the card is completely peeled away
      const dFullFor = (g, u) => Gfun(tmaxOf(g, u) + 2.2 * RMIN + 20, RMIN, Math.PI - 0.12, 0.12)
      const toUnits = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - r.width / 2) / S, -(e.clientY - r.top - r.height / 2) / S] }

      // grab point on the edge whose inward normal is nIn, as close to p as possible
      function placeAt(nIn, p) {
        const pad = RAD * 0.8, cl = (v, lim) => Math.max(-lim + pad, Math.min(lim - pad, v))
        st.nIn = nIn
        st.g = nIn[0] ? [-nIn[0] * W / 2, cl(p[1], H / 2)] : [cl(p[0], W / 2), -nIn[1] * H / 2]
      }
      function beginDrag(p) {                         // nearest edge and the grab point on it
        const dl = p[0] + W / 2, dr = W / 2 - p[0], db = p[1] + H / 2, dt = H / 2 - p[1]
        const m = Math.min(dl, dr, db, dt)
        placeAt(m === dl ? [1, 0] : m === dr ? [-1, 0] : m === db ? [0, 1] : [0, -1], p)
        st.p0 = p; st.dT = 0; st.angT = 0; st.velU = 0; st.lastDT = 0; st.lastTime = performance.now()
      }
      // A returning card has no remembered side: it comes in from the side the finger pulls away from.
      function resolvePending(p) {
        const vx = p[0] - st.p0[0], vy = p[1] - st.p0[1]
        if (Math.hypot(vx, vy) < 10) return false
        placeAt(Math.abs(vx) >= Math.abs(vy) ? [-Math.sign(vx), 0] : [0, -Math.sign(vy)], st.p0)
        st.pending = false; st.ang = 0; st.angBase = 0; st.angT = 0
        st.dEnd = dFullFor(st.g, st.nIn); st.d = st.dEnd
        st.dT = 0; st.velU = 0; st.lastDT = 0; st.lastTime = performance.now()
        return true
      }
      function trackVel(x) {
        const now = performance.now(), dtm = Math.max(1, now - st.lastTime)
        st.velU += ((x - st.lastDT) / dtm * 1000 - st.velU) * 0.35
        st.lastDT = x; st.lastTime = now
      }
      function updateTargets(p) {                     // where the finger pulls: fold offset and rotation
        const v = [p[0] - st.p0[0], p[1] - st.p0[1]], len = Math.hypot(v[0], v[1])
        if (st.restick) {                              // sticking back: pull against the peel direction
          const w = dirOf(st.nIn, st.angBase).map(x => -x)
          const rel = Math.max(-0.6, Math.min(0.6, Math.atan2(w[0] * v[1] - w[1] * v[0], v[0] * w[0] + v[1] * w[1])))
          st.angT = st.angBase + rel * smooth(6, 70, len)
          const u2 = dirOf(st.nIn, st.angT)
          st.dT = Math.max(0, -(v[0] * u2[0] + v[1] * u2[1]))   // how far it was pulled back
          trackVel(st.dT)
          return
        }
        const dotn = v[0] * st.nIn[0] + v[1] * st.nIn[1], crs = st.nIn[0] * v[1] - st.nIn[1] * v[0]
        const rel = Math.max(-MAXANG, Math.min(MAXANG, Math.atan2(crs, dotn)))
        st.angT = rel * smooth(6, 70, len)
        const u = dirOf(st.nIn, st.angT)
        st.dT = Math.max(0, v[0] * u[0] + v[1] * u[1])
        trackVel(st.dT)
      }
      function startComplete() {
        const u = dirOf(st.nIn, st.prog ? st.angT : st.ang)
        st.dEnd = dFullFor(st.g, u)
        st.alpha = 1
        st.mode = 'complete'
      }
      function endDrag() {
        if (st.mode !== 'drag') return
        grabbing.value = false
        if (st.pending) { st.pending = false; st.restick = false; st.mode = 'rest'; peel(); return }   // a tap brings it back too
        const u = dirOf(st.nIn, st.ang)
        if (st.restick) {
          const f = st.d / dFullFor(st.g, u)
          if (f < 0.6 || (st.velU > 700 && f < 0.9)) st.mode = 'settle'   // stick back
          else startComplete()                                              // return to the peeled position
          return
        }
        const ratio = st.d / tmaxOf(st.g, u)
        if (ratio > 0.32 || (st.velU > 700 && ratio > 0.1)) startComplete(); else st.mode = 'settle'
      }
      // angle: tilt of the peel direction in degrees (positive = upward), 0 = straight
      function peel(angle) {
        const a = Math.max(-MAXANG, Math.min(MAXANG, (typeof angle === 'number' ? angle : PEEL_ANGLE) * Math.PI / 180))
        if (TOG && st.peeled && st.mode === 'rest') {   // reverse of the peel: fade in, then curl back down
          st.nIn = [1, 0]; st.g = [-W / 2, 0]; st.ang = st.angT = a; st.prog = true
          st.dEnd = dFullFor(st.g, dirOf(st.nIn, a)); st.d = st.dEnd; st.t = 0; st.mode = 'unfade'; return
        }
        if (TOG && st.peeled && st.mode === 'drag') { st.restick = false; st.mode = 'settle'; return }
        if (st.mode !== 'idle' && st.mode !== 'hint' && st.mode !== 'settle') return
        if (TOG && st.peeled) return
        st.interacted = true
        st.nIn = [1, 0]; st.g = [-W / 2, 0]; st.ang = 0; st.angT = a; st.prog = true; startComplete()
      }
      api.peel = peel
      function startHint() {
        if (!props.hint || st.mode !== 'idle' || st.interacted || reduced) return
        st.nIn = [1, 0]; st.g = [-W / 2, 0]; st.ang = 0; st.mode = 'hint'; st.t = 0
      }

      const onDown = e => {
        if (st.mode === 'complete' || st.mode === 'fade' || st.mode === 'unfade' || st.mode === 'unpeel') return
        const p = toUnits(e)
        st.prog = false
        if (TOG && st.peeled) {                        // peeled: any touch starts bringing the card back
          if (st.mode !== 'rest') return
          cv.setPointerCapture(e.pointerId); grabbing.value = true
          st.restick = true; st.pending = true; st.p0 = p; st.mode = 'drag'
          return
        }
        if (Math.abs(p[0]) > W / 2 + 30 || Math.abs(p[1]) > H / 2 + 30) return
        cv.setPointerCapture(e.pointerId)
        grabbing.value = true
        if (!st.interacted) emit('grab')
        st.interacted = true
        st.restick = false
        tap.ok = true; tap.x = e.clientX; tap.y = e.clientY
        beginDrag(p); st.mode = 'drag'
      }
      const onMove = e => {
        if (st.mode !== 'drag') return
        if (tap.ok && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.ok = false
        const p = toUnits(e)
        if (st.pending && !resolvePending(p)) return
        updateTargets(p)
      }
      // clickPeel: a press that barely moved peels from the pressed edge
      const onUp = e => {
        if (props.clickPeel && e.type === 'pointerup' && tap.ok && st.mode === 'drag' && !st.restick) {
          tap.ok = false; grabbing.value = false
          st.d = 0; st.ang = 0; st.angT = PEEL_ANGLE * Math.PI / 180; st.prog = true
          startComplete()
          return
        }
        endDrag()
      }
      const onKey = e => { if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); peel() } }
      cv.addEventListener('pointerdown', onDown)
      cv.addEventListener('pointermove', onMove)
      cv.addEventListener('pointerup', onUp)
      cv.addEventListener('pointercancel', onUp)
      cv.addEventListener('keydown', onKey)

      function swapCards() {
        const gone = topIdx
        topIdx = (topIdx + 1) % N()
        st.d = 0; st.ang = 0; st.alpha = 1; st.mode = 'idle'
        ensure(topIdx + 2); freeTextures(false)
        emit('peel', gone); emit('change', topIdx)
      }
      function stepState(dt) {
        switch (st.mode) {
          case 'drag':
            if (st.pending) break
            if (st.restick) {
              const dR = dFullFor(st.g, dirOf(st.nIn, st.ang))
              st.d += (Math.max(0, dR - st.dT) - st.d) * (1 - Math.exp(-dt * 30))
            } else st.d += (Math.min(st.dT, 1500) - st.d) * (1 - Math.exp(-dt * 30))
            st.ang += (st.angT - st.ang) * (1 - Math.exp(-dt * 16))
            break
          case 'settle':
            st.d += (0 - st.d) * (1 - Math.exp(-dt * 9))
            st.ang += (0 - st.ang) * (1 - Math.exp(-dt * 14))   // a rotated fold line curls a corner even at d = 0
            if (st.d < 0.05 && Math.abs(st.ang) < 0.002) {
              st.d = 0; st.ang = 0; st.mode = 'idle'
              if (TOG && st.peeled) { st.peeled = false; emit('toggle', false) }
            }
            break
          case 'hint': {
            st.t += dt; const k = st.t / 1.5
            if (k >= 1) { st.d = 0; st.ang = 0; st.mode = 'idle' }
            else { st.d = 70 * Math.pow(Math.sin(Math.PI * k), 2); st.ang = 0.22 * Math.sin(2 * Math.PI * k) }
            break
          }
          case 'complete':
            st.d += Math.max((st.dEnd - st.d) * (1 - Math.exp(-dt * 6)), 380 * dt)
            if (st.prog) st.ang = st.angT * smooth(6, 70, st.d)   // a tilted fold line curls a corner at small d, so ramp the tilt in
            if (st.d >= st.dEnd) { st.d = st.dEnd; st.mode = 'fade'; st.t = 0 }
            break
          case 'rest':
            break
          case 'fade':
            st.t += dt; st.alpha = Math.max(0, 1 - st.t / 0.28)
            if (st.t >= 0.28) {
              if (!TOG) swapCards()
              else { st.mode = 'rest'; if (!st.peeled) { st.peeled = true; emit('toggle', true) } }
            }
            break
          case 'unfade':
            st.t += dt; st.alpha = Math.min(1, st.alpha + dt / 0.28)
            if (st.alpha >= 1) st.mode = 'unpeel'
            break
          case 'unpeel':
            st.d -= Math.max((st.dEnd - st.d) * (1 - Math.exp(-dt * 6)), 380 * dt)
            st.ang = st.angT * smooth(6, 70, st.d)
            if (st.d <= 0) { st.d = 0; st.ang = 0; st.prog = false; st.mode = 'idle'; st.peeled = false; emit('toggle', false) }
            break
        }
        // dragging a peeled card back: it becomes visible again
        if (TOG && !st.pending && (st.mode === 'drag' || st.mode === 'settle')) st.alpha += (1 - st.alpha) * (1 - Math.exp(-dt * 12))
      }

      /* — rendering — */
      function setCommon(p, gm, u) {
        const L = p.loc
        gl.uniform2f(L.uG, st.g[0], st.g[1]); gl.uniform2f(L.uU, u[0], u[1]); gl.uniform2f(L.uHalf, W / 2, H / 2)
        gl.uniform1f(L.uTf, gm.tf); gl.uniform1f(L.uR, gm.R); gl.uniform1f(L.uTheta, gm.Th)
        gl.uniform1f(L.uSinPhi, gm.sp); gl.uniform1f(L.uCosPhi, gm.cp)
        gl.uniform2f(L.uView, cw, ch); gl.uniform1f(L.uScale, S * dpr)
      }
      function draw() {
        const A = texCache.get(topIdx), B = texCache.get((topIdx + 1) % N())
        gl.viewport(0, 0, cw, ch)
        gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        if (!A || !A.tex || !B || !B.tex) return
        const u = dirOf(st.nIn, st.ang)
        const gm = geom(st.d)

        // 1) table + bottom card + shadows
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND)
        gl.useProgram(pFloor); setCommon(pFloor, gm, u)
        gl.uniform3f(pFloor.loc.uBg, bg[0], bg[1], bg[2]); gl.uniform1f(pFloor.loc.uAlpha, st.alpha)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B.tex); gl.uniform1i(pFloor.loc.uBase, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVB)
        gl.enableVertexAttribArray(pFloor.aPos); gl.vertexAttribPointer(pFloor.aPos, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

        // 2) top (peeled) card
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL)
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.useProgram(pCard); setCommon(pCard, gm, u)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.uniform1i(pCard.loc.uFront, 0)
        gl.uniform3f(pCard.loc.uBack, A.back[0], A.back[1], A.back[2]); gl.uniform1f(pCard.loc.uAlpha, st.alpha)
        gl.bindBuffer(gl.ARRAY_BUFFER, meshVB)
        gl.enableVertexAttribArray(pCard.aPos); gl.vertexAttribPointer(pCard.aPos, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIB)
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
      }
      let last = performance.now()
      function frame(now) {
        if (!alive) return
        const dt = Math.min(0.05, (now - last) / 1000); last = now
        stepState(dt); draw()
        raf = requestAnimationFrame(frame)
      }

      /* — observers and startup — */
      const ro = new ResizeObserver(resize); ro.observe(root.value)
      const mq = matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener && mq.addEventListener('change', readBg)
      const mo = new MutationObserver(readBg); mo.observe(document.documentElement, { attributes: true })
      resize(); readBg()
      texScale = Math.min(3, Math.max(2, S * dpr))

      // Watch content, not array identity: inline `:cards="[a, b]"` is a new array on every parent render.
      const cardsKey = () => props.cards.map(c => `${c.bg}\u0000${c.back}\u0000${c.html}`).join('\u0001')
      const stopWatch = watch(cardsKey, () => {      // cards replaced: re-render textures
        freeTextures(true); topIdx = 0; st.d = 0; st.mode = 'idle'; st.alpha = 1; st.peeled = false; warm()
      })
      warm().then(() => {
        if (!alive) return
        raf = requestAnimationFrame(t => { last = t; frame(t) })
        timers.push(setTimeout(startHint, 900), setTimeout(startHint, 8000))
      })

      dispose = () => {
        alive = false
        cancelAnimationFrame(raf); timers.forEach(clearTimeout)
        stopWatch(); ro.disconnect(); mo.disconnect()
        mq.removeEventListener && mq.removeEventListener('change', readBg)
        cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove)
        cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp)
        cv.removeEventListener('keydown', onKey)
        freeTextures(true)
        gl.deleteBuffer(meshVB); gl.deleteBuffer(meshIB); gl.deleteBuffer(quadVB)
        gl.deleteProgram(pCard); gl.deleteProgram(pFloor)
        const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext()
      }
      if (typeof window !== 'undefined' && window.__PEEL_DEBUG__) window.__peelDebug = st
    }

    onMounted(init)
    onBeforeUnmount(() => dispose())
    expose({ peel: () => api.peel() })
    return { root, canvas, noGL, focused, rootStyle, noGLStyle, canvasStyle, onFocus }
  },
}
</script>
