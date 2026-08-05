<script setup>
// Static companion figure for the Tweedie slide: the density-world evolution
// panel (as on the flow slides, but compact and frozen) with a magnifier
// zooming the region just above the zero-set boundary. Arrows there show the
// signed-RF velocity: pointing away from the boundary, with magnitude
// exploding as the trajectory approaches it — Tweedie's repulsion made visible.
import katex from 'katex'
import { computed } from 'vue'
import {
  DENSITY, PALETTE, quantileSeeds, simulateTrajectories, zeroBranches,
  zeroCrossings, signedVelocity,
} from './signedRfMath.js'
import RfFigLabel from './RfFigLabel.vue'

const props = defineProps({
  height: { type: Number, default: 250 },
})

const W = 900
const ALPHA = 0.85

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- static world data (computed once at module import) ----------------------
const seeds = quantileSeeds(15)
const trajData = simulateTrajectories(seeds, ALPHA, DENSITY, 420)
const branches = zeroBranches(ALPHA, DENSITY)

// loupe anchor: the upper zero-set branch at tc
const TC = 0.66
const upperRootAt = (t) => {
  const roots = zeroCrossings(t, ALPHA, DENSITY)
  return roots.length ? Math.max(...roots) : NaN
}
const XB = upperRootAt(TC)

// source window in world coordinates (biased to the positive side above the wall)
const SRC = { t0: TC - 0.13, t1: TC + 0.13, x0: XB - 0.55, x1: XB + 1.05 }

// ---- panel geometry -----------------------------------------------------------
const PX0 = 150
const PX1 = 545
const PY0 = 20
const XRANGE = [-3.4, 3.4]

const py1 = computed(() => props.height - 32)
const tx = t => PX0 + (PX1 - PX0) * t
const xy = computed(() => {
  const y1 = py1.value
  return x => y1 - ((x - XRANGE[0]) / (XRANGE[1] - XRANGE[0])) * (y1 - PY0)
})

const trajPaths = computed(() => {
  const ys = xy.value
  return trajData.paths.map((p) => {
    let d = ''
    for (let k = 0; k < trajData.times.length; k += 3) {
      const x = p[k]
      if (!Number.isFinite(x) || x < XRANGE[0] || x > XRANGE[1]) continue
      d += `${d ? 'L' : 'M'}${tx(trajData.times[k]).toFixed(1)},${ys(x).toFixed(1)}`
    }
    return d
  })
})

const boundaryPaths = computed(() => {
  const ys = xy.value
  return branches
    .filter(pts => pts.length > 3)
    .map(pts => pts.map(([t, x], i) => `${i ? 'L' : 'M'}${tx(t).toFixed(1)},${ys(x).toFixed(1)}`).join(''))
})

// ---- loupe geometry -----------------------------------------------------------
const loupe = computed(() => {
  const r = Math.min(116, (props.height - 24) / 2)
  return { cx: 736, cy: props.height / 2 - 3, r }
})

// map world (t, x) inside SRC -> loupe-local coordinates (square inscribed in circle)
function loupeMap(t, x, lp) {
  const s = lp.r * 1.35
  const u = ((t - SRC.t0) / (SRC.t1 - SRC.t0) - 0.5) * s
  const v = (0.5 - (x - SRC.x0) / (SRC.x1 - SRC.x0)) * s
  return [lp.cx + u, lp.cy + v]
}

// boundary trace inside the loupe window
const loupeBoundary = computed(() => {
  const lp = loupe.value
  let d = ''
  const seg = []
  for (let i = 0; i <= 60; i += 1) {
    const t = SRC.t0 + (i / 60) * (SRC.t1 - SRC.t0)
    const xb = upperRootAt(t)
    if (!Number.isFinite(xb)) continue
    seg.push([t, xb])
    const [px, py] = loupeMap(t, xb, lp)
    d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`
  }
  // negative-region fill: area below the boundary down to the window floor
  let fill = d
  if (seg.length) {
    const [pl] = [loupeMap(seg[seg.length - 1][0], SRC.x0, lp)]
    const [p0] = [loupeMap(seg[0][0], SRC.x0, lp)]
    fill += `L${pl[0].toFixed(1)},${pl[1].toFixed(1)}L${p0[0].toFixed(1)},${p0[1].toFixed(1)}Z`
  }
  return { stroke: d, fill }
})

// Normalized direction field of the signed-RF flow on the positive side:
// each arrow is the unit tangent of (dt, dx) = (1, v) in screen space, so
// lengths never explode — near the wall the arrows simply turn vertical.
// Magnitude is carried by shade instead: darker = larger log-magnitude.
function magWeight(mag) {
  return Math.min(1, Math.log1p(mag) / Math.log1p(250)) ** 1.6
}

function shade(u) {
  const mix = (a, b) => Math.round(a + (b - a) * u)
  return `rgb(${mix(196, 8)}, ${mix(210, 18)}, ${mix(248, 84)})`
}

const arrows = computed(() => {
  const lp = loupe.value
  const s = lp.r * 1.35
  const st = s / (SRC.t1 - SRC.t0)
  const sx = s / (SRC.x1 - SRC.x0)
  const L = 18
  const out = []
  for (let i = 0; i < 7; i += 1) {
    const t = SRC.t0 + ((i + 0.5) / 7) * (SRC.t1 - SRC.t0)
    const xb = upperRootAt(t)
    // one row hugging the wall: |v| is enormous there, so the normalized
    // arrow is essentially vertical — the singular repulsion made explicit
    const xs = [xb + 0.025]
    for (let j = 0; j < 6; j += 1) {
      const g = SRC.x0 + ((j + 0.5) / 6) * (SRC.x1 - SRC.x0)
      if (g >= xb + 0.16) xs.push(g)
    }
    for (const x of xs) {
      const v = signedVelocity(x, t, ALPHA, DENSITY)
      const mag = Math.abs(v)
      let dx = st
      let dy = -sx * v
      const n = Math.hypot(dx, dy)
      dx = (dx / n) * (L / 2)
      dy = (dy / n) * (L / 2)
      const [px, py] = loupeMap(t, x, lp)
      const u = magWeight(mag)
      out.push({
        x1: px - dx, y1: py - dy, x2: px + dx, y2: py + dy, dx, dy,
        color: shade(u), w: 1.3 + 2.3 * u, o: 0.5 + 0.5 * u,
      })
    }
  }
  return out
})

// connector lines: source box corners -> loupe rim
const srcBox = computed(() => {
  const ys = xy.value
  const x = tx(SRC.t0)
  const y = ys(SRC.x1)
  return { x, y, w: tx(SRC.t1) - x, h: ys(SRC.x0) - y }
})

const labelZero = mathHtml('\\Omega_t^0')
const labelT = 'time t'
</script>

<template>
  <div class="twz-wrap">
    <svg :viewBox="`0 0 ${W} ${height}`" role="img" aria-label="Velocity direction and magnitude near the zero-set boundary, magnified">
      <defs>
        <clipPath :id="`twz-clip-${height}`">
          <circle :cx="loupe.cx" :cy="loupe.cy" :r="loupe.r - 1.5" />
        </clipPath>
      </defs>

      <!-- ============ compact evolution panel ============ -->
      <rect :x="PX0" :y="PY0" :width="PX1 - PX0" :height="py1 - PY0" rx="8" :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" />
      <g>
        <path
          v-for="(d, i) in trajPaths" :key="`tr-${i}`"
          :d="d" fill="none" :stroke="PALETTE.sampling" stroke-width="0.9" stroke-opacity="0.5"
        />
        <path
          v-for="(d, i) in boundaryPaths" :key="`zb-${i}`"
          :d="d" fill="none" :stroke="PALETTE.negative" stroke-width="1.6"
        />
      </g>
      <line :x1="PX0" :y1="py1" :x2="PX1" :y2="py1" :stroke="PALETTE.textMuted" stroke-width="0.8" stroke-opacity="0.5" />
      <text :x="PX0" :y="py1 + 14" text-anchor="middle" class="twz-tick">0</text>
      <text :x="PX1" :y="py1 + 14" text-anchor="middle" class="twz-tick">1</text>
      <text :x="(PX0 + PX1) / 2" :y="py1 + 14" text-anchor="middle" class="twz-tick">{{ labelT }}</text>

      <!-- source window + connectors -->
      <rect
        :x="srcBox.x" :y="srcBox.y" :width="srcBox.w" :height="srcBox.h"
        fill="none" :stroke="PALETTE.ink" stroke-width="1.1" stroke-dasharray="4 3" stroke-opacity="0.65" rx="3"
      />
      <line
        :x1="srcBox.x + srcBox.w" :y1="srcBox.y" :x2="loupe.cx - loupe.r * 0.72" :y2="loupe.cy - loupe.r * 0.7"
        :stroke="PALETTE.ink" stroke-width="0.8" stroke-dasharray="4 3" stroke-opacity="0.4"
      />
      <line
        :x1="srcBox.x + srcBox.w" :y1="srcBox.y + srcBox.h" :x2="loupe.cx - loupe.r * 0.72" :y2="loupe.cy + loupe.r * 0.7"
        :stroke="PALETTE.ink" stroke-width="0.8" stroke-dasharray="4 3" stroke-opacity="0.4"
      />

      <!-- ============ magnifier ============ -->
      <circle :cx="loupe.cx" :cy="loupe.cy" :r="loupe.r" fill="#FFFFFF" :stroke="PALETTE.panelBorder" stroke-width="1" />
      <g :clip-path="`url(#twz-clip-${height})`">
        <path :d="loupeBoundary.fill" :fill="PALETTE.negative" opacity="0.12" />
        <path :d="loupeBoundary.stroke" fill="none" :stroke="PALETTE.negative" stroke-width="2.4" />
        <g v-for="(a, i) in arrows" :key="`ar-${i}`">
          <line
            :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2"
            :style="{ stroke: a.color, strokeOpacity: a.o }" :stroke-width="a.w" stroke-linecap="round"
          />
          <path
            :d="`M${a.x2 - (a.dx * 0.42 - a.dy * 0.3)},${a.y2 - (a.dy * 0.42 + a.dx * 0.3)} L${a.x2},${a.y2} L${a.x2 - (a.dx * 0.42 + a.dy * 0.3)},${a.y2 - (a.dy * 0.42 - a.dx * 0.3)}`"
            fill="none" :style="{ stroke: a.color, strokeOpacity: a.o }" :stroke-width="a.w" stroke-linecap="round" stroke-linejoin="round"
          />
        </g>
      </g>
      <!-- rim + handle: the magnifying glass -->
      <circle :cx="loupe.cx" :cy="loupe.cy" :r="loupe.r" fill="none" :stroke="PALETTE.samplingDark" stroke-width="2.6" />
      <line
        :x1="loupe.cx + loupe.r * 0.72" :y1="loupe.cy + loupe.r * 0.72"
        :x2="loupe.cx + loupe.r * 1.06" :y2="loupe.cy + loupe.r * 1.06"
        :stroke="PALETTE.samplingDark" stroke-width="7" stroke-linecap="round"
      />
    </svg>

    <RfFigLabel :x="tx(0.4) - 30" :y="xy(upperRootAt(0.42)) - 26" :w="60" :vb-h="height">
      <div class="twz-math twz-center" :style="{ color: PALETTE.negativeDark }" v-html="labelZero"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.twz-wrap {
  position: relative;
  width: 100%;
}

.twz-wrap svg {
  display: block;
  width: 100%;
  height: auto;
}

.twz-math {
  white-space: nowrap;
}

.twz-math :deep(.katex) {
  font-size: 12.5px;
}

.twz-center {
  text-align: center;
}

.twz-tick {
  font-family: 'KaTeX_Main', 'Times New Roman', serif;
  font-size: 11px;
  fill: #536073;
}
</style>
