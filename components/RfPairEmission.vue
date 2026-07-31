<script>
// Module-scope caches: unique ids per instance; boundaries, trajectories and
// emitted pairs are deterministic, so compute them once for all instances.
let peUidCounter = 0
let peCache = null
</script>

<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted } from 'vue'
import { ref } from 'vue'
import {
  DENSITY,
  PALETTE,
  gaussianPdf,
  quantileSeeds,
  reachFrontier,
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

// ---- Fixed setup: the paper's density world (paper_1d_density.py) ----------
const width = 900
const WORLD = DENSITY
const ALPHA = DENSITY.alpha
const domain = WORLD.domain
const uid = `pe1d-${peUidCounter++}`
const panelX = 104
const panelW = 756
const panelY = 54
const stripX = 22
const stripW = 70
const stripRight = stripX + stripW
const SWEEP = 7.0 // seconds, forward t: 0 -> 1
const HOLD = 1.6
const CYCLE = SWEEP + HOLD
const FLASH = 0.06 // pair-production flash span in t-units
// Emission schedule from the video script (schema_1d_density_simulated_video):
// two demo pairs per wedge edge, seeded at boundary -/+ eps, integrated forward.
const EMIT_DTS = [0.09, 0.33]
const EMIT_EPS = 0.07

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- Deterministic content: boundaries, transported ensemble, emissions ----
function buildContent() {
  const frontier = reachFrontier(ALPHA, WORLD)
  const zeroLines = zeroBranches(ALPHA, WORLD, 160)
  const transported = simulateTrajectories(quantileSeeds(17), ALPHA, WORLD, 480)
  const pairs = []
  if (frontier) {
    for (const side of ['lower', 'upper']) {
      for (const dt of EMIT_DTS) {
        const t0 = Math.min(0.97, frontier.tTip + dt)
        const roots = zeroCrossings(t0, ALPHA, WORLD)
        if (!roots.length) continue
        const xb = side === 'lower' ? roots[0] : roots[roots.length - 1]
        const out = side === 'lower' ? -1 : 1
        pairs.push({
          id: `${side}-${dt}`,
          t: t0,
          xb,
          ghost: simulateAdaptive(xb + out * EMIT_EPS, t0, ALPHA, WORLD),
          reject: simulateAdaptive(xb - out * EMIT_EPS, t0, ALPHA, WORLD),
        })
      }
    }
  }
  pairs.sort((a, b) => a.t - b.t)
  return { frontier, zeroLines, transported, pairs }
}
if (!peCache) peCache = buildContent()
const { frontier, zeroLines, transported, pairs } = peCache

// Interpolate x(t) on a forward curve ({ts, xs}, ts increasing).
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
const legendHtml = [
  '<span class="pe-key"><span class="pe-chip pe-chip-ghost">+</span>&nbsp;ghost particle</span>',
  '<span class="pe-key"><span class="pe-chip pe-chip-neg">−</span>&nbsp;negative particle</span>',
  `<span class="pe-key pe-note">created in pairs on ${mathHtml('\\Omega_t^0')} — never transported from ${mathHtml('\\pi_0')}</span>`,
].join('')

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

function curvePathD(c, ys) {
  const n = c.ts.length
  const stride = Math.max(1, Math.floor(n / 220))
  let d = ''
  for (let i = 0; i < n; i += stride) d += (d ? 'L' : 'M') + tX(c.ts[i]).toFixed(1) + ',' + ys(c.xs[i]).toFixed(1)
  d += 'L' + tX(c.ts[n - 1]).toFixed(1) + ',' + ys(c.xs[n - 1]).toFixed(1)
  return d
}

// Transported (source) trajectories: thin blue, revealed up to the cursor.
const transportedPaths = computed(() => {
  const ys = yScale.value
  const { times, paths } = transported
  return paths.map((arr) => {
    let d = ''
    for (let i = 0; i < arr.length; i += 3) d += (d ? 'L' : 'M') + tX(times[i]).toFixed(1) + ',' + ys(arr[i]).toFixed(1)
    return d
  })
})

// Emitted pair curves (ghost grey / negative pink), dashed with a soft glow.
const pairShapes = computed(() => {
  const ys = yScale.value
  return pairs.map(p => ({
    id: p.id,
    t: p.t,
    cx: tX(p.t),
    cy: ys(p.xb),
    ghost: curvePathD(p.ghost, ys),
    reject: curvePathD(p.reject, ys),
  }))
})

// ---- Curve labels + callout ---------------------------------------------------
const curveLabels = computed(() => {
  const ys = yScale.value
  const out = []
  if (frontier) {
    const tz = frontier.tTip
    const zr = zeroCrossings(Math.min(tz + 5e-3, 1), ALPHA, WORLD)
    if (zr.length) {
      const xTip = 0.5 * (zr[0] + zr[zr.length - 1])
      out.push({ key: 'zero', x: tX(tz) - 152, y: ys(xTip) - 12, cls: 'pe-label-zero', html: zeroChipHtml })
    }
    const tg = 0.8
    const gx = frontAt(frontier.right, tg)
    if (Number.isFinite(gx)) {
      out.push({ key: 'ghost', x: tX(tg) + 8, y: ys(gx) - 24, cls: 'pe-label-ghost', html: ghostChipHtml })
    }
  }
  return out
})

const callout = computed(() => {
  if (!pairs.length) return null
  const p = pairs[0]
  const ys = yScale.value
  const mx = tX(p.t)
  const my = ys(p.xb)
  const bx = mx - 40
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

// ---- Zone heatmap (reachable / ghost / negative), as on the backward page ---
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
  const img = ctx.createImageData(W, H)
  const cReach = [73, 105, 226]
  const cGhost = [232, 232, 227]
  const cNeg = [227, 74, 146]
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
  for (let py = 0; py < H; py += 1) {
    const x = domain[1] - (py / (H - 1)) * (domain[1] - domain[0])
    for (let px = 0; px < W; px += 1) {
      const v = vals[py * W + px]
      let c
      let aScale = 1
      if (v < 0) {
        c = cNeg
      } else if (Number.isFinite(gapLo[px]) && x >= gapLo[px] && x <= gapHi[px]) {
        c = cGhost
        aScale = 0.45
      } else {
        c = cReach
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

// ---- Animation: FORWARD time cursor ------------------------------------------
const cursor = ref(1)
const playing = ref(props.autoplay)
const manual = ref(false)
const dragMode = ref(null)
let raf = 0
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete t = 1 picture

const isRunning = computed(() => playing.value && !manual.value)

function tick(now) {
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

// Dots riding the exact curves at the cursor time.
const dots = computed(() => {
  const c = clamp(cursor.value)
  const ys = yScale.value
  const out = []
  const { times, paths } = transported
  const last = times.length - 1
  const idx = Math.max(0, Math.min(last, Math.round(c * last)))
  for (let i = 0; i < paths.length; i += 1) {
    out.push({ id: `src-${i}`, cx: tX(c), cy: ys(paths[i][idx]), sign: '', fill: PALETTE.trajMarkerFill, edge: PALETTE.trajMarkerEdge, r: 3.2, sw: 0.8 })
  }
  for (const p of pairs) {
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
  renderHeatmap()
  // Print/export freeze at t = 1: all pairs emitted and carried to the end.
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (isPrint) {
    cursor.value = 1
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
      <foreignObject :x="stripX - 16" :y="panelY - 30" :width="stripW + 40" height="24" class="pe-fo">
        <div xmlns="http://www.w3.org/1999/xhtml" class="pe-src-label" v-html="sourceLabel"></div>
      </foreignObject>
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
          v-if="heatmapUrl"
          :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
          :href="heatmapUrl" preserveAspectRatio="none"
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

      <!-- White-backed chip labels near the boundary curves -->
      <foreignObject
        v-for="lb in curveLabels"
        :key="lb.key"
        :x="lb.x" :y="lb.y" width="150" height="22"
        class="pe-fo"
      >
        <div xmlns="http://www.w3.org/1999/xhtml" class="pe-curve-label" :class="lb.cls">
          <span class="pe-chipbg" v-html="lb.html"></span>
        </div>
      </foreignObject>

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

      <!-- Time axis labels -->
      <text :x="panelX" :y="layout.sliderY + 4" text-anchor="middle" class="pe-tick">0</text>
      <text :x="panelX + panelW" :y="layout.sliderY + 4" text-anchor="end" class="pe-tick">1</text>

      <!-- Play / pause control -->
      <g class="pe-play" @pointerdown.prevent="togglePlay">
        <circle :cx="stripX + 24" :cy="layout.sliderY" r="12" fill="#FFFFFF" stroke="#253A88" stroke-width="2" />
        <g v-if="isRunning">
          <rect :x="stripX + 19.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
          <rect :x="stripX + 25.4" :y="layout.sliderY - 5" width="3.2" height="10" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${stripX + 20.6} ${layout.sliderY - 5.4} L ${stripX + 30} ${layout.sliderY} L ${stripX + 20.6} ${layout.sliderY + 5.4} Z`"
          fill="#253A88"
        />
      </g>

      <!-- Time slider -->
      <g class="pe-slider" @pointerdown.prevent="handleSliderDown">
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
        <foreignObject :x="slider.x + slider.w + 18" :y="slider.y - 13" width="96" height="26" class="pe-fo">
          <div xmlns="http://www.w3.org/1999/xhtml" class="pe-readout" v-html="tReadout"></div>
        </foreignObject>
      </g>

      <!-- Legend -->
      <foreignObject :x="panelX" :y="layout.legendY - 6" :width="panelW" height="26" class="pe-fo">
        <div xmlns="http://www.w3.org/1999/xhtml" class="pe-legend" v-html="legendHtml"></div>
      </foreignObject>

      <!-- Transparent overlay: drag to scrub t -->
      <rect
        :x="panelX" :y="panelY" :width="panelW" :height="layout.panelH"
        fill="transparent" class="pe-panel-hit"
        @pointerdown.prevent="handlePanelDown"
      />
    </svg>
  </div>
</template>

<style scoped>
.pe-wrap {
  width: 100%;
  margin-top: 0.1rem;
}

.pe-svg {
  display: block;
  width: 100%;
  height: auto;
}

.pe-fo {
  pointer-events: none;
}

.pe-src-label {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
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

.pe-tick {
  fill: #536073;
  font-size: 11px;
  font-weight: 500;
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
