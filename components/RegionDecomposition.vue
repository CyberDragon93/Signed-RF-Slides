<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  SCHEMA,
  PALETTE,
  branchPdf,
  signedDensity,
  zeroCrossings,
  ghostCrossings,
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

// ---- Static math: terminal signed density of the schema setup (t = 1) ----

const alphaS = SCHEMA.alpha
const [xLo, xHi] = SCHEMA.domain

function sAt(x) {
  return signedDensity(x, 1, alphaS, SCHEMA)
}

// Zero crossing (reachable/negative frontier of the density) and ghost
// frontier (signed CDF hits mass 1) — exact roots from the shared module.
const x0 = zeroCrossings(1, alphaS, SCHEMA, 480)[0]
const ghostRoots = ghostCrossings(1, alphaS, SCHEMA, 480)
const xg = ghostRoots[ghostRoots.length - 1]

const nGrid = 481
const curvePts = d3.range(nGrid).map((i) => {
  const x = xLo + (i / (nGrid - 1)) * (xHi - xLo)
  return {
    x,
    s: sAt(x),
    pp: branchPdf(x, 1, SCHEMA.plus),
    pm: branchPdf(x, 1, SCHEMA.minus),
  }
})

// Signed curve split into three zone segments with exact junction points.
const reachPts = [...curvePts.filter(p => p.x < xg), { x: xg, s: sAt(xg) }]
const ghostPts = [{ x: xg, s: sAt(xg) }, ...curvePts.filter(p => p.x > xg && p.x < x0), { x: x0, s: 0 }]
const negPts = [{ x: x0, s: 0 }, ...curvePts.filter(p => p.x > x0)]

const rawMax = d3.max(curvePts, p => Math.max(p.s, p.pp, p.pm))
const rawMin = Math.min(0, d3.min(curvePts, p => p.s))
const padY = 0.12 * (rawMax - rawMin)
const yLo = rawMin - padY
const yHi = rawMax + padY

// Signed-density peak (for the direct curve label).
const peakPt = curvePts.reduce((a, b) => (b.s > a.s ? b : a), curvePts[0])

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
const reachLine = computed(() => linePath(reachPts, 's'))
const ghostLine = computed(() => linePath(ghostPts, 's'))
const negLine = computed(() => linePath(negPts, 's'))
const reachFill = computed(() => zoneAreaPath(reachPts))
const ghostFill = computed(() => zoneAreaPath(ghostPts))
const negFill = computed(() => zoneAreaPath(negPts))

// ---- Zones: fills, circled charge markers, label boxes with arrows --------

const ringOffsets = d3.range(18).map((i) => {
  const th = (i / 18) * 2 * Math.PI
  return { dx: markerR * Math.cos(th), dy: markerR * Math.sin(th) }
})

const zonesStatic = [
  {
    id: 'reach',
    xa: xLo,
    xb: xg,
    sign: 'plus',
    dashed: false,
    edge: PALETTE.sampling,
    dark: PALETTE.samplingDark,
    labelHtml: `Reachable ${mathHtml('\\Omega^{r}')}`,
  },
  {
    id: 'ghost',
    xa: xg,
    xb: x0,
    sign: 'plus',
    dashed: true,
    edge: PALETTE.buffer,
    dark: PALETTE.bufferDark,
    labelHtml: `Ghost ${mathHtml('\\Omega^{g}')}`,
  },
  {
    id: 'neg',
    xa: x0,
    xb: xHi,
    sign: 'minus',
    dashed: true,
    edge: PALETTE.negative,
    dark: PALETTE.negativeDark,
    labelHtml: `Rejection ${mathHtml('\\Omega^{-}')}`,
  },
]

const zones = computed(() => zonesStatic.map((z) => {
  const xc = 0.5 * (z.xa + z.xb)
  const mx = X.value(xc)
  const my = Y.value(0.5 * sAt(xc))
  const boxY = layout.value.panel.y + 8
  return {
    ...z,
    mx,
    my,
    boxY,
    arrowY1: boxY + 30,
    arrowY2: z.sign === 'minus' ? my - markerR - 5 : my - markerR - 5,
    baseX1: X.value(z.xa),
    baseX2: X.value(z.xb),
  }
}))

// ---- Text / annotations ---------------------------------------------------

const signedLabel = mathHtml('\\pi_1^{\\mathtt{sign}}')
const piPlusLabel = mathHtml('\\pi_1^{+}')
const piMinusLabel = mathHtml('\\pi_1^{-}')
const xAxisLabel = mathHtml('x')
const unionNote = mathHtml('\\Omega^{+} = \\Omega^{r} \\,\\dot\\cup\\, \\Omega^{g}')
const massNote = mathHtml('\\int_{\\Omega^{g}}\\pi^{\\mathtt{sign}} + \\int_{\\Omega^{-}}\\pi^{\\mathtt{sign}} = 0')

const axisTicks = [-3, -2, -1, 0, 1, 2, 3]

const signedLabelPos = computed(() => ({
  x: X.value(peakPt.x) - 88,
  y: Y.value(peakPt.s) - 2,
}))
const piPlusLabelPos = computed(() => ({
  x: X.value(-1.28) - 18,
  y: Y.value(branchPdf(-1.28, 1, SCHEMA.plus)) + 10,
}))
const piMinusLabelPos = computed(() => ({
  x: X.value(2.35) + 6,
  y: Y.value(branchPdf(2.35, 1, SCHEMA.minus)) - 26,
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

      <!-- Barely-visible blue wash over the reachable zone, fading out left -->
      <rect
        :x="layout.plot.left"
        :y="layout.plot.top"
        :width="Math.max(0, X(xg) - layout.plot.left)"
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
      <foreignObject :x="layout.plot.right + 6" :y="layout.plot.bottom - 10" width="26" height="22">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-axis-label" v-html="xAxisLabel"></div>
      </foreignObject>

      <!-- Zone fills under the signed curve (ghost + negative breathe) -->
      <path :d="reachFill" :fill="PALETTE.sampling" :fill-opacity="0.14" />
      <path :d="ghostFill" :fill="PALETTE.bufferBg" :fill-opacity="0.30 * breathe" />
      <path :d="negFill" :fill="PALETTE.negative" :fill-opacity="0.16 * breathe" />

      <!-- Crisp zero baseline, tri-color per zone (as in schema.py) -->
      <line
        v-for="z in zones"
        :key="`base-${z.id}`"
        :x1="z.baseX1" :y1="Y(0)" :x2="z.baseX2" :y2="Y(0)"
        :stroke="z.dark" stroke-width="1" stroke-opacity="0.8"
      />

      <!-- Boundary ticks at x_g and x_0 -->
      <line :x1="X(xg)" :y1="Y(0) - 7" :x2="X(xg)" :y2="Y(0) + 7" :stroke="PALETTE.bufferDark" stroke-width="1.3" />
      <line :x1="X(x0)" :y1="Y(0) - 7" :x2="X(x0)" :y2="Y(0) + 7" :stroke="PALETTE.negativeDark" stroke-width="1.3" />

      <!-- Dashed branch-density context curves -->
      <path :d="piPlusPath" fill="none" :stroke="PALETTE.sampling" stroke-width="1.3" stroke-opacity="0.75" stroke-dasharray="5 4" stroke-linecap="round" />
      <path :d="piMinusPath" fill="none" :stroke="PALETTE.negative" stroke-width="1.3" stroke-opacity="0.75" stroke-dasharray="5 4" stroke-linecap="round" />

      <!-- Signed density curve: three zone-colored segments, butt joins -->
      <path :d="reachLine" fill="none" :stroke="PALETTE.sampling" stroke-width="2.2" stroke-linecap="butt" />
      <path :d="ghostLine" fill="none" :stroke="PALETTE.buffer" stroke-width="2.2" stroke-linecap="butt" />
      <path :d="negLine" fill="none" :stroke="PALETTE.negative" stroke-width="2.2" stroke-linecap="butt" />

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
            v-for="(o, di) in ringOffsets"
            :key="`dot-${z.id}-${di}`"
            :cx="z.mx + o.dx" :cy="z.my + o.dy" r="1.4"
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

      <!-- Zone label boxes with thin arrows to the zone markers -->
      <g v-for="z in zones" :key="`zl-${z.id}`">
        <line
          :x1="z.mx" :y1="z.arrowY1" :x2="z.mx" :y2="z.arrowY2"
          :stroke="z.dark" stroke-width="1" :marker-end="`url(#rdArrow-${z.id})`"
        />
        <foreignObject :x="z.mx - 92" :y="z.boxY" width="184" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="rd-zone-row">
            <span class="rd-zone-box" :style="{ color: z.dark, borderColor: z.dark }" v-html="z.labelHtml"></span>
          </div>
        </foreignObject>
      </g>

      <!-- Direct curve labels (ink / muted, per the deck's text rules) -->
      <foreignObject :x="signedLabelPos.x" :y="signedLabelPos.y" width="86" height="24">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-curve-label rd-curve-label--ink" v-html="signedLabel"></div>
      </foreignObject>
      <foreignObject :x="piPlusLabelPos.x" :y="piPlusLabelPos.y" width="52" height="24">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-curve-label" v-html="piPlusLabel"></div>
      </foreignObject>
      <foreignObject :x="piMinusLabelPos.x" :y="piMinusLabelPos.y" width="52" height="24">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-curve-label" v-html="piMinusLabel"></div>
      </foreignObject>

      <!-- Bottom annotations: decomposition + mass-balance identity -->
      <foreignObject :x="(layout.plot.left + layout.plot.right) / 2 - 160" :y="layout.panel.y + layout.panel.h - 26" width="320" height="24">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-note rd-note--center" v-html="unionNote"></div>
      </foreignObject>
      <foreignObject :x="layout.plot.right - 300" :y="layout.panel.y + layout.panel.h - 26" width="300" height="24">
        <div xmlns="http://www.w3.org/1999/xhtml" class="rd-note rd-note--right" v-html="massNote"></div>
      </foreignObject>
    </svg>
  </div>
</template>

<style scoped>
.rd-wrap {
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
