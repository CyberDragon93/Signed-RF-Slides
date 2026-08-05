<script setup>
import * as d3 from 'd3'
import { computed } from 'vue'
import {
  SCHEMA,
  PALETTE,
  signedDensity,
  zeroCrossings,
  ghostCrossings,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 270 },
})

const width = 900
const x0 = 72
const x1 = 855
const yTop = 24
const yBottom = computed(() => props.height - 46)
const t = 1
const alpha = SCHEMA.alpha
const [domainLo, domainHi] = SCHEMA.domain

const zeroBoundary = zeroCrossings(t, alpha, SCHEMA)[0]
const bufferBoundaryRoots = ghostCrossings(t, alpha, SCHEMA)
const bufferBoundary = bufferBoundaryRoots[bufferBoundaryRoots.length - 1]

const grid = d3.range(0, 421).map(i => domainLo + (i / 420) * (domainHi - domainLo))
const density = x => signedDensity(x, t, alpha, SCHEMA)
const maxDensity = d3.max(grid, density) || 1
const minDensity = d3.min(grid, density) || -0.2

const xScale = d3.scaleLinear().domain([domainLo, domainHi]).range([x0, x1])
const yScale = computed(() => d3.scaleLinear()
  .domain([Math.min(-0.04, minDensity * 1.18), maxDensity * 1.24])
  .range([yBottom.value, yTop]))

const baselineY = computed(() => yScale.value(0))

const curvePath = computed(() => d3.line()
  .x(x => xScale(x))
  .y(x => yScale.value(density(x)))(grid))

function regionPoints(lo, hi) {
  return [lo, ...grid.filter(x => x > lo && x < hi), hi]
    .map(x => ({ x, value: density(x) }))
}

function areaPath(lo, hi) {
  return d3.area()
    .x(d => xScale(d.x))
    .y0(baselineY.value)
    .y1(d => yScale.value(d.value))(regionPoints(lo, hi))
}

const reachedArea = computed(() => areaPath(domainLo, bufferBoundary))
const bufferArea = computed(() => areaPath(bufferBoundary, zeroBoundary))
const negativeArea = computed(() => areaPath(zeroBoundary, domainHi))

const histogramBars = computed(() => {
  const n = 32
  const dx = (bufferBoundary - domainLo) / n
  const gap = 1.2
  return d3.range(n).map(i => {
    const lo = domainLo + i * dx
    const hi = lo + dx
    const mid = 0.5 * (lo + hi)
    const y = yScale.value(Math.max(0, density(mid)))
    return {
      x: xScale(lo) + gap / 2,
      y,
      width: Math.max(1, xScale(hi) - xScale(lo) - gap),
      height: Math.max(0, baselineY.value - y),
    }
  })
})

const ticks = [-3, -2, -1, 0, 1, 2, 3]
</script>

<template>
  <div class="buffer-balance-wrap">
    <svg
      class="buffer-balance-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-label="Horizontal signed density showing the reachable region, positive unreachable buffer zone, and excluded negative region"
    >
      <rect x="42" y="8" width="838" :height="height - 20" rx="16" :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" />

      <line :x1="x0" :x2="x1" :y1="baselineY" :y2="baselineY" :stroke="PALETTE.textMuted" stroke-width="1" stroke-opacity="0.65" />

      <path :d="reachedArea" :fill="PALETTE.sampling" opacity="0.11" />
      <path :d="bufferArea" :fill="PALETTE.bufferBg" opacity="0.95" />
      <path :d="negativeArea" :fill="PALETTE.negative" opacity="0.23" />

      <rect
        v-for="(bar, i) in histogramBars"
        :key="i"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        :fill="PALETTE.sampleHist"
        opacity="0.78"
      />

      <path :d="curvePath" fill="none" :stroke="PALETTE.ink" stroke-width="2.4" stroke-linecap="round" />

      <line
        :x1="xScale(bufferBoundary)" :x2="xScale(bufferBoundary)"
        :y1="yTop + 5" :y2="yBottom"
        :stroke="PALETTE.bufferDark" stroke-width="1.4" stroke-dasharray="5 4"
      />
      <line
        :x1="xScale(zeroBoundary)" :x2="xScale(zeroBoundary)"
        :y1="yTop + 5" :y2="yBottom"
        :stroke="PALETTE.negative" stroke-width="1.4" stroke-dasharray="5 4"
      />

      <g class="buffer-region-label" :transform="`translate(${xScale((domainLo + bufferBoundary) / 2) - 72}, 38)`">
        <rect width="144" height="27" rx="7" fill="#FFFFFF" :stroke="PALETTE.samplingDark" />
        <text x="72" y="18.5" text-anchor="middle" class="buffer-zone-text" :fill="PALETTE.samplingDark">Reachable zone (Ωₜʳ)</text>
      </g>

      <g class="buffer-region-label" :transform="`translate(${xScale((bufferBoundary + zeroBoundary) / 2) - 65}, 38)`">
        <rect width="130" height="27" rx="7" fill="#FFFFFF" :stroke="PALETTE.bufferDark" />
        <text x="65" y="18.5" text-anchor="middle" class="buffer-zone-text" :fill="PALETTE.bufferDark">Buffer zone (Ωₜᵇ)</text>
      </g>

      <g class="buffer-region-label" :transform="`translate(${xScale((zeroBoundary + domainHi) / 2) - 68}, 38)`">
        <rect width="136" height="27" rx="7" fill="#FFFFFF" :stroke="PALETTE.negativeDark" />
        <text x="68" y="18.5" text-anchor="middle" class="buffer-zone-text" :fill="PALETTE.negativeDark">Negative zone (Ωₜ⁻)</text>
      </g>

      <text :x="xScale((bufferBoundary + zeroBoundary) / 2)" :y="baselineY - 15" text-anchor="middle" class="buffer-area-plus">+A</text>
      <text :x="xScale((zeroBoundary + domainHi) / 2)" :y="baselineY + 31" text-anchor="middle" class="buffer-area-minus">−A</text>

      <g v-for="tick in ticks" :key="tick">
        <line :x1="xScale(tick)" :x2="xScale(tick)" :y1="baselineY" :y2="baselineY + 5" :stroke="PALETTE.textMuted" />
        <text :x="xScale(tick)" :y="baselineY + 20" text-anchor="middle" class="buffer-tick">{{ tick }}</text>
      </g>
      <text :x="(x0 + x1) / 2" :y="height - 16" text-anchor="middle" class="buffer-axis-label">x</text>

      <g transform="translate(73, 17)">
        <line x1="0" y1="0" x2="28" y2="0" :stroke="PALETTE.ink" stroke-width="2.4" />
        <text x="36" y="4.5" class="buffer-legend-text" :fill="PALETTE.ink">signed density  πₜˢⁱᵍⁿ</text>
        <rect x="205" y="-7" width="27" height="13" :fill="PALETTE.sampleHist" opacity="0.78" />
        <text x="241" y="4.5" class="buffer-legend-text" :fill="PALETTE.samplingDark">flow density  πₜᶠˡᵒʷ</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.buffer-balance-wrap {
  width: 100%;
  margin: 0.05rem auto 0;
}

.buffer-balance-svg {
  display: block;
  width: 100%;
  height: auto;
}

.buffer-zone-text,
.buffer-legend-text {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 11.5px;
  font-weight: 700;
}

.buffer-legend-text {
  font-size: 11.5px;
}

.buffer-area-plus,
.buffer-area-minus {
  font-family: KaTeX_Main, "Times New Roman", serif;
  font-size: 17px;
  font-weight: 700;
}

.buffer-area-plus {
  fill: #666666;
}

.buffer-area-minus {
  fill: #9D2D64;
}

.buffer-tick {
  fill: #536073;
  font-size: 11px;
}

.buffer-axis-label {
  fill: #536073;
  font-family: KaTeX_Math, "Times New Roman", serif;
  font-size: 14px;
  font-style: italic;
}
</style>
