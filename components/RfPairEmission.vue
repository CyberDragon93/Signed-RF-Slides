<script>
// Module-scope caches: unique ids per instance; every (world, alpha) slice is
// deterministic, so compute it once, share across instances, prewarm after
// mount.
let peUidCounter = 0
const peMemo = new Map()
function peMemoGet(key, fn) {
  if (!peMemo.has(key)) peMemo.set(key, fn())
  return peMemo.get(key)
}
const pePrewarmed = new Set()
</script>

<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import {
  ALPHA_DETENTS,
  CORE,
  DENSITY,
  PALETTE,
  SKEW,
  TWIN,
  alphaDetentFrac,
  gaussianPdf,
  quantileSeeds,
  reachFrontiers,
  signedDensity,
  simulateAdaptive,
  simulateTrajectories,
  zeroBranches,
  zeroCrossings,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

// ---- Worlds: switchable data modes (all interior-wedge topologies) ----------
const WORLDS = [
  { id: 'paper', label: 'paper', setup: DENSITY },
  { id: 'lens', label: 'lens', setup: CORE },
  { id: 'twin', label: 'twin', setup: TWIN },
  { id: 'skew', label: 'skew', setup: SKEW },
]

const width = 900
const uid = `pe1d-${peUidCounter++}`
const panelX = 104
const panelW = 640
const panelY = 54
const stripX = 22
const stripW = 70
const stripRight = stripX + stripW
const RSTRIP_X = 764
const RSTRIP_W = 104
const SWEEP = 7.0 // seconds, forward t: 0 -> 1
const HOLD = 1.6
const CYCLE = SWEEP + HOLD
const FLASH = 0.06 // pair-production flash span in t-units

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- Interactive state -------------------------------------------------------
const worldId = ref('paper')
const alphaSel = ref(DENSITY.alpha)
const alphaPrev = ref(DENSITY.alpha)
const alphaAnim = ref(DENSITY.alpha)
// blendW eases 0 -> 1 after every commit: heat crossblend + morph window.
const blendW = ref(1)
// True when the last commit changed alpha within the same world (geometry is
// then continuous, so boundary curves can morph instead of swapping).
let wedgeMorph = false
const prevHeatUrl = ref('')

const world = computed(() => WORLDS.find(w => w.id === worldId.value) || WORLDS[0])
const setup = computed(() => world.value.setup)
const domain = computed(() => setup.value.domain)

// ---- Deterministic per-(world, alpha) slice ----------------------------------
function frontAt(curve, t) {
  const { ts, xs } = curve
  const n = ts.length
  if (t < ts[0]) return NaN
  if (t >= ts[n - 1]) return xs[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const span = ts[hi] - ts[lo]
  return span > 0 ? xs[lo] + ((t - ts[lo]) / span) * (xs[hi] - xs[lo]) : xs[lo]
}

function buildEmissions(a, su, frontiers) {
  // One demo pair per wedge edge; single-wedge worlds get two production
  // times, multi-wedge worlds one (keeps the picture readable).
  const dts = frontiers.length > 1 ? [0.16] : [0.09, 0.33]
  const eps = 0.07
  const pairs = []
  for (let k = 0; k < frontiers.length; k += 1) {
    const f = frontiers[k]
    for (const dt of dts) {
      const t0 = Math.min(0.97, f.tTip + dt)
      const gl = frontAt(f.left, t0)
      const gh = frontAt(f.right, t0)
      const roots = zeroCrossings(t0, a, su).filter(r => r > gl && r < gh)
      if (roots.length < 2) continue
      const rl = roots[0]
      const ru = roots[roots.length - 1]
      pairs.push(
        { id: `w${k}-lo-${dt}`, t: t0, xb: rl, ghost: simulateAdaptive(rl - eps, t0, a, su), reject: simulateAdaptive(rl + eps, t0, a, su) },
        { id: `w${k}-hi-${dt}`, t: t0, xb: ru, ghost: simulateAdaptive(ru + eps, t0, a, su), reject: simulateAdaptive(ru - eps, t0, a, su) },
      )
    }
  }
  pairs.sort((a2, b2) => a2.t - b2.t)
  return pairs
}

// Terminal (t = 1) zone segments for the annotated right strip: the ghost
// region's extent is exactly the gap between each frontier pair minus the
// negative wedge inside it.
function buildZones1(a, su, frontiers) {
  const [lo, hi] = su.domain
  const gaps = frontiers.map(f => [f.left.xs[f.left.xs.length - 1], f.right.xs[f.right.xs.length - 1]])
  const typeOf = (x) => {
    if (signedDensity(x, 1, a, su) < 0) return 'neg'
    for (const [gl, gh] of gaps) {
      if (x >= gl && x <= gh) return 'ghost'
    }
    return 'reach'
  }
  const n = 320
  const segs = []
  let cur = null
  for (let i = 0; i <= n; i += 1) {
    const x = lo + (i / n) * (hi - lo)
    const ty = typeOf(x)
    if (!cur || cur.type !== ty) {
      cur = { type: ty, x0: x, x1: x }
      segs.push(cur)
    } else {
      cur.x1 = x
    }
  }
  return segs
}

function renderHeat(a, su, frontiers) {
  if (typeof document === 'undefined') return ''
  const W = 300
  const H = 220
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const [dLo, dHi] = su.domain
  const img = ctx.createImageData(W, H)
  const cReach = [73, 105, 226]
  const cGhost = [232, 232, 227]
  const cNeg = [227, 74, 146]
  const vals = new Float64Array(W * H)
  const gapsPerCol = []
  let maxAbs = 1e-12
  for (let px = 0; px < W; px += 1) {
    const t = px / (W - 1)
    gapsPerCol.push(frontiers.map(f => [frontAt(f.left, t), frontAt(f.right, t)]))
    for (let py = 0; py < H; py += 1) {
      const x = dHi - (py / (H - 1)) * (dHi - dLo)
      const v = signedDensity(x, t, a, su)
      vals[py * W + px] = v
      const av = Math.abs(v)
      if (av > maxAbs) maxAbs = av
    }
  }
  for (let py = 0; py < H; py += 1) {
    const x = dHi - (py / (H - 1)) * (dHi - dLo)
    for (let px = 0; px < W; px += 1) {
      const v = vals[py * W + px]
      let c = cReach
      let aScale = 1
      if (v < 0) {
        c = cNeg
      } else {
        for (const [gl, gh] of gapsPerCol[px]) {
          if (Number.isFinite(gl) && x >= gl && x <= gh) {
            c = cGhost
            aScale = 0.45
            break
          }
        }
      }
      const aPix = 0.02 + 0.28 * Math.pow(Math.abs(v) / maxAbs, 0.75)
      const o = 4 * (py * W + px)
      img.data[o] = c[0]
      img.data[o + 1] = c[1]
      img.data[o + 2] = c[2]
      img.data[o + 3] = Math.round(255 * clamp(aPix * aScale))
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function sliceFor(wid, a) {
  return peMemoGet(`pe|${wid}|${a}`, () => {
    const su = WORLDS.find(w => w.id === wid).setup
    const frontiers = reachFrontiers(a, su)
    return {
      frontiers,
      zeroLines: zeroBranches(a, su, 160),
      transported: simulateTrajectories(quantileSeeds(17), a, su, 480),
      pairs: buildEmissions(a, su, frontiers),
      heat: renderHeat(a, su, frontiers),
      zones1: buildZones1(a, su, frontiers),
    }
  })
}

const slice = computed(() => sliceFor(worldId.value, alphaSel.value))

// ---- Layout & scales ----------------------------------------------------------
const layout = computed(() => {
  const sliderY = props.height - 46
  const panelH = sliderY - 14 - panelY
  return { sliderY, panelH, legendY: props.height - 28 }
})
const tX = d3.scaleLinear().domain([0, 1]).range([panelX, panelX + panelW])
const yScale = computed(() => d3.scaleLinear()
  .domain(domain.value)
  .range([panelY + layout.value.panelH, panelY]))
const slider = computed(() => ({ x: 150, y: layout.value.sliderY, w: 175 }))
const aSlider = computed(() => ({ x: 540, y: layout.value.sliderY, w: 175 }))

// ---- KaTeX labels ---------------------------------------------------------------
const sourceLabel = mathHtml('\\pi_0=\\mathcal{N}(0,1)')
const zeroChipHtml = `zero set ${mathHtml('\\Omega_t^0')}`
const ghostChipHtml = 'ghost boundary'
const stripTitle = mathHtml('\\pi_1^{\\mathtt{sign}}')
const zoneHtml = {
  reach: mathHtml('\\Omega^{r}'),
  ghost: mathHtml('\\Omega^{g}'),
  neg: mathHtml('\\Omega^{-}'),
}
const zoneColor = {
  reach: PALETTE.samplingDark,
  ghost: PALETTE.bufferDark,
  neg: PALETTE.negativeDark,
}
const legendHtml = [
  '<span class="pe-key"><span class="pe-chip pe-chip-ghost">+</span>&nbsp;ghost particle</span>',
  '<span class="pe-key"><span class="pe-chip pe-chip-neg">−</span>&nbsp;negative particle</span>',
  `<span class="pe-key pe-note">created in pairs on ${mathHtml('\\Omega_t^0')} — never transported from ${mathHtml('\\pi_0')}</span>`,
].join('')
const alphaReadout = computed(() => mathHtml(`\\alpha = ${alphaSel.value.toFixed(2)}`))

// ---- Static paths ----------------------------------------------------------------
function polyPath(pts) {
  let d = ''
  for (const [px, py] of pts) d += (d ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1)
  return d
}

// Resample a frontier curve to a fixed grid so two alphas can be lerped.
function resampleFrontier(c, n = 80) {
  const t0 = c.ts[0]
  const out = { t0, xs: new Float64Array(n + 1) }
  for (let k = 0; k <= n; k += 1) {
    out.xs[k] = frontAt(c, t0 + (k / n) * (1 - t0))
  }
  return out
}

const zeroBranchPaths = computed(() => {
  const ys = yScale.value
  const lines = wedgeMorph && blendW.value < 1
    ? zeroBranches(alphaAnim.value, setup.value, 60, 0.35, 220)
    : slice.value.zeroLines
  return lines.map((line) => {
    let d = ''
    for (const [t, xv] of line) d += (d ? 'L' : 'M') + tX(t).toFixed(1) + ',' + ys(xv).toFixed(1)
    return d
  })
})

const frontierPaths = computed(() => {
  const ys = yScale.value
  const cur = slice.value.frontiers
  const w = blendW.value
  const prev = wedgeMorph && w < 1
    ? sliceFor(worldId.value, alphaPrev.value).frontiers
    : null
  return cur.flatMap((f, k) => [f.left, f.right].map((c, side) => {
    if (prev && prev.length === cur.length) {
      // Continuous morph: lerp the resampled previous/current curves.
      const A = resampleFrontier(prev[k][side === 0 ? 'left' : 'right'])
      const B = resampleFrontier(c)
      const t0 = A.t0 + (B.t0 - A.t0) * w
      const n = B.xs.length - 1
      const pts = []
      for (let i = 0; i <= n; i += 1) {
        const t = t0 + (i / n) * (1 - t0)
        pts.push([tX(t), ys(A.xs[i] + (B.xs[i] - A.xs[i]) * w)])
      }
      return polyPath(pts)
    }
    const nPts = c.ts.length
    const stride = Math.max(1, Math.floor(nPts / 260))
    const pts = []
    for (let i = 0; i < nPts; i += stride) pts.push([tX(c.ts[i]), ys(c.xs[i])])
    pts.push([tX(c.ts[nPts - 1]), ys(c.xs[nPts - 1])])
    return polyPath(pts)
  }))
})

function curvePathD(c, ys) {
  const n = c.ts.length
  const stride = Math.max(1, Math.floor(n / 220))
  let d = ''
  for (let i = 0; i < n; i += stride) d += (d ? 'L' : 'M') + tX(c.ts[i]).toFixed(1) + ',' + ys(c.xs[i]).toFixed(1)
  d += 'L' + tX(c.ts[n - 1]).toFixed(1) + ',' + ys(c.xs[n - 1]).toFixed(1)
  return d
}

const transportedPaths = computed(() => {
  const ys = yScale.value
  const { times, paths } = slice.value.transported
  return paths.map((arr) => {
    let d = ''
    for (let i = 0; i < arr.length; i += 3) d += (d ? 'L' : 'M') + tX(times[i]).toFixed(1) + ',' + ys(arr[i]).toFixed(1)
    return d
  })
})

const pairShapes = computed(() => {
  const ys = yScale.value
  return slice.value.pairs.map(p => ({
    id: p.id,
    t: p.t,
    cx: tX(p.t),
    cy: ys(p.xb),
    ghost: curvePathD(p.ghost, ys),
    reject: curvePathD(p.reject, ys),
  }))
})

// ---- Right strip: terminal signed density with zone fills + labels -----------
const rstrip = computed(() => {
  const su = setup.value
  const a = alphaSel.value
  const ys = yScale.value
  const [dLo, dHi] = su.domain
  let maxAbs = 1e-9
  const nG = 200
  for (let i = 0; i <= nG; i += 1) {
    const x = dLo + (i / nG) * (dHi - dLo)
    maxAbs = Math.max(maxAbs, Math.abs(signedDensity(x, 1, a, su)))
  }
  const baseX = RSTRIP_X + 34
  const k = (RSTRIP_W - 40) / maxAbs
  const sAt = x => signedDensity(x, 1, a, su)
  const segs = slice.value.zones1.map(seg => ({
    type: seg.type,
    line: d3.line().x(x => baseX + k * sAt(x)).y(x => ys(x))(d3.range(41).map(i => seg.x0 + (i / 40) * (seg.x1 - seg.x0))),
    area: d3.area()
      .x0(baseX)
      .x1(x => baseX + k * sAt(x))
      .y(x => ys(x))(d3.range(41).map(i => seg.x0 + (i / 40) * (seg.x1 - seg.x0))),
    midY: ys(0.5 * (seg.x0 + seg.x1)),
    span: Math.abs(ys(seg.x1) - ys(seg.x0)),
  }))
  // one label per zone type, on its largest segment
  const py1 = panelY + layout.value.panelH
  const labels = []
  for (const ty of ['reach', 'ghost', 'neg']) {
    const cands = segs.filter(s => s.type === ty && s.span > 8)
    if (!cands.length) continue
    const best = cands.reduce((x, y) => (y.span > x.span ? y : x))
    labels.push({ type: ty, y: clamp(best.midY, panelY + 14, py1 - 12) })
  }
  return { baseX, segs, labels }
})

// ---- Curve labels + callout -------------------------------------------------------
const curveLabels = computed(() => {
  const ys = yScale.value
  const py1 = panelY + layout.value.panelH
  const cx = v => clamp(v, panelX + 6, panelX + panelW - 156)
  const cy = v => clamp(v, panelY + 4, py1 - 26)
  const out = []
  const fs = slice.value.frontiers
  if (fs.length) {
    const f = fs[0]
    const tz = f.tTip
    const zr = zeroCrossings(Math.min(tz + 5e-3, 1), alphaSel.value, setup.value)
    if (zr.length) {
      const xTip = 0.5 * (zr[0] + zr[1])
      out.push({ key: 'zero', x: cx(tX(tz) - 152), y: cy(ys(xTip) - 12), cls: 'pe-label-zero', html: zeroChipHtml })
    }
    // Anchor the ghost chip on the outermost frontier's outer curve.
    const tg = 0.78
    const fo = fs[fs.length - 1]
    const gx = frontAt(fo.right, tg)
    if (Number.isFinite(gx)) {
      out.push({ key: 'ghost', x: cx(tX(tg) + 8), y: cy(ys(gx) - 24), cls: 'pe-label-ghost', html: ghostChipHtml })
    }
  }
  return out
})

const callout = computed(() => {
  const pairs = slice.value.pairs
  if (!pairs.length) return null
  const p = pairs[0]
  const ys = yScale.value
  const mx = tX(p.t)
  const my = ys(p.xb)
  // Keep the box clear of the world chips parked at the panel's top right.
  const bx = clamp(mx - 40, panelX + 70, panelX + panelW - 310)
  const by = 27
  return {
    text: 'Pair production',
    cx: bx,
    cy: by,
    w: 126,
    h: 24,
    path: `M ${(bx + 30).toFixed(1)} ${by + 12} Q ${(mx - 30).toFixed(1)} ${((by + my) / 2 + 12).toFixed(1)} ${(mx - 4).toFixed(1)} ${(my - 12).toFixed(1)}`,
  }
})

// ---- Source strip: pi_0 density bulging left -------------------------------------
const xGrid = computed(() => {
  const [dLo, dHi] = domain.value
  return d3.range(181).map(i => dLo + (i / 180) * (dHi - dLo))
})
const srcScale = d3.scaleLinear().domain([0, 0.42]).range([0, 58])
const srcLine = computed(() => d3.line()
  .x(x => stripRight - srcScale(gaussianPdf(x, 0, 1)))
  .y(x => yScale.value(x))
  .curve(d3.curveCatmullRom.alpha(0.5))(xGrid.value))
const srcArea = computed(() => d3.area()
  .x0(stripRight)
  .x1(x => stripRight - srcScale(gaussianPdf(x, 0, 1)))
  .y(x => yScale.value(x))
  .curve(d3.curveCatmullRom.alpha(0.5))(xGrid.value))

// ---- Animation: FORWARD time cursor ------------------------------------------------
const cursor = ref(1)
const playing = ref(props.autoplay)
const manual = ref(false)
const dragMode = ref(null)
let raf = 0
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete t = 1 picture

const isRunning = computed(() => playing.value && !manual.value)

function tick(now) {
  {
    const target = alphaSel.value
    const cur = alphaAnim.value
    if (cur !== target) {
      alphaAnim.value = Math.abs(target - cur) < 1e-3 ? target : cur + (target - cur) * 0.16
    }
    if (blendW.value < 1) {
      const nb = blendW.value + (1 - blendW.value) * 0.16
      blendW.value = nb > 0.995 ? 1 : nb
    }
  }
  if (isRunning.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % CYCLE
    cursor.value = ph < SWEEP ? ph / SWEEP : 1
  } else {
    refTs = 0
    phase0 = SWEEP * cursor.value
  }
  raf = requestAnimationFrame(tick)
}

// Any commit restarts the forward sweep from t = 0: nothing is revealed at
// that instant, so the content swap is invisible — the demo re-runs under the
// new setting while the heat crossblends and the boundaries morph.
function restartSweep() {
  manual.value = false
  playing.value = true
  cursor.value = 0
  refTs = 0
  phase0 = 0
}

function commitAlpha(det) {
  if (det === alphaSel.value) return
  prevHeatUrl.value = slice.value.heat
  alphaPrev.value = alphaSel.value
  alphaSel.value = det
  wedgeMorph = true
  blendW.value = 0
  restartSweep()
}

function selectWorld(id) {
  if (id === worldId.value) return
  prevHeatUrl.value = slice.value.heat
  worldId.value = id
  alphaPrev.value = alphaSel.value
  alphaAnim.value = alphaSel.value
  wedgeMorph = false
  blendW.value = 0
  restartSweep()
  prewarmDetents()
}

// Dots riding the exact curves at the cursor time.
const dots = computed(() => {
  const c = clamp(cursor.value)
  const ys = yScale.value
  const out = []
  const { times, paths } = slice.value.transported
  const last = times.length - 1
  const idx = Math.max(0, Math.min(last, Math.round(c * last)))
  for (let i = 0; i < paths.length; i += 1) {
    out.push({ id: `src-${i}`, cx: tX(c), cy: ys(paths[i][idx]), sign: '', fill: PALETTE.trajMarkerFill, edge: PALETTE.trajMarkerEdge, r: 3.2, sw: 0.8 })
  }
  for (const p of slice.value.pairs) {
    if (c < p.t) continue
    out.push({ id: `g-${p.id}`, cx: tX(c), cy: ys(frontAt(p.ghost, c)), sign: '+', fill: PALETTE.buffer, edge: '#FFFFFF', r: 7, sw: 1.6 })
    out.push({ id: `n-${p.id}`, cx: tX(c), cy: ys(frontAt(p.reject, c)), sign: '−', fill: PALETTE.negative, edge: '#FFFFFF', r: 7, sw: 1.6 })
  }
  return out
})

// Expanding-ring flashes as the cursor passes each pair-production event.
const flashes = computed(() => {
  const c = cursor.value
  const out = []
  for (const p of pairShapes.value) {
    const d = c - p.t
    if (d <= 0 || d > FLASH) continue
    const prog = d / FLASH
    out.push({ key: `f-n-${p.id}`, cx: p.cx, cy: p.cy, r: 5 + 22 * prog, o: 0.65 * (1 - prog), color: PALETTE.negativeDark, w: 2.4 })
    out.push({ key: `f-g-${p.id}`, cx: p.cx, cy: p.cy, r: 3 + 15 * prog, o: 0.65 * (1 - prog), color: PALETTE.bufferDark, w: 2 })
  }
  return out
})

const tReadout = computed(() => mathHtml(`t = ${clamp(cursor.value).toFixed(2)}`))

// ---- Interaction ---------------------------------------------------------------------
function svgX(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

function setCursorFrom(event) {
  const sx = svgX(event)
  if (dragMode.value === 'slider') {
    const s = slider.value
    cursor.value = clamp((sx - s.x) / s.w)
  } else {
    cursor.value = clamp((sx - panelX) / panelW)
  }
}

function setAlphaFrom(event) {
  const sl = aSlider.value
  const frac = clamp((svgX(event) - sl.x) / sl.w)
  const det = ALPHA_DETENTS[Math.round(frac * (ALPHA_DETENTS.length - 1))]
  commitAlpha(det)
}

function handlePanelDown(event) {
  dragMode.value = 'panel'
  manual.value = true
  setCursorFrom(event)
}

function handleSliderDown(event) {
  dragMode.value = 'slider'
  manual.value = true
  setCursorFrom(event)
}

function handleAlphaDown(event) {
  dragMode.value = 'alpha'
  setAlphaFrom(event)
}

function handlePointerMove(event) {
  if (!dragMode.value) return
  if (dragMode.value === 'alpha') setAlphaFrom(event)
  else setCursorFrom(event)
}

function handlePointerUp() {
  dragMode.value = null
}

function togglePlay() {
  if (isRunning.value) {
    playing.value = false
  } else {
    manual.value = false
    playing.value = true
  }
}

// Warm the current world's remaining detents in the background.
function prewarmDetents() {
  if (typeof window === 'undefined') return
  const wid = worldId.value
  if (pePrewarmed.has(wid)) return
  pePrewarmed.add(wid)
  const queue = [...ALPHA_DETENTS]
    .filter(a => a !== alphaSel.value)
    .sort((a, b) => Math.abs(a - alphaSel.value) - Math.abs(b - alphaSel.value))
  const next = () => {
    const a = queue.shift()
    if (a === undefined) return
    sliceFor(wid, a)
    setTimeout(next, 160)
  }
  setTimeout(next, 2500)
}

onMounted(() => {
  // Print/export freeze at t = 1: all pairs emitted and carried to the end.
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (isPrint) {
    cursor.value = 1
    playing.value = false
    return
  }
  raf = requestAnimationFrame(tick)
  prewarmDetents()
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="pe-wrap">
    <svg
      class="pe-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
    >
      <defs>
        <clipPath :id="`${uid}-panel`">
          <rect :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH" rx="8" />
        </clipPath>
        <!-- Forward sweep: only times <= cursor t are revealed. -->
        <clipPath :id="`${uid}-swept`">
          <rect
            :x="panelX" :y="panelY"
            :width="Math.max(0, tX(clamp(cursor)) - panelX)" :height="layout.panelH"
          />
        </clipPath>
        <marker
          :id="`${uid}-arrow`"
          viewBox="0 0 10 10"
          refX="8.2"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#202124" />
        </marker>
      </defs>

      <!-- Source strip: pi_0 -->
      <path :d="srcArea" fill="#4969E2" opacity="0.14" />
      <path :d="srcLine" fill="none" stroke="#4969E2" stroke-width="2" stroke-linecap="round" />
      <line
        :x1="stripRight" :y1="panelY" :x2="stripRight" :y2="panelY + layout.panelH"
        stroke="#253A88" stroke-width="1" stroke-opacity="0.35"
      />

      <!-- Main (t, x) panel -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        rx="8" fill="#FBFCFF" stroke="none"
      />

      <g :clip-path="`url(#${uid}-panel)`">
        <image
          v-if="prevHeatUrl && blendW < 1"
          :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
          :href="prevHeatUrl" preserveAspectRatio="none"
        />
        <image
          v-if="slice.heat"
          :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
          :href="slice.heat" preserveAspectRatio="none"
          :opacity="blendW < 1 ? blendW : 1"
        />

        <!-- Boundary curves -->
        <path
          v-for="(fd, fi) in frontierPaths"
          :key="`fp-${fi}`"
          :d="fd" fill="none"
          stroke="#9A9A9A" stroke-width="1.5" stroke-opacity="0.95"
        />
        <path
          v-for="(zd, zi) in zeroBranchPaths"
          :key="`zp-${zi}`"
          :d="zd" fill="none" stroke="#E34A92" stroke-width="1.6" stroke-opacity="0.9"
        />

        <!-- Forward-swept content -->
        <g :clip-path="`url(#${uid}-swept)`">
          <!-- transported source trajectories -->
          <path
            v-for="(d, i) in transportedPaths"
            :key="`tp-${i}`"
            :d="d" fill="none"
            :stroke="PALETTE.traj" stroke-width="0.9" stroke-opacity="0.5" stroke-linecap="round"
          />
          <!-- emitted pairs: soft glow + dashed cores -->
          <template v-for="p in pairShapes" :key="`pair-${p.id}`">
            <path :d="p.reject" fill="none" :stroke="PALETTE.negative" stroke-width="4.8" stroke-opacity="0.14" stroke-linecap="round" />
            <path :d="p.ghost" fill="none" :stroke="PALETTE.buffer" stroke-width="4.8" stroke-opacity="0.14" stroke-linecap="round" />
            <path :d="p.reject" fill="none" :stroke="PALETTE.negative" stroke-width="2.4" stroke-dasharray="2.2 1.6" stroke-opacity="0.95" stroke-linecap="round" />
            <path :d="p.ghost" fill="none" :stroke="PALETTE.buffer" stroke-width="2.4" stroke-dasharray="2.2 1.6" stroke-opacity="0.95" stroke-linecap="round" />
          </template>
        </g>

        <!-- Emission points (visible once the sweep passes them) -->
        <circle
          v-for="p in pairShapes"
          :key="`em-${p.id}`"
          v-show="cursor >= p.t"
          :cx="p.cx" :cy="p.cy" r="2.9"
          fill="#FFFFFF" :stroke="PALETTE.negativeDark" stroke-width="0.9"
        />

        <!-- Time cursor -->
        <line
          :x1="tX(clamp(cursor))" :y1="panelY" :x2="tX(clamp(cursor))" :y2="panelY + layout.panelH"
          stroke="#202124" stroke-width="1.4" stroke-dasharray="5 4" stroke-opacity="0.42"
        />

        <!-- Pair-production flashes -->
        <circle
          v-for="f in flashes"
          :key="f.key"
          :cx="f.cx" :cy="f.cy" :r="f.r"
          fill="none" :stroke="f.color" :stroke-width="f.w" :opacity="f.o"
        />

        <!-- Particles riding forward along their exact curves -->
        <g v-for="p in dots" :key="`dot-${p.id}`">
          <circle :cx="p.cx" :cy="p.cy" :r="p.r" :fill="p.fill" :stroke="p.edge" :stroke-width="p.sw" />
          <text
            v-if="p.sign"
            :x="p.cx" :y="p.cy" class="pe-charge"
            text-anchor="middle" dominant-baseline="central"
          >{{ p.sign }}</text>
        </g>
      </g>

      <!-- Panel border on top for a crisp edge -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        rx="8" fill="none" stroke="#D6DDF3" stroke-width="1"
      />

      <!-- Right strip: terminal signed density with zone fills -->
      <line
        :x1="rstrip.baseX" :y1="panelY" :x2="rstrip.baseX" :y2="panelY + layout.panelH"
        stroke="#536073" stroke-width="0.9" stroke-opacity="0.45"
      />
      <template v-for="(seg, si) in rstrip.segs" :key="`rs-${si}`">
        <path
          :d="seg.area"
          :fill="seg.type === 'reach' ? PALETTE.sampling : seg.type === 'ghost' ? PALETTE.bufferDark : PALETTE.negative"
          :fill-opacity="seg.type === 'ghost' ? 0.3 : 0.2"
        />
        <path
          :d="seg.line" fill="none"
          :stroke="seg.type === 'reach' ? PALETTE.sampling : seg.type === 'ghost' ? PALETTE.buffer : PALETTE.negative"
          stroke-width="1.7" stroke-linecap="butt"
        />
      </template>

      <!-- Callout: the forward reading of the boundary event -->
      <g v-if="callout">
        <path :d="callout.path" fill="none" stroke="#202124" stroke-width="1.1" :marker-end="`url(#${uid}-arrow)`" />
        <rect
          :x="callout.cx - callout.w / 2" :y="callout.cy - callout.h / 2"
          :width="callout.w" :height="callout.h" rx="6"
          fill="#FFFFFF" stroke="#202124" stroke-width="0.8"
        />
        <text :x="callout.cx" :y="callout.cy + 3.5" text-anchor="middle" class="pe-callout-text">{{ callout.text }}</text>
      </g>

      <!-- World chips: switch the data mode -->
      <g v-for="(w, wi) in WORLDS" :key="`world-${w.id}`" class="pe-world" @pointerdown.prevent="selectWorld(w.id)">
        <rect
          :x="panelX + panelW - 232 + wi * 58" :y="panelY - 26" width="52" height="20" rx="10"
          :fill="w.id === worldId ? '#EAF0FF' : '#FFFFFF'"
          :stroke="w.id === worldId ? PALETTE.samplingDark : '#C9D2E8'"
          :stroke-width="w.id === worldId ? 1.4 : 1"
        />
        <text
          :x="panelX + panelW - 232 + wi * 58 + 26" :y="panelY - 12"
          text-anchor="middle" class="pe-world-text"
          :class="{ 'pe-world-text--on': w.id === worldId }"
        >{{ w.label }}</text>
      </g>

      <!-- Play / pause control -->
      <g class="pe-play" @pointerdown.prevent="togglePlay">
        <circle :cx="34" :cy="layout.sliderY" r="12" fill="#FFFFFF" stroke="#253A88" stroke-width="2" />
        <g v-if="isRunning">
          <rect :x="29.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
          <rect :x="35.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${30.6} ${layout.sliderY - 5.4} L ${40} ${layout.sliderY} L ${30.6} ${layout.sliderY + 5.4} Z`"
          fill="#253A88"
        />
      </g>

      <!-- Time slider -->
      <g class="pe-slider" @pointerdown.prevent="handleSliderDown">
        <text :x="slider.x - 12" :y="slider.y + 4" text-anchor="end" class="pe-slider-text">time</text>
        <line :x1="slider.x" :y1="slider.y" :x2="slider.x + slider.w" :y2="slider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="slider.x" :y1="slider.y"
          :x2="slider.x + slider.w * clamp(cursor)" :y2="slider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          :cx="slider.x + slider.w * clamp(cursor)" :cy="slider.y"
          r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2"
        />
      </g>

      <!-- Repulsive-strength detent slider -->
      <g class="pe-slider" @pointerdown.prevent="handleAlphaDown">
        <text :x="aSlider.x - 12" :y="aSlider.y + 4" text-anchor="end" class="pe-slider-text">repulsive strength</text>
        <line :x1="aSlider.x" :y1="aSlider.y" :x2="aSlider.x + aSlider.w" :y2="aSlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="aSlider.x" :y1="aSlider.y"
          :x2="aSlider.x + aSlider.w * alphaDetentFrac(alphaAnim)" :y2="aSlider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          v-for="d in ALPHA_DETENTS"
          :key="`det-${d}`"
          :cx="aSlider.x + aSlider.w * alphaDetentFrac(d)" :cy="aSlider.y"
          r="2" fill="#FFFFFF" stroke="#3250BC" stroke-opacity="0.45" stroke-width="0.9"
        />
        <circle
          :cx="aSlider.x + aSlider.w * alphaDetentFrac(alphaAnim)" :cy="aSlider.y"
          r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2"
        />
      </g>

      <!-- Transparent overlay: drag to scrub t -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        fill="transparent" class="pe-panel-hit"
        @pointerdown.prevent="handlePanelDown"
      />
    </svg>

    <!-- HTML label overlays (outside the SVG: WebKit foreignObject paint bug) -->
    <RfFigLabel :x="stripX - 16" :y="panelY - 30" :w="stripW + 40" :vb-h="height">
      <div class="pe-src-label" v-html="sourceLabel"></div>
    </RfFigLabel>

    <RfFigLabel :x="RSTRIP_X" :y="panelY - 30" :w="RSTRIP_W" :vb-h="height">
      <div class="pe-strip-title" v-html="stripTitle"></div>
    </RfFigLabel>

    <RfFigLabel
      v-for="lb in curveLabels"
      :key="lb.key"
      :x="lb.x" :y="lb.y" :w="150" :vb-h="height"
    >
      <div class="pe-curve-label" :class="lb.cls">
        <span class="pe-chipbg" v-html="lb.html"></span>
      </div>
    </RfFigLabel>

    <!-- Zone labels on the right strip -->
    <RfFigLabel
      v-for="zl in rstrip.labels"
      :key="`zl-${zl.type}`"
      :x="RSTRIP_X + RSTRIP_W - 34" :y="zl.y - 11" :w="34" :vb-h="height"
    >
      <div class="pe-zone" :style="{ color: zoneColor[zl.type], borderColor: zoneColor[zl.type] }" v-html="zoneHtml[zl.type]"></div>
    </RfFigLabel>

    <!-- Readouts -->
    <RfFigLabel :x="slider.x + slider.w + 16" :y="layout.sliderY - 13" :w="86" :vb-h="height">
      <div class="pe-readout" v-html="tReadout"></div>
    </RfFigLabel>
    <RfFigLabel :x="aSlider.x + aSlider.w + 16" :y="layout.sliderY - 13" :w="110" :vb-h="height">
      <div class="pe-readout" v-html="alphaReadout"></div>
    </RfFigLabel>

    <!-- Legend -->
    <RfFigLabel :x="panelX" :y="layout.legendY - 6" :w="panelW + 120" :vb-h="height">
      <div class="pe-legend" v-html="legendHtml"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.pe-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.pe-svg {
  display: block;
  width: 100%;
  height: auto;
}

.pe-src-label {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
}

.pe-strip-title {
  color: #202124;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  text-align: center;
}

.pe-strip-title :deep(.katex) {
  font-size: 1.05em;
}

.pe-curve-label {
  font-size: 12px;
  font-weight: 680;
  line-height: 1.3;
}

.pe-chipbg {
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  padding: 1px 7px 2px;
  border: 1px solid;
  white-space: nowrap;
}

.pe-label-zero .pe-chipbg {
  color: #9d2d64;
  border-color: #9d2d64;
}

.pe-label-ghost .pe-chipbg {
  color: #666666;
  border-color: #666666;
}

.pe-zone {
  display: inline-block;
  padding: 0 5px 1px;
  border-radius: 6px;
  border: 1px solid;
  background: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
}

.pe-zone :deep(.katex) {
  font-size: 1.02em;
}

.pe-callout-text {
  fill: #202124;
  font-size: 12.5px;
  font-weight: 650;
}

.pe-charge {
  fill: #ffffff;
  font-size: 10.5px;
  font-weight: 800;
}

.pe-world {
  cursor: pointer;
}

.pe-world-text {
  fill: #536073;
  font-size: 11px;
  font-weight: 650;
  user-select: none;
}

.pe-world-text--on {
  fill: #253a88;
}

.pe-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.pe-slider,
.pe-play {
  cursor: pointer;
}

.pe-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.pe-panel-hit {
  cursor: ew-resize;
}

.pe-legend {
  display: flex;
  gap: 18px;
  align-items: center;
  color: #536073;
  font-size: 12.5px;
  font-weight: 600;
}

.pe-legend :deep(.pe-chip) {
  display: inline-flex;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
}

.pe-legend :deep(.pe-chip-ghost) {
  background: #9a9a9a;
}

.pe-legend :deep(.pe-chip-neg) {
  background: #e34a92;
}

.pe-legend :deep(.pe-note) {
  font-weight: 500;
}
</style>
