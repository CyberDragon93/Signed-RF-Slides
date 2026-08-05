<script>
let projectionRedrawUid = 0
</script>

<script setup>
import { computed } from 'vue'
import { PALETTE } from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 450 },
})

const width = 900
const uid = `rf-projection-redraw-${projectionRedrawUid++}`

const COLORS = {
  ...PALETTE,
  green: '#5A9B52',
  greenDark: '#2F6F2B',
  greenSoft: '#DCEED9',
  coral: '#E34A92',
  warm: '#A4461D',
}

function lcg(seed) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

const rand = lcg(20260804)

const fanLines = Array.from({ length: 76 }, (_, i) => {
  const sourceY = 54 + rand() * 92
  const upper = i % 2 === 0
  const targetY = (upper ? 67 : 137) + (rand() - 0.5) * 13
  return {
    id: `fan-${i}`,
    x1: 338,
    y1: sourceY,
    x2: 846,
    y2: targetY,
    color: upper ? COLORS.sampling : COLORS.green,
  }
})

function cluster(cx, cy, count, spreadX, spreadY, seed) {
  const sample = lcg(seed)
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963229728653 + sample() * 0.25
    const radius = Math.sqrt((i + 0.35) / count)
    return {
      x: cx + Math.cos(angle) * spreadX * radius,
      y: cy + Math.sin(angle) * spreadY * radius,
    }
  })
}

const beforeTop = cluster(510, 291, 17, 14, 18, 102)
const beforeBottom = cluster(510, 371, 17, 14, 18, 103)
const afterTop = cluster(720, 291, 17, 14, 18, 104)
const afterBottom = cluster(720, 371, 17, 14, 18, 105)

function couplingLines(sourcePoints, targetTopY, targetBottomY, x2, curved) {
  return sourcePoints.map((point, i) => {
    const targetY = i % 2 === 0
      ? targetTopY + ((i * 7) % 13) - 6
      : targetBottomY + ((i * 5) % 13) - 6
    if (!curved)
      return `M ${point.x} ${point.y} L ${x2} ${targetY}`

    const sourceBand = point.y < (targetTopY + targetBottomY) / 2 ? targetTopY : targetBottomY
    const c1x = point.x + 50
    const c2x = x2 - 44
    const c1y = point.y + (sourceBand - point.y) * 0.25
    const c2y = targetY + (sourceBand - targetY) * 0.55
    return `M ${point.x} ${point.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${targetY}`
  })
}

const beforeBluePaths = couplingLines(beforeTop, 291, 371, 645, false)
const beforeGreenPaths = couplingLines(beforeBottom, 291, 371, 645, false)
const afterBluePaths = couplingLines(afterTop, 291, 371, 855, true)
const afterGreenPaths = couplingLines(afterBottom, 291, 371, 855, true)

const panels = computed(() => ({
  crossing: { x: 20, y: 18, w: 246, h: 170 },
  mean: { x: 284, y: 18, w: 596, h: 170 },
  rewire: { x: 20, y: 211, w: 438, h: props.height - 226 },
  before: { x: 478, y: 211, w: 192, h: props.height - 226 },
  after: { x: 688, y: 211, w: 192, h: props.height - 226 },
}))
</script>

<template>
  <div class="projection-redraw-wrap" :style="{ height: `${props.height}px` }">
    <svg
      :viewBox="`0 0 ${width} ${props.height}`"
      role="img"
      aria-label="Vue redraw of velocity averaging, trajectory rewiring, and marginal-preserving couplings"
    >
      <defs>
        <filter :id="`${uid}-shadow`" x="-10%" y="-15%" width="120%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.10" />
        </filter>
        <marker :id="`${uid}-blue-arrow`" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" :fill="COLORS.sampling" />
        </marker>
        <marker :id="`${uid}-green-arrow`" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" :fill="COLORS.green" />
        </marker>
        <marker :id="`${uid}-dark-arrow`" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" :fill="COLORS.samplingDark" />
        </marker>
        <linearGradient :id="`${uid}-mean-halo`" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" :stop-color="COLORS.sampling" stop-opacity="0.18" />
          <stop offset="100%" :stop-color="COLORS.sampling" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <rect
        v-for="(panel, key) in panels"
        :key="key"
        :x="panel.x"
        :y="panel.y"
        :width="panel.w"
        :height="panel.h"
        rx="13"
        :fill="COLORS.panel"
        :stroke="COLORS.panelBorder"
        :filter="`url(#${uid}-shadow)`"
      />

      <!-- Local conditional mean. -->
      <text x="39" y="45" class="panel-title">At an intersection</text>
      <circle cx="108" cy="112" r="44" :fill="COLORS.sampling" opacity="0.055" />
      <line x1="55" y1="145" x2="108" y2="112" :stroke="COLORS.green" stroke-width="3" stroke-linecap="round" />
      <line x1="56" y1="78" x2="108" y2="112" :stroke="COLORS.sampling" stroke-width="3" stroke-linecap="round" />
      <line x1="108" y1="112" x2="180" y2="66" :stroke="COLORS.sampling" stroke-width="3.3" stroke-linecap="round" :marker-end="`url(#${uid}-blue-arrow)`" />
      <line x1="108" y1="112" x2="182" y2="154" :stroke="COLORS.green" stroke-width="3.3" stroke-linecap="round" :marker-end="`url(#${uid}-green-arrow)`" />
      <line x1="108" y1="112" x2="221" y2="112" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" />
      <line x1="108" y1="112" x2="221" y2="112" :stroke="COLORS.samplingDark" stroke-width="4" stroke-linecap="round" :marker-end="`url(#${uid}-dark-arrow)`" />
      <circle cx="108" cy="112" r="6.5" :fill="COLORS.coral" stroke="#FFFFFF" stroke-width="2.2" />
      <text x="177" y="98" class="mean-label">conditional mean</text>
      <text x="39" y="171" class="panel-note">Average the velocities conditioned on the same state.</text>

      <!-- Many interpolation directions define one local ODE velocity. -->
      <text x="303" y="45" class="panel-title">Many directions → one ODE velocity</text>
      <path d="M 332 55 C 306 72, 306 128, 332 151 L 338 151 L 338 55 Z" :fill="COLORS.sampling" opacity="0.13" />
      <path d="M 332 55 C 306 72, 306 128, 332 151" fill="none" :stroke="COLORS.sampling" stroke-width="2.1" />
      <line x1="338" y1="53" x2="338" y2="154" :stroke="COLORS.samplingDark" stroke-width="1" stroke-dasharray="4 4" opacity="0.72" />
      <line x1="846" y1="53" x2="846" y2="154" :stroke="COLORS.samplingDark" stroke-width="1" stroke-dasharray="4 4" opacity="0.72" />
      <line
        v-for="line in fanLines"
        :key="line.id"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :stroke="line.color"
        stroke-width="1.15"
        stroke-opacity="0.13"
      />
      <ellipse cx="846" cy="67" rx="10" ry="21" :fill="COLORS.sampling" opacity="0.12" />
      <ellipse cx="846" cy="137" rx="10" ry="21" :fill="COLORS.green" opacity="0.13" />
      <circle cx="846" cy="67" r="4.8" :fill="COLORS.sampling" stroke="#FFFFFF" stroke-width="1.6" />
      <circle cx="846" cy="137" r="4.8" :fill="COLORS.green" stroke="#FFFFFF" stroke-width="1.6" />
      <rect x="531" y="73" width="126" height="62" rx="31" :fill="`url(#${uid}-mean-halo)`" />
      <circle cx="558" cy="104" r="5.8" :fill="COLORS.coral" stroke="#FFFFFF" stroke-width="2" />
      <line x1="558" y1="104" x2="633" y2="71" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" />
      <line x1="558" y1="104" x2="633" y2="71" :stroke="COLORS.sampling" stroke-width="3" stroke-linecap="round" :marker-end="`url(#${uid}-blue-arrow)`" />
      <line x1="558" y1="104" x2="633" y2="139" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" />
      <line x1="558" y1="104" x2="633" y2="139" :stroke="COLORS.green" stroke-width="3" stroke-linecap="round" :marker-end="`url(#${uid}-green-arrow)`" />
      <line x1="558" y1="104" x2="657" y2="104" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" />
      <line x1="558" y1="104" x2="657" y2="104" :stroke="COLORS.samplingDark" stroke-width="4" stroke-linecap="round" :marker-end="`url(#${uid}-dark-arrow)`" />
      <text x="329" y="171" class="endpoint-label">noise</text>
      <text x="833" y="171" class="endpoint-label">data</text>

      <!-- Three-stage rewiring close-up. -->
      <text x="39" y="239" class="panel-title">Velocity averaging rewires crossings</text>
      <line v-for="i in 4" :key="`rw-a-${i}`" x1="38" :y1="274 + i * 18" x2="151" :y2="346 + i * 4" :stroke="COLORS.sampling" stroke-width="2.1" stroke-dasharray="6 5" stroke-opacity="0.62" />
      <line v-for="i in 4" :key="`rw-b-${i}`" x1="38" :y1="351 - i * 18" x2="151" :y2="279 - i * 4" :stroke="COLORS.green" stroke-width="2.1" stroke-dasharray="6 5" stroke-opacity="0.62" />
      <ellipse cx="96" cy="313" rx="41" ry="26" :fill="COLORS.coral" opacity="0.08" :stroke="COLORS.coral" stroke-width="1" stroke-dasharray="3 3" />
      <circle v-for="i in 18" :key="`rw-dot-${i}`" :cx="67 + ((i * 23) % 59)" :cy="294 + ((i * 17) % 39)" r="2" :fill="i % 2 ? COLORS.sampling : COLORS.green" opacity="0.76" />

      <line v-for="i in 3" :key="`rw-c-${i}`" x1="174" :y1="277 + i * 28" x2="281" :y2="347 - i * 24" :stroke="COLORS.sampling" stroke-width="1.8" stroke-dasharray="5 5" stroke-opacity="0.28" />
      <line v-for="i in 3" :key="`rw-d-${i}`" x1="174" :y1="349 - i * 28" x2="281" :y2="279 + i * 24" :stroke="COLORS.green" stroke-width="1.8" stroke-dasharray="5 5" stroke-opacity="0.28" />
      <path d="M 174 276 L 226 313 L 282 350" fill="none" :stroke="COLORS.sampling" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 174 350 L 226 313 L 282 276" fill="none" :stroke="COLORS.green" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="226" cy="313" r="6.5" :fill="COLORS.coral" stroke="#FFFFFF" stroke-width="2" />
      <line x1="226" y1="313" x2="274" y2="313" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" />
      <line x1="226" y1="313" x2="274" y2="313" :stroke="COLORS.samplingDark" stroke-width="3.5" stroke-linecap="round" :marker-end="`url(#${uid}-dark-arrow)`" />

      <path d="M 307 278 L 354 301 L 421 271" fill="none" :stroke="COLORS.samplingDark" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 307 296 L 354 306 L 421 291" fill="none" :stroke="COLORS.samplingDark" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 307 330 L 354 320 L 421 335" fill="none" :stroke="COLORS.greenDark" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 307 349 L 354 332 L 421 354" fill="none" :stroke="COLORS.greenDark" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <text x="96" :y="props.height - 27" class="stage-label">crossings</text>
      <text x="226" :y="props.height - 27" class="stage-label">average locally</text>
      <text x="365" :y="props.height - 27" class="stage-label">ODE paths</text>

      <!-- Before coupling. -->
      <text x="494" y="239" class="panel-title small">Interpolation coupling</text>
      <path v-for="(path, i) in beforeBluePaths" :key="`bb-${i}`" :d="path" fill="none" :stroke="COLORS.sampling" stroke-width="0.9" stroke-opacity="0.28" />
      <path v-for="(path, i) in beforeGreenPaths" :key="`bg-${i}`" :d="path" fill="none" :stroke="COLORS.green" stroke-width="0.9" stroke-opacity="0.28" />
      <ellipse v-for="r in [20, 15, 10]" :key="`bt-${r}`" cx="510" cy="291" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.sampling" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`bbot-${r}`" cx="510" cy="371" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.green" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`btt-${r}`" cx="645" cy="291" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.coral" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`btb-${r}`" cx="645" cy="371" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.coral" stroke-width="1.1" stroke-opacity="0.62" />
      <circle v-for="(point, i) in beforeTop" :key="`btp-${i}`" :cx="point.x" :cy="point.y" r="2.2" :fill="COLORS.sampling" />
      <circle v-for="(point, i) in beforeBottom" :key="`bbp-${i}`" :cx="point.x" :cy="point.y" r="2.2" :fill="COLORS.green" />
      <text x="574" :y="props.height - 27" class="stage-label">crossed pairings</text>

      <!-- After coupling. -->
      <text x="704" y="239" class="panel-title small">ODE coupling</text>
      <path v-for="(path, i) in afterBluePaths" :key="`ab-${i}`" :d="path" fill="none" :stroke="COLORS.sampling" stroke-width="0.95" stroke-opacity="0.34" />
      <path v-for="(path, i) in afterGreenPaths" :key="`ag-${i}`" :d="path" fill="none" :stroke="COLORS.green" stroke-width="0.95" stroke-opacity="0.34" />
      <ellipse v-for="r in [20, 15, 10]" :key="`at-${r}`" cx="720" cy="291" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.sampling" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`abot-${r}`" cx="720" cy="371" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.green" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`att-${r}`" cx="855" cy="291" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.coral" stroke-width="1.1" stroke-opacity="0.62" />
      <ellipse v-for="r in [20, 15, 10]" :key="`atb-${r}`" cx="855" cy="371" :rx="r" :ry="r * 0.72" fill="none" :stroke="COLORS.coral" stroke-width="1.1" stroke-opacity="0.62" />
      <circle v-for="(point, i) in afterTop" :key="`atp-${i}`" :cx="point.x" :cy="point.y" r="2.2" :fill="COLORS.sampling" />
      <circle v-for="(point, i) in afterBottom" :key="`abp-${i}`" :cx="point.x" :cy="point.y" r="2.2" :fill="COLORS.green" />
      <text x="784" :y="props.height - 27" class="stage-label">same marginals</text>
    </svg>
  </div>
</template>

<style scoped>
.projection-redraw-wrap {
  width: 100%;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.panel-title {
  fill: #253a88;
  font-family: var(--scholarly-font-serif), KaTeX_Main, serif;
  font-size: 17px;
  font-weight: 700;
}

.panel-title.small {
  font-size: 15px;
}

.panel-note,
.endpoint-label,
.stage-label,
.mean-label {
  fill: #536073;
  font-family: var(--scholarly-font-serif), KaTeX_Main, serif;
}

.panel-note {
  font-size: 11px;
}

.mean-label {
  fill: #253a88;
  font-size: 10px;
  font-weight: 700;
}

.endpoint-label {
  font-size: 10px;
  text-anchor: middle;
}

.stage-label {
  font-size: 10.5px;
  text-anchor: middle;
}
</style>
