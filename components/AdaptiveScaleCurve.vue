<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { PALETTE } from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 340 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const lambdaMax = 12
const alphaMin = 0.2
const alphaMax = 3.0

const alphaVal = ref(1.0)
const rAuto = ref(0.35)
const rManual = ref(0.6)
const hovering = ref(false)
const manual = ref(false)
const sliderDrag = ref(false)
let raf = 0
let start = 0

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// lambda_t^alpha(r) = alpha r / ((1+alpha) - alpha r), pole at r* = (1+alpha)/alpha.
function lambdaOfR(r, a) {
  const den = (1 + a) - a * r
  return (a * r) / den
}

function rOfLambda(lam, a) {
  return ((1 + a) * lam) / (a * (1 + lam))
}

const rStar = computed(() => (1 + alphaVal.value) / alphaVal.value)
const rMax = computed(() => 1.30 * rStar.value)

const layout = computed(() => {
  const panel = { x: 140, y: 34, w: 620, h: props.height - 110 }
  return {
    panel,
    plot: {
      x0: panel.x + 42,
      x1: panel.x + panel.w - 16,
      yTop: panel.y + 18,
      yBot: panel.y + panel.h - 26,
    },
    slider: { x: 336, y: props.height - 24, w: 250 },
  }
})

function xOfR(r) {
  const p = layout.value.plot
  return p.x0 + (r / rMax.value) * (p.x1 - p.x0)
}

function yOfLambda(lam) {
  const p = layout.value.plot
  return p.yBot - (lam / lambdaMax) * (p.yBot - p.yTop)
}

const poleX = computed(() => xOfR(rStar.value))

// Curve sampled uniformly in lambda (monotone in r) so the blow-up stays smooth.
function curvePoints(lamLo, lamHi, n) {
  const pts = []
  for (let i = 0; i <= n; i += 1) {
    const lam = lamLo + (i / n) * (lamHi - lamLo)
    pts.push([xOfR(rOfLambda(lam, alphaVal.value)), yOfLambda(lam)])
  }
  return pts
}

const curvePath = computed(() => d3.line()(curvePoints(0, lambdaMax, 220)))
const curveTopPath = computed(() => d3.line()(curvePoints(6.5, lambdaMax, 90)))

const gridLambdas = [2, 4, 6, 8, 10]

const rTicks = computed(() => {
  const out = [{ r: 0, label: '0' }]
  for (let k = 1; k < rMax.value - 1e-9; k += 1) {
    if (Math.abs(xOfR(k) - poleX.value) < 18) continue
    out.push({ r: k, label: `${k}` })
  }
  return out
})

// ---- Marker dot -----------------------------------------------------------

const rDot = computed(() => {
  const raw = hovering.value || manual.value ? rManual.value : rAuto.value
  return clamp(raw, 0.02, 0.99 * rStar.value)
})

const dotLambda = computed(() => lambdaOfR(rDot.value, alphaVal.value))
const dotX = computed(() => xOfR(rDot.value))
const dotY = computed(() => yOfLambda(Math.min(dotLambda.value, lambdaMax)))

const readoutPos = computed(() => {
  const p = layout.value.plot
  const flip = dotX.value > p.x0 + 0.55 * (p.x1 - p.x0)
  return {
    x: flip ? dotX.value - 126 : dotX.value + 16,
    y: clamp(dotY.value - 34, p.yTop + 2, p.yBot - 30),
  }
})

// ---- KaTeX labels ---------------------------------------------------------

function mathHtml(tex) {
  return katex.renderToString(tex, {
    throwOnError: false,
    output: 'html',
  })
}

const xAxisLabel = mathHtml('r_t(x)')
const yAxisLabel = mathHtml('\\lambda_t^{\\alpha}(x)')
const poleLine1 = mathHtml('(1+\\alpha)-\\alpha r=0')
const poleLine2 = `the signed boundary ${mathHtml('\\pi_t^{\\mathtt{sign}}=0')}`
const cfg1Label = `constant CFG ${mathHtml('\\omega=1')}`
const cfg3Label = mathHtml('\\omega=3')
const alphaReadout = computed(() => mathHtml(`\\alpha = ${alphaVal.value.toFixed(2)}`))
const lambdaReadout = computed(() => mathHtml(`\\lambda = ${dotLambda.value.toFixed(2)}`))
const poleTick = computed(() => mathHtml(`r^{*} = ${rStar.value.toFixed(2)}`))

// ---- Pointer interaction --------------------------------------------------

function svgXFromEvent(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

function updateRFromEvent(event) {
  const p = layout.value.plot
  const frac = clamp((svgXFromEvent(event) - p.x0) / (p.x1 - p.x0), 0, 1)
  rManual.value = clamp(frac * rMax.value, 0.02, 0.99 * rStar.value)
}

function handlePlotEnter(event) {
  hovering.value = true
  updateRFromEvent(event)
}

function handlePlotMove(event) {
  if (hovering.value) updateRFromEvent(event)
}

function handlePlotLeave() {
  hovering.value = false
}

function handlePlotDown(event) {
  manual.value = true
  hovering.value = true
  updateRFromEvent(event)
}

function updateAlphaFromEvent(event) {
  const s = layout.value.slider
  const frac = clamp((svgXFromEvent(event) - s.x) / s.w, 0, 1)
  alphaVal.value = alphaMin + frac * (alphaMax - alphaMin)
}

function handleSliderDown(event) {
  sliderDrag.value = true
  updateAlphaFromEvent(event)
}

function handleSvgMove(event) {
  if (sliderDrag.value) updateAlphaFromEvent(event)
}

function handleSvgUp() {
  sliderDrag.value = false
}

const sliderFrac = computed(() => (alphaVal.value - alphaMin) / (alphaMax - alphaMin))

// ---- Autoplay -------------------------------------------------------------

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  if (props.autoplay && !manual.value && !hovering.value) {
    const rLo = 0.05
    const rHi = 0.97 * rStar.value
    const frac = 0.5 + 0.5 * Math.sin(0.45 * elapsed - 0.55)
    rAuto.value = rLo + frac * (rHi - rLo)
  }
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
  <div class="lg-wrap">
    <svg
      class="lg-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handleSvgMove"
      @pointerup="handleSvgUp"
      @pointerleave="handleSvgUp"
    >
      <defs>
        <filter id="lgSoftShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.12" />
        </filter>
      </defs>

      <!-- Panel -->
      <rect
        :x="layout.panel.x"
        :y="layout.panel.y"
        :width="layout.panel.w"
        :height="layout.panel.h"
        rx="8"
        :fill="PALETTE.panel"
        :stroke="PALETTE.panelBorder"
        filter="url(#lgSoftShadow)"
      />

      <!-- Faint negative zone beyond the pole -->
      <rect
        :x="poleX"
        :y="layout.plot.yTop"
        :width="layout.plot.x1 - poleX"
        :height="layout.plot.yBot - layout.plot.yTop"
        :fill="PALETTE.negative"
        opacity="0.06"
      />

      <!-- Grid at integer lambdas -->
      <line
        v-for="lam in gridLambdas"
        :key="`grid-${lam}`"
        :x1="layout.plot.x0"
        :x2="layout.plot.x1"
        :y1="yOfLambda(lam)"
        :y2="yOfLambda(lam)"
        :stroke="PALETTE.grid"
        stroke-width="1"
      />
      <text
        v-for="lam in gridLambdas"
        :key="`gridnum-${lam}`"
        :x="layout.plot.x0 - 8"
        :y="yOfLambda(lam) + 3.5"
        text-anchor="end"
        class="lg-tick"
      >{{ lam }}</text>

      <!-- Constant-CFG reference lines -->
      <line
        :x1="layout.plot.x0"
        :x2="layout.plot.x1"
        :y1="yOfLambda(1)"
        :y2="yOfLambda(1)"
        :stroke="PALETTE.buffer"
        stroke-width="1.2"
        stroke-dasharray="1.4,3.6"
        stroke-linecap="round"
        opacity="0.9"
      />
      <line
        :x1="layout.plot.x0"
        :x2="layout.plot.x1"
        :y1="yOfLambda(3)"
        :y2="yOfLambda(3)"
        :stroke="PALETTE.buffer"
        stroke-width="1.2"
        stroke-dasharray="1.4,3.6"
        stroke-linecap="round"
        opacity="0.9"
      />
      <foreignObject :x="layout.plot.x1 - 170" :y="yOfLambda(1) - 19" width="166" height="18">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-ref-label" v-html="cfg1Label"></div>
      </foreignObject>
      <foreignObject :x="layout.plot.x1 - 170" :y="yOfLambda(3) - 19" width="166" height="18">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-ref-label" v-html="cfg3Label"></div>
      </foreignObject>

      <!-- Recessive axes -->
      <line
        :x1="layout.plot.x0"
        :x2="layout.plot.x1"
        :y1="layout.plot.yBot"
        :y2="layout.plot.yBot"
        stroke="#536073"
        stroke-width="1"
        opacity="0.6"
      />
      <line
        :x1="layout.plot.x0"
        :x2="layout.plot.x0"
        :y1="layout.plot.yTop"
        :y2="layout.plot.yBot"
        stroke="#536073"
        stroke-width="1"
        opacity="0.6"
      />
      <g v-for="tickItem in rTicks" :key="`rtick-${tickItem.r}`">
        <line
          :x1="xOfR(tickItem.r)"
          :x2="xOfR(tickItem.r)"
          :y1="layout.plot.yBot"
          :y2="layout.plot.yBot + 4"
          stroke="#536073"
          stroke-width="1"
          opacity="0.6"
        />
        <text :x="xOfR(tickItem.r)" :y="layout.plot.yBot + 15" text-anchor="middle" class="lg-tick">{{ tickItem.label }}</text>
      </g>

      <!-- Guidance curve with blow-up emphasis -->
      <path :d="curvePath" fill="none" :stroke="PALETTE.sampling" stroke-width="7" stroke-opacity="0.12" stroke-linecap="round" />
      <path :d="curveTopPath" fill="none" :stroke="PALETTE.sampling" stroke-width="11" stroke-opacity="0.10" stroke-linecap="round" />
      <path :d="curvePath" fill="none" :stroke="PALETTE.samplingDark" stroke-width="2.2" stroke-linecap="round" />

      <!-- Pole: vertical dashed magenta -->
      <line
        :x1="poleX"
        :x2="poleX"
        :y1="layout.plot.yTop"
        :y2="layout.plot.yBot"
        :stroke="PALETTE.negative"
        stroke-width="1.6"
        stroke-dasharray="4,3"
      />
      <foreignObject :x="poleX - 18" :y="layout.plot.yBot + 4" width="86" height="20">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-pole-tick" v-html="poleTick"></div>
      </foreignObject>
      <foreignObject :x="poleX - 300" :y="layout.plot.yTop + 4" width="206" height="48">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-pole-box">
          <div class="lg-pole-eq" v-html="poleLine1"></div>
          <div class="lg-pole-sub" v-html="poleLine2"></div>
        </div>
      </foreignObject>

      <!-- Annotations -->
      <text :x="layout.plot.x0 + 14" :y="yOfLambda(4.45)" class="lg-annot">looks positive: guidance vanishes</text>
      <foreignObject :x="poleX + 8" :y="yOfLambda(6.6)" width="126" height="36">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-annot-html">leans negative:<br />repulsion grows</div>
      </foreignObject>

      <!-- Axis labels -->
      <foreignObject :x="layout.plot.x1 + 22" :y="layout.plot.yBot - 12" width="70" height="26">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-axis-label" v-html="xAxisLabel"></div>
      </foreignObject>
      <foreignObject :x="layout.plot.x0 - 34" :y="layout.panel.y - 30" width="90" height="28">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-axis-label" v-html="yAxisLabel"></div>
      </foreignObject>

      <!-- Marker dot + readout -->
      <circle :cx="dotX" :cy="dotY" r="10" :fill="PALETTE.sampling" stroke="#FFFFFF" stroke-width="2.4" />
      <foreignObject :x="readoutPos.x" :y="readoutPos.y" width="112" height="28">
        <div xmlns="http://www.w3.org/1999/xhtml" class="lg-readout" v-html="lambdaReadout"></div>
      </foreignObject>

      <!-- Pointer capture over the plot -->
      <rect
        :x="layout.plot.x0"
        :y="layout.plot.yTop"
        :width="layout.plot.x1 - layout.plot.x0"
        :height="layout.plot.yBot - layout.plot.yTop"
        fill="transparent"
        class="lg-capture"
        @pointerenter="handlePlotEnter"
        @pointermove="handlePlotMove"
        @pointerleave="handlePlotLeave"
        @pointerdown.prevent="handlePlotDown"
      />

      <!-- Alpha slider -->
      <g class="lg-slider" @pointerdown.prevent="handleSliderDown">
        <text :x="layout.slider.x - 14" :y="layout.slider.y + 4" text-anchor="end" class="lg-slider-text">signed weight</text>
        <line
          :x1="layout.slider.x"
          :y1="layout.slider.y"
          :x2="layout.slider.x + layout.slider.w"
          :y2="layout.slider.y"
          :stroke="PALETTE.panelBorder"
          stroke-width="8"
          stroke-linecap="round"
        />
        <line
          :x1="layout.slider.x"
          :y1="layout.slider.y"
          :x2="layout.slider.x + layout.slider.w * sliderFrac"
          :y2="layout.slider.y"
          :stroke="PALETTE.sampling"
          stroke-width="8"
          stroke-linecap="round"
        />
        <circle
          :cx="layout.slider.x + layout.slider.w * sliderFrac"
          :cy="layout.slider.y"
          r="10.5"
          fill="#FFFFFF"
          :stroke="PALETTE.samplingDark"
          stroke-width="2.2"
        />
        <foreignObject :x="layout.slider.x + layout.slider.w + 18" :y="layout.slider.y - 12" width="110" height="26">
          <div xmlns="http://www.w3.org/1999/xhtml" class="lg-alpha-readout" v-html="alphaReadout"></div>
        </foreignObject>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.lg-wrap {
  width: 100%;
  margin-top: 0.1rem;
}

.lg-svg {
  display: block;
  width: 100%;
  height: auto;
}

.lg-tick {
  fill: #536073;
  font-size: 10.5px;
  font-weight: 600;
}

.lg-ref-label {
  color: #536073;
  font-size: 11px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  line-height: 1;
}

.lg-ref-label :deep(.katex) {
  font-size: 1.02em;
}

.lg-axis-label {
  color: #202124;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  line-height: 1;
}

.lg-axis-label :deep(.katex) {
  font-size: 1.08em;
}

.lg-pole-box {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #d6ddf3;
  border-radius: 6px;
  padding: 4px 8px;
  text-align: right;
  white-space: nowrap;
  line-height: 1.25;
  width: fit-content;
  margin-left: auto;
}

.lg-pole-eq {
  color: #9d2d64;
  font-size: 12.5px;
  font-weight: 650;
}

.lg-pole-sub {
  color: #536073;
  font-size: 10.5px;
  font-weight: 600;
  margin-top: 2px;
}

.lg-pole-tick {
  color: #9d2d64;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  line-height: 1;
}

.lg-annot {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.lg-annot-html {
  color: #536073;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
}

.lg-readout {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #d6ddf3;
  border-radius: 5px;
  padding: 2px 7px;
  color: #253a88;
  font-size: 12.5px;
  font-weight: 650;
  white-space: nowrap;
  line-height: 1.2;
  width: fit-content;
}

.lg-capture {
  cursor: crosshair;
}

.lg-slider {
  cursor: pointer;
}

.lg-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.lg-alpha-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  line-height: 1.2;
}
</style>
