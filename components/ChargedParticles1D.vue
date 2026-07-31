<script>
// Module-scope state: unique SVG defs ids per instance, and a shared cache for
// the backward ensemble (both modes visualize the SAME honest trajectories).
let cpUidCounter = 0
let ensembleCache = null
let boundaryCache = null
</script>

<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import {
  DENSITY,
  PALETTE,
  gaussianPdf,
  reachFrontier,
  signedDensity,
  simulateBackward,
  zeroBranches,
  zeroCrossings,
} from './signedRfMath.js'

const props = defineProps({
  mode: { type: String, default: 'classified' }, // 'uniform' | 'classified'
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

// ---- Fixed setup: the paper's density world (paper_1d_density.py) ----------
// Three-mode pi+ split by a single middle pi-, at the paper's alpha = 0.85.
const width = 900
const WORLD = DENSITY
const ALPHA = DENSITY.alpha
const domain = WORLD.domain
const uid = `cp1d-${cpUidCounter++}`
const panelX = 104
const panelW = 756
const panelY = 54
const stripX = 22
const stripW = 70
const stripRight = stripX + stripW
const SWEEP = 7.0 // seconds, t: 1 -> 0
const HOLD = 1.6 // seconds at t = 0 (print-freeze covers exports; keep the live loop moving)
const CYCLE = SWEEP + HOLD
const FLASH = 0.06 // annihilation flash span in t-units
const N_SEEDS = 26
const SEED_LO = -3.05
const SEED_HI = 3.05
const PAIR_DT = 0.10
const PAIR_DX = 0.14

const isClassified = computed(() => props.mode !== 'uniform')

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- Exact boundaries (closed-form roots) -----------------------------------
// Zero set: ALL branches — the middle wedge has two edges.
// Reach/ghost frontier: the pair of limit trajectories hugging the wedge from
// outside, seeded just off the two newborn roots at the wedge tip and pushed
// forward with the adaptive integrator (the pairTrajectories construction).
// Verified against theory: the enclosed gap carries zero net signed mass
// (signedCdf equal at both ends), forward samples never land inside it, and
// backward fates match it 26/26.
if (!boundaryCache) {
  boundaryCache = {
    zeroLines: zeroBranches(ALPHA, WORLD, 160),
    frontier: reachFrontier(ALPHA, WORLD),
  }
}
const { zeroLines, frontier } = boundaryCache

// Interpolate x(t) on a frontier curve ({ts, xs}, ts increasing).
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

// ---- Backward ensemble: 26 uniformly spaced terminal seeds -----------------
// Each is the exact Signed RF ODE integrated backward from t ~ 0.999 (adaptive
// RK4); a trajectory either reaches the source or dies on the moving zero set.
const trajData = shallowRef(null)

function buildEnsemble() {
  const trajs = []
  for (let i = 0; i < N_SEEDS; i += 1) {
    const x1 = SEED_LO + (i / (N_SEEDS - 1)) * (SEED_HI - SEED_LO)
    const r = simulateBackward(x1, ALPHA, WORLD)
    const n = r.ts.length
    trajs.push({
      id: i,
      x1,
      ts: r.ts,
      xs: r.xs,
      fate: r.fate,
      charge: r.charge,
      tEnd: r.ts[n - 1],
      xEnd: r.xs[n - 1],
    })
  }
  // Pair annihilated + / - trajectories whose end points nearly coincide:
  // in forward time these are pair-production events on the zero set.
  const plus = trajs.filter(tr => tr.fate === 'annihilated' && tr.charge === 1)
  const minus = trajs.filter(tr => tr.fate === 'annihilated' && tr.charge === -1)
  const used = new Set()
  const pairs = []
  for (const p of plus) {
    let best = null
    for (const m of minus) {
      if (used.has(m.id)) continue
      const dt = Math.abs(p.tEnd - m.tEnd)
      const dx = Math.abs(p.xEnd - m.xEnd)
      if (dt >= PAIR_DT || dx >= PAIR_DX) continue
      const score = dt / PAIR_DT + dx / PAIR_DX
      if (!best || score < best.score) best = { m, score }
    }
    if (best) {
      used.add(best.m.id)
      pairs.push({
        t: 0.5 * (p.tEnd + best.m.tEnd),
        x: 0.5 * (p.xEnd + best.m.xEnd),
        plusId: p.id,
        minusId: best.m.id,
      })
    }
  }
  pairs.sort((a, b) => a.t - b.t)
  const pairedIds = new Set()
  for (const pr of pairs) {
    pairedIds.add(pr.plusId)
    pairedIds.add(pr.minusId)
  }
  const solos = trajs.filter(tr => tr.fate === 'annihilated' && !pairedIds.has(tr.id))
  return { trajs, pairs, solos }
}

// Binary-search interpolation of x at time t on a backward curve (ts DECREASE).
function xAtBackward(tr, t) {
  const ts = tr.ts
  const xs = tr.xs
  const n = ts.length
  if (t >= ts[0]) return xs[0]
  if (t <= ts[n - 1]) return xs[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (ts[mid] >= t) lo = mid
    else hi = mid
  }
  const span = ts[lo] - ts[hi]
  return span > 0 ? xs[lo] + ((ts[lo] - t) / span) * (xs[hi] - xs[lo]) : xs[lo]
}

// ---- Layout & scales --------------------------------------------------------
const layout = computed(() => {
  const sliderY = props.height - 46
  const panelH = sliderY - 14 - panelY
  return { sliderY, panelH, legendY: props.height - 28 }
})
const tX = d3.scaleLinear().domain([0, 1]).range([panelX, panelX + panelW])
const yScale = computed(() => d3.scaleLinear()
  .domain(domain)
  .range([panelY + layout.value.panelH, panelY]))
const slider = computed(() => ({ x: panelX, y: layout.value.sliderY, w: panelW - 104 }))

// ---- KaTeX labels -----------------------------------------------------------
const sourceLabel = mathHtml('\\pi_0=\\mathcal{N}(0,1)')
const zeroChipHtml = `zero set ${mathHtml('\\Omega_t^0')}`
const ghostChipHtml = 'ghost boundary'
const legendClassifiedHtml = [
  '<span class="cp-key"><span class="cp-chip cp-chip-ghost">+</span>&nbsp;ghost particle</span>',
  '<span class="cp-key"><span class="cp-chip cp-chip-neg">−</span>&nbsp;negative particle</span>',
  `<span class="cp-key cp-note">created in pairs on ${mathHtml('\\Omega_t^0')} — never transported from ${mathHtml('\\pi_0')}</span>`,
].join('')
const legendUniformHtml = '<span class="cp-key cp-note">integrating backward from t = 1</span>'
const legendHtml = computed(() => (isClassified.value ? legendClassifiedHtml : legendUniformHtml))

// ---- Static paths -----------------------------------------------------------
const zeroBranchPaths = computed(() => {
  const ys = yScale.value
  return zeroLines.map((line) => {
    let d = ''
    for (const [t, xv] of line) d += (d ? 'L' : 'M') + tX(t).toFixed(1) + ',' + ys(xv).toFixed(1)
    return d
  })
})

const frontierPaths = computed(() => {
  if (!frontier) return []
  const ys = yScale.value
  return [frontier.left, frontier.right].map((c) => {
    const n = c.ts.length
    const stride = Math.max(1, Math.floor(n / 260))
    let d = ''
    for (let i = 0; i < n; i += stride) d += (d ? 'L' : 'M') + tX(c.ts[i]).toFixed(1) + ',' + ys(c.xs[i]).toFixed(1)
    d += 'L' + tX(c.ts[n - 1]).toFixed(1) + ',' + ys(c.xs[n - 1]).toFixed(1)
    return d
  })
})

function trajPathD(tr, ys) {
  const n = tr.ts.length
  const stride = Math.max(1, Math.floor(n / 200))
  let d = ''
  for (let i = 0; i < n; i += stride) {
    d += (d ? 'L' : 'M') + tX(tr.ts[i]).toFixed(1) + ',' + ys(tr.xs[i]).toFixed(1)
  }
  // Always include the exact end point (annihilation locus / source landing).
  d += 'L' + tX(tr.ts[n - 1]).toFixed(1) + ',' + ys(tr.xs[n - 1]).toFixed(1)
  return d
}

const trajShapes = computed(() => {
  const data = trajData.value
  if (!data) return []
  const ys = yScale.value
  return data.trajs.map((tr) => {
    const d = trajPathD(tr, ys)
    if (!isClassified.value) {
      return { id: tr.id, d, color: PALETTE.traj, w: 1.0, op: 0.55, dash: null, glow: false }
    }
    if (tr.fate === 'source') {
      return { id: tr.id, d, color: PALETTE.sampling, w: 1.1, op: 0.55, dash: null, glow: false }
    }
    const color = tr.charge > 0 ? PALETTE.buffer : PALETTE.negative
    return { id: tr.id, d, color, w: 1.6, op: 0.9, dash: '2.2,1.6', glow: true }
  })
})

// Static terminal dots on the t ~ 1 line (where the backward sweep starts).
const terminalDots = computed(() => {
  const data = trajData.value
  if (!data) return []
  const ys = yScale.value
  return data.trajs.map((tr) => {
    let fill = PALETTE.traj
    let edge = '#FFFFFF'
    if (isClassified.value) {
      fill = tr.fate === 'source' ? PALETTE.trajMarkerFill : (tr.charge > 0 ? PALETTE.buffer : PALETTE.negative)
      edge = tr.fate === 'source' ? PALETTE.trajMarkerEdge : '#FFFFFF'
    }
    return { id: tr.id, cx: tX(tr.ts[0]), cy: ys(tr.xs[0]), fill, edge }
  })
})

// Source-landing markers at t ~ 0 (revealed by the cursor clip near the end).
const sourceEndDots = computed(() => {
  const data = trajData.value
  if (!data) return []
  const ys = yScale.value
  return data.trajs
    .filter(tr => tr.fate === 'source')
    .map(tr => ({ id: tr.id, cx: tX(tr.tEnd), cy: ys(tr.xEnd) }))
})

// ---- Annihilation markers ----------------------------------------------------
// uniform: hollow ink circles at every annihilation end point.
const uniformMarkers = computed(() => {
  const data = trajData.value
  if (!data || isClassified.value) return []
  const ys = yScale.value
  return data.trajs
    .filter(tr => tr.fate === 'annihilated')
    .map(tr => ({ id: tr.id, t: tr.tEnd, cx: tX(tr.tEnd), cy: ys(tr.xEnd) }))
})

// classified: 12-dot split-event ring (top half magenta, bottom half grey).
function splitMarkerDots(cx, cy) {
  const rr = 5.0
  const dots = []
  for (let i = 0; i < 6; i += 1) {
    const th = ((36 + i * (148 / 5)) * Math.PI) / 180
    dots.push({ x: cx + rr * Math.cos(th), y: cy - rr * Math.sin(th), c: PALETTE.negative })
  }
  for (let i = 0; i < 6; i += 1) {
    const th = ((216 + i * (148 / 5)) * Math.PI) / 180
    dots.push({ x: cx + rr * Math.cos(th), y: cy - rr * Math.sin(th), c: PALETTE.buffer })
  }
  return dots
}

const pairMarkers = computed(() => {
  const data = trajData.value
  if (!data || !isClassified.value) return []
  const ys = yScale.value
  return data.pairs.map((pr) => {
    const cx = tX(pr.t)
    const cy = ys(pr.x)
    return { key: `pm-${pr.plusId}`, t: pr.t, cx, cy, dots: splitMarkerDots(cx, cy) }
  })
})

const soloMarkers = computed(() => {
  const data = trajData.value
  if (!data || !isClassified.value) return []
  const ys = yScale.value
  return data.solos.map(tr => ({
    key: `sm-${tr.id}`,
    t: tr.tEnd,
    cx: tX(tr.tEnd),
    cy: ys(tr.xEnd),
    stroke: tr.charge > 0 ? PALETTE.bufferDark : PALETTE.negativeDark,
  }))
})

// ---- Callouts (classified): both readings of the same events -----------------
const callouts = computed(() => {
  const data = trajData.value
  if (!data || !isClassified.value || !data.pairs.length) return []
  const pairs = data.pairs
  const ys = yScale.value
  const pick = goal => pairs.reduce((a, b) => (Math.abs(b.t - goal) < Math.abs(a.t - goal) ? b : a))
  const ann = pick(0.72)
  let pp = pick(0.35)
  if (pp === ann && pairs.length > 1) pp = pairs[0] === ann ? pairs[1] : pairs[0]
  const items = []
  if (pp !== ann) {
    const mx = tX(pp.t)
    const my = ys(pp.x)
    const bx = mx - 72
    const by = 27
    items.push({
      key: 'pp',
      text: 'Pair production',
      cx: bx,
      cy: by,
      w: 126,
      h: 24,
      path: `M ${(bx + 40).toFixed(1)} ${by + 12} Q ${(mx - 26).toFixed(1)} ${((by + my) / 2 + 14).toFixed(1)} ${(mx - 4).toFixed(1)} ${(my - 12).toFixed(1)}`,
    })
  }
  {
    const mx = tX(ann.t)
    const my = ys(ann.x)
    const bx = mx + 68
    const by = 27
    items.push({
      key: 'an',
      text: 'Annihilation',
      cx: bx,
      cy: by,
      w: 104,
      h: 24,
      path: `M ${(bx - 34).toFixed(1)} ${by + 12} Q ${(mx + 26).toFixed(1)} ${((by + my) / 2 + 14).toFixed(1)} ${(mx + 4).toFixed(1)} ${(my - 12).toFixed(1)}`,
    })
  }
  return items
})

// ---- White-backed chip labels near the boundary curves ----------------------
const curveLabels = computed(() => {
  const ys = yScale.value
  const out = []
  // Zero-set chip: just left of the wedge tip, where the fork is born.
  if (frontier) {
    const tz = frontier.tTip
    const zr = zeroCrossings(Math.min(tz + 5e-3, 1), ALPHA, WORLD)
    if (zr.length) {
      const xTip = 0.5 * (zr[0] + zr[zr.length - 1])
      out.push({ key: 'zero', x: tX(tz) - 152, y: ys(xTip) - 12, cls: 'cp-label-zero', html: zeroChipHtml })
    }
    if (isClassified.value) {
      const tg = 0.8
      const gx = frontAt(frontier.right, tg)
      if (Number.isFinite(gx)) {
        out.push({ key: 'ghost', x: tX(tg) + 8, y: ys(gx) - 24, cls: 'cp-label-ghost', html: ghostChipHtml })
      }
    }
  }
  return out
})

// ---- Source strip: pi_0 density bulging left --------------------------------
const xGrid = d3.range(181).map(i => domain[0] + (i / 180) * (domain[1] - domain[0]))
const srcScale = d3.scaleLinear().domain([0, 0.42]).range([0, 58])
const srcLine = computed(() => d3.line()
  .x(x => stripRight - srcScale(gaussianPdf(x, 0, 1)))
  .y(x => yScale.value(x))
  .curve(d3.curveCatmullRom.alpha(0.5))(xGrid))
const srcArea = computed(() => d3.area()
  .x0(stripRight)
  .x1(x => stripRight - srcScale(gaussianPdf(x, 0, 1)))
  .y(x => yScale.value(x))
  .curve(d3.curveCatmullRom.alpha(0.5))(xGrid))

// ---- Heatmap (schema.py alpha recipe) on an offscreen canvas -----------------
// classified: 3 zones (reachable blue / ghost buffer / negative magenta);
// uniform: honest 2-tone by the sign of pi_t^sign only.
const heatmapUrl = ref('')

function renderHeatmap() {
  if (typeof document === 'undefined') return
  const W = 300
  const H = 220
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const vals = new Float64Array(W * H)
  const gapLo = new Float64Array(W)
  const gapHi = new Float64Array(W)
  let maxAbs = 1e-12
  for (let px = 0; px < W; px += 1) {
    const t = px / (W - 1)
    gapLo[px] = frontier ? frontAt(frontier.left, t) : NaN
    gapHi[px] = frontier ? frontAt(frontier.right, t) : NaN
    for (let py = 0; py < H; py += 1) {
      const x = domain[1] - (py / (H - 1)) * (domain[1] - domain[0])
      const v = signedDensity(x, t, ALPHA, WORLD)
      vals[py * W + px] = v
      const av = Math.abs(v)
      if (av > maxAbs) maxAbs = av
    }
  }

  const classified = isClassified.value
  const img = ctx.createImageData(W, H)
  const cReach = [73, 105, 226]
  const cGhost = [232, 232, 227]
  const cNeg = [227, 74, 146]
  for (let py = 0; py < H; py += 1) {
    const x = domain[1] - (py / (H - 1)) * (domain[1] - domain[0])
    for (let px = 0; px < W; px += 1) {
      const v = vals[py * W + px]
      let c
      let aScale = 1
      if (classified) {
        // Negative wherever the signed density dips below zero; ghost is the
        // rest of the unreachable gap between the two frontier trajectories.
        if (v < 0) {
          c = cNeg
        } else if (Number.isFinite(gapLo[px]) && x >= gapLo[px] && x <= gapHi[px]) {
          c = cGhost
          aScale = 0.45
        } else {
          c = cReach
        }
      } else {
        c = v < 0 ? cNeg : cReach
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
  heatmapUrl.value = canvas.toDataURL('image/png')
}

// ---- Animation: backward time cursor (RAF, timestamp-only) -------------------
const cursor = ref(props.autoplay ? 1 : 0)
const playing = ref(props.autoplay)
const manual = ref(false)
const dragMode = ref(null)
let raf = 0
let refTs = 0
let phase0 = 0

const isRunning = computed(() => playing.value && !manual.value)

function tick(now) {
  if (isRunning.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % CYCLE
    cursor.value = ph < SWEEP ? 1 - ph / SWEEP : 0
  } else {
    // Keep the phase in sync with the (possibly scrubbed) cursor so pressing
    // play resumes exactly where the user left it.
    refTs = 0
    phase0 = SWEEP * (1 - cursor.value)
  }
  raf = requestAnimationFrame(tick)
}

// Dots ride the exact backward curves at the cursor time.
const dots = computed(() => {
  const data = trajData.value
  if (!data) return []
  const c = clamp(cursor.value)
  const ys = yScale.value
  const out = []
  for (const tr of data.trajs) {
    if (tr.fate === 'annihilated' && c <= tr.tEnd) continue
    const dot = { id: tr.id, cx: tX(c), cy: ys(xAtBackward(tr, c)), sign: '', fill: PALETTE.traj, edge: '#FFFFFF', r: 3.6, sw: 1 }
    if (isClassified.value) {
      if (tr.fate === 'source') {
        dot.fill = PALETTE.trajMarkerFill
        dot.edge = PALETTE.trajMarkerEdge
        dot.sw = 0.8
      } else {
        dot.fill = tr.charge > 0 ? PALETTE.buffer : PALETTE.negative
        dot.sign = tr.charge > 0 ? '+' : '−'
        dot.r = 7
        dot.sw = 1.6
      }
    }
    out.push(dot)
  }
  return out
})

// Expanding-ring flashes as the cursor passes annihilation end points.
const flashes = computed(() => {
  const data = trajData.value
  if (!data) return []
  const c = cursor.value
  const ys = yScale.value
  const out = []
  const ring = (key, t, x, color, r0, r1, w) => {
    const d = t - c
    if (d <= 0 || d > FLASH) return
    const p = d / FLASH
    out.push({ key, cx: tX(t), cy: ys(x), r: r0 + r1 * p, o: 0.65 * (1 - p), color, w })
  }
  if (isClassified.value) {
    for (const pr of data.pairs) {
      // Mixed-color flash: the + and - dots die together at the pair point.
      ring(`pf-n-${pr.plusId}`, pr.t, pr.x, PALETTE.negativeDark, 5, 22, 2.4)
      ring(`pf-g-${pr.plusId}`, pr.t, pr.x, PALETTE.bufferDark, 3, 15, 2)
    }
    for (const tr of data.solos) {
      ring(`sf-${tr.id}`, tr.tEnd, tr.xEnd, tr.charge > 0 ? PALETTE.bufferDark : PALETTE.negativeDark, 4, 18, 2.2)
    }
  } else {
    for (const tr of data.trajs) {
      if (tr.fate !== 'annihilated') continue
      ring(`uf-${tr.id}`, tr.tEnd, tr.xEnd, PALETTE.ink, 4, 18, 2)
    }
  }
  return out
})

const tReadout = computed(() => mathHtml(`t = ${clamp(cursor.value).toFixed(2)}`))

// ---- Interaction --------------------------------------------------------------
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

function handlePointerMove(event) {
  if (!dragMode.value) return
  setCursorFrom(event)
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

onMounted(() => {
  if (!ensembleCache) ensembleCache = buildEnsemble()
  trajData.value = ensembleCache
  renderHeatmap()
  // In Slidev's print/export context, freeze at t = 0: every trajectory fully
  // swept and every annihilation marker visible — the complete static picture.
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (isPrint) {
    cursor.value = 0
    playing.value = false
    return
  }
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="cp-wrap">
    <svg
      class="cp-svg"
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
        <!-- Backward sweep: only times >= cursor t are revealed. -->
        <clipPath :id="`${uid}-swept`">
          <rect
            :x="tX(clamp(cursor))" :y="panelY"
            :width="Math.max(0, panelX + panelW - tX(clamp(cursor)))" :height="layout.panelH"
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
          v-if="isClassified && heatmapUrl"
          :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
          :href="heatmapUrl" preserveAspectRatio="none"
        />

        <!-- Boundary curves -->
        <template v-if="isClassified">
          <path
            v-for="(fd, fi) in frontierPaths"
            :key="`fp-${fi}`"
            :d="fd" fill="none"
            stroke="#9A9A9A" stroke-width="1.5" stroke-opacity="0.95"
          />
        </template>
        <path
          v-for="(zd, zi) in zeroBranchPaths"
          :key="`zp-${zi}`"
          :d="zd" fill="none" stroke="#E34A92" stroke-width="1.6" stroke-opacity="0.9"
        />

        <!-- Swept-out part of the honest backward trajectories -->
        <g :clip-path="`url(#${uid}-swept)`">
          <g v-for="s in trajShapes" :key="`traj-${s.id}`">
            <path
              v-if="s.glow"
              :d="s.d" fill="none" :stroke="s.color"
              stroke-width="4.8" stroke-opacity="0.14" stroke-linecap="round"
            />
            <path
              :d="s.d" fill="none" :stroke="s.color"
              :stroke-width="s.w" :stroke-opacity="s.op"
              :stroke-dasharray="s.dash" stroke-linecap="round"
            />
          </g>
          <!-- Survivors land on the t = 0 axis, distributed like the source -->
          <circle
            v-for="m in sourceEndDots"
            :key="`land-${m.id}`"
            :cx="m.cx" :cy="m.cy" r="2.6"
            fill="#2E4FAF" stroke="#D7F1FF" stroke-width="0.7"
          />
        </g>

        <!-- Terminal seeds on the t ~ 1 line -->
        <circle
          v-for="m in terminalDots"
          :key="`term-${m.id}`"
          :cx="m.cx" :cy="m.cy" r="2.4"
          :fill="m.fill" :stroke="m.edge" stroke-width="0.7"
        />

        <!-- Annihilation markers (appear once the sweep passes them) -->
        <circle
          v-for="m in uniformMarkers"
          :key="`um-${m.id}`"
          v-show="cursor <= m.t"
          :cx="m.cx" :cy="m.cy" r="2.8"
          fill="#FFFFFF" stroke="#202124" stroke-width="1"
        />
        <g v-for="pm in pairMarkers" :key="pm.key">
          <g v-show="cursor <= pm.t">
            <circle :cx="pm.cx" :cy="pm.cy" r="6.5" fill="#FFFFFF" />
            <circle
              v-for="(d, i) in pm.dots"
              :key="`${pm.key}-${i}`"
              :cx="d.x" :cy="d.y" r="1.3" :fill="d.c" opacity="0.98"
            />
          </g>
        </g>
        <circle
          v-for="sm in soloMarkers"
          :key="sm.key"
          v-show="cursor <= sm.t"
          :cx="sm.cx" :cy="sm.cy" r="2.8"
          fill="#FFFFFF" :stroke="sm.stroke" stroke-width="1"
        />

        <!-- Time cursor -->
        <line
          :x1="tX(clamp(cursor))" :y1="panelY" :x2="tX(clamp(cursor))" :y2="panelY + layout.panelH"
          stroke="#202124" stroke-width="1.4" stroke-dasharray="5 4" stroke-opacity="0.42"
        />

        <!-- Annihilation flashes -->
        <circle
          v-for="f in flashes"
          :key="f.key"
          :cx="f.cx" :cy="f.cy" :r="f.r"
          fill="none" :stroke="f.color" :stroke-width="f.w" :opacity="f.o"
        />

        <!-- Particles riding backward along their exact curves -->
        <g v-for="p in dots" :key="`dot-${p.id}`">
          <circle :cx="p.cx" :cy="p.cy" :r="p.r" :fill="p.fill" :stroke="p.edge" :stroke-width="p.sw" />
          <text
            v-if="p.sign"
            :x="p.cx" :y="p.cy" class="cp-charge"
            text-anchor="middle" dominant-baseline="central"
          >{{ p.sign }}</text>
        </g>
      </g>

      <!-- Panel border on top for a crisp edge -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        rx="8" fill="none" stroke="#D6DDF3" stroke-width="1"
      />

      <!-- Callouts: the same event read backward and forward (classified) -->
      <g v-for="cb in callouts" :key="cb.key">
        <path :d="cb.path" fill="none" stroke="#202124" stroke-width="1.1" :marker-end="`url(#${uid}-arrow)`" />
        <rect
          :x="cb.cx - cb.w / 2" :y="cb.cy - cb.h / 2" :width="cb.w" :height="cb.h"
          rx="7" fill="#FFFFFF" stroke="#202124" stroke-width="1" opacity="0.96"
        />
        <text
          :x="cb.cx" :y="cb.cy + 0.5" class="cp-callout-text"
          text-anchor="middle" dominant-baseline="central"
        >{{ cb.text }}</text>
      </g>

      <!-- Scrub overlay over the panel (drag pauses the loop) -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        fill="transparent" class="cp-scrub"
        @pointerdown.prevent="handlePanelDown"
      />

      <!-- Play / pause control -->
      <g class="cp-play" @pointerdown.prevent="togglePlay">
        <circle cx="46" :cy="layout.sliderY" r="12" fill="#FFFFFF" stroke="#253A88" stroke-width="2" />
        <g v-if="isRunning">
          <rect x="41.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
          <rect x="47.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${42.6} ${layout.sliderY - 5.4} L ${52} ${layout.sliderY} L ${42.6} ${layout.sliderY + 5.4} Z`"
          fill="#253A88"
        />
      </g>

      <!-- Time slider + KaTeX readout -->
      <g class="cp-slider" @pointerdown.prevent="handleSliderDown">
        <line
          :x1="slider.x" :y1="slider.y" :x2="slider.x + slider.w" :y2="slider.y"
          stroke="#D6DDF3" stroke-width="8" stroke-linecap="round"
        />
        <line
          :x1="slider.x" :y1="slider.y" :x2="slider.x + slider.w * clamp(cursor)" :y2="slider.y"
          stroke="#4969E2" stroke-width="8" stroke-linecap="round"
        />
        <text :x="slider.x - 12" :y="slider.y + 4" text-anchor="end" class="cp-tick">0</text>
        <text :x="slider.x + slider.w + 10" :y="slider.y + 4" class="cp-tick">1</text>
        <circle :cx="slider.x + slider.w * clamp(cursor)" :cy="slider.y" r="10.5" fill="#FFFFFF" stroke="#253A88" stroke-width="2.2" />
      </g>
    </svg>

    <!-- HTML label overlays (moved out of the SVG: WebKit foreignObject paint bug) -->
    <!-- Source strip: pi_0 -->
    <RfFigLabel :x="stripX - 16" :y="panelY - 30" :w="stripW + 40" :vb-h="height">
      <div class="cp-src-label" v-html="sourceLabel"></div>
    </RfFigLabel>

    <!-- White-backed chip labels near the boundary curves -->
    <RfFigLabel
      v-for="lb in curveLabels"
      :key="lb.key"
      :x="lb.x" :y="lb.y" :w="150" :vb-h="height"
    >
      <div class="cp-curve-label" :class="lb.cls">
        <span class="cp-chipbg" v-html="lb.html"></span>
      </div>
    </RfFigLabel>

    <!-- Time readout -->
    <RfFigLabel :x="slider.x + slider.w + 26" :y="layout.sliderY - 13" :w="80" :vb-h="height">
      <div class="cp-readout" v-html="tReadout"></div>
    </RfFigLabel>

    <!-- Legend -->
    <RfFigLabel :x="panelX" :y="layout.legendY" :w="panelW" :vb-h="height">
      <div class="cp-legend" v-html="legendHtml"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.cp-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.cp-svg {
  display: block;
  width: 100%;
  height: auto;
}

.cp-fo {
  pointer-events: none;
  overflow: visible;
}

.cp-src-label {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.cp-src-label :deep(.katex) {
  font-size: 1.05em;
}

.cp-charge {
  fill: #ffffff;
  font-size: 13px;
  font-weight: 800;
  user-select: none;
  pointer-events: none;
}

.cp-callout-text {
  fill: #202124;
  font-size: 13px;
  font-weight: 700;
}

.cp-curve-label {
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.cp-label-zero {
  color: #9d2d64;
  text-align: right;
}

.cp-label-ghost {
  color: #666666;
  text-align: left;
}

.cp-chipbg {
  display: inline-block;
  background: rgba(255, 255, 255, 0.78);
  border-radius: 4px;
  padding: 0 4px;
}

.cp-curve-label :deep(.katex) {
  font-size: 1.05em;
}

.cp-scrub,
.cp-slider,
.cp-play {
  cursor: pointer;
}

.cp-tick {
  fill: #536073;
  font-size: 11.5px;
  font-weight: 600;
}

.cp-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.cp-legend {
  display: flex;
  align-items: center;
  gap: 18px;
  color: #536073;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
}

.cp-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cp-chip {
  display: inline-flex;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.cp-chip-ghost {
  background: #9a9a9a;
}

.cp-chip-neg {
  background: #e34a92;
}

.cp-note {
  color: #536073;
}

.cp-legend :deep(.katex) {
  font-size: 1.08em;
}
</style>
