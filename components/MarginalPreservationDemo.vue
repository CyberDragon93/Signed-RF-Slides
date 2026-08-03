<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RfFigLabel from './RfFigLabel.vue'

const props = defineProps({
  height: { type: Number, default: 455 },
  autoplay: { type: Boolean, default: true },
  showMarginals: { type: Boolean, default: true },
})

const width = 900
const xDomain = [-3.35, 3.35]
const sourceSigma = 0.95
const sideDensityW = 58
const targetComponents = [
  { w: 0.54, mu: -1.45, sigma: 0.42 },
  { w: 0.46, mu: 1.55, sigma: 0.52 },
]
const t = ref(0.32)
const isDragging = ref(false)
const manual = ref(false)
const heatmapUrl = ref('')
let raf = 0
let start = 0

const layout = computed(() => {
  const topY = 28
  const topH = props.showMarginals
    ? Math.max(178, Math.min(214, props.height * 0.46))
    : Math.max(178, Math.min(214, props.height - 72))
  const densityY = topY + topH + 44
  const densityH = Math.max(74, props.height - densityY - 72)
  const panelW = 324
  const leftX = 42
  const rightX = width - leftX - sideDensityW - panelW

  return {
    leftTop: { x: leftX + sideDensityW, y: topY, w: panelW, h: topH },
    rightTop: { x: rightX, y: topY, w: panelW, h: topH },
    leftDensity: { x: leftX, y: densityY, w: panelW + sideDensityW, h: densityH },
    rightDensity: { x: rightX, y: densityY, w: panelW + sideDensityW, h: densityH },
    slider: { x: 230, y: props.height - 27, w: 440 },
  }
})

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

function targetSampleWith(rand) {
  if (rand() < targetComponents[0].w) {
    return targetComponents[0].mu + targetComponents[0].sigma * randn(rand)
  }
  return targetComponents[1].mu + targetComponents[1].sigma * randn(rand)
}

function sourceSampleWith(rand) {
  return sourceSigma * randn(rand)
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function clampX(value) {
  return Math.max(xDomain[0], Math.min(xDomain[1], value))
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

function makePairs(seed, length) {
  const rand = lcg(seed)
  return Array.from({ length }, (_, i) => ({
    id: `mp-${i}`,
    x0: clampX(sourceSigma * normalQuantile((i + 0.5) / length)),
    x1: clampX(targetSampleWith(rand)),
  }))
}

function makeOdeParticles(seed, length) {
  const rand = lcg(seed)
  return Array.from({ length }, (_, i) => ({
    id: `sim-${i}`,
    x0: clampX(sourceSampleWith(rand)),
  }))
}

const samples = makePairs(20260629, 58)
const histogramParticles = makeOdeParticles(20260630, 560)
const highlightedIds = new Set([2, 6, 11, 17, 24, 32, 41, 50, 56])
const xGrid = d3.range(180).map(i => xDomain[0] + (i / 179) * (xDomain[1] - xDomain[0]))
const odeSteps = 110

function mathHtml(tex) {
  return katex.renderToString(tex, {
    throwOnError: false,
    output: 'html',
  })
}

const marginalXLabel = `Marginal law of ${mathHtml('X_t')}`
const marginalZLabel = `Marginal law of ${mathHtml('Z_t')}`
const piLabel = mathHtml('\\pi_t')
const interpolationTitle = `Interpolation ${mathHtml('X_t=tX_1+(1-t)X_0')}`
const odeTitle = `ODE ${mathHtml('\\dot Z_t=v_t(Z_t)')}`

function marginalPdf(tt, x) {
  return d3.sum(targetComponents, c => {
    const mean = tt * c.mu
    const sigma = Math.sqrt(((1 - tt) * sourceSigma) ** 2 + (tt * c.sigma) ** 2)
    return c.w * gaussianPdf(x, mean, Math.max(sigma, 0.04))
  })
}

function sourcePdf(x) {
  return gaussianPdf(x, 0, sourceSigma)
}

function targetPdf(x) {
  return d3.sum(targetComponents, c => c.w * gaussianPdf(x, c.mu, c.sigma))
}

function analyticVelocity(tt, x) {
  const weighted = targetComponents.map(c => {
    const variance = ((1 - tt) * sourceSigma) ** 2 + (tt * c.sigma) ** 2
    const mean = tt * c.mu
    const sigma = Math.sqrt(Math.max(variance, 1e-5))
    const density = c.w * gaussianPdf(x, mean, sigma)
    const posteriorMeanX1 = c.mu + (tt * c.sigma ** 2 / variance) * (x - mean)
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
  return clampX(x + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4))
}

const odeTrajectories = computed(() => samples.map(sample => {
  const points = [{ t: 0, x: sample.x0 }]
  let x = sample.x0
  for (let i = 0; i < odeSteps; i += 1) {
    const time = i / odeSteps
    x = rk4Step(time, x, 1 / odeSteps)
    points.push({ t: (i + 1) / odeSteps, x })
  }
  return { id: sample.id, x0: sample.x0, points }
}))

const histogramTrajectories = computed(() => histogramParticles.map(particle => {
  const points = [{ t: 0, x: particle.x0 }]
  let x = particle.x0
  for (let i = 0; i < odeSteps; i += 1) {
    const time = i / odeSteps
    x = rk4Step(time, x, 1 / odeSteps)
    points.push({ t: (i + 1) / odeSteps, x })
  }
  return { id: particle.id, x0: particle.x0, points }
}))

function indexFromId(id) {
  return Number(id.split('-')[1])
}

function isHighlighted(id) {
  return highlightedIds.has(indexFromId(id))
}

const highlightedSamples = computed(() => samples.filter(sample => isHighlighted(sample.id)))
const highlightedOdeTrajectories = computed(() => (
  odeTrajectories.value.filter(trajectory => isHighlighted(trajectory.id))
))

function timeToX(panel, time) {
  return panel.x + panel.w * clamp(time)
}

function valueToY(panel, value) {
  const ratio = (xDomain[1] - value) / (xDomain[1] - xDomain[0])
  return panel.y + panel.h * ratio
}

function densityX(panel, value) {
  const ratio = (value - xDomain[0]) / (xDomain[1] - xDomain[0])
  return panel.x + panel.w * ratio
}

function densityY(panel, density) {
  const maxDensity = 0.72
  return panel.y + panel.h - panel.h * clamp(density / maxDensity)
}

function sourceDensityX(panel, value) {
  return panel.x - sideDensityW * clamp(sourcePdf(value) / sourcePdf(0))
}

function targetDensityX(panel, value) {
  const maxDensity = d3.max(xGrid, x => targetPdf(x)) || 1
  return panel.x + panel.w + sideDensityW * clamp(targetPdf(value) / maxDensity)
}

function interp(sample, time) {
  return (1 - time) * sample.x0 + time * sample.x1
}

function odeAt(trajectory, time) {
  const raw = clamp(time) * odeSteps
  const index = Math.min(odeSteps - 1, Math.floor(raw))
  const frac = raw - index
  const a = trajectory.points[index]
  const b = trajectory.points[index + 1]
  return a.x + frac * (b.x - a.x)
}

function interpolationPath(sample, panel) {
  const line = d3.line()
    .x(d => timeToX(panel, d.t))
    .y(d => valueToY(panel, d.x))
  return line([
    { t: 0, x: sample.x0 },
    { t: 1, x: sample.x1 },
  ])
}

function odePath(trajectory, panel) {
  const line = d3.line()
    .x(d => timeToX(panel, d.t))
    .y(d => valueToY(panel, d.x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(trajectory.points)
}

function densityAreaPath(panel) {
  const area = d3.area()
    .x(x => densityX(panel, x))
    .y0(panel.y + panel.h)
    .y1(x => densityY(panel, marginalPdf(t.value, x)))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return area(xGrid)
}

function densityLinePath(panel) {
  const line = d3.line()
    .x(x => densityX(panel, x))
    .y(x => densityY(panel, marginalPdf(t.value, x)))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(xGrid)
}

function sourceDensityLinePath(panel) {
  const line = d3.line()
    .x(x => sourceDensityX(panel, x))
    .y(x => valueToY(panel, x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(xGrid)
}

function sourceDensityAreaPath(panel) {
  const area = d3.area()
    .x0(panel.x)
    .x1(x => sourceDensityX(panel, x))
    .y(x => valueToY(panel, x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return area(xGrid)
}

function targetDensityLinePath(panel) {
  const line = d3.line()
    .x(x => targetDensityX(panel, x))
    .y(x => valueToY(panel, x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return line(xGrid)
}

function targetDensityAreaPath(panel) {
  const area = d3.area()
    .x0(panel.x + panel.w)
    .x1(x => targetDensityX(panel, x))
    .y(x => valueToY(panel, x))
    .curve(d3.curveCatmullRom.alpha(0.45))
  return area(xGrid)
}

const histogramBins = computed(() => {
  const values = histogramTrajectories.value.map(trajectory => odeAt(trajectory, t.value))
  const binCount = 30
  const thresholds = d3.range(1, binCount).map(i => xDomain[0] + (i / binCount) * (xDomain[1] - xDomain[0]))
  const bins = d3.bin()
    .domain(xDomain)
    .thresholds(thresholds)(values)

  return bins.map(bin => {
    const width = Math.max(1e-6, bin.x1 - bin.x0)
    return {
      x0: bin.x0,
      x1: bin.x1,
      density: bin.length / (values.length * width),
    }
  })
})

function histogramBarRects(panel) {
  return histogramBins.value.map(bin => {
    const x0 = densityX(panel, bin.x0)
    const x1 = densityX(panel, bin.x1)
    const yTop = densityY(panel, bin.density)
    return {
      x: x0 + 1.4,
      y: yTop,
      width: Math.max(1, x1 - x0 - 2.8),
      height: Math.max(0, panel.y + panel.h - yTop),
    }
  })
}

function renderHeatmap() {
  if (typeof document === 'undefined') return
  const panel = layout.value.leftTop
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(panel.w * scale)
  canvas.height = Math.round(panel.h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const image = ctx.createImageData(canvas.width, canvas.height)
  const blue = [73, 105, 226]
  const opacity = d3.scaleSqrt().domain([0, 0.72]).range([0, 0.22]).clamp(true)

  for (let py = 0; py < canvas.height; py += 1) {
    const ratioY = py / Math.max(1, canvas.height - 1)
    const value = xDomain[1] - ratioY * (xDomain[1] - xDomain[0])
    for (let px = 0; px < canvas.width; px += 1) {
      const tt = px / Math.max(1, canvas.width - 1)
      const alpha = opacity(marginalPdf(tt, value))
      const offset = 4 * (py * canvas.width + px)
      image.data[offset] = blue[0]
      image.data[offset + 1] = blue[1]
      image.data[offset + 2] = blue[2]
      image.data[offset + 3] = Math.round(255 * alpha)
    }
  }

  ctx.putImageData(image, 0, 0)
  heatmapUrl.value = canvas.toDataURL('image/png')
}

function updateTimeFromEvent(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  const svgX = (event.clientX - rect.left) * (width / rect.width)
  const slider = layout.value.slider
  t.value = clamp((svgX - slider.x) / slider.w)
}

function handleSliderDown(event) {
  isDragging.value = true
  manual.value = true
  updateTimeFromEvent(event)
}

function handleSliderMove(event) {
  if (!isDragging.value) return
  updateTimeFromEvent(event)
}

function handleSliderUp() {
  isDragging.value = false
}

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  if (!manual.value && !isDragging.value) {
    t.value = 0.5 + 0.5 * Math.sin(elapsed * 0.42 - 0.9)
  }
  raf = requestAnimationFrame(tick)
}

const tLabel = computed(() => t.value.toFixed(2))

watch(() => props.height, () => {
  renderHeatmap()
})

onMounted(() => {
  renderHeatmap()
  if (props.autoplay) raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="mp-wrap">
    <svg
      class="mp-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handleSliderMove"
      @pointerup="handleSliderUp"
      @pointerleave="handleSliderUp"
    >
      <defs>
        <filter id="mpSoftShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.12" />
        </filter>
        <linearGradient id="mpDensityFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#4969E2" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#4969E2" stop-opacity="0.05" />
        </linearGradient>
      </defs>

      <g v-for="panel in [layout.leftTop, layout.rightTop]" :key="`top-panel-${panel.x}`">
        <rect
          :x="panel.x"
          :y="panel.y"
          :width="panel.w"
          :height="panel.h"
          rx="8"
          fill="#F8F9FE"
          stroke="#D9E0F6"
          filter="url(#mpSoftShadow)"
        />
        <image
          v-if="heatmapUrl"
          :x="panel.x"
          :y="panel.y"
          :width="panel.w"
          :height="panel.h"
          :href="heatmapUrl"
          preserveAspectRatio="none"
        />
        <line :x1="panel.x" :y1="panel.y + panel.h" :x2="panel.x + panel.w" :y2="panel.y + panel.h" stroke="#253A88" stroke-opacity="0.22" />
        <line :x1="panel.x" :y1="panel.y" :x2="panel.x" :y2="panel.y + panel.h" stroke="#253A88" stroke-opacity="0.22" />
        <line :x1="timeToX(panel, t)" :y1="panel.y + 4" :x2="timeToX(panel, t)" :y2="panel.y + panel.h - 2" stroke="#172B78" stroke-width="1.6" stroke-dasharray="5 5" />
      </g>

      <g>
        <path
          v-for="sample in samples"
          :key="`interp-bg-${sample.id}`"
          :d="interpolationPath(sample, layout.leftTop)"
          fill="none"
          stroke="#4969E2"
          stroke-width="1.15"
          stroke-opacity="0.28"
          stroke-linecap="round"
        />
        <path
          v-for="trajectory in odeTrajectories"
          :key="`ode-bg-${trajectory.id}`"
          :d="odePath(trajectory, layout.rightTop)"
          fill="none"
          stroke="#4969E2"
          stroke-width="1.15"
          stroke-opacity="0.3"
          stroke-linecap="round"
        />
      </g>

      <g>
        <path
          v-for="sample in highlightedSamples"
          :key="`interp-halo-${sample.id}`"
          :d="interpolationPath(sample, layout.leftTop)"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="3.3"
          stroke-opacity="0.82"
          stroke-linecap="round"
        />
        <path
          v-for="trajectory in highlightedOdeTrajectories"
          :key="`ode-halo-${trajectory.id}`"
          :d="odePath(trajectory, layout.rightTop)"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="3.4"
          stroke-opacity="0.82"
          stroke-linecap="round"
        />
        <path
          v-for="sample in highlightedSamples"
          :key="`interp-fg-${sample.id}`"
          :d="interpolationPath(sample, layout.leftTop)"
          fill="none"
          stroke="#172B78"
          stroke-width="1.6"
          stroke-opacity="0.9"
          stroke-linecap="round"
        />
        <path
          v-for="trajectory in highlightedOdeTrajectories"
          :key="`ode-fg-${trajectory.id}`"
          :d="odePath(trajectory, layout.rightTop)"
          fill="none"
          stroke="#172B78"
          stroke-width="1.65"
          stroke-opacity="0.9"
          stroke-linecap="round"
        />
      </g>

      <g>
        <line
          :x1="layout.leftTop.x"
          :y1="layout.leftTop.y"
          :x2="layout.leftTop.x"
          :y2="layout.leftTop.y + layout.leftTop.h"
          stroke="#253A88"
          stroke-width="1.6"
          stroke-opacity="0.34"
        />
        <path :d="sourceDensityAreaPath(layout.leftTop)" fill="#4969E2" opacity="0.18" />
        <path
          :d="sourceDensityLinePath(layout.leftTop)"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="4"
          stroke-opacity="0.78"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          :d="sourceDensityLinePath(layout.leftTop)"
          fill="none"
          stroke="#253A88"
          stroke-width="2.2"
          stroke-opacity="0.9"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>

      <g>
        <line
          :x1="layout.rightTop.x + layout.rightTop.w"
          :y1="layout.rightTop.y"
          :x2="layout.rightTop.x + layout.rightTop.w"
          :y2="layout.rightTop.y + layout.rightTop.h"
          stroke="#253A88"
          stroke-width="1.6"
          stroke-opacity="0.34"
        />
        <path :d="targetDensityAreaPath(layout.rightTop)" fill="#4969E2" opacity="0.18" />
        <path
          :d="targetDensityLinePath(layout.rightTop)"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="4"
          stroke-opacity="0.78"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          :d="targetDensityLinePath(layout.rightTop)"
          fill="none"
          stroke="#253A88"
          stroke-width="2.2"
          stroke-opacity="0.9"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>

      <g v-for="sample in samples" :key="`start-left-${sample.id}`">
        <circle :cx="layout.leftTop.x" :cy="valueToY(layout.leftTop, sample.x0)" r="2" fill="#253A88" opacity="0.58" />
        <circle :cx="layout.rightTop.x" :cy="valueToY(layout.rightTop, sample.x0)" r="2" fill="#253A88" opacity="0.58" />
      </g>

      <g v-for="sample in samples" :key="`current-left-${sample.id}`">
        <circle :cx="timeToX(layout.leftTop, t)" :cy="valueToY(layout.leftTop, interp(sample, t))" r="2.25" fill="#172B78" opacity="0.72" />
      </g>
      <g v-for="trajectory in odeTrajectories" :key="`current-right-${trajectory.id}`">
        <circle :cx="timeToX(layout.rightTop, t)" :cy="valueToY(layout.rightTop, odeAt(trajectory, t))" r="2.25" fill="#172B78" opacity="0.72" />
      </g>

      <text :x="timeToX(layout.leftTop, t) + 6" :y="layout.leftTop.y + 14" class="mp-time-label">t = {{ tLabel }}</text>
      <text :x="timeToX(layout.rightTop, t) + 6" :y="layout.rightTop.y + 14" class="mp-time-label">t = {{ tLabel }}</text>

      <g v-if="props.showMarginals">
        <rect :x="layout.leftDensity.x" :y="layout.leftDensity.y" :width="layout.leftDensity.w" :height="layout.leftDensity.h" rx="8" fill="#FBFCFF" stroke="#D9E0F6" />
        <path :d="densityAreaPath(layout.leftDensity)" fill="url(#mpDensityFill)" />
        <path :d="densityLinePath(layout.leftDensity)" fill="none" stroke="#253A88" stroke-width="2.1" />
        <line :x1="layout.leftDensity.x" :y1="layout.leftDensity.y + layout.leftDensity.h" :x2="layout.leftDensity.x + layout.leftDensity.w" :y2="layout.leftDensity.y + layout.leftDensity.h" stroke="#253A88" stroke-opacity="0.24" />
      </g>

      <g v-if="props.showMarginals">
        <rect :x="layout.rightDensity.x" :y="layout.rightDensity.y" :width="layout.rightDensity.w" :height="layout.rightDensity.h" rx="8" fill="#FBFCFF" stroke="#D9E0F6" />
        <rect
          v-for="(bar, index) in histogramBarRects(layout.rightDensity)"
          :key="`hist-${index}`"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          rx="2"
          fill="#4969E2"
          opacity="0.58"
        />
        <path
          :d="densityLinePath(layout.rightDensity)"
          fill="none"
          stroke="#253A88"
          stroke-width="1.7"
          stroke-opacity="0.52"
          stroke-dasharray="5 4"
        />
        <line :x1="layout.rightDensity.x" :y1="layout.rightDensity.y + layout.rightDensity.h" :x2="layout.rightDensity.x + layout.rightDensity.w" :y2="layout.rightDensity.y + layout.rightDensity.h" stroke="#253A88" stroke-opacity="0.24" />
      </g>

      <text v-if="props.showMarginals" :x="width / 2" :y="layout.leftDensity.y + layout.leftDensity.h * 0.56" text-anchor="middle" class="mp-equals">=</text>

      <g class="mp-slider" @pointerdown.prevent="handleSliderDown">
        <line
          :x1="layout.slider.x"
          :y1="layout.slider.y"
          :x2="layout.slider.x + layout.slider.w"
          :y2="layout.slider.y"
          stroke="#CED7F3"
          stroke-width="9"
          stroke-linecap="round"
        />
        <line
          :x1="layout.slider.x"
          :y1="layout.slider.y"
          :x2="layout.slider.x + layout.slider.w * t"
          :y2="layout.slider.y"
          stroke="#4969E2"
          stroke-width="9"
          stroke-linecap="round"
        />
        <circle
          :cx="layout.slider.x + layout.slider.w * t"
          :cy="layout.slider.y"
          r="11"
          fill="#FFFFFF"
          stroke="#253A88"
          stroke-width="2.4"
        />
        <text :x="layout.slider.x - 18" :y="layout.slider.y + 5" text-anchor="end" class="mp-slider-label">0</text>
        <text :x="layout.slider.x + layout.slider.w + 18" :y="layout.slider.y + 5" class="mp-slider-label">1</text>
      </g>
    </svg>
    <RfFigLabel :x="layout.leftTop.x - sideDensityW" :y="layout.leftTop.y - 28" :w="layout.leftTop.w + sideDensityW" :vb-h="height">
      <div class="mp-panel-title-html" v-html="interpolationTitle"></div>
    </RfFigLabel>
    <RfFigLabel :x="layout.rightTop.x" :y="layout.rightTop.y - 28" :w="layout.rightTop.w + sideDensityW" :vb-h="height">
      <div class="mp-panel-title-html" v-html="odeTitle"></div>
    </RfFigLabel>
    <RfFigLabel v-if="props.showMarginals" :x="layout.leftDensity.x" :y="layout.leftDensity.y - 28" :w="layout.leftDensity.w" :vb-h="height">
      <div class="mp-density-title-html" v-html="marginalXLabel"></div>
    </RfFigLabel>
    <RfFigLabel v-if="props.showMarginals" :x="layout.rightDensity.x" :y="layout.rightDensity.y - 28" :w="layout.rightDensity.w" :vb-h="height">
      <div class="mp-density-title-html" v-html="marginalZLabel"></div>
    </RfFigLabel>
    <RfFigLabel v-if="props.showMarginals" :x="width / 2 - 35" :y="layout.leftDensity.y + layout.leftDensity.h * 0.56 - 50" :w="70" :vb-h="height">
      <div class="mp-pi-label" v-html="piLabel"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.mp-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.15rem;
}

.mp-svg {
  display: block;
  width: 100%;
  height: auto;
}

.mp-time-label,
.mp-slider-label {
  font-size: 12px;
  font-weight: 560;
  fill: #536073;
}

.mp-time-label {
  fill: #172b78;
  font-family: KaTeX_Main, "Latin Modern Roman", "Times New Roman", serif;
}

.mp-equals {
  font-size: 34px;
  font-weight: 720;
  fill: #253a88;
}

.mp-slider {
  cursor: pointer;
}

.mp-panel-title-html {
  color: #253a88;
  font-size: 17px;
  font-weight: 720;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.mp-panel-title-html :deep(.katex) {
  font-size: 1.14em;
}

.mp-density-title-html {
  color: #253a88;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.mp-density-title-html :deep(.katex) {
  font-size: 1.18em;
}

.mp-pi-label {
  color: #253a88;
  font-size: 18px;
  line-height: 1;
  text-align: center;
}

.mp-pi-label :deep(.katex) {
  font-size: 1.2em;
}
</style>
