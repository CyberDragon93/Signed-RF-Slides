<script setup>
import * as d3 from 'd3'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'coupling' },
  height: { type: Number, default: 320 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const t = ref(0.18)
const phase = ref(0)
const heatmapUrl = ref('')
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
const conditionalPairs = makePairs(20260711, 54)

const yDomain = [-3.35, 3.35]
const xGrid = d3.range(150).map(i => yDomain[0] + (i / 149) * (yDomain[1] - yDomain[0]))

const y = computed(() => d3.scaleLinear().domain(yDomain).range([props.height - 22, 24]))
const timeX = d3.scaleLinear().domain([0, 1]).range([142, 704])
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

function renderMarginalHeatmap() {
  if (typeof document === 'undefined') return

  const panelX = 128
  const panelY = 20
  const panelW = 592
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
    .x(d => 112 - densityScale(sourcePdf(d)))
    .y(d => y.value(d))
    .curve(d3.curveCatmullRom.alpha(0.6))
  return line(xGrid)
})

const targetPath = computed(() => {
  const line = d3.line()
    .x(d => 732 + densityScale(targetPdf(d)))
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

const probeX = computed(() => 0.42 * Math.sin(2 * Math.PI * (t.value - 0.12)))
const bandwidth = 0.28

const selected = computed(() => {
  if (props.mode !== 'conditional') return []
  let hits = activePairs.value
    .map(p => ({ ...p, xt: interp(p, t.value), v: p.x1 - p.x0 }))
    .filter(p => Math.abs(p.xt - probeX.value) < bandwidth)
  if (hits.length < 5) {
    hits = activePairs.value
      .map(p => ({ ...p, xt: interp(p, t.value), v: p.x1 - p.x0, dist: Math.abs(interp(p, t.value) - probeX.value) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8)
  }
  return hits
})

const meanVelocity = computed(() => {
  const hits = selected.value
  if (!hits.length) return 0
  return d3.mean(hits, d => d.v) ?? 0
})

const meanX = computed(() => {
  const hits = selected.value
  if (!hits.length) return probeX.value
  return d3.mean(hits, d => d.xt) ?? probeX.value
})

const meanArrow = computed(() => {
  const dt = 0.105
  const v = meanVelocity.value
  const cx = t.value
  const cy = meanX.value
  return {
    x1: timeX(cx - dt),
    y1: y.value(cy - v * dt),
    x2: timeX(cx + dt),
    y2: y.value(cy + v * dt),
  }
})

function smallArrow(hit) {
  const dt = 0.055
  return {
    x1: timeX(t.value - dt),
    y1: y.value(hit.xt - hit.v * dt),
    x2: timeX(t.value + dt),
    y2: y.value(hit.xt + hit.v * dt),
  }
}

function tick(now) {
  if (!start) start = now
  const elapsed = (now - start) / 1000
  phase.value = (elapsed / 9.0) % sampleBatches.length
  t.value = 0.18 + 0.64 * (0.5 + 0.5 * Math.sin(elapsed * 0.55))
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
    <svg class="rf-flow" :viewBox="`0 0 ${width} ${height}`" role="img">
      <defs>
        <linearGradient id="rfPanelTint" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#4969E2" stop-opacity="0.09" />
          <stop offset="55%" stop-color="#4969E2" stop-opacity="0.045" />
          <stop offset="100%" stop-color="#4969E2" stop-opacity="0.09" />
        </linearGradient>
        <marker id="rfArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" fill="#253A88" />
        </marker>
        <marker id="rfSmallArrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#9AA9EC" />
        </marker>
      </defs>

      <rect x="128" y="20" width="592" :height="height - 42" fill="#F8F9FE" />
      <image
        v-if="heatmapUrl"
        x="128"
        y="20"
        width="592"
        :height="height - 42"
        :href="heatmapUrl"
        preserveAspectRatio="none"
      />

      <line x1="112" :y1="20" x2="112" :y2="height - 22" stroke="#253A88" stroke-width="1" />
      <line x1="732" :y1="20" x2="732" :y2="height - 22" stroke="#253A88" stroke-width="1" />
      <line x1="142" :y1="height - 22" x2="704" :y2="height - 22" stroke="#253A88" stroke-opacity="0.22" />

      <path :d="sourcePath" fill="none" stroke="#4969E2" stroke-width="3" />
      <path :d="targetPath" fill="none" stroke="#4969E2" stroke-width="3" />
      <path :d="`${sourcePath} L112,${height - 22} L112,24 Z`" fill="#4969E2" opacity="0.10" />
      <path :d="`${targetPath} L732,${height - 22} L732,24 Z`" fill="#4969E2" opacity="0.10" />

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
          :stroke="mode === 'conditional' && selected.some(s => s.id === pair.id) ? '#4969E2' : mode === 'conditional' ? '#8EA0EA' : '#253A88'"
          :stroke-width="mode === 'conditional' && selected.some(s => s.id === pair.id) ? 2.2 : mode === 'conditional' ? 0.9 : 1.35"
          :stroke-opacity="mode === 'conditional' && selected.some(s => s.id === pair.id) ? 0.72 : mode === 'conditional' ? 0.1 : couplingLineOpacity(index)"
        />
      </g>

      <g v-if="mode === 'coupling'">
      </g>

      <g v-else>
        <line :x1="timeX(t)" y1="22" :x2="timeX(t)" :y2="height - 22" stroke="#253A88" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.65" />
        <rect
          :x="timeX(t) - 26"
          :y="y(probeX + bandwidth)"
          width="52"
          :height="Math.max(10, y(probeX - bandwidth) - y(probeX + bandwidth))"
          rx="8"
          fill="#4969E2"
          opacity="0.12"
          stroke="#4969E2"
          stroke-opacity="0.42"
        />
        <circle :cx="timeX(t)" :cy="y(probeX)" r="4.2" fill="white" stroke="#253A88" stroke-width="1.7" />

        <g v-for="hit in selected" :key="`arrow-${hit.id}`">
          <line
            :x1="smallArrow(hit).x1"
            :y1="smallArrow(hit).y1"
            :x2="smallArrow(hit).x2"
            :y2="smallArrow(hit).y2"
            stroke="#9AA9EC"
            stroke-width="1.5"
            marker-end="url(#rfSmallArrow)"
            opacity="0.7"
          />
        </g>

        <line
          :x1="meanArrow.x1"
          :y1="meanArrow.y1"
          :x2="meanArrow.x2"
          :y2="meanArrow.y2"
          stroke="#253A88"
          stroke-width="3.5"
          marker-end="url(#rfArrow)"
        />
        <text x="424" y="43" text-anchor="middle" class="formula-text">
          Conditional mean velocity
        </text>
        <text x="424" y="65" text-anchor="middle" class="subtle-text">
          average local slope through the same state
        </text>
      </g>

      <g v-for="(pair, index) in activePairs.slice(0, mode === 'coupling' ? maxCouplingPairs : 28)" :key="`endpoints-${pair.id}`">
        <circle cx="112" :cy="y(pair.x0)" r="2.6" fill="#253A88" :opacity="mode === 'coupling' ? couplingPointOpacity(index) : 1" />
        <circle cx="732" :cy="y(pair.x1)" r="2.6" fill="#253A88" :opacity="mode === 'coupling' ? couplingPointOpacity(index) : 1" />
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
