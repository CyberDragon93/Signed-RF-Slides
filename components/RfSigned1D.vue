<script>
// Module-scope instance counter for unique SVG defs ids (deterministic, no randomness).
let srfUidCounter = 0

// Everything drawn for a given (world, alpha) is deterministic, so cache it
// across drags, instances and pages: switching back to a visited detent is
// then instant instead of re-running boundary root-finding, 400 RK4
// trajectories and a canvas heat render.
const srfMemo = new Map()
function srfMemoGet(key, fn) {
  if (!srfMemo.has(key)) srfMemo.set(key, fn())
  return srfMemo.get(key)
}
const srfPrewarmed = new Set()
</script>

<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import {
  SCHEMA, DENSITY, PALETTE, lcg, randn, gaussianPdf, branchPdf,
  signedDensity, boundaryCurves, zeroBranches, quantileSeeds, simulateTrajectories,
  pairTrajectories, histogramDensity,
  ALPHA_DETENTS, alphaDetentFrac,
} from './signedRfMath.js'

const props = defineProps({
  mode: { type: String, default: 'evolution' },
  // 'schema' (one-sided negative) or 'density' — the paper's toy setting:
  // three-mode pi+ split by a single pi- in the middle (paper_1d_density.py).
  world: { type: String, default: 'schema' },
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

const WORLD = props.world === 'density' ? DENSITY : SCHEMA

const width = 900
const uid = `srf1d-${srfUidCounter++}`
const isTargetMode = computed(() => props.mode === 'target')
const isEvolution = computed(() => props.mode === 'evolution')
const isSimulate = computed(() => props.mode === 'simulate')
const isOverlay = computed(() => props.mode === 'overlay')
// simulate/overlay share the "empirical ensemble" machinery.
const isEmpirical = computed(() => isSimulate.value || isOverlay.value)

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---------------------------------------------------------------- shared UI state
// The density world defaults to the paper's alpha = 0.85.
const ALPHA_INIT = props.mode === 'target' || WORLD === DENSITY ? 0.85 : 1.0
const alphaLive = ref(ALPHA_INIT)
const committedAlpha = ref(WORLD === DENSITY ? 0.85 : 1.0)
const tCur = ref(1.0)
const alphaManual = ref(false)
const tManual = ref(false)
const dragMode = ref(null)
let raf = 0
let start = 0
let commitTimer = 0

// ======================================================================
// mode="target"  — paper_1d_density.py panel (c), DENSITY setup at t=1
// ======================================================================
const TG_X0 = 130
const TG_W = 640
const TG_Y0 = 36
const TG_ALPHA_LO = 0.05
const TG_ALPHA_HI = 2.0
const tgY1 = computed(() => props.height - 64)
const tgSlider = computed(() => ({ x: 316, y: props.height - 29, w: 280 }))

const tgGrid = d3.range(0, 421).map(i => DENSITY.domain[0] + (i / 420) * (DENSITY.domain[1] - DENSITY.domain[0]))
const tgXScale = d3.scaleLinear().domain(DENSITY.domain).range([TG_X0 + 14, TG_X0 + TG_W - 14])

function tgPlusPdf(x) { return branchPdf(x, 1, DENSITY.plus) }
function tgMinusPdf(x) { return branchPdf(x, 1, DENSITY.minus) }

// Stable y-range across autoplay: computed once for alpha = 2.
let tgMaxY = 0
let tgMinY = 0
for (const x of tgGrid) {
  tgMaxY = Math.max(tgMaxY, (1 + TG_ALPHA_HI) * tgPlusPdf(x), TG_ALPHA_HI * tgMinusPdf(x))
  tgMinY = Math.min(tgMinY, signedDensity(x, 1, TG_ALPHA_HI, DENSITY))
}
tgMaxY *= 1.045
tgMinY = Math.min(-0.02, tgMinY * 1.1)

const tgYScale = computed(() => d3.scaleLinear().domain([tgMinY, tgMaxY]).range([tgY1.value - 8, TG_Y0 + 10]))

const tgShapes = computed(() => {
  const a = alphaLive.value
  const xs = tgXScale
  const ys = tgYScale.value
  const signed = x => (1 + a) * tgPlusPdf(x) - a * tgMinusPdf(x)
  const mkLine = f => d3.line().x(x => xs(x)).y(x => ys(f(x)))(tgGrid)
  return {
    plus: mkLine(x => (1 + a) * tgPlusPdf(x)),
    minus: mkLine(x => a * tgMinusPdf(x)),
    signed: mkLine(signed),
    pos: d3.area().x(x => xs(x)).y0(ys(0)).y1(x => ys(Math.max(0, signed(x))))(tgGrid),
    neg: d3.area().x(x => xs(x)).y0(ys(0)).y1(x => ys(Math.min(0, signed(x))))(tgGrid),
    labels: {
      // Anchor the (1+a)pi+ label in the empty pocket left of the visible
      // dashed-blue bump (near x~0), not on the left hump where the dashed
      // curve hides under the signed curve.
      plus: { x: xs(-1.72), y: clamp(ys(0.34) - 13, TG_Y0 + 4, tgY1.value - 26) },
      minus: { x: xs(0.98) + 4, y: clamp(ys(a * tgMinusPdf(0.98)) - 26, TG_Y0 + 4, tgY1.value - 26) },
      signed: { x: xs(2.78) + 16, y: clamp(ys(Math.max(signed(2.78), 0)) - 14, TG_Y0 + 4, tgY1.value - 26) },
    },
  }
})

const tgTicks = [-4, -2, 0, 2, 4]

// ======================================================================
// mode="evolution"  — schema.py main panel, SCHEMA setup
// ======================================================================
const EV_PY0 = 34
const EV_CX0 = 100
const EV_CX1 = 700
const EV_SRC_BASE = 100
const EV_STRIP_X = 706
const EV_STRIP_W = 158

const evPy1 = computed(() => props.height - 72)
const evPh = computed(() => evPy1.value - EV_PY0)
const yE = computed(() => d3.scaleLinear().domain(WORLD.domain).range([evPy1.value, EV_PY0]))
function tX(t) { return EV_CX0 + (EV_CX1 - EV_CX0) * t }

const evTSlider = computed(() => ({ x: 150, y: props.height - 30, w: 185 }))
const evASlider = computed(() => ({ x: 545, y: props.height - 30, w: 185 }))

// ---- boundaries + trajectories, keyed on committed alpha ----
function finitePts(ts, xs) {
  const outT = []
  const outX = []
  for (let i = 0; i < ts.length; i += 1) {
    if (Number.isFinite(xs[i])) {
      outT.push(ts[i])
      outX.push(xs[i])
    }
  }
  return { ts: outT, xs: outX }
}

function interpPts(pts, t) {
  const { ts, xs } = pts
  const n = ts.length
  if (!n || t < ts[0] || t > ts[n - 1]) return NaN
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const span = ts[hi] - ts[lo]
  return span > 0 ? xs[lo] + (xs[hi] - xs[lo]) * (t - ts[lo]) / span : xs[lo]
}

// The signed-weight slider snaps to the shared detent ladder: each level's
// geometry is computed once and cached, so scrubbing alpha stays fluid
// instead of re-deriving the whole world per pixel of drag.
const worldKey = props.world === 'density' ? 'd' : 's'

const boundaries = computed(() => srfMemoGet(
  `b|${worldKey}|${committedAlpha.value}`,
  () => boundaryCurves(committedAlpha.value, WORLD, 160),
))
const zeroPts = computed(() => finitePts(boundaries.value.ts, boundaries.value.zero))
const ghostPts = computed(() => finitePts(boundaries.value.ts, boundaries.value.ghost))

function boundaryPath(pts) {
  const ys = yE.value
  let d = ''
  for (let i = 0; i < pts.ts.length; i += 1) {
    d += (d ? 'L' : 'M') + tX(pts.ts[i]).toFixed(1) + ',' + ys(pts.xs[i]).toFixed(1)
  }
  return d
}

const zeroBoundaryPath = computed(() => boundaryPath(zeroPts.value))
const ghostBoundaryPath = computed(() => boundaryPath(ghostPts.value))

// ALL zero-set branches in screen space — multi-root worlds (DENSITY's middle
// wedge) draw every edge, not just the first root per time step.
const zeroBranchPaths = computed(() => {
  const ys = yE.value
  const branches = srfMemoGet(
    `zb|${worldKey}|${committedAlpha.value}`,
    () => zeroBranches(committedAlpha.value, WORLD, 140),
  )
  return branches.map((line) => {
    let d = ''
    for (const [t, xv] of line) d += (d ? 'L' : 'M') + tX(t).toFixed(1) + ',' + ys(xv).toFixed(1)
    return d
  })
})

const quantTraj = computed(() => srfMemoGet(
  `qt|${worldKey}|${committedAlpha.value}`,
  () => simulateTrajectories(quantileSeeds(17), committedAlpha.value, WORLD, 480),
))

function evTrajPath(times, arr, stride) {
  const ys = yE.value
  const yLo = EV_PY0 - 80
  const yHi = evPy1.value + 80
  let d = ''
  const n = arr.length
  for (let i = 0; i < n; i += stride) {
    const yy = Math.max(yLo, Math.min(yHi, ys(arr[i])))
    d += (d ? 'L' : 'M') + tX(times[i]).toFixed(1) + ',' + yy.toFixed(1)
  }
  return d
}

const trajPaths = computed(() => {
  const { times, paths } = quantTraj.value
  return paths.map(p => evTrajPath(times, p, 3))
})

const trajDots = computed(() => {
  const { paths } = quantTraj.value
  const last = paths[0].length - 1
  const idx = Math.max(0, Math.min(last, Math.round(tCur.value * last)))
  const ys = yE.value
  return paths.map((p, i) => ({ id: i, y0: ys(p[0]), yt: ys(p[idx]) }))
})

// ---- pair production / annihilation ghost trajectories (schema.py) ----
function evArrPath(ts, xs) {
  const n = ts.length
  if (n < 2) return ''
  const stride = Math.max(1, Math.floor(n / 110))
  const ys = yE.value
  const yLo = EV_PY0 - 80
  const yHi = evPy1.value + 80
  let d = ''
  for (let i = 0; i < n; i += stride) {
    const yy = Math.max(yLo, Math.min(yHi, ys(xs[i])))
    d += (d ? 'L' : 'M') + tX(ts[i]).toFixed(1) + ',' + yy.toFixed(1)
  }
  return d
}

const pairShapes = computed(() => (
  pairTrajectories([0.3, 0.62], committedAlpha.value, WORLD).map((p, i) => ({
    id: i,
    t: p.t,
    cx: tX(p.t),
    cy: yE.value(p.xb),
    ghost: evArrPath(p.left.ts, p.left.xs),
    reject: evArrPath(p.right.ts, p.right.xs),
  }))
))

// ---- 3-zone heatmap on an offscreen canvas, exposed as dataURL ----
const heatmapUrl = computed(() => renderHeatmap(committedAlpha.value, zeroPts.value, ghostPts.value))

function renderHeatmap(alpha, zPts, gPts) {
  if (typeof document === 'undefined') return ''
  const W = 300
  const H = 220
  const [lo, hi] = WORLD.domain
  const vals = new Float64Array(W * H)
  const rowX = new Float64Array(H)
  const zbCol = new Float64Array(W)
  const gbCol = new Float64Array(W)
  for (let c = 0; c < W; c += 1) {
    const t = c / (W - 1)
    zbCol[c] = interpPts(zPts, t)
    gbCol[c] = interpPts(gPts, t)
  }
  let maxAbs = 1e-12
  for (let r = 0; r < H; r += 1) {
    const x = hi - (r / (H - 1)) * (hi - lo)
    rowX[r] = x
    for (let c = 0; c < W; c += 1) {
      const s = signedDensity(x, c / (W - 1), alpha, WORLD)
      vals[r * W + c] = s
      const av = Math.abs(s)
      if (av > maxAbs) maxAbs = av
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(W, H)
  const cBlue = [73, 105, 226]
  const cBuf = [232, 232, 227]
  const cNeg = [227, 74, 146]
  for (let r = 0; r < H; r += 1) {
    const x = rowX[r]
    for (let c = 0; c < W; c += 1) {
      const s = vals[r * W + c]
      const base = 0.02 + 0.28 * Math.pow(Math.abs(s) / maxAbs, 0.75)
      const zb = zbCol[c]
      const gb = gbCol[c]
      let col = cBlue
      let af = base
      if (Number.isFinite(zb)) {
        if (x >= zb) {
          col = cNeg
        } else if (Number.isFinite(gb) && x >= gb) {
          col = cBuf
          af = 0.45 * base
        }
      } else if (s < 0) {
        col = cNeg
      }
      const off = 4 * (r * W + c)
      image.data[off] = col[0]
      image.data[off + 1] = col[1]
      image.data[off + 2] = col[2]
      image.data[off + 3] = Math.round(255 * af)
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

// ---- left strip: source density N(0,1) sideways ----
const evGrid = d3.range(0, 141).map(i => WORLD.domain[0] + (i / 140) * (WORLD.domain[1] - WORLD.domain[0]))

const srcShapes = computed(() => {
  const ys = yE.value
  const sc = v => v * (60 / 0.45)
  const line = d3.line().x(x => EV_SRC_BASE - sc(gaussianPdf(x, 0, 1))).y(x => ys(x))
  const area = d3.area().x0(EV_SRC_BASE).x1(x => EV_SRC_BASE - sc(gaussianPdf(x, 0, 1))).y(x => ys(x))
  return { line: line(evGrid), area: area(evGrid) }
})

// ---- right strip: signed density at cursor t + particle histogram ----
const stripScale = computed(() => {
  const a = committedAlpha.value
  const [lo, hi] = WORLD.domain
  let maxPos = 1e-9
  let maxNeg = 0
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24
    for (let j = 0; j <= 120; j += 1) {
      const s = signedDensity(lo + (j / 120) * (hi - lo), t, a, WORLD)
      if (s > maxPos) maxPos = s
      if (-s > maxNeg) maxNeg = -s
    }
  }
  const k = (EV_STRIP_W - 14) / (maxPos + maxNeg)
  return { k, baseX: EV_STRIP_X + 5 + k * maxNeg }
})

function zoneOf(x, s, zb, gb) {
  if (Number.isFinite(zb)) {
    if (x >= zb) return 'neg'
    if (Number.isFinite(gb) && x >= gb) return 'ghost'
    return 'reach'
  }
  return s < 0 ? 'neg' : 'reach'
}

const stripShapes = computed(() => {
  const t = tCur.value
  const a = committedAlpha.value
  const [lo, hi] = WORLD.domain
  const zb = interpPts(zeroPts.value, t)
  const gb = interpPts(ghostPts.value, t)
  const { k, baseX } = stripScale.value
  const ys = yE.value
  const pts = []
  for (let i = 0; i <= 150; i += 1) {
    const x = lo + (i / 150) * (hi - lo)
    const s = signedDensity(x, t, a, WORLD)
    pts.push({ x, s, zone: zoneOf(x, s, zb, gb) })
  }
  const lineFor = zone => d3.line()
    .x(d => baseX + k * d.s)
    .y(d => ys(d.x))
    .defined(d => d.zone === zone)(pts) || ''
  const areaFor = zone => d3.area()
    .x0(baseX)
    .x1(d => baseX + k * d.s)
    .y(d => ys(d.x))
    .defined(d => d.zone === zone)(pts) || ''
  const zbv = Number.isFinite(zb) ? zb : hi
  const gbv = Number.isFinite(gb) ? Math.min(gb, zbv) : zbv
  return {
    baseX,
    lineReach: lineFor('reach'),
    lineGhost: lineFor('ghost'),
    lineNeg: lineFor('neg'),
    areaReach: areaFor('reach'),
    areaGhost: areaFor('ghost'),
    areaNeg: areaFor('neg'),
    baseSegs: [
      { id: 'r', y1: ys(lo), y2: ys(gbv), color: PALETTE.samplingDark },
      { id: 'g', y1: ys(gbv), y2: ys(zbv), color: PALETTE.bufferDark },
      { id: 'n', y1: ys(zbv), y2: ys(hi), color: PALETTE.negativeDark },
    ],
  }
})

// ---- simulate: terminal branch targets as fixed dashed references ----
// "Just Run It" shows raw dynamics only; these silhouettes are the one piece
// of context it needs — what pi_1^+ and pi_1^- actually are in this world.
const branchRefs = computed(() => {
  if (!isSimulate.value) return null
  const { k, baseX } = stripScale.value
  const ys = yE.value
  const fPlus = x => branchPdf(x, 1, WORLD.plus)
  const fMinus = x => branchPdf(x, 1, WORLD.minus)
  const line = f => d3.line().x(x => baseX + k * f(x)).y(x => ys(x))(evGrid)
  const area = f => d3.area().x0(baseX).x1(x => baseX + k * f(x)).y(x => ys(x))(evGrid)
  let muPlus = 0
  let muMinus = 0
  let bestP = -1
  let bestM = -1
  for (const x of evGrid) {
    const p = fPlus(x)
    const m = fMinus(x)
    if (p > bestP) { bestP = p; muPlus = x }
    if (m > bestM) { bestM = m; muMinus = x }
  }
  return {
    plus: line(fPlus),
    plusArea: area(fPlus),
    minus: line(fMinus),
    minusArea: area(fMinus),
    labelPlus: { x: EV_STRIP_X + EV_STRIP_W - 46, y: ys(muPlus) - 13 },
    labelMinus: { x: EV_STRIP_X + EV_STRIP_W - 46, y: ys(muMinus) - 13 },
  }
})
const refLabelPlus = mathHtml('\\pi_1^+')
const refLabelMinus = mathHtml('\\pi_1^-')

// ---- histogram particles (feed the right strip only; paths never drawn) ----
const particles = ref(null)
let particleJob = 0

// Chunked 400-path ensemble; results are cached per (world, alpha) so a
// revisited detent resolves synchronously. `cancelled` lets the view job
// abandon stale work; prewarm jobs always run to completion.
function buildParticles(alpha, cancelled, done) {
  const key = `pt|${worldKey}|${alpha}`
  if (srfMemo.has(key)) {
    done(srfMemo.get(key))
    return
  }
  const rand = lcg(97)
  const seeds = []
  for (let i = 0; i < 400; i += 1) seeds.push(randn(rand))
  const paths = []
  let times = null
  let i = 0
  const step = () => {
    if (cancelled()) return
    const end = Math.min(i + 80, seeds.length)
    const res = simulateTrajectories(seeds.slice(i, end), alpha, WORLD, 320)
    times = res.times
    for (const p of res.paths) paths.push(p)
    i = end
    if (i < seeds.length) {
      setTimeout(step, 0)
    } else {
      const pd = { times, paths, alpha }
      srfMemo.set(key, pd)
      done(pd)
    }
  }
  step()
}

function computeParticles(alpha) {
  if (typeof window === 'undefined') return
  const job = ++particleJob
  buildParticles(alpha, () => job !== particleJob, (pd) => {
    particles.value = pd
  })
}

// Warm the remaining detents in the background (once per world, shared by all
// instances): after this, every slider position switches instantly.
function prewarmDetents() {
  if (typeof window === 'undefined' || srfPrewarmed.has(worldKey)) return
  srfPrewarmed.add(worldKey)
  const current = committedAlpha.value
  const queue = [...ALPHA_DETENTS]
    .filter(a => a !== current)
    .sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
  const next = () => {
    const a = queue.shift()
    if (a === undefined) return
    srfMemoGet(`b|${worldKey}|${a}`, () => boundaryCurves(a, WORLD, 160))
    srfMemoGet(`zb|${worldKey}|${a}`, () => zeroBranches(a, WORLD, 140))
    srfMemoGet(`qt|${worldKey}|${a}`, () => simulateTrajectories(quantileSeeds(17), a, WORLD, 480))
    buildParticles(a, () => false, (pd) => {
      srfMemoGet(`heat|${worldKey}|${a}`, () => renderEmpiricalHeat(pd))
      setTimeout(next, 120)
    })
  }
  setTimeout(next, 2500)
}

// Temporal smoothing: raw per-frame bins flicker as samples hop between the
// fine bins. Blend the displayed densities toward the current target with a
// plain EMA (~150 ms settle) — no animation machinery, just calmer bars.
const HIST_BINS = 64
const histDisp = new Float64Array(HIST_BINS)
const histTick = ref(0)

function updateHist(blend) {
  const pd = particles.value
  if (!pd) return
  const last = pd.times.length - 1
  const idx = Math.max(0, Math.min(last, Math.round(tCur.value * last)))
  const values = []
  for (const p of pd.paths) values.push(p[idx])
  const bins = histogramDensity(values, HIST_BINS, WORLD.domain)
  let changed = false
  for (let b = 0; b < HIST_BINS; b += 1) {
    const target = bins[b].density
    let next = histDisp[b] + blend * (target - histDisp[b])
    if (Math.abs(next - target) < 1e-4) next = target
    if (next !== histDisp[b]) {
      histDisp[b] = next
      changed = true
    }
  }
  if (changed) histTick.value += 1
}

const histBars = computed(() => {
  void histTick.value
  if (!particles.value) return []
  const [lo, hi] = WORLD.domain
  const w = (hi - lo) / HIST_BINS
  const { k, baseX } = stripScale.value
  const ys = yE.value
  const out = []
  for (let b = 0; b < HIST_BINS; b += 1) {
    const density = histDisp[b]
    if (density <= 1e-3) continue
    const yTop = ys(lo + (b + 1) * w)
    const yBot = ys(lo + b * w)
    const h = (yBot - yTop) * 0.82
    out.push({
      id: b,
      x: baseX,
      y: (yTop + yBot) / 2 - h / 2,
      w: Math.min(k * density, EV_STRIP_W - 8),
      h,
    })
  }
  return out
})

// ======================================================================
// modes "simulate" / "overlay" — empirical ensemble view
// ======================================================================

// ---- blue-only empirical heat: sample density of the 400-path ensemble ----
// Rebuilds only when `particles` does, i.e. on committed alpha changes.
const empiricalHeatUrl = computed(() => {
  if (!isEmpirical.value) return ''
  const pd = particles.value
  if (!pd) return ''
  return srfMemoGet(`heat|${worldKey}|${pd.alpha}`, () => renderEmpiricalHeat(pd))
})

function renderEmpiricalHeat(pd) {
  if (typeof document === 'undefined') return ''
  const W = 220 // time columns
  const H = 110 // x bins
  const [lo, hi] = WORLD.domain
  const last = pd.times.length - 1
  const dens = new Float64Array(W * H)
  for (let c = 0; c < W; c += 1) {
    const idx = Math.round((c / (W - 1)) * last)
    for (const p of pd.paths) {
      const b = Math.floor(((p[idx] - lo) / (hi - lo)) * H)
      if (b >= 0 && b < H) dens[c * H + b] += 1
    }
  }
  // Two small box-blur passes along x soften bin noise without hiding structure.
  const tmp = new Float64Array(H)
  for (let pass = 0; pass < 2; pass += 1) {
    for (let c = 0; c < W; c += 1) {
      const col = c * H
      for (let b = 0; b < H; b += 1) {
        tmp[b] = (dens[col + Math.max(0, b - 1)] + dens[col + b] + dens[col + Math.min(H - 1, b + 1)]) / 3
      }
      for (let b = 0; b < H; b += 1) dens[col + b] = tmp[b]
    }
  }
  let maxV = 1e-12
  for (let i = 0; i < dens.length; i += 1) {
    if (dens[i] > maxV) maxV = dens[i]
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(W, H)
  const cb = [73, 105, 226] // PALETTE.sampling
  for (let r = 0; r < H; r += 1) {
    const b = H - 1 - r // row 0 is the top of the panel = domain hi
    for (let c = 0; c < W; c += 1) {
      const v = dens[c * H + b] / maxV
      const off = 4 * (r * W + c)
      image.data[off] = cb[0]
      image.data[off + 1] = cb[1]
      image.data[off + 2] = cb[2]
      image.data[off + 3] = Math.round(255 * 0.30 * Math.pow(v, 0.6))
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

const centerHeatUrl = computed(() => {
  if (isEvolution.value) return heatmapUrl.value
  return isEmpirical.value ? empiricalHeatUrl.value : ''
})

// ---- smoothed empirical outline at cursor t (mode "simulate" only) ----
const empOutlinePath = computed(() => {
  if (!isSimulate.value) return ''
  void histTick.value
  if (!particles.value) return ''
  let d = Array.from(histDisp)
  for (let pass = 0; pass < 2; pass += 1) {
    const nd = d.slice()
    for (let i = 0; i < d.length; i += 1) {
      let acc = 0
      let cnt = 0
      for (let j = Math.max(0, i - 2); j <= Math.min(d.length - 1, i + 2); j += 1) {
        acc += d[j]
        cnt += 1
      }
      nd[i] = acc / cnt
    }
    d = nd
  }
  const [lo, hi] = WORLD.domain
  const w = (hi - lo) / HIST_BINS
  const { k, baseX } = stripScale.value
  const ys = yE.value
  let path = ''
  for (let i = 0; i < HIST_BINS; i += 1) {
    const xm = lo + (i + 0.5) * w
    path += (path ? 'L' : 'M') + (baseX + k * d[i]).toFixed(1) + ',' + ys(xm).toFixed(1)
  }
  return path
})

// ---- overlay strip: signed density as ink curve + magenta dip fill ----
// Shares stripScale's k with the histogram, so bars and curve are comparable.
const overlayStrip = computed(() => {
  if (!isOverlay.value) return { line: '', neg: '' }
  const t = tCur.value
  const a = committedAlpha.value
  const [lo, hi] = WORLD.domain
  const { k, baseX } = stripScale.value
  const ys = yE.value
  const pts = []
  for (let i = 0; i <= 150; i += 1) {
    const x = lo + (i / 150) * (hi - lo)
    pts.push({ x, s: signedDensity(x, t, a, WORLD) })
  }
  return {
    line: d3.line().x(d => baseX + k * d.s).y(d => ys(d.x))(pts),
    neg: d3.area().x0(baseX).x1(d => baseX + k * Math.min(0, d.s)).y(d => ys(d.x))(pts),
  }
})

// plain recessive baseline for the empirical strip
const stripBaseSeg = computed(() => ({
  x: stripScale.value.baseX,
  y1: yE.value(WORLD.domain[0]),
  y2: yE.value(WORLD.domain[1]),
}))

// ---- overlay chip near the start of the zero-set boundary ----
const omegaZeroHtml = mathHtml('\\Omega_t^0')
const omegaZeroLabel = computed(() => {
  if (!isOverlay.value) return null
  const pts = zeroPts.value
  if (!pts.ts.length) return null
  const ys = yE.value
  return {
    x: clamp(tX(pts.ts[0]) - 8, EV_CX0 + 6, EV_CX1 - 64),
    y: clamp(ys(pts.xs[0]) - 30, EV_PY0 + 6, evPy1.value - 26),
  }
})

// ---- zone labels at t ~ 0.85 (paper callout styling) ----
const zoneRHtml = mathHtml('\\Omega_t^{r}')
const zoneGHtml = mathHtml('\\Omega_t^{g}')
const zoneNHtml = mathHtml('\\Omega_t^{-}')

const zoneLabels = computed(() => {
  const ys = yE.value
  const [lo, hi] = WORLD.domain
  const tq = 0.85
  const zbRaw = interpPts(zeroPts.value, tq)
  const gbRaw = interpPts(ghostPts.value, tq)
  const zb = Number.isFinite(zbRaw) ? zbRaw : hi
  const gb = Number.isFinite(gbRaw) ? Math.min(gbRaw, zb) : zb
  let yN = ys(0.5 * (zb + hi))
  let yG = ys(0.5 * (gb + zb))
  let yR = ys(0.5 * (lo + gb) - 0.35)
  if (yG - yN < 26) yG = yN + 26
  if (yR - yG < 26) yR = yG + 26
  const x = tX(tq) - 21
  return [
    { id: 'r', html: zoneRHtml, color: PALETTE.samplingDark, x, y: yR },
    { id: 'g', html: zoneGHtml, color: PALETTE.bufferDark, x, y: yG },
    { id: 'n', html: zoneNHtml, color: PALETTE.negativeDark, x, y: yN },
  ]
})

// ---------------------------------------------------------------- KaTeX labels
const tgLabelPlus = mathHtml('(1+\\alpha)\\pi_1^+')
const tgLabelMinus = mathHtml('\\alpha\\pi_1^-')
const tgLabelSigned = mathHtml('\\pi_1^{\\mathtt{sign}}')
const evTitleCenter = `Signed flow ${mathHtml('\\dot Z_t = v_t^{\\mathtt{sign}}(Z_t)')}`
const evTitleLeft = `${mathHtml('\\pi_0')}<span class="srf-hint"> source</span>`
const evTitleRight = `${mathHtml('\\pi_t^{\\mathtt{sign}}')}<span class="srf-hint"> + sample hist.</span>`
const simTitleCenter = mathHtml('\\dot Z_t = v_t^{\\mathtt{signRF}}(Z_t)')
const simTitleLeft = mathHtml('\\pi_0')
const simTitleRight = 'empirical density'
const titleLeft = computed(() => (isEvolution.value ? evTitleLeft : simTitleLeft))
const titleCenter = computed(() => (isEvolution.value ? evTitleCenter : simTitleCenter))
const titleRight = computed(() => (isEvolution.value ? evTitleRight : simTitleRight))

const alphaStr = computed(() => alphaLive.value.toFixed(2))
const tStr = computed(() => clamp(tCur.value).toFixed(2))
const alphaReadout = computed(() => mathHtml(`\\alpha = ${alphaStr.value}`))
const tReadout = computed(() => mathHtml(`t = ${tStr.value}`))

// ---------------------------------------------------------------- interaction
function svgXY(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (width / rect.width),
    y: (event.clientY - rect.top) * (props.height / rect.height),
  }
}

function alphaCommit() {
  if (commitTimer) {
    clearTimeout(commitTimer)
    commitTimer = 0
  }
  if (committedAlpha.value !== alphaLive.value) committedAlpha.value = alphaLive.value
}

function setAlphaFromX(x) {
  if (isTargetMode.value) {
    const s = tgSlider.value
    alphaLive.value = TG_ALPHA_LO + (TG_ALPHA_HI - TG_ALPHA_LO) * clamp((x - s.x) / s.w)
  } else {
    // Snap to the detent ladder and commit immediately: each level is cached
    // after its first computation, so crossing detents swaps data in place.
    const s = evASlider.value
    const frac = clamp((x - s.x) / s.w)
    const det = ALPHA_DETENTS[Math.round(frac * (ALPHA_DETENTS.length - 1))]
    if (det !== alphaLive.value) {
      alphaLive.value = det
      alphaCommit()
    }
  }
}

function handleAlphaDown(event) {
  dragMode.value = 'alpha'
  alphaManual.value = true
  setAlphaFromX(svgXY(event).x)
}

function handleTSliderDown(event) {
  dragMode.value = 'tslider'
  tManual.value = true
  const s = evTSlider.value
  tCur.value = clamp((svgXY(event).x - s.x) / s.w)
}

function handlePanelDown(event) {
  dragMode.value = 'panel'
  tManual.value = true
  tCur.value = clamp((svgXY(event).x - EV_CX0) / (EV_CX1 - EV_CX0))
}

function handlePointerMove(event) {
  if (!dragMode.value) return
  const { x } = svgXY(event)
  if (dragMode.value === 'alpha') {
    setAlphaFromX(x)
  } else if (dragMode.value === 'tslider') {
    const s = evTSlider.value
    tCur.value = clamp((x - s.x) / s.w)
  } else {
    tCur.value = clamp((x - EV_CX0) / (EV_CX1 - EV_CX0))
  }
}

function handlePointerUp() {
  if (dragMode.value === 'alpha' && !isTargetMode.value) alphaCommit()
  dragMode.value = null
}

// ---------------------------------------------------------------- autoplay
const TG_PHASE0 = Math.asin((0.85 - 1.025) / 0.975)
const EV_SWEEP = 7.0
// Print-freeze guarantees deterministic exports, so the live hold can stay
// short — a long park at t=1 reads as "the animation ended".
const EV_HOLD = 1.6
const EV_CYCLE = EV_SWEEP + EV_HOLD
const playing = ref(props.autoplay)
let refTs = 0
let phase0 = EV_SWEEP // hold-first: the slide opens on the complete t=1 picture

const isRunning = computed(() => playing.value && !tManual.value)

// Invert d3.easeCubicInOut by bisection (monotone on [0,1]).
function easeInv(v) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi)
    if (d3.easeCubicInOut(mid) < v) lo = mid
    else hi = mid
  }
  return 0.5 * (lo + hi)
}

function tick(now) {
  if (!isTargetMode.value) updateHist(0.2)
  if (props.mode === 'target') {
    if (!start) start = now
    const elapsed = (now - start) / 1000
    if (!alphaManual.value) {
      alphaLive.value = clamp(1.025 + 0.975 * Math.sin(0.35 * elapsed + TG_PHASE0), TG_ALPHA_LO, TG_ALPHA_HI)
    }
  } else if (isRunning.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % EV_CYCLE
    tCur.value = ph < EV_SWEEP ? d3.easeCubicInOut(ph / EV_SWEEP) : 1
  } else {
    // Keep the phase in sync with the (possibly scrubbed) cursor so pressing
    // play resumes exactly where the user left it.
    refTs = 0
    phase0 = tCur.value >= 1 ? EV_SWEEP : EV_SWEEP * easeInv(tCur.value)
  }
  raf = requestAnimationFrame(tick)
}

function togglePlay() {
  if (isRunning.value) {
    playing.value = false
  } else {
    tManual.value = false
    playing.value = true
  }
}

watch(committedAlpha, (a) => {
  if (!isTargetMode.value) computeParticles(a)
})

// Snap (no blend) whenever the ensemble itself refreshes: on load and on
// alpha changes the old shape is stale, and in print mode no tick runs —
// exports must show the exact final histogram.
watch(particles, () => updateHist(1))

onMounted(() => {
  if (!isTargetMode.value) computeParticles(committedAlpha.value)
  const isPrintCtx = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (isEmpirical.value && !isPrintCtx) prewarmDetents()
  // In Slidev's print/export context, freeze on the complete t=1 picture so
  // screenshots are deterministic; animate only in the live deck.
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (props.autoplay && !isPrint) raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (commitTimer) clearTimeout(commitTimer)
  particleJob += 1
})
</script>

<template>
  <div class="srf-wrap">
    <svg
      class="srf-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
    >
      <defs>
        <filter :id="`${uid}-shadow`" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.12" />
        </filter>
        <clipPath v-if="!isTargetMode" :id="`${uid}-clipCursor`">
          <rect :x="EV_CX0" :y="EV_PY0" :width="Math.max(0, tX(tCur) - EV_CX0)" :height="evPh" />
        </clipPath>
        <clipPath v-if="!isTargetMode" :id="`${uid}-clipPanel`">
          <rect :x="EV_CX0" :y="EV_PY0" :width="EV_CX1 - EV_CX0" :height="evPh" />
        </clipPath>
      </defs>

      <!-- ============================ mode = target ============================ -->
      <g v-if="isTargetMode">
        <rect
          :x="TG_X0" :y="TG_Y0" :width="TG_W" :height="tgY1 - TG_Y0" rx="8"
          :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" :filter="`url(#${uid}-shadow)`"
        />

        <g v-for="tk in tgTicks" :key="`tick-${tk}`">
          <line :x1="tgXScale(tk)" :y1="tgY1" :x2="tgXScale(tk)" :y2="tgY1 + 4" :stroke="PALETTE.grid" stroke-width="1" />
          <text :x="tgXScale(tk)" :y="tgY1 + 15" text-anchor="middle" class="srf-tick">{{ tk }}</text>
        </g>
        <text :x="TG_X0 + TG_W + 12" :y="tgY1 + 4" class="srf-axis-x">x</text>

        <path :d="tgShapes.pos" :fill="PALETTE.sampling" opacity="0.22" />
        <path :d="tgShapes.neg" :fill="PALETTE.negative" opacity="0.16" />

        <line
          :x1="TG_X0 + 6" :y1="tgYScale(0)" :x2="TG_X0 + TG_W - 6" :y2="tgYScale(0)"
          :stroke="PALETTE.ink" stroke-width="1" stroke-opacity="0.72"
        />

        <path :d="tgShapes.plus" fill="none" :stroke="PALETTE.sampling" stroke-width="1.4" stroke-dasharray="3 2.1" stroke-linecap="round" />
        <path :d="tgShapes.minus" fill="none" :stroke="PALETTE.negative" stroke-width="1.4" stroke-dasharray="3 2.1" stroke-linecap="round" />
        <path :d="tgShapes.signed" fill="none" :stroke="PALETTE.ink" stroke-width="2.2" stroke-linecap="round" />

        <g class="srf-slider" @pointerdown.prevent="handleAlphaDown">
          <text :x="tgSlider.x - 14" :y="tgSlider.y + 4" text-anchor="end" class="srf-slider-text">signed weight</text>
          <line :x1="tgSlider.x" :y1="tgSlider.y" :x2="tgSlider.x + tgSlider.w" :y2="tgSlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
          <line
            :x1="tgSlider.x" :y1="tgSlider.y"
            :x2="tgSlider.x + tgSlider.w * clamp((alphaLive - TG_ALPHA_LO) / (TG_ALPHA_HI - TG_ALPHA_LO))" :y2="tgSlider.y"
            :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
          />
          <circle
            :cx="tgSlider.x + tgSlider.w * clamp((alphaLive - TG_ALPHA_LO) / (TG_ALPHA_HI - TG_ALPHA_LO))" :cy="tgSlider.y"
            r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2"
          />
        </g>
      </g>

      <!-- ============================ mode = evolution ============================ -->
      <g v-else>
        <rect
          x="24" :y="EV_PY0 - 8" width="848" :height="evPh + 16" rx="10"
          :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" :filter="`url(#${uid}-shadow)`"
        />

        <!-- center (t, x) panel -->
        <rect :x="EV_CX0" :y="EV_PY0" :width="EV_CX1 - EV_CX0" :height="evPh" fill="#FFFFFF" :stroke="PALETTE.grid" stroke-width="1" />
        <image
          v-if="centerHeatUrl"
          :x="EV_CX0" :y="EV_PY0" :width="EV_CX1 - EV_CX0" :height="evPh"
          :href="centerHeatUrl" preserveAspectRatio="none"
        />

        <g v-if="isEvolution || isOverlay" :clip-path="`url(#${uid}-clipPanel)`">
          <path
            v-for="(bd, bi) in zeroBranchPaths"
            :key="`zb-${bi}`"
            :d="bd" fill="none" :stroke="PALETTE.negative" stroke-width="1.6" stroke-opacity="0.9" stroke-linecap="round"
          />
          <path v-if="isEvolution" :d="ghostBoundaryPath" fill="none" :stroke="PALETTE.buffer" stroke-width="1.5" stroke-opacity="0.95" stroke-linecap="round" />
        </g>

        <!-- pair production / annihilation ghost trajectories, clipped at cursor -->
        <g v-if="isEvolution">
          <g :clip-path="`url(#${uid}-clipCursor)`">
            <template v-for="p in pairShapes" :key="`pair-${p.id}`">
              <path :d="p.reject" fill="none" :stroke="PALETTE.negative" stroke-width="4.8" stroke-opacity="0.14" stroke-linecap="round" />
              <path :d="p.ghost" fill="none" :stroke="PALETTE.buffer" stroke-width="4.8" stroke-opacity="0.14" stroke-linecap="round" />
              <path :d="p.reject" fill="none" :stroke="PALETTE.negative" stroke-width="2.4" stroke-dasharray="2.2 1.6" stroke-opacity="0.95" stroke-linecap="round" />
              <path :d="p.ghost" fill="none" :stroke="PALETTE.buffer" stroke-width="2.4" stroke-dasharray="2.2 1.6" stroke-opacity="0.95" stroke-linecap="round" />
            </template>
          </g>
          <g v-for="p in pairShapes" :key="`pairdot-${p.id}`">
            <circle v-if="tCur >= p.t" :cx="p.cx" :cy="p.cy" r="2.9" fill="#FFFFFF" :stroke="PALETTE.negativeDark" stroke-width="0.9" />
          </g>
        </g>

        <!-- 17 quantile trajectories, clipped at cursor -->
        <g :clip-path="`url(#${uid}-clipCursor)`">
          <path
            v-for="(d, i) in trajPaths"
            :key="`traj-${i}`"
            :d="d"
            fill="none"
            :stroke="PALETTE.traj"
            stroke-width="0.9"
            stroke-opacity="0.5"
            stroke-linecap="round"
          />
        </g>
        <g :clip-path="`url(#${uid}-clipPanel)`">
          <g v-for="dot in trajDots" :key="`dot-${dot.id}`">
            <circle :cx="EV_CX0" :cy="dot.y0" r="2.3" :fill="PALETTE.trajMarkerFill" :stroke="PALETTE.trajMarkerEdge" stroke-width="0.7" />
            <circle :cx="tX(tCur)" :cy="dot.yt" r="2.8" :fill="PALETTE.trajMarkerFill" :stroke="PALETTE.trajMarkerEdge" stroke-width="0.8" />
          </g>
        </g>

        <!-- time cursor -->
        <line
          :x1="tX(tCur)" :y1="EV_PY0" :x2="tX(tCur)" :y2="evPy1"
          :stroke="PALETTE.ink" stroke-width="1.2" stroke-opacity="0.8"
        />

        <!-- left strip: source density -->
        <path :d="srcShapes.area" :fill="PALETTE.source" opacity="0.14" />
        <path :d="srcShapes.line" fill="none" :stroke="PALETTE.source" stroke-width="2" stroke-linecap="round" />
        <line :x1="EV_SRC_BASE" :y1="EV_PY0" :x2="EV_SRC_BASE" :y2="evPy1" :stroke="PALETTE.samplingDark" stroke-width="0.7" stroke-opacity="0.6" />

        <!-- right strip: density at cursor t + histogram -->
        <template v-if="isEvolution">
          <path :d="stripShapes.areaReach" :fill="PALETTE.sampling" opacity="0.14" />
          <path :d="stripShapes.areaGhost" :fill="PALETTE.bufferBg" opacity="0.24" />
          <path :d="stripShapes.areaNeg" :fill="PALETTE.negative" opacity="0.16" />
        </template>
        <template v-else>
          <line
            :x1="stripBaseSeg.x" :y1="stripBaseSeg.y1" :x2="stripBaseSeg.x" :y2="stripBaseSeg.y2"
            :stroke="PALETTE.textMuted" stroke-width="0.9" stroke-opacity="0.45"
          />
          <path v-if="isOverlay" :d="overlayStrip.neg" :fill="PALETTE.negative" opacity="0.16" />
          <template v-if="branchRefs">
            <path :d="branchRefs.plusArea" :fill="PALETTE.sampling" opacity="0.07" />
            <path :d="branchRefs.plus" fill="none" :stroke="PALETTE.sampling" stroke-width="1.3" stroke-dasharray="3 2.2" stroke-opacity="0.8" />
            <path :d="branchRefs.minusArea" :fill="PALETTE.negative" opacity="0.07" />
            <path :d="branchRefs.minus" fill="none" :stroke="PALETTE.negative" stroke-width="1.3" stroke-dasharray="3 2.2" stroke-opacity="0.8" />
          </template>
        </template>
        <rect
          v-for="bar in histBars"
          :key="`hist-${bar.id}`"
          :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h"
          :fill="PALETTE.sampleHist" opacity="0.9"
        />
        <template v-if="isEvolution">
          <path :d="stripShapes.lineReach" fill="none" :stroke="PALETTE.sampling" stroke-width="1.6" stroke-linecap="round" />
          <path :d="stripShapes.lineGhost" fill="none" :stroke="PALETTE.buffer" stroke-width="1.6" stroke-linecap="round" />
          <path :d="stripShapes.lineNeg" fill="none" :stroke="PALETTE.negative" stroke-width="1.6" stroke-linecap="round" />
          <line
            v-for="seg in stripShapes.baseSegs"
            :key="`base-${seg.id}`"
            :x1="stripShapes.baseX" :y1="seg.y1" :x2="stripShapes.baseX" :y2="seg.y2"
            :stroke="seg.color" stroke-width="0.9" stroke-opacity="0.85"
          />
        </template>
        <template v-else>
          <path
            v-if="empOutlinePath"
            :d="empOutlinePath" fill="none"
            :stroke="PALETTE.sampling" stroke-width="1.1" stroke-opacity="0.85" stroke-linecap="round"
          />
          <path
            v-if="isOverlay && overlayStrip.line"
            :d="overlayStrip.line" fill="none"
            :stroke="PALETTE.ink" stroke-width="1.8" stroke-linecap="round"
          />
        </template>

        <!-- recessive time axis labels -->
        <text :x="EV_CX0" :y="evPy1 + 18" text-anchor="middle" class="srf-tick">0</text>
        <text :x="(EV_CX0 + EV_CX1) / 2" :y="evPy1 + 18" text-anchor="middle" class="srf-tick">time t</text>
        <text :x="EV_CX1" :y="evPy1 + 18" text-anchor="middle" class="srf-tick">1</text>

        <!-- transparent overlay: drag to scrub t -->
        <rect
          :x="EV_CX0" :y="EV_PY0" :width="EV_CX1 - EV_CX0" :height="evPh"
          fill="transparent" class="srf-panel-hit"
          @pointerdown.prevent="handlePanelDown"
        />

        <!-- play / pause control -->
        <g class="srf-play" @pointerdown.prevent="togglePlay">
          <circle cx="34" :cy="evTSlider.y" r="12" fill="#FFFFFF" stroke="#253A88" stroke-width="2" />
          <g v-if="isRunning">
            <rect x="29.4" :y="evTSlider.y - 5" width="3.2" height="10" rx="1" fill="#253A88" />
            <rect x="35.4" :y="evTSlider.y - 5" width="3.2" height="10" rx="1" fill="#253A88" />
          </g>
          <path
            v-else
            :d="`M ${30.6} ${evTSlider.y - 5.4} L ${40} ${evTSlider.y} L ${30.6} ${evTSlider.y + 5.4} Z`"
            fill="#253A88"
          />
        </g>

        <!-- sliders row -->
        <g class="srf-slider" @pointerdown.prevent="handleTSliderDown">
          <text :x="evTSlider.x - 12" :y="evTSlider.y + 4" text-anchor="end" class="srf-slider-text">time</text>
          <line :x1="evTSlider.x" :y1="evTSlider.y" :x2="evTSlider.x + evTSlider.w" :y2="evTSlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
          <line :x1="evTSlider.x" :y1="evTSlider.y" :x2="evTSlider.x + evTSlider.w * clamp(tCur)" :y2="evTSlider.y" :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round" />
          <circle :cx="evTSlider.x + evTSlider.w * clamp(tCur)" :cy="evTSlider.y" r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2" />
        </g>
        <g class="srf-slider" @pointerdown.prevent="handleAlphaDown">
          <text :x="evASlider.x - 12" :y="evASlider.y + 4" text-anchor="end" class="srf-slider-text">signed weight</text>
          <line :x1="evASlider.x" :y1="evASlider.y" :x2="evASlider.x + evASlider.w" :y2="evASlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
          <circle
            v-for="d in ALPHA_DETENTS"
            :key="`det-${d}`"
            :cx="evASlider.x + evASlider.w * alphaDetentFrac(d)" :cy="evASlider.y"
            r="1.7" fill="#FFFFFF" fill-opacity="0.9"
          />
          <line
            :x1="evASlider.x" :y1="evASlider.y"
            :x2="evASlider.x + evASlider.w * alphaDetentFrac(alphaLive)" :y2="evASlider.y"
            :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
          />
          <circle
            :cx="evASlider.x + evASlider.w * alphaDetentFrac(alphaLive)" :cy="evASlider.y"
            r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2"
          />
        </g>
      </g>
    </svg>

    <!-- HTML label overlays (moved out of the SVG; see RfFigLabel.vue) -->
    <template v-if="isTargetMode">
      <RfFigLabel :x="tgShapes.labels.plus.x" :y="tgShapes.labels.plus.y" :w="118" :vb-h="height">
        <div class="srf-math" :style="{ color: PALETTE.samplingDark }" v-html="tgLabelPlus"></div>
      </RfFigLabel>
      <RfFigLabel :x="tgShapes.labels.minus.x" :y="tgShapes.labels.minus.y" :w="70" :vb-h="height">
        <div class="srf-math" :style="{ color: PALETTE.negativeDark }" v-html="tgLabelMinus"></div>
      </RfFigLabel>
      <RfFigLabel :x="tgShapes.labels.signed.x" :y="tgShapes.labels.signed.y" :w="96" :vb-h="height">
        <div class="srf-math" :style="{ color: PALETTE.ink }" v-html="tgLabelSigned"></div>
      </RfFigLabel>
      <RfFigLabel :x="tgSlider.x + tgSlider.w + 18" :y="tgSlider.y - 13" :w="110" :vb-h="height">
        <div class="srf-readout" v-html="alphaReadout"></div>
      </RfFigLabel>
    </template>
    <template v-else>
      <RfFigLabel :x="30" :y="4" :w="120" :vb-h="height">
        <div class="srf-title" v-html="titleLeft"></div>
      </RfFigLabel>
      <RfFigLabel :x="250" :y="4" :w="300" :vb-h="height">
        <div class="srf-title srf-center" v-html="titleCenter"></div>
      </RfFigLabel>
      <RfFigLabel :x="EV_STRIP_X" :y="4" :w="180" :vb-h="height">
        <div class="srf-title" v-html="titleRight"></div>
      </RfFigLabel>

      <!-- zone labels (paper callout styling), evolution only -->
      <template v-if="isEvolution">
        <RfFigLabel
          v-for="z in zoneLabels"
          :key="`zone-${z.id}`"
          :x="z.x" :y="z.y - 13" :w="64" :vb-h="height"
        >
          <div
            class="srf-zone"
            :style="{ color: z.color, borderColor: z.color }"
            v-html="z.html"
          ></div>
        </RfFigLabel>
      </template>

      <!-- overlay: single chip near the start of the zero-set boundary -->
      <RfFigLabel
        v-if="omegaZeroLabel"
        :x="omegaZeroLabel.x" :y="omegaZeroLabel.y" :w="58" :vb-h="height"
      >
        <div
          class="srf-zone"
          :style="{ color: PALETTE.negativeDark, borderColor: PALETTE.negativeDark }"
          v-html="omegaZeroHtml"
        ></div>
      </RfFigLabel>

      <!-- terminal branch reference labels (simulate mode) -->
      <template v-if="!isEvolution && branchRefs">
        <RfFigLabel :x="branchRefs.labelPlus.x" :y="branchRefs.labelPlus.y" :w="44" :vb-h="height">
          <div
            class="srf-zone"
            :style="{ color: PALETTE.samplingDark, borderColor: PALETTE.samplingDark }"
            v-html="refLabelPlus"
          ></div>
        </RfFigLabel>
        <RfFigLabel :x="branchRefs.labelMinus.x" :y="branchRefs.labelMinus.y" :w="44" :vb-h="height">
          <div
            class="srf-zone"
            :style="{ color: PALETTE.negativeDark, borderColor: PALETTE.negativeDark }"
            v-html="refLabelMinus"
          ></div>
        </RfFigLabel>
      </template>

      <RfFigLabel :x="evTSlider.x + evTSlider.w + 16" :y="evTSlider.y - 13" :w="86" :vb-h="height">
        <div class="srf-readout" v-html="tReadout"></div>
      </RfFigLabel>
      <RfFigLabel :x="evASlider.x + evASlider.w + 16" :y="evASlider.y - 13" :w="110" :vb-h="height">
        <div class="srf-readout" v-html="alphaReadout"></div>
      </RfFigLabel>
    </template>
  </div>
</template>

<style scoped>
.srf-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.srf-svg {
  display: block;
  width: 100%;
  height: auto;
}

.srf-math {
  font-size: 13.5px;
  font-weight: 680;
  line-height: 1;
  white-space: nowrap;
}

.srf-math :deep(.katex) {
  font-size: 1.08em;
}

.srf-title {
  color: #253a88;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.srf-title :deep(.katex) {
  font-size: 1.06em;
}

.srf-center {
  text-align: center;
}

.srf-hint {
  color: #536073;
  font-size: 11.5px;
  font-weight: 600;
}

.srf-zone {
  display: inline-block;
  padding: 1px 7px 2px;
  border-radius: 7px;
  border: 1px solid;
  background: rgba(255, 255, 255, 0.92);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
}

.srf-zone :deep(.katex) {
  font-size: 1.05em;
}

.srf-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.srf-slider {
  cursor: pointer;
}

.srf-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.srf-tick {
  fill: #536073;
  font-size: 11px;
  font-weight: 500;
}

.srf-axis-x {
  fill: #536073;
  font-size: 13px;
  font-style: italic;
  font-family: KaTeX_Math, "Times New Roman", serif;
}

.srf-panel-hit {
  cursor: ew-resize;
}

.srf-play {
  cursor: pointer;
}
</style>
