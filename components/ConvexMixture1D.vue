<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  height: { type: Number, default: 355 },
  autoplay: { type: Boolean, default: true },
  alpha: { type: Number, default: null },
})

const width = 900
const yDomain = [-3.35, 3.35]
const sourceSigma = 0.92
const plusTarget = { mu: -1.18, sigma: 0.42 }
const minusTarget = { mu: 1.38, sigma: 0.48 }
const plusColor = '#253A88'
const minusColor = '#A4461D'
const densityW = 58
const panelY = 34
const alphaInternal = ref(0.28)
const isDragging = ref(false)
const manual = ref(false)
let raf = 0
let start = 0

const layout = computed(() => {
  const panelH = props.height - 94
  const panelW = 306
  const gap = 80
  const leftX = 84
  const rightX = leftX + panelW + gap
  return {
    left: { x: leftX, y: panelY, w: panelW, h: panelH },
    right: { x: rightX, y: panelY, w: panelW, h: panelH },
    slider: { x: 294, y: props.height - 29, w: 312 },
  }
})

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randn(rand) {
  const u = Math.max(rand(), 1e-9)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function gaussianPdf(x, mu, sigma) {
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z) / (Math.sqrt(2 * Math.PI) * sigma)
}

function normalQuantile(p) {
  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ]
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ]
  const plow = 0.02425
  const phigh = 1 - plow

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }

  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

function sourcePdf(x) {
  return gaussianPdf(x, 0, sourceSigma)
}

function plusPdf(x) {
  return gaussianPdf(x, plusTarget.mu, plusTarget.sigma)
}

function minusPdf(x) {
  return gaussianPdf(x, minusTarget.mu, minusTarget.sigma)
}

function targetPdf(x) {
  return (1 - alphaValue.value) * plusPdf(x) + alphaValue.value * minusPdf(x)
}

function sampleTarget(rand, target) {
  return target.mu + target.sigma * randn(rand)
}

function makeSamples() {
  const rand = lcg(20260703)
  return Array.from({ length: 78 }, (_, index) => ({
    id: `convex-${index}`,
    u: rand(),
    x0: clamp(sourceSigma * normalQuantile((index + 0.5) / 78) + 0.025 * randn(rand), yDomain[0], yDomain[1]),
    xPlus: clamp(sampleTarget(rand, plusTarget), yDomain[0], yDomain[1]),
    xMinus: clamp(sampleTarget(rand, minusTarget), yDomain[0], yDomain[1]),
  }))
}

const samples = makeSamples()
const odeSteps = 90
const xGrid = d3.range(190).map(i => yDomain[0] + (i / 189) * (yDomain[1] - yDomain[0]))
const alphaValue = computed(() => (
  props.alpha === null || Number.isNaN(props.alpha)
    ? alphaInternal.value
    : clamp(props.alpha)
))
const plusMass = computed(() => 1 - alphaValue.value)
const minusMass = computed(() => alphaValue.value)
const alphaLabel = computed(() => alphaValue.value.toFixed(2))
const y = computed(() => d3.scaleLinear().domain(yDomain).range([layout.value.left.y + layout.value.left.h - 4, layout.value.left.y + 4]))
const densityScale = d3.scaleLinear().domain([0, 1.0]).range([0, densityW])

function mathHtml(tex) {
  return katex.renderToString(tex, {
    throwOnError: false,
    output: 'html',
  })
}

const interpolationTitle = `Interpolation ${mathHtml('X_t=(1-t)X_0+tX_1')}`
const flowTitle = `Flow ${mathHtml('\\dot Z_t=v_t^\\omega(Z_t)')}`
const sourceLabel = mathHtml('X_0\\sim\\pi_0')
const plusLabel = mathHtml('\\pi_1^+')
const minusLabel = mathHtml('\\pi_1^-')
const mixLabel = mathHtml('\\pi_1^\\omega')

function branch(sample) {
  return sample.u < alphaValue.value ? 'minus' : 'plus'
}

function targetValue(sample) {
  return branch(sample) === 'minus' ? sample.xMinus : sample.xPlus
}

function targetColor(sample) {
  return branch(sample) === 'minus' ? minusColor : plusColor
}

function sampleOpacity(sample) {
  const distance = Math.abs(sample.u - alphaValue.value)
  return clamp(0.14 + 0.46 * Math.exp(-distance * 8), 0.13, 0.58)
}

function timeX(panel, time) {
  return panel.x + panel.w * clamp(time)
}

function valueY(value) {
  return y.value(value)
}

function interpolationPath(sample, panel) {
  const line = d3.line()
    .x(d => timeX(panel, d.t))
    .y(d => valueY(d.x))
  return line([
    { t: 0, x: sample.x0 },
    { t: 1, x: targetValue(sample) },
  ])
}

function analyticVelocity(tt, x) {
  const components = [
    { weight: plusMass.value, mu: plusTarget.mu, sigma: plusTarget.sigma },
    { weight: minusMass.value, mu: minusTarget.mu, sigma: minusTarget.sigma },
  ]
  const weighted = components.map(component => {
    if (component.weight <= 1e-6) return { density: 0, velocity: 0 }
    const variance = ((1 - tt) * sourceSigma) ** 2 + (tt * component.sigma) ** 2
    const mean = tt * component.mu
    const sigma = Math.sqrt(Math.max(variance, 1e-6))
    const density = component.weight * gaussianPdf(x, mean, sigma)
    const posteriorMeanX1 = component.mu + (tt * component.sigma ** 2 / variance) * (x - mean)
    const posteriorMeanX0 = ((1 - tt) * sourceSigma ** 2 / variance) * (x - mean)
    return {
      density,
      velocity: posteriorMeanX1 - posteriorMeanX0,
    }
  })
  const total = d3.sum(weighted, d => d.density)
  if (total <= 1e-10) return 0
  return d3.sum(weighted, d => d.density * d.velocity) / total
}

function rk4Step(time, x, dt) {
  const k1 = analyticVelocity(time, x)
  const k2 = analyticVelocity(time + 0.5 * dt, x + 0.5 * dt * k1)
  const k3 = analyticVelocity(time + 0.5 * dt, x + 0.5 * dt * k2)
  const k4 = analyticVelocity(time + dt, x + dt * k3)
  return clamp(x + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4), yDomain[0], yDomain[1])
}

const odeTrajectories = computed(() => samples.map(sample => {
  const points = [{ t: 0, x: sample.x0 }]
  let x = sample.x0
  for (let i = 0; i < odeSteps; i += 1) {
    const time = i / odeSteps
    x = rk4Step(time, x, 1 / odeSteps)
    points.push({ t: (i + 1) / odeSteps, x })
  }
  return { id: sample.id, u: sample.u, x0: sample.x0, points }
}))

function odePath(trajectory, panel) {
  const line = d3.line()
    .x(d => timeX(panel, d.t))
    .y(d => valueY(d.x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(trajectory.points)
}

function densityLine(pdfFn, baselineX, direction) {
  const line = d3.line()
    .x(x => baselineX + direction * densityScale(pdfFn(x)))
    .y(x => valueY(x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(xGrid)
}

function densityArea(pdfFn, baselineX, direction) {
  const area = d3.area()
    .x0(baselineX)
    .x1(x => baselineX + direction * densityScale(pdfFn(x)))
    .y(x => valueY(x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return area(xGrid)
}

const sourceArea = computed(() => densityArea(sourcePdf, layout.value.left.x, -1))
const sourceLine = computed(() => densityLine(sourcePdf, layout.value.left.x, -1))
const plusArea = computed(() => densityArea(x => plusMass.value * plusPdf(x), layout.value.right.x + layout.value.right.w, 1))
const minusArea = computed(() => densityArea(x => minusMass.value * minusPdf(x), layout.value.right.x + layout.value.right.w, 1))
const mixLine = computed(() => densityLine(targetPdf, layout.value.right.x + layout.value.right.w, 1))
const plusLine = computed(() => densityLine(x => plusMass.value * plusPdf(x), layout.value.right.x + layout.value.right.w, 1))
const minusLine = computed(() => densityLine(x => minusMass.value * minusPdf(x), layout.value.right.x + layout.value.right.w, 1))

function updateAlphaFromEvent(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  const svgX = (event.clientX - rect.left) * (width / rect.width)
  const slider = layout.value.slider
  alphaInternal.value = clamp((svgX - slider.x) / slider.w, 0.03, 0.97)
}

function handlePointerDown(event) {
  isDragging.value = true
  manual.value = true
  updateAlphaFromEvent(event)
}

function handlePointerMove(event) {
  if (!isDragging.value) return
  updateAlphaFromEvent(event)
}

function handlePointerUp() {
  isDragging.value = false
}

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  if (props.autoplay && props.alpha === null && !manual.value && !isDragging.value) {
    alphaInternal.value = 0.5 + 0.43 * Math.sin(elapsed * 0.34 - 0.9)
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
  <div class="cm-wrap">
    <svg
      class="cm-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
    >
      <defs>
        <filter id="cmSoftShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.12" />
        </filter>
        <linearGradient id="cmPanelFill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#F8FAFF" />
          <stop offset="50%" stop-color="#FDFDFB" />
          <stop offset="100%" stop-color="#F8FAFF" />
        </linearGradient>
      </defs>

      <foreignObject :x="layout.left.x - densityW" :y="layout.left.y - 29" :width="layout.left.w + densityW" height="26">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-panel-title" v-html="interpolationTitle"></div>
      </foreignObject>
      <foreignObject :x="layout.right.x" :y="layout.right.y - 29" :width="layout.right.w + densityW" height="26">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-panel-title" v-html="flowTitle"></div>
      </foreignObject>

      <g v-for="panel in [layout.left, layout.right]" :key="`panel-${panel.x}`">
        <rect
          :x="panel.x"
          :y="panel.y"
          :width="panel.w"
          :height="panel.h"
          rx="8"
          fill="url(#cmPanelFill)"
          stroke="#D9E0F6"
          filter="url(#cmSoftShadow)"
        />
        <line :x1="panel.x" :y1="panel.y" :x2="panel.x" :y2="panel.y + panel.h" stroke="#253A88" stroke-opacity="0.24" />
        <line :x1="panel.x + panel.w" :y1="panel.y" :x2="panel.x + panel.w" :y2="panel.y + panel.h" stroke="#253A88" stroke-opacity="0.24" />
        <line :x1="panel.x" :y1="panel.y + panel.h" :x2="panel.x + panel.w" :y2="panel.y + panel.h" stroke="#253A88" stroke-opacity="0.18" />
      </g>

      <path :d="sourceArea" fill="#4969E2" opacity="0.16" />
      <path :d="sourceLine" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-opacity="0.82" stroke-linecap="round" />
      <path :d="sourceLine" fill="none" stroke="#253A88" stroke-width="3.1" stroke-opacity="0.9" stroke-linecap="round" />

      <path :d="plusArea" fill="#4969E2" opacity="0.22" />
      <path :d="minusArea" fill="#A4461D" opacity="0.2" />
      <path :d="plusLine" fill="none" stroke="#253A88" stroke-width="2.1" stroke-opacity="0.72" stroke-linecap="round" />
      <path :d="minusLine" fill="none" stroke="#A4461D" stroke-width="2.1" stroke-opacity="0.72" stroke-linecap="round" />
      <path :d="mixLine" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-opacity="0.86" stroke-linecap="round" />
      <path :d="mixLine" fill="none" stroke="#172B78" stroke-width="3.6" stroke-opacity="0.98" stroke-linecap="round" />

      <g>
        <path
          v-for="sample in samples"
          :key="`interp-${sample.id}`"
          :d="interpolationPath(sample, layout.left)"
          fill="none"
          :stroke="targetColor(sample)"
          stroke-width="1.2"
          :stroke-opacity="sampleOpacity(sample)"
          stroke-linecap="round"
        />
      </g>

      <g>
        <path
          v-for="trajectory in odeTrajectories"
          :key="`ode-${trajectory.id}`"
          :d="odePath(trajectory, layout.right)"
          fill="none"
          stroke="#253A88"
          stroke-width="1.2"
          stroke-opacity="0.28"
          stroke-linecap="round"
        />
      </g>

      <g v-for="sample in samples" :key="`endpoints-${sample.id}`">
        <circle :cx="layout.left.x" :cy="valueY(sample.x0)" r="1.9" fill="#253A88" opacity="0.5" />
        <circle :cx="layout.left.x + layout.left.w" :cy="valueY(targetValue(sample))" r="1.9" :fill="targetColor(sample)" opacity="0.48" />
        <circle :cx="layout.right.x" :cy="valueY(sample.x0)" r="1.9" fill="#253A88" opacity="0.5" />
      </g>

      <foreignObject :x="layout.left.x - densityW - 6" :y="layout.left.y - 1" width="80" height="28">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-label" v-html="sourceLabel"></div>
      </foreignObject>
      <foreignObject :x="layout.right.x + layout.right.w + 48" :y="valueY(plusTarget.mu) - 27" width="80" height="30">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-label cm-plus" v-html="plusLabel"></div>
      </foreignObject>
      <foreignObject :x="layout.right.x + layout.right.w + 48" :y="valueY(minusTarget.mu) - 4" width="80" height="30">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-label cm-minus" v-html="minusLabel"></div>
      </foreignObject>
      <foreignObject :x="layout.right.x + layout.right.w + 84" :y="layout.right.y + layout.right.h * 0.5 - 16" width="64" height="32">
        <div xmlns="http://www.w3.org/1999/xhtml" class="cm-label cm-mix" v-html="mixLabel"></div>
      </foreignObject>

      <g class="cm-slider" @pointerdown.prevent="handlePointerDown">
        <text x="232" :y="height - 24" text-anchor="end" class="cm-slider-text">weight of</text>
        <foreignObject x="238" :y="height - 39" width="34" height="25">
          <div xmlns="http://www.w3.org/1999/xhtml" class="cm-mini-math" v-html="minusLabel"></div>
        </foreignObject>
        <line :x1="layout.slider.x" :y1="layout.slider.y" :x2="layout.slider.x + layout.slider.w" :y2="layout.slider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line :x1="layout.slider.x" :y1="layout.slider.y" :x2="layout.slider.x + layout.slider.w * alphaValue" :y2="layout.slider.y" stroke="#4969E2" stroke-width="8" stroke-linecap="round" />
        <circle :cx="layout.slider.x + layout.slider.w * alphaValue" :cy="layout.slider.y" r="10.5" fill="#FFFFFF" stroke="#253A88" stroke-width="2.2" />
        <text x="624" :y="height - 24" class="cm-slider-text">ω = {{ alphaLabel }}</text>
        <text x="700" :y="height - 24" class="cm-mass-text">plus {{ plusMass.toFixed(2) }} / minus {{ minusMass.toFixed(2) }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.cm-wrap {
  width: 100%;
  margin-top: 0.1rem;
}

.cm-svg {
  display: block;
  width: 100%;
  height: auto;
}

.cm-label,
.cm-mini-math {
  color: #253a88;
  font-size: 14px;
  font-weight: 680;
  line-height: 1;
}

.cm-label :deep(.katex),
.cm-mini-math :deep(.katex) {
  font-size: 1.12em;
}

.cm-panel-title {
  color: #253a88;
  font-size: 15px;
  font-weight: 720;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.cm-panel-title :deep(.katex) {
  font-size: 1.1em;
}

.cm-plus {
  color: #253a88;
}

.cm-minus {
  color: #8f3518;
}

.cm-mix {
  color: #172b78;
  font-size: 15px;
}

.cm-slider {
  cursor: pointer;
}

.cm-slider-text,
.cm-mass-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.cm-mass-text {
  fill: #253a88;
}
</style>
