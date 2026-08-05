<script setup>
import * as d3 from 'd3'
import katex from 'katex'
import { computed } from 'vue'
import {
  SCHEMA,
  PALETTE,
  signedDensity,
  zeroCrossings,
  ghostCrossings,
} from './signedRfMath.js'
import RfFigLabel from './RfFigLabel.vue'

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

// Every label is real KaTeX rendered into HTML overlays (RfFigLabel), so the
// figure's typography matches the deck's LaTeX voice exactly.
function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

const legendSigned = mathHtml('\\text{signed density }\\; \\pi_t^{\\mathtt{sign}}')
const legendFlow = mathHtml('\\text{flow density }\\; \\pi_t^{\\mathtt{flow}}')
const chipReach = mathHtml('\\text{Reachable zone } (\\Omega_t^r)')
const chipBuffer = mathHtml('\\text{Buffer zone } (\\Omega_t^b)')
const chipNeg = mathHtml('\\text{Negative zone } (\\Omega_t^-)')
const plusA = mathHtml('+A')
const minusA = mathHtml('-A')
const axisX = mathHtml('x')

const CHIPS = [
  { w: 152, cx: (domainLo + bufferBoundary) / 2, html: chipReach, color: PALETTE.samplingDark },
  { w: 132, cx: (bufferBoundary + zeroBoundary) / 2, html: chipBuffer, color: PALETTE.bufferDark },
  { w: 146, cx: (zeroBoundary + domainHi) / 2, html: chipNeg, color: PALETTE.negativeDark },
]
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

      <!-- chip frames; their text lives in the KaTeX overlays below -->
      <rect
        v-for="chip in CHIPS"
        :key="chip.color"
        :x="xScale(chip.cx) - chip.w / 2" y="38"
        :width="chip.w" height="27" rx="7"
        fill="#FFFFFF" :stroke="chip.color"
      />

      <!-- legend swatches; text in overlays -->
      <g transform="translate(73, 17)">
        <line x1="0" y1="0" x2="28" y2="0" :stroke="PALETTE.ink" stroke-width="2.4" />
        <rect x="216" y="-7" width="27" height="13" :fill="PALETTE.sampleHist" opacity="0.78" />
      </g>

      <g v-for="tick in ticks" :key="tick">
        <line :x1="xScale(tick)" :x2="xScale(tick)" :y1="baselineY" :y2="baselineY + 5" :stroke="PALETTE.textMuted" />
        <text :x="xScale(tick)" :y="baselineY + 20" text-anchor="middle" class="buffer-tick">{{ tick }}</text>
      </g>
    </svg>

    <RfFigLabel :x="109" :y="3.3" :w="200" :vb-h="height">
      <div class="bb-math" :style="{ color: PALETTE.ink }" v-html="legendSigned"></div>
    </RfFigLabel>
    <RfFigLabel :x="325" :y="3.3" :w="200" :vb-h="height">
      <div class="bb-math" :style="{ color: PALETTE.samplingDark }" v-html="legendFlow"></div>
    </RfFigLabel>

    <RfFigLabel
      v-for="chip in CHIPS"
      :key="`t-${chip.color}`"
      :x="xScale(chip.cx) - chip.w / 2" :y="38.2" :w="chip.w" :vb-h="height"
    >
      <div class="bb-chip bb-math" :style="{ color: chip.color }" v-html="chip.html"></div>
    </RfFigLabel>

    <RfFigLabel :x="xScale((bufferBoundary + zeroBoundary) / 2) - 24" :y="baselineY - 32" :w="48" :vb-h="height">
      <div class="bb-area bb-math" :style="{ color: PALETTE.bufferDark }" v-html="plusA"></div>
    </RfFigLabel>
    <RfFigLabel :x="xScale((zeroBoundary + domainHi) / 2) - 24" :y="baselineY + 34" :w="48" :vb-h="height">
      <div class="bb-area bb-math" :style="{ color: PALETTE.negativeDark }" v-html="minusA"></div>
    </RfFigLabel>

    <RfFigLabel :x="(x0 + x1) / 2 - 12" :y="height - 27" :w="24" :vb-h="height">
      <div class="bb-area bb-math" :style="{ color: PALETTE.textMuted }" v-html="axisX"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.buffer-balance-wrap {
  position: relative;
  width: 100%;
  margin: 0.05rem auto 0;
}

.buffer-balance-svg {
  display: block;
  width: 100%;
  height: auto;
}

.bb-math {
  white-space: nowrap;
}

.bb-math :deep(.katex) {
  font-size: 12.5px;
}

.bb-chip {
  text-align: center;
  white-space: nowrap;
}

.bb-chip :deep(.katex) {
  font-size: 12px;
}

.bb-area {
  text-align: center;
}

.bb-area :deep(.katex) {
  font-size: 15.5px;
}

.buffer-tick {
  fill: #536073;
  font-family: 'KaTeX_Main', 'Times New Roman', serif;
  font-size: 11.5px;
}
</style>
