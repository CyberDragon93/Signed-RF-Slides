<script setup>
// ImageNet-256 best-FID vs NFE, Euler + second-order solvers.
// Static vector chart in the deck's language: one hero (Signed RF,
// ultramarine), context baselines in recessive gray, identity carried by
// direct labels on every line (plus dash pattern for the solver family),
// REPA as an external magenta reference line.
import { computed } from 'vue'

const props = defineProps({
  height: { type: Number, default: 430 },
})

const W = 900
const PX0 = 96
const PX1 = 742
const PY0 = 42
const PY1 = computed(() => props.height - 58)

const NFES = [16, 32, 64]
const FID_LO = 1.25
const FID_HI = 2.5

const HERO = '#3250BC'
const HERO_DARK = '#253A88'
const CTX = '#707D95'
const REF = '#B23A6F'

const SERIES = [
  { name: 'CFG', vals: [2.38, 1.87, 1.73], color: CTX, dash: '', w: 1.6, hero: false },
  { name: 'ADG', vals: [2.32, 2.00, 1.85], color: CTX, dash: '', w: 1.6, hero: false },
  { name: 'MG', vals: [1.85, 1.71, 1.60], color: CTX, dash: '', w: 1.6, hero: false },
  { name: 'CFG (2nd)', vals: [1.86, 1.66, 1.67], color: CTX, dash: '7 4', w: 1.6, hero: false },
  { name: 'Signed RF', vals: [1.82, 1.51, 1.41], color: HERO, dash: '', w: 2.6, hero: true },
  { name: 'Signed RF (2nd)', vals: [1.52, 1.39, 1.36], color: HERO_DARK, dash: '7 4', w: 2.6, hero: true },
]
const REPA = 1.42

const x = i => PX0 + (i / (NFES.length - 1)) * (PX1 - PX0)
const y = computed(() => v => PY1.value - ((v - FID_LO) / (FID_HI - FID_LO)) * (PY1.value - PY0))

const gridVals = [1.5, 1.75, 2.0, 2.25]

// Polyline per series, clipping the segment that exits the top (CFG++ at 64).
const shapes = computed(() => {
  const ys = y.value
  return SERIES.map((s) => {
    const pts = []
    let exit = null
    for (let i = 0; i < s.vals.length; i += 1) {
      const v = s.vals[i]
      if (v <= FID_HI) {
        pts.push([x(i), ys(v)])
      } else {
        const v0 = s.vals[i - 1]
        const f = (FID_HI - v0) / (v - v0)
        const xe = x(i - 1) + f * (x(i) - x(i - 1))
        pts.push([xe, ys(FID_HI)])
        exit = { x: xe, v }
        break
      }
    }
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
    const dots = pts.filter((_, k) => s.vals[k] <= FID_HI).map((p, k) => ({ cx: p[0], cy: p[1], v: s.vals[k] }))
    return { ...s, d, dots, exit, endY: exit ? ys(FID_HI) : ys(s.vals[s.vals.length - 1]) }
  })
})

// Right-edge direct labels with greedy collision resolution.
const labels = computed(() => {
  const ys = y.value
  const items = shapes.value.filter(s => !s.exit).map(s => ({
    text: s.name,
    color: s.hero ? s.color : '#5A6578',
    hero: s.hero,
    anchorY: s.endY,
    lineY: s.endY,
  }))
  items.push({ text: 'REPA · 250 NFE', color: REF, hero: false, anchorY: ys(REPA), lineY: ys(REPA) })
  items.sort((a, b) => a.anchorY - b.anchorY)
  const MIN = 17
  for (let i = 1; i < items.length; i += 1) {
    if (items[i].anchorY - items[i - 1].anchorY < MIN) items[i].anchorY = items[i - 1].anchorY + MIN
  }
  for (let i = items.length - 2; i >= 0; i -= 1) {
    if (items[i + 1].anchorY - items[i].anchorY < MIN) items[i].anchorY = items[i + 1].anchorY - MIN
  }
  return items
})
</script>

<template>
  <div class="ifid-wrap">
    <svg :viewBox="`0 0 ${W} ${height}`" role="img" aria-label="Best FID by NFE, all methods">
      <!-- grid + y labels -->
      <g v-for="g in gridVals" :key="`g-${g}`">
        <line :x1="PX0 - 6" :y1="y(g)" :x2="PX1" :y2="y(g)" stroke="rgba(48,58,73,0.13)" stroke-width="1" />
        <text :x="PX0 - 14" :y="y(g) + 4" text-anchor="end" class="ifid-tick">{{ g.toFixed(2) }}</text>
      </g>
      <text :x="PX0 - 58" :y="(PY0 + PY1) / 2" class="ifid-axis" :transform="`rotate(-90 ${PX0 - 58} ${(PY0 + PY1) / 2})`" text-anchor="middle">FID ↓</text>

      <!-- x ticks -->
      <g v-for="(n, i) in NFES" :key="`x-${n}`">
        <line :x1="x(i)" :y1="PY1" :x2="x(i)" :y2="PY1 + 5" stroke="rgba(48,58,73,0.35)" stroke-width="1" />
        <text :x="x(i)" :y="PY1 + 21" text-anchor="middle" class="ifid-tick">{{ n }}</text>
      </g>
      <text :x="(PX0 + PX1) / 2" :y="PY1 + 40" text-anchor="middle" class="ifid-axis">NFE (sampling steps)</text>
      <line :x1="PX0 - 6" :y1="PY1" :x2="PX1" :y2="PY1" stroke="rgba(48,58,73,0.35)" stroke-width="1.1" />

      <!-- REPA reference -->
      <line :x1="PX0" :y1="y(REPA)" :x2="PX1" :y2="y(REPA)" :stroke="REF" stroke-width="1.2" stroke-dasharray="2.5 3.5" stroke-opacity="0.75" />

      <!-- series -->
      <g v-for="s in shapes" :key="s.name">
        <path :d="s.d" fill="none" :stroke-width="s.w" :stroke-dasharray="s.dash" stroke-linecap="round" stroke-linejoin="round" :style="{ stroke: s.color, strokeOpacity: s.hero ? 1 : 0.85 }" />
        <g v-for="(p, k) in s.dots" :key="`${s.name}-${k}`">
          <circle :cx="p.cx" :cy="p.cy" :r="s.hero ? 4 : 2.6" :fill="s.color" stroke="#FDFBF7" :stroke-width="s.hero ? 1.8 : 1.2" />
          <text v-if="s.hero" :x="p.cx" :y="p.cy + (s.dash ? 21 : -12)" text-anchor="middle" class="ifid-val" :style="{ fill: s.color }">{{ p.v.toFixed(2) }}</text>
        </g>
        <!-- clipped exit (CFG++) -->
        <text v-if="s.exit" :x="s.exit.x + 6" :y="PY0 + 12" class="ifid-clip">{{ s.name }} → {{ s.exit.v.toFixed(2) }}</text>
      </g>

      <!-- right-edge direct labels -->
      <g v-for="lb in labels" :key="`lb-${lb.text}`">
        <line
          v-if="Math.abs(lb.anchorY - lb.lineY) > 2"
          :x1="PX1 + 4" :y1="lb.lineY" :x2="PX1 + 14" :y2="lb.anchorY"
          stroke="rgba(48,58,73,0.25)" stroke-width="0.8"
        />
        <text :x="PX1 + 18" :y="lb.anchorY + 4" class="ifid-label" :class="{ 'ifid-label-hero': lb.hero }" :style="{ fill: lb.color }">{{ lb.text }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.ifid-wrap {
  width: 100%;
}

.ifid-wrap svg {
  display: block;
  width: 100%;
  height: auto;
}

.ifid-tick {
  font-family: 'KaTeX_Main', Georgia, serif;
  font-size: 13px;
  fill: #536073;
}

.ifid-axis {
  font-family: 'KaTeX_Main', Georgia, serif;
  font-size: 13.5px;
  fill: #536073;
}

.ifid-val {
  font-family: 'KaTeX_Main', Georgia, serif;
  font-size: 12.5px;
  font-weight: 700;
}

.ifid-label {
  font-family: 'KaTeX_Main', Georgia, serif;
  font-size: 13px;
  font-weight: 600;
}

.ifid-label-hero {
  font-weight: 700;
}

.ifid-clip {
  font-family: 'KaTeX_Main', Georgia, serif;
  font-size: 11.5px;
  fill: #707d95;
}
</style>
