<script setup>
import * as d3 from 'd3'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'coupling' },
  height: { type: Number, default: 320 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const sourceAxisX = 112
const targetAxisX = 732
const panelX = sourceAxisX
const panelW = targetAxisX - sourceAxisX
const t = ref(0.18)
const phase = ref(0)
const heatmapUrl = ref('')
const pointerActive = ref(false)
const hoverProbeX = ref(0)
let raf = 0
let start = 0

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

function sourcePdf(x) {
  return gaussianPdf(x, 0, 0.95)
}

function targetPdf(x) {
  return 0.54 * gaussianPdf(x, -1.45, 0.42) + 0.46 * gaussianPdf(x, 1.55, 0.52)
}

function targetSampleWith(rand) {
  if (rand() < 0.54) return -1.45 + 0.42 * randn(rand)
  return 1.55 + 0.52 * randn(rand)
}

function makePairs(seed, length) {
  const rand = lcg(seed)
  return Array.from({ length }, (_, i) => ({
    id: `${seed}-${i}`,
    x0: Math.max(-3.25, Math.min(3.25, 0.95 * randn(rand))),
    x1: Math.max(-3.25, Math.min(3.25, targetSampleWith(rand))),
  }))
}

const sampleBatches = Array.from({ length: 7 }, (_, i) => makePairs(20260621 + i * 101, 58))
const conditionalPairs = makePairs(20260711, 92)

const yDomain = [-3.35, 3.35]
const xGrid = d3.range(150).map(i => yDomain[0] + (i / 149) * (yDomain[1] - yDomain[0]))

const y = computed(() => d3.scaleLinear().domain(yDomain).range([props.height - 22, 24]))
const timeX = d3.scaleLinear().domain([0, 1]).range([sourceAxisX, targetAxisX])
const densityScale = d3.scaleLinear().domain([0, 0.7]).range([0, 72])

const batchIndex = computed(() => Math.floor(phase.value) % sampleBatches.length)
const localPhase = computed(() => phase.value % 1)
const activePairs = computed(() => (props.mode === 'coupling' ? sampleBatches[batchIndex.value] : conditionalPairs))
const maxCouplingPairs = 58

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function revealStart(index) {
  if (index < 10) {
    return 0.035 + index * 0.065
  }
  const progress = (index - 10) / Math.max(1, maxCouplingPairs - 11)
  return 0.70 + 0.22 * Math.pow(progress, 0.48)
}

function revealAmount(index) {
  const age = localPhase.value - revealStart(index)
  return d3.easeCubicOut(clamp(age / 0.085))
}

const revealedCount = computed(() => (
  activePairs.value
    .slice(0, maxCouplingPairs)
    .filter((_, index) => revealAmount(index) > 0.02)
    .length
))

function couplingLineOpacity(index) {
  const reveal = revealAmount(index)
  if (reveal <= 0) return 0
  const age = Math.max(0, localPhase.value - revealStart(index))
  const crowding = d3.scaleLinear().domain([1, maxCouplingPairs]).range([0.82, 0.22]).clamp(true)(revealedCount.value)
  const freshBoost = 0.42 * Math.max(0, 1 - age / 0.22)
  const openingBoost = index < 2 && localPhase.value < 0.32 ? 0.18 : 0
  return clamp(reveal * (crowding + freshBoost + openingBoost), 0, 0.92)
}

function couplingPointOpacity(index) {
  const opacity = couplingLineOpacity(index)
  if (opacity <= 0) return 0
  return clamp(opacity + 0.1, 0, 0.92)
}

function marginalPdf(tt, x) {
  const sourceSigma = 0.95
  const components = [
    { w: 0.54, mu: -1.45, sigma: 0.42 },
    { w: 0.46, mu: 1.55, sigma: 0.52 },
  ]
  return d3.sum(components, c => {
    const mu = tt * c.mu
    const sigma = Math.sqrt(((1 - tt) * sourceSigma) ** 2 + (tt * c.sigma) ** 2)
    return c.w * gaussianPdf(x, mu, Math.max(sigma, 0.04))
  })
}

function analyticVelocity(tt, x) {
  const sourceSigma = 0.95
  const components = [
    { w: 0.54, mu: -1.45, sigma: 0.42 },
    { w: 0.46, mu: 1.55, sigma: 0.52 },
  ]
  const weighted = components.map(c => {
    const variance = ((1 - tt) * sourceSigma) ** 2 + (tt * c.sigma) ** 2
    const mean = tt * c.mu
    const density = c.w * gaussianPdf(x, mean, Math.sqrt(Math.max(variance, 1e-5)))
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

function renderMarginalHeatmap() {
  if (typeof document === 'undefined') return

  const panelY = 20
  const panelH = props.height - 42
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(panelW * scale)
  canvas.height = Math.round(panelH * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const image = ctx.createImageData(canvas.width, canvas.height)
  const opacity = d3.scaleSqrt().domain([0, 0.72]).range([0, 0.26]).clamp(true)
  const blue = [73, 105, 226]
  const yScale = y.value

  for (let py = 0; py < canvas.height; py += 1) {
    const svgY = panelY + py / scale
    const xValue = yScale.invert(svgY)
    for (let px = 0; px < canvas.width; px += 1) {
      const svgX = panelX + px / scale
      const tt = clamp((svgX - timeX(0)) / (timeX(1) - timeX(0)))
      const density = svgX < timeX(0) || svgX > timeX(1) ? 0 : marginalPdf(tt, xValue)
      const alpha = opacity(density)
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

const sourcePath = computed(() => {
  const line = d3.line()
    .x(d => sourceAxisX - densityScale(sourcePdf(d)))
    .y(d => y.value(d))
    .curve(d3.curveCatmullRom.alpha(0.6))
  return line(xGrid)
})

const targetPath = computed(() => {
  const line = d3.line()
    .x(d => targetAxisX + densityScale(targetPdf(d)))
    .y(d => y.value(d))
    .curve(d3.curveCatmullRom.alpha(0.6))
  return line(xGrid)
})

function pathFor(pair) {
  const line = d3.line()
    .x(d => timeX(d.t))
    .y(d => y.value(d.x))
  return line([
    { t: 0, x: pair.x0 },
    { t: 1, x: pair.x1 },
  ])
}

function interp(pair, tt) {
  return (1 - tt) * pair.x0 + tt * pair.x1
}

const probeX = computed(() => (
  pointerActive.value
    ? hoverProbeX.value
    : 0.42 * Math.sin(2 * Math.PI * (t.value - 0.12))
))
const bandwidth = 0.28

const selected = computed(() => {
  if (props.mode !== 'conditional') return []
  return activePairs.value
    .map(p => ({
      ...p,
      xt: interp(p, t.value),
      v: p.x1 - p.x0,
      dist: Math.abs(interp(p, t.value) - probeX.value),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 16)
})

const highlightedSamples = computed(() => selected.value.slice(0, 16))

const meanVelocity = computed(() => {
  return analyticVelocity(t.value, probeX.value)
})

const meanX = computed(() => {
  return probeX.value
})

const meanArrow = computed(() => {
  return arrowFromVelocity(t.value, meanX.value, meanVelocity.value, 80, 2.0)
})

function arrowFromVelocity(cx, cy, velocity, length, verticalGain = 1.0) {
  const dt = 0.07
  const displayVelocity = velocity * verticalGain
  const xStart = timeX(cx - dt)
  const yStart = y.value(cy - displayVelocity * dt)
  const xEnd = timeX(cx + dt)
  const yEnd = y.value(cy + displayVelocity * dt)
  const vx = xEnd - xStart
  const vy = yEnd - yStart
  const norm = Math.max(1e-6, Math.sqrt(vx * vx + vy * vy))
  const ux = vx / norm
  const uy = vy / norm
  const centerX = timeX(cx)
  const centerY = y.value(cy)
  return {
    x1: centerX - 0.5 * length * ux,
    y1: centerY - 0.5 * length * uy,
    x2: centerX + 0.5 * length * ux,
    y2: centerY + 0.5 * length * uy,
  }
}

function arrowHeadPath(arrow, length, widthValue) {
  const dx = arrow.x2 - arrow.x1
  const dy = arrow.y2 - arrow.y1
  const norm = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy))
  const ux = dx / norm
  const uy = dy / norm
  const nx = -uy
  const ny = ux
  const bx = arrow.x2 - length * ux
  const by = arrow.y2 - length * uy
  const half = widthValue / 2
  return [
    `M${arrow.x2},${arrow.y2}`,
    `L${bx + half * nx},${by + half * ny}`,
    `L${bx - half * nx},${by - half * ny}`,
    'Z',
  ].join(' ')
}

function arrowShaftEnd(arrow, headLength) {
  const dx = arrow.x2 - arrow.x1
  const dy = arrow.y2 - arrow.y1
  const norm = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy))
  return {
    x: arrow.x2 - headLength * dx / norm,
    y: arrow.y2 - headLength * dy / norm,
  }
}

function handlePointerMove(event) {
  if (props.mode !== 'conditional') return

  const svg = event.currentTarget
  const rect = svg.getBoundingClientRect()
  const svgX = (event.clientX - rect.left) * (width / rect.width)
  const svgY = (event.clientY - rect.top) * (props.height / rect.height)
  const insidePanel = svgX >= timeX(0)
    && svgX <= timeX(1)
    && svgY >= 20
    && svgY <= props.height - 22

  pointerActive.value = insidePanel
  if (!insidePanel) return

  t.value = clamp((svgX - timeX(0)) / (timeX(1) - timeX(0)))
  hoverProbeX.value = clamp(y.value.invert(svgY), yDomain[0], yDomain[1])
}

function handlePointerLeave() {
  pointerActive.value = false
}

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  phase.value = (elapsed / 9.0) % sampleBatches.length
  if (!pointerActive.value) {
    t.value = 0.18 + 0.64 * (0.5 + 0.5 * Math.sin(elapsed * 0.55))
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  renderMarginalHeatmap()
  if (props.autoplay) raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="rf-flow-wrap">
    <svg
      class="rf-flow"
      :class="{ 'is-interactive': mode === 'conditional' }"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    >
      <defs>
        <linearGradient id="rfPanelTint" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#4969E2" stop-opacity="0.09" />
          <stop offset="55%" stop-color="#4969E2" stop-opacity="0.045" />
          <stop offset="100%" stop-color="#4969E2" stop-opacity="0.09" />
        </linearGradient>
      </defs>

      <rect :x="panelX" y="20" :width="panelW" :height="height - 42" fill="#F8F9FE" />
      <image
        v-if="heatmapUrl"
        :x="panelX"
        y="20"
        :width="panelW"
        :height="height - 42"
        :href="heatmapUrl"
        preserveAspectRatio="none"
      />

      <line :x1="sourceAxisX" :y1="20" :x2="sourceAxisX" :y2="height - 22" stroke="#253A88" stroke-width="1" />
      <line :x1="targetAxisX" :y1="20" :x2="targetAxisX" :y2="height - 22" stroke="#253A88" stroke-width="1" />
      <line :x1="timeX(0)" :y1="height - 22" :x2="timeX(1)" :y2="height - 22" stroke="#253A88" stroke-opacity="0.22" />

      <path :d="sourcePath" fill="none" stroke="#4969E2" stroke-width="3" />
      <path :d="targetPath" fill="none" stroke="#4969E2" stroke-width="3" />
      <path :d="`${sourcePath} L${sourceAxisX},${height - 22} L${sourceAxisX},24 Z`" fill="#4969E2" opacity="0.10" />
      <path :d="`${targetPath} L${targetAxisX},${height - 22} L${targetAxisX},24 Z`" fill="#4969E2" opacity="0.10" />

      <text x="74" y="18" text-anchor="middle" class="math-label">
        <tspan>X</tspan><tspan class="math-sub">0</tspan>
      </text>
      <text x="74" y="37" text-anchor="middle" class="role-label">(noise)</text>
      <text x="774" y="18" text-anchor="middle" class="math-label">
        <tspan>X</tspan><tspan class="math-sub">1</tspan>
      </text>
      <text x="774" y="37" text-anchor="middle" class="role-label">(data)</text>
      <text x="423" :y="height - 5" text-anchor="middle" class="axis-label">time t</text>

      <g v-for="(pair, index) in activePairs" :key="pair.id">
        <path
          :d="pathFor(pair)"
          fill="none"
          :stroke="mode === 'conditional' ? '#4969E2' : '#253A88'"
          :stroke-width="mode === 'conditional' ? 0.95 : 1.35"
          :stroke-opacity="mode === 'conditional' ? 0.09 : couplingLineOpacity(index)"
          stroke-linecap="round"
        />
      </g>

      <g v-if="mode === 'conditional'">
        <path
          v-for="pair in highlightedSamples"
          :key="`highlighted-halo-${pair.id}`"
          :d="pathFor(pair)"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="5.6"
          stroke-opacity="0.9"
          stroke-linecap="round"
        />
        <path
          v-for="pair in highlightedSamples"
          :key="`highlighted-line-${pair.id}`"
          :d="pathFor(pair)"
          fill="none"
          stroke="#172B78"
          stroke-width="3"
          stroke-opacity="0.96"
          stroke-linecap="round"
        />
      </g>

      <g v-if="mode === 'coupling'">
      </g>

      <g v-else>
        <line
          :x1="timeX(t)"
          y1="22"
          :x2="timeX(t)"
          :y2="height - 22"
          stroke="#253A88"
          :stroke-width="pointerActive ? 1.8 : 1.35"
          stroke-dasharray="5 4"
          :opacity="pointerActive ? 0.86 : 0.65"
        />
        <rect
          :x="timeX(t) - 26"
          :y="y(probeX + bandwidth)"
          width="52"
          :height="Math.max(10, y(probeX - bandwidth) - y(probeX + bandwidth))"
          rx="8"
          fill="#4969E2"
          :opacity="pointerActive ? 0.18 : 0.12"
          stroke="#4969E2"
          :stroke-opacity="pointerActive ? 0.58 : 0.42"
        />
        <circle
          :cx="timeX(t)"
          :cy="y(probeX)"
          :r="pointerActive ? 5.1 : 4.2"
          fill="white"
          stroke="#253A88"
          :stroke-width="pointerActive ? 2.1 : 1.7"
        />

        <circle
          v-for="pair in activePairs"
          :key="`slice-point-${pair.id}`"
          :cx="timeX(t)"
          :cy="y(interp(pair, t))"
          r="1.8"
          fill="#253A88"
          opacity="0.28"
        />

        <line
          :x1="meanArrow.x1"
          :y1="meanArrow.y1"
          :x2="arrowShaftEnd(meanArrow, 20).x"
          :y2="arrowShaftEnd(meanArrow, 20).y"
          stroke="#FFFFFF"
          stroke-width="11"
          stroke-linecap="round"
          opacity="0.94"
        />
        <path
          :d="arrowHeadPath(meanArrow, 20, 20)"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          stroke-width="7"
          stroke-linejoin="round"
          opacity="0.95"
        />
        <line
          :x1="meanArrow.x1"
          :y1="meanArrow.y1"
          :x2="arrowShaftEnd(meanArrow, 20).x"
          :y2="arrowShaftEnd(meanArrow, 20).y"
          stroke="#0E7490"
          stroke-width="5.4"
          stroke-linecap="round"
        />
        <path
          :d="arrowHeadPath(meanArrow, 20, 20)"
          fill="#0E7490"
          stroke="#164E63"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </g>

      <g v-for="(pair, index) in activePairs.slice(0, mode === 'coupling' ? maxCouplingPairs : 72)" :key="`endpoints-${pair.id}`">
        <circle
          :cx="sourceAxisX"
          :cy="y(pair.x0)"
          :r="mode === 'coupling' ? 2.6 : 2.15"
          fill="#253A88"
          :opacity="mode === 'coupling' ? couplingPointOpacity(index) : 0.48"
        />
        <circle
          :cx="targetAxisX"
          :cy="y(pair.x1)"
          :r="mode === 'coupling' ? 2.6 : 2.15"
          fill="#253A88"
          :opacity="mode === 'coupling' ? couplingPointOpacity(index) : 0.48"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.rf-flow-wrap {
  width: 100%;
  margin-top: 0.15rem;
}

.rf-flow {
  display: block;
  width: 100%;
  height: auto;
}

.rf-flow.is-interactive {
  cursor: crosshair;
}

.panel-label {
  font-size: 18px;
  font-weight: 650;
  fill: #253a88;
}

.math-label {
  font-family: KaTeX_Main, "Latin Modern Roman", "Times New Roman", serif;
  font-size: 21px;
  font-style: italic;
  font-weight: 650;
  fill: #253a88;
}

.math-sub {
  font-size: 13px !important;
  baseline-shift: sub;
}

.role-label {
  font-size: 13px;
  fill: #536073;
}

.axis-label,
.subtle-text {
  font-size: 14px;
  fill: #536073;
}

.formula-text {
  font-size: 18px;
  font-weight: 650;
  fill: #253a88;
}
</style>
