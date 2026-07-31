<script>
// Module-scope instance counter for unique SVG defs ids (deterministic, no randomness).
let steqUidCounter = 0
</script>

<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { DENSITY, PALETTE, branchPdf } from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 320 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const uid = `steq-${steqUidCounter++}`

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---------------------------------------------------------------- alpha state
// Same range, default and sinusoidal sweep as the original target-mode figure.
const ALPHA_LO = 0.05
const ALPHA_HI = 2.0
const ALPHA0 = 0.85
const alphaLive = ref(ALPHA0)
const alphaManual = ref(false)
const dragging = ref(false)
const PHASE0 = Math.asin((ALPHA0 - 1.025) / 0.975)
let raf = 0
let start = 0

// ---------------------------------------------------------------- geometry
// Three equal panels read as a visual equation:  (1+α)π⁺  −  απ⁻  =  π^sign.
const PANEL_W = 244
const GAP = 42
const X0 = (width - (3 * PANEL_W + 2 * GAP)) / 2
const Y0 = 38
const y1 = computed(() => props.height - 52)
const panelX = [X0, X0 + PANEL_W + GAP, X0 + 2 * (PANEL_W + GAP)]
const opX = [X0 + PANEL_W + GAP / 2, X0 + 2 * PANEL_W + 1.5 * GAP]
const opMid = computed(() => (Y0 + y1.value) / 2)

const grid = d3.range(0, 241).map(i => DENSITY.domain[0] + (i / 240) * (DENSITY.domain[1] - DENSITY.domain[0]))
const plusPdf = x => branchPdf(x, 1, DENSITY.plus)
const minusPdf = x => branchPdf(x, 1, DENSITY.minus)

// Shared y-domain, fixed across the whole sweep (extremes at α = ALPHA_HI):
// all three panels use one scale, so the subtraction reads truthfully.
let maxY = 0
let minY = 0
for (const x of grid) {
  const p = plusPdf(x)
  const m = minusPdf(x)
  maxY = Math.max(maxY, (1 + ALPHA_HI) * p, ALPHA_HI * m)
  minY = Math.min(minY, (1 + ALPHA_HI) * p - ALPHA_HI * m)
}
maxY *= 1.06
minY = Math.min(-0.02, minY * 1.08)

const xScales = panelX.map(px => d3.scaleLinear().domain(DENSITY.domain).range([px + 10, px + PANEL_W - 10]))
const yScale = computed(() => d3.scaleLinear().domain([minY, maxY]).range([y1.value - 6, Y0 + 8]))

const shapes = computed(() => {
  const a = alphaLive.value
  const ys = yScale.value
  const signed = x => (1 + a) * plusPdf(x) - a * minusPdf(x)
  const line = (i, f) => d3.line().x(x => xScales[i](x)).y(x => ys(f(x)))(grid)
  const area = (i, f) => d3.area().x(x => xScales[i](x)).y0(ys(0)).y1(x => ys(f(x)))(grid)
  return {
    // Unscaled branch densities as faint dashed references: the solid curve is
    // the same shape rescaled, so the sweep shows exactly what α does.
    plusRef: line(0, plusPdf),
    plus: line(0, x => (1 + a) * plusPdf(x)),
    plusFill: area(0, x => (1 + a) * plusPdf(x)),
    minusRef: line(1, minusPdf),
    minus: line(1, x => a * minusPdf(x)),
    minusFill: area(1, x => a * minusPdf(x)),
    signed: line(2, signed),
    signedPos: area(2, x => Math.max(0, signed(x))),
    signedNeg: area(2, x => Math.min(0, signed(x))),
  }
})

const TICKS = [-4, 0, 4]

// ---------------------------------------------------------------- labels
const labels = [
  { html: mathHtml('(1+\\alpha)\\,\\pi_1^+'), color: PALETTE.samplingDark },
  { html: mathHtml('\\alpha\\,\\pi_1^-'), color: PALETTE.negativeDark },
  { html: mathHtml('\\pi_1^{\\mathtt{sign}}'), color: PALETTE.ink },
]
const opMinusHtml = mathHtml('-')
const opEqHtml = mathHtml('=')
const alphaReadout = computed(() => mathHtml(`\\alpha = ${alphaLive.value.toFixed(2)}`))

// ---------------------------------------------------------------- interaction
const slider = computed(() => ({ x: 316, y: props.height - 22, w: 280 }))

function svgX(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

function setAlphaFromX(x) {
  const s = slider.value
  alphaLive.value = ALPHA_LO + (ALPHA_HI - ALPHA_LO) * clamp((x - s.x) / s.w)
}

function handleAlphaDown(event) {
  dragging.value = true
  alphaManual.value = true
  setAlphaFromX(svgX(event))
}

function handlePointerMove(event) {
  if (dragging.value) setAlphaFromX(svgX(event))
}

function handlePointerUp() {
  dragging.value = false
}

// ---------------------------------------------------------------- autoplay
function tick(now) {
  if (!start) start = now
  if (!alphaManual.value) {
    const elapsed = (now - start) / 1000
    alphaLive.value = clamp(1.025 + 0.975 * Math.sin(0.35 * elapsed + PHASE0), ALPHA_LO, ALPHA_HI)
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  // In Slidev's print/export context, freeze at the paper's α = 0.85 so
  // screenshots are deterministic; animate only in the live deck.
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (props.autoplay && !isPrint) raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="steq-wrap">
    <svg
      class="steq-svg"
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
      </defs>

      <!-- panel labels -->
      <foreignObject v-for="(lb, i) in labels" :key="`lb-${i}`" :x="panelX[i]" y="4" :width="PANEL_W" height="28" pointer-events="none">
        <div xmlns="http://www.w3.org/1999/xhtml" class="steq-label" :style="{ color: lb.color }" v-html="lb.html"></div>
      </foreignObject>

      <!-- panels -->
      <g v-for="(px, i) in panelX" :key="`panel-${i}`">
        <rect
          :x="px" :y="Y0" :width="PANEL_W" :height="y1 - Y0" rx="8"
          :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" :filter="`url(#${uid}-shadow)`"
        />
        <line
          :x1="px + 5" :y1="yScale(0)" :x2="px + PANEL_W - 5" :y2="yScale(0)"
          :stroke="PALETTE.ink" stroke-width="1" stroke-opacity="0.55"
        />
        <g v-for="tk in TICKS" :key="`tick-${i}-${tk}`">
          <line :x1="xScales[i](tk)" :y1="y1" :x2="xScales[i](tk)" :y2="y1 + 4" :stroke="PALETTE.grid" stroke-width="1" />
          <text :x="xScales[i](tk)" :y="y1 + 15" text-anchor="middle" class="steq-tick">{{ tk }}</text>
        </g>
      </g>

      <!-- operators between panels -->
      <foreignObject :x="opX[0] - 20" :y="opMid - 20" width="40" height="40" pointer-events="none">
        <div xmlns="http://www.w3.org/1999/xhtml" class="steq-op" v-html="opMinusHtml"></div>
      </foreignObject>
      <foreignObject :x="opX[1] - 20" :y="opMid - 20" width="40" height="40" pointer-events="none">
        <div xmlns="http://www.w3.org/1999/xhtml" class="steq-op" v-html="opEqHtml"></div>
      </foreignObject>

      <!-- panel 1: scaled positive branch -->
      <path :d="shapes.plusFill" :fill="PALETTE.sampling" opacity="0.2" />
      <path :d="shapes.plusRef" fill="none" :stroke="PALETTE.sampling" stroke-width="1.1" stroke-opacity="0.5" stroke-dasharray="3 2.4" />
      <path :d="shapes.plus" fill="none" :stroke="PALETTE.sampling" stroke-width="2" stroke-linecap="round" />

      <!-- panel 2: scaled negative branch -->
      <path :d="shapes.minusFill" :fill="PALETTE.negative" opacity="0.15" />
      <path :d="shapes.minusRef" fill="none" :stroke="PALETTE.negative" stroke-width="1.1" stroke-opacity="0.5" stroke-dasharray="3 2.4" />
      <path :d="shapes.minus" fill="none" :stroke="PALETTE.negative" stroke-width="2" stroke-linecap="round" />

      <!-- panel 3: the signed target. The below-zero region is the whole
           point of the figure — fill it in unmistakable red. -->
      <path :d="shapes.signedPos" :fill="PALETTE.sampling" opacity="0.22" />
      <path :d="shapes.signedNeg" :fill="PALETTE.negative" opacity="0.38" />
      <path :d="shapes.signed" fill="none" :stroke="PALETTE.ink" stroke-width="2.2" stroke-linecap="round" />

      <!-- alpha slider -->
      <g class="steq-slider" @pointerdown.prevent="handleAlphaDown">
        <text :x="slider.x - 14" :y="slider.y + 4" text-anchor="end" class="steq-slider-text">signed weight</text>
        <line :x1="slider.x" :y1="slider.y" :x2="slider.x + slider.w" :y2="slider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="slider.x" :y1="slider.y"
          :x2="slider.x + slider.w * clamp((alphaLive - ALPHA_LO) / (ALPHA_HI - ALPHA_LO))" :y2="slider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          :cx="slider.x + slider.w * clamp((alphaLive - ALPHA_LO) / (ALPHA_HI - ALPHA_LO))" :cy="slider.y"
          r="10.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.2"
        />
        <foreignObject :x="slider.x + slider.w + 18" :y="slider.y - 13" width="110" height="26" pointer-events="none">
          <div xmlns="http://www.w3.org/1999/xhtml" class="steq-readout" v-html="alphaReadout"></div>
        </foreignObject>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.steq-wrap {
  width: 100%;
}

.steq-svg {
  display: block;
  width: 100%;
  height: auto;
}

.steq-label {
  font-size: 14px;
  font-weight: 680;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.steq-label :deep(.katex) {
  font-size: 1.1em;
}

.steq-op {
  color: #202124;
  font-size: 23px;
  font-weight: 600;
  line-height: 40px;
  text-align: center;
}

.steq-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.steq-slider {
  cursor: pointer;
}

.steq-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.steq-tick {
  fill: #536073;
  font-size: 11px;
  font-weight: 500;
}
</style>
