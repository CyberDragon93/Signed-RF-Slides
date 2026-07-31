<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import {
  DENSITY,
  PALETTE,
  branchPdf,
  signedDensity,
  simulateAdaptive,
  zeroCrossings,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 300 },
})

const width = 900
const markerR = 11

function mathHtml(tex) {
  return katex.renderToString(tex, {
    throwOnError: false,
    output: 'html',
  })
}

// ---- Static math: terminal signed density of the paper's density world ----

const alphaS = DENSITY.alpha
const [xLo, xHi] = DENSITY.domain

function sAt(x) {
  return signedDensity(x, 1, alphaS, DENSITY)
}

// Exact zone boundaries at t = 1. The negative wedge is the interval between
// the two zero roots; the reach/ghost frontier is the endpoint pair of the two
// limit trajectories hugging the wedge from outside (seeded just off the
// newborn roots at the wedge tip, adaptive integrator — the pairTrajectories
// construction; the enclosed gap carries zero net signed mass).
const zRoots = zeroCrossings(1, alphaS, DENSITY, 480)
const z1 = zRoots[0]
const z2 = zRoots[zRoots.length - 1]

function frontierGap() {
  let lo = 0.01
  let hi = 1
  for (let i = 0; i < 60; i += 1) {
    const m = 0.5 * (lo + hi)
    if (zeroCrossings(m, alphaS, DENSITY).length) hi = m
    else lo = m
  }
  const t0 = Math.min(hi + 2e-3, 1)
  const roots = zeroCrossings(t0, alphaS, DENSITY)
  const eps = 1e-4
  const L = simulateAdaptive(roots[0] - eps, t0, alphaS, DENSITY)
  const R = simulateAdaptive(roots[roots.length - 1] + eps, t0, alphaS, DENSITY)
  return [L.xs[L.xs.length - 1], R.xs[R.xs.length - 1]]
}
const [xa, xb] = frontierGap()

const nGrid = 561
const curvePts = d3.range(nGrid).map((i) => {
  const x = xLo + (i / (nGrid - 1)) * (xHi - xLo)
  return {
    x,
    s: sAt(x),
    pp: branchPdf(x, 1, DENSITY.plus),
    pm: branchPdf(x, 1, DENSITY.minus),
  }
})

function segmentPts(x0, x1) {
  return [{ x: x0, s: sAt(x0) }, ...curvePts.filter(p => p.x > x0 && p.x < x1), { x: x1, s: sAt(x1) }]
}

const rawMax = d3.max(curvePts, p => Math.max(p.s, p.pp, p.pm))
const rawMin = Math.min(0, d3.min(curvePts, p => p.s))
const padY = 0.12 * (rawMax - rawMin)
const yLo = rawMin - padY
const yHi = rawMax + padY

// ---- Layout / scales ------------------------------------------------------

const layout = computed(() => {
  const panel = { x: 20, y: 4, w: 860, h: props.height - 30 }
  const plot = {
    left: panel.x + 34,
    right: panel.x + panel.w - 34,
    top: panel.y + 56,
    bottom: panel.y + panel.h - 44,
  }
  return { panel, plot }
})

const X = computed(() => d3.scaleLinear().domain([xLo, xHi]).range([layout.value.plot.left, layout.value.plot.right]))
const Y = computed(() => d3.scaleLinear().domain([yLo, yHi]).range([layout.value.plot.bottom, layout.value.plot.top]))

function linePath(points, key) {
  const line = d3.line().x(p => X.value(p.x)).y(p => Y.value(p[key]))
  return line(points)
}

function zoneAreaPath(points) {
  const area = d3.area()
    .x(p => X.value(p.x))
    .y0(Y.value(0))
    .y1(p => Y.value(p.s))
  return area(points)
}

const piPlusPath = computed(() => linePath(curvePts, 'pp'))
const piMinusPath = computed(() => linePath(curvePts, 'pm'))

// ---- Five zones: reach | ghost | wedge | ghost | reach ---------------------

const TYPE_STYLE = {
  reach: { sign: 'plus', dashed: false, edge: PALETTE.sampling, dark: PALETTE.samplingDark, fill: PALETTE.sampling, fillOp: 0.14, breathes: false },
  ghost: { sign: 'plus', dashed: true, edge: PALETTE.buffer, dark: PALETTE.bufferDark, fill: PALETTE.bufferBg, fillOp: 0.30, breathes: true },
  neg: { sign: 'minus', dashed: true, edge: PALETTE.negative, dark: PALETTE.negativeDark, fill: PALETTE.negative, fillOp: 0.16, breathes: true },
}

const zonesStatic = [
  { id: 'reachL', type: 'reach', xa: xLo, xb: xa, labelHtml: `Reachable ${mathHtml('\\Omega^{r}')}` },
  { id: 'ghostL', type: 'ghost', xa, xb: z1, labelHtml: null },
  { id: 'neg', type: 'neg', xa: z1, xb: z2, labelHtml: `Rejection ${mathHtml('\\Omega^{-}')}` },
  { id: 'ghostR', type: 'ghost', xa: z2, xb, labelHtml: `Ghost ${mathHtml('\\Omega^{g}')}` },
  { id: 'reachR', type: 'reach', xa: xb, xb: xHi, labelHtml: null },
].map(z => ({ ...z, ...TYPE_STYLE[z.type], pts: segmentPts(z.xa, z.xb) }))

const zones = computed(() => zonesStatic.map((z) => {
  const xc = 0.5 * (z.xa + z.xb)
  const mx = X.value(xc)
  const my = Y.value(0.5 * sAt(xc))
  const boxY = layout.value.panel.y + 8
  return {
    ...z,
    line: linePath(z.pts, 's'),
    fillPath: zoneAreaPath(z.pts),
    mx,
    my,
    boxY,
    arrowY1: boxY + 30,
    arrowY2: my - markerR - 5,
    baseX1: X.value(z.xa),
    baseX2: X.value(z.xb),
  }
}))

// Boundary ticks on the zero baseline: frontier edges grey, zero roots pink.
const boundaryTicks = [
  { x: xa, color: PALETTE.bufferDark },
  { x: z1, color: PALETTE.negativeDark },
  { x: z2, color: PALETTE.negativeDark },
  { x: xb, color: PALETTE.bufferDark },
]

// ---- Text / annotations ---------------------------------------------------

const signedLabel = mathHtml('\\pi_1^{\\mathtt{sign}}')
const piPlusLabel = mathHtml('\\pi_1^{+}')
const piMinusLabel = mathHtml('\\pi_1^{-}')
const xAxisLabel = mathHtml('x')
const unionNote = mathHtml('\\Omega^{+} = \\Omega^{r} \\,\\dot\\cup\\, \\Omega^{g}')
const massNote = mathHtml('\\int_{\\Omega^{g}}\\pi^{\\mathtt{sign}} + \\int_{\\Omega^{-}}\\pi^{\\mathtt{sign}} = 0')

const axisTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4]

// Signed-density peak (left lobe) for the direct curve label.
const peakPt = curvePts.reduce((a, b) => (b.s > a.s ? b : a), curvePts[0])

const signedLabelPos = computed(() => ({
  x: X.value(peakPt.x) - 92,
  y: Y.value(peakPt.s) - 4,
}))
// pi+ dashed curve sits below the signed curve on the left lobe.
const piPlusLabelPos = computed(() => ({
  x: X.value(-2.45) + 26,
  y: Y.value(branchPdf(-2.45, 1, DENSITY.plus)) + 6,
}))
// pi- dashed peak rises out of the wedge in the middle.
const piMinusLabelPos = computed(() => ({
  x: X.value(0.34) + 6,
  y: Y.value(branchPdf(0.34, 1, DENSITY.minus)) - 22,
}))

// ---- Gentle 3s opacity breathe on the ghost + negative fills ---------------

const breathe = ref(0.85)
let raf = 0
let start = 0

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  breathe.value = 0.925 + 0.075 * Math.sin((elapsed / 3) * 2 * Math.PI - Math.PI / 2)
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="rd-wrap">
    <svg class="rd-svg" :viewBox="`0 0 ${width} ${height}`" role="img">
      <defs>
        <filter id="rdSoftShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.10" />
        </filter>
        <linearGradient id="rdReachFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#4969E2" stop-opacity="0" />
          <stop offset="100%" stop-color="#4969E2" stop-opacity="0.05" />
        </linearGradient>
        <marker
          v-for="z in zones"
          :id="`rdArrow-${z.id}`"
          :key="`marker-${z.id}`"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" :fill="z.dark" />
        </marker>
      </defs>

      <!-- Panel -->
      <rect
        :x="layout.panel.x"
        :y="layout.panel.y"
        :width="layout.panel.w"
        :height="layout.panel.h"
        rx="8"
        :fill="'#FBFCFF'"
        stroke="#D6DDF3"
        filter="url(#rdSoftShadow)"
      />

      <!-- Barely-visible blue wash over the left reachable zone -->
      <rect
        :x="layout.plot.left"
        :y="layout.plot.top"
        :width="Math.max(0, X(xa) - layout.plot.left)"
        :height="layout.plot.bottom - layout.plot.top"
        fill="url(#rdReachFade)"
      />

      <!-- Recessive x-axis -->
      <line
        :x1="layout.plot.left" :y1="layout.plot.bottom"
        :x2="layout.plot.right" :y2="layout.plot.bottom"
        stroke="#B9C0D4" stroke-width="1"
      />
      <g v-for="tickX in axisTicks" :key="`tick-${tickX}`">
        <line
          :x1="X(tickX)" :y1="layout.plot.bottom"
          :x2="X(tickX)" :y2="layout.plot.bottom + 4"
          stroke="#B9C0D4" stroke-width="1"
        />
        <text :x="X(tickX)" :y="layout.plot.bottom + 14" text-anchor="middle" class="rd-tick-text">{{ tickX }}</text>
      </g>

      <!-- Zone fills under the signed curve (ghost + negative breathe) -->
      <path
        v-for="z in zones"
        :key="`fill-${z.id}`"
        :d="z.fillPath" :fill="z.fill"
        :fill-opacity="z.fillOp * (z.breathes ? breathe : 1)"
      />

      <!-- Crisp zero baseline, zone-colored (as in the paper figures) -->
      <line
        v-for="z in zones"
        :key="`base-${z.id}`"
        :x1="z.baseX1" :y1="Y(0)" :x2="z.baseX2" :y2="Y(0)"
        :stroke="z.dark" stroke-width="1" stroke-opacity="0.8"
      />

      <!-- Boundary ticks at the frontier edges and zero roots -->
      <line
        v-for="(bt, bi) in boundaryTicks"
        :key="`bt-${bi}`"
        :x1="X(bt.x)" :y1="Y(0) - 7" :x2="X(bt.x)" :y2="Y(0) + 7"
        :stroke="bt.color" stroke-width="1.3"
      />

      <!-- Dashed branch-density context curves -->
      <path :d="piPlusPath" fill="none" :stroke="PALETTE.sampling" stroke-width="1.3" stroke-opacity="0.75" stroke-dasharray="5 4" stroke-linecap="round" />
      <path :d="piMinusPath" fill="none" :stroke="PALETTE.negative" stroke-width="1.3" stroke-opacity="0.75" stroke-dasharray="5 4" stroke-linecap="round" />

      <!-- Signed density curve: zone-colored segments, butt joins -->
      <path
        v-for="z in zones"
        :key="`line-${z.id}`"
        :d="z.line" fill="none" :stroke="z.edge" stroke-width="2.2" stroke-linecap="butt"
      />

      <!-- Circled charge markers (solid ring = reachable, dotted = ghost/neg) -->
      <g v-for="z in zones" :key="`chip-${z.id}`">
        <circle
          :cx="z.mx" :cy="z.my" :r="markerR"
          fill="#FFFFFF"
          :stroke="z.dashed ? 'none' : z.edge"
          :stroke-width="z.dashed ? 0 : 1.7"
        />
        <g v-if="z.dashed">
          <circle
            v-for="di in 18"
            :key="`dot-${z.id}-${di}`"
            :cx="z.mx + markerR * Math.cos((di / 18) * 2 * Math.PI)"
            :cy="z.my + markerR * Math.sin((di / 18) * 2 * Math.PI)"
            r="1.4"
            :fill="z.edge"
          />
        </g>
        <line :x1="z.mx - 4.2" :y1="z.my" :x2="z.mx + 4.2" :y2="z.my" stroke="#111111" stroke-width="1.8" />
        <line
          v-if="z.sign === 'plus'"
          :x1="z.mx" :y1="z.my - 4.2" :x2="z.mx" :y2="z.my + 4.2"
          stroke="#111111" stroke-width="1.8"
        />
      </g>

      <!-- Zone label boxes with thin arrows (one per zone type) -->
      <g v-for="z in zones.filter(zz => zz.labelHtml)" :key="`zl-${z.id}`">
        <line
          :x1="z.mx" :y1="z.arrowY1" :x2="z.mx" :y2="z.arrowY2"
          :stroke="z.dark" stroke-width="1" :marker-end="`url(#rdArrow-${z.id})`"
        />
      </g>
    </svg>

    <!-- x-axis label -->
    <RfFigLabel :x="layout.plot.right + 6" :y="layout.plot.bottom - 10" :w="26" :vb-h="height">
      <div class="rd-axis-label" v-html="xAxisLabel"></div>
    </RfFigLabel>

    <!-- Zone label boxes (arrows stay in the svg) -->
    <RfFigLabel
      v-for="z in zones.filter(zz => zz.labelHtml)"
      :key="`zl-${z.id}`"
      :x="z.mx - 92" :y="z.boxY" :w="184" :vb-h="height"
    >
      <div class="rd-zone-row">
        <span class="rd-zone-box" :style="{ color: z.dark, borderColor: z.dark }" v-html="z.labelHtml"></span>
      </div>
    </RfFigLabel>

    <!-- Direct curve labels (ink / muted, per the deck's text rules) -->
    <RfFigLabel :x="signedLabelPos.x" :y="signedLabelPos.y" :w="86" :vb-h="height">
      <div class="rd-curve-label rd-curve-label--ink" v-html="signedLabel"></div>
    </RfFigLabel>
    <RfFigLabel :x="piPlusLabelPos.x" :y="piPlusLabelPos.y" :w="52" :vb-h="height">
      <div class="rd-curve-label" v-html="piPlusLabel"></div>
    </RfFigLabel>
    <RfFigLabel :x="piMinusLabelPos.x" :y="piMinusLabelPos.y" :w="52" :vb-h="height">
      <div class="rd-curve-label" v-html="piMinusLabel"></div>
    </RfFigLabel>

    <!-- Bottom annotations: decomposition + mass-balance identity -->
    <RfFigLabel :x="(layout.plot.left + layout.plot.right) / 2 - 160" :y="layout.panel.y + layout.panel.h - 26" :w="320" :vb-h="height">
      <div class="rd-note rd-note--center" v-html="unionNote"></div>
    </RfFigLabel>
    <RfFigLabel :x="layout.plot.right - 300" :y="layout.panel.y + layout.panel.h - 26" :w="300" :vb-h="height">
      <div class="rd-note rd-note--right" v-html="massNote"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.rd-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.rd-svg {
  display: block;
  width: 100%;
  height: auto;
}

.rd-zone-row {
  display: flex;
  justify-content: center;
}

.rd-zone-box {
  display: inline-block;
  background: #ffffff;
  border-style: solid;
  border-width: 0.65px;
  border-radius: 6px;
  padding: 2px 9px;
  font-size: 12.5px;
  font-weight: 720;
  line-height: 1.3;
  white-space: nowrap;
}

.rd-zone-box :deep(.katex) {
  font-size: 1.04em;
}

.rd-curve-label {
  color: #536073;
  font-size: 13px;
  font-weight: 620;
  line-height: 1;
}

.rd-curve-label--ink {
  color: #202124;
}

.rd-curve-label :deep(.katex) {
  font-size: 1.06em;
}

.rd-axis-label {
  color: #536073;
  font-size: 12px;
  line-height: 1;
}

.rd-note {
  color: #536073;
  font-size: 13px;
  line-height: 1.35;
}

.rd-note--center {
  text-align: center;
}

.rd-note--right {
  text-align: right;
}

.rd-tick-text {
  fill: #536073;
  font-size: 10px;
  font-weight: 550;
}
</style>
