<script>
// Module-scope instance counter for unique SVG defs ids (deterministic, no randomness).
let srfgUidCounter = 0

// Per-(panel, alpha) render cache: every detent's heatmap, boundary branches
// and trajectories are deterministic — compute once, reuse across drags and
// remounts. Prewarmed in the background after mount.
const srfgMemo = new Map()
function srfgMemoGet(key, fn) {
  if (!srfgMemo.has(key)) srfgMemo.set(key, fn())
  return srfgMemo.get(key)
}
let srfgPrewarmed = false
</script>

<script setup>
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import {
  SCHEMA, DENSITY, TWIN, CORE, SKEW, PALETTE,
  signedDensity, zeroBranches, quantileSeeds, simulateTrajectories,
  ALPHA_DETENTS, alphaDetentFrac,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const uid = `srfg-${srfgUidCounter++}`

// ---------------------------------------------------------------- panel specs
// Six worlds, no captions — the pictures carry the point. Two extra setups
// beyond the paper ones, chosen for distinct boundary topologies:
// MODE2: two positive modes, the negative branch sits on one of them — the
// surviving positive peak becomes an island between two negative zones.
const MODE2 = {
  plus: [
    { w: 0.5, mu: -1.6, vr: 0.35 },
    { w: 0.5, mu: 1.6, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 1.6, vr: 0.45 }],
  domain: [-3.4, 3.4],
}

// Six distinct worlds under ONE shared signed weight — the slider sweeps all
// panels together, so the same alpha reads across every topology at once.
const PANEL_DEFS = [
  { id: 'schema1', setup: SCHEMA },
  { id: 'density', setup: DENSITY },
  { id: 'mode2', setup: MODE2 },
  { id: 'twin', setup: TWIN },
  { id: 'core', setup: CORE },
  { id: 'skew', setup: SKEW },
]

// ---------------------------------------------------------------- static math
// Everything below is computed exactly once: the gallery is a static render
// (complete immediately, deterministic in print/export).

// 2-tone sign heatmap: blue where pi_t^sign > 0, magenta where < 0,
// standard alpha recipe 0.02 + 0.28 * (|s|/max|s|)^0.75.
function renderPanelHeatmap(alpha, setup) {
  if (typeof document === 'undefined') return ''
  const W = 200
  const H = 120
  const [lo, hi] = setup.domain
  const vals = new Float64Array(W * H)
  let maxAbs = 1e-12
  for (let r = 0; r < H; r += 1) {
    const x = hi - (r / (H - 1)) * (hi - lo)
    for (let c = 0; c < W; c += 1) {
      const s = signedDensity(x, c / (W - 1), alpha, setup)
      vals[r * W + c] = s
      const av = Math.abs(s)
      if (av > maxAbs) maxAbs = av
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(W, H)
  const cBlue = [73, 105, 226]
  const cNeg = [227, 74, 146]
  for (let i = 0; i < W * H; i += 1) {
    const s = vals[i]
    const col = s < 0 ? cNeg : cBlue
    const af = 0.02 + 0.28 * Math.pow(Math.abs(s) / maxAbs, 0.75)
    const off = 4 * i
    image.data[off] = col[0]
    image.data[off + 1] = col[1]
    image.data[off + 2] = col[2]
    image.data[off + 3] = Math.round(255 * af)
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

const alphaSel = ref(1.0)
const alphaPrev = ref(1.0)
const alphaAnimG = ref(1.0)

// Ease progress from the previous detent to the selected one (1 = settled).
const morphWG = computed(() => {
  const from = alphaPrev.value
  const to = alphaSel.value
  if (from === to) return 1
  return Math.max(0, Math.min(1, (alphaAnimG.value - from) / (to - from)))
})

function panelSlice(def, a) {
  return srfgMemoGet(`${def.id}|${a}`, () => ({
    heatmap: renderPanelHeatmap(a, def.setup),
    branches: zeroBranches(a, def.setup, 140),
    traj: simulateTrajectories(quantileSeeds(12), a, def.setup, 320),
  }))
}

// While easing, trajectories are the pointwise lerp of the two cached
// detents (continuous in alpha), boundaries re-derive live from the eased
// alpha at reduced resolution, and the heat image blends the two renders.
const panelData = computed(() => {
  const w = morphWG.value
  return PANEL_DEFS.map((def) => {
    const S = panelSlice(def, alphaSel.value)
    if (w >= 1) return { ...def, ...S, heatFrom: '' }
    const P = panelSlice(def, alphaPrev.value)
    const paths = S.traj.paths.map((pb, i) => {
      const pa = P.traj.paths[i]
      const out = new Float64Array(pb.length)
      for (let k = 0; k < pb.length; k += 1) out[k] = pa[k] + (pb[k] - pa[k]) * w
      return out
    })
    return {
      ...def,
      heatmap: S.heatmap,
      heatFrom: P.heatmap,
      branches: zeroBranches(alphaAnimG.value, def.setup, 48, 0.35, 200),
      traj: { times: S.traj.times, paths },
    }
  })
})

// ---------------------------------------------------------------- layout
const COLS = 3
const GUT = 14
const CARD_W = 282
const MARGIN_X = (width - (COLS * CARD_W + (COLS - 1) * GUT)) / 2

const cardH = computed(() => (props.height - 14 - GUT - 30) / 2)

const panels = computed(() => {
  const ch = cardH.value
  return panelData.value.map((p, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const cx = MARGIN_X + col * (CARD_W + GUT)
    const cy = 14 + row * (ch + GUT)
    const plotX = cx + 10
    const plotW = CARD_W - 20
    const plotY = cy + 10
    const plotH = Math.max(40, ch - 20)
    const [lo, hi] = p.setup.domain
    const px = t => plotX + t * plotW
    const py = xv => plotY + ((hi - xv) / (hi - lo)) * plotH

    const branchPaths = p.branches.map((line) => {
      let d = ''
      for (const [t, xv] of line) d += (d ? 'L' : 'M') + px(t).toFixed(1) + ',' + py(xv).toFixed(1)
      return d
    })

    const { times, paths } = p.traj
    const yLo = plotY - 30
    const yHi = plotY + plotH + 30
    const trajPaths = paths.map((arr) => {
      let d = ''
      for (let k = 0; k < arr.length; k += 2) {
        const yy = Math.max(yLo, Math.min(yHi, py(arr[k])))
        d += (d ? 'L' : 'M') + px(times[k]).toFixed(1) + ',' + yy.toFixed(1)
      }
      return d
    })

    return {
      id: p.id,
      heatmap: p.heatmap,
      traj: p.traj,
      lo,
      hi,
      cx,
      cy,
      ch,
      plotX,
      plotY,
      plotW,
      plotH,
      branchPaths,
      trajPaths,
    }
  })
})

// ---------------------------------------------------------------- animation
// One shared clock sweeps t: 0 -> 1 across all four worlds; trajectories are
// revealed up to the cursor and the endpoint dots ride them. Loops forever;
// print/export freezes on the complete t = 1 picture.
const SWEEP = 6.0
const HOLD = 1.6
const CYCLE = SWEEP + HOLD
const cursor = ref(1)
const playing = ref(props.autoplay)
let raf = 0
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete picture

function easeCubicInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2
}

function tick(now) {
  {
    const target = alphaSel.value
    const cur = alphaAnimG.value
    if (cur !== target) {
      alphaAnimG.value = Math.abs(target - cur) < 1e-3 ? target : cur + (target - cur) * 0.16
    }
  }
  if (playing.value && !manual.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % CYCLE
    cursor.value = ph < SWEEP ? easeCubicInOut(ph / SWEEP) : 1
  } else {
    refTs = 0
    phase0 = cursor.value >= 1 ? SWEEP : SWEEP * cursor.value
  }
  raf = requestAnimationFrame(tick)
}

function togglePlay() {
  if (playing.value && !manual.value) {
    playing.value = false
  } else {
    manual.value = false
    playing.value = true
  }
}

// Per-frame sweep geometry (cheap: O(panels x 12) interpolation).
const sweep = computed(() => {
  const c = cursor.value
  return panels.value.map((p) => {
    const dots = p.traj.paths.map((arr, j) => {
      const n = arr.length
      const idx = Math.max(0, Math.min(n - 1, Math.round(c * (n - 1))))
      const yy = p.plotY + ((p.hi - arr[idx]) / (p.hi - p.lo)) * p.plotH
      return { id: j, cy: Math.max(p.plotY, Math.min(p.plotY + p.plotH, yy)) }
    })
    return {
      id: p.id,
      cursorX: p.plotX + p.plotW * c,
      revealW: Math.max(0, p.plotW * c),
      dots,
    }
  })
})

const playBtn = computed(() => ({ x: MARGIN_X + 12, y: props.height - 14 }))

// ---------------------------------------------------------------- sliders
const tSlider = computed(() => ({ x: MARGIN_X + 95, y: props.height - 14, w: 140 }))
const aSlider = computed(() => ({ x: MARGIN_X + 480, y: props.height - 14, w: 180 }))
const dragMode = ref(null)
const manual = ref(false)

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}
const alphaReadout = computed(() => mathHtml(`\\alpha = ${alphaSel.value.toFixed(2)}`))
const tReadout = computed(() => mathHtml(`t = ${Math.max(0, Math.min(1, cursor.value)).toFixed(2)}`))

function svgX(event) {
  const svg = event.currentTarget.ownerSVGElement || event.currentTarget
  const rect = svg.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

function setAlphaFromX(x) {
  const sl = aSlider.value
  const frac = Math.max(0, Math.min(1, (x - sl.x) / sl.w))
  const det = ALPHA_DETENTS[Math.round(frac * (ALPHA_DETENTS.length - 1))]
  if (det !== alphaSel.value) {
    alphaPrev.value = alphaSel.value
    alphaSel.value = det
  }
}

function setCursorFromX(x) {
  const sl = tSlider.value
  cursor.value = Math.max(0, Math.min(1, (x - sl.x) / sl.w))
}

function handleAlphaDown(event) {
  dragMode.value = 'alpha'
  setAlphaFromX(svgX(event))
}

function handleTimeDown(event) {
  dragMode.value = 'time'
  manual.value = true
  setCursorFromX(svgX(event))
}

function handlePointerMove(event) {
  if (dragMode.value === 'alpha') setAlphaFromX(svgX(event))
  else if (dragMode.value === 'time') setCursorFromX(svgX(event))
}

function handlePointerUp() {
  dragMode.value = null
}

// Warm every detent for every panel in the background so first drags are
// instant too (once per module; shared across instances).
function prewarmDetents() {
  if (typeof window === 'undefined' || srfgPrewarmed) return
  srfgPrewarmed = true
  const queue = []
  for (const a of [...ALPHA_DETENTS].sort((x, y) => Math.abs(x - alphaSel.value) - Math.abs(y - alphaSel.value))) {
    for (const def of PANEL_DEFS) queue.push([def, a])
  }
  const next = () => {
    const item = queue.shift()
    if (!item) return
    panelSlice(item[0], item[1])
    setTimeout(next, 90)
  }
  setTimeout(next, 2500)
}

onMounted(() => {
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (props.autoplay && !isPrint) {
    raf = requestAnimationFrame(tick)
    prewarmDetents()
  } else {
    cursor.value = 1
  }
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="srfg-wrap">
    <svg
      class="srfg-svg"
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
        <clipPath v-for="p in panels" :id="`${uid}-clip-${p.id}`" :key="`clip-${p.id}`">
          <rect :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH" />
        </clipPath>
        <!-- reveal clip: trajectories are swept out by the shared time cursor -->
        <clipPath v-for="(s, i) in sweep" :id="`${uid}-sweep-${s.id}`" :key="`sweep-${s.id}`">
          <rect
            :x="panels[i].plotX" :y="panels[i].plotY"
            :width="s.revealW" :height="panels[i].plotH"
          />
        </clipPath>
      </defs>

      <g v-for="(p, i) in panels" :key="p.id">
        <!-- card -->
        <rect
          :x="p.cx" :y="p.cy" :width="CARD_W" :height="p.ch" rx="8"
          :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" :filter="`url(#${uid}-shadow)`"
        />

        <!-- (t, x) plot -->
        <rect
          :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH"
          fill="#FFFFFF" :stroke="PALETTE.grid" stroke-width="1"
        />
        <image
          v-if="p.heatFrom && morphWG < 1"
          :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH"
          :href="p.heatFrom" preserveAspectRatio="none"
        />
        <image
          v-if="p.heatmap"
          :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH"
          :href="p.heatmap" preserveAspectRatio="none"
          :opacity="morphWG < 1 ? morphWG : 1"
        />

        <g :clip-path="`url(#${uid}-clip-${p.id})`">
          <!-- zero-boundary branches -->
          <path
            v-for="(d, j) in p.branchPaths"
            :key="`b-${j}`"
            :d="d"
            fill="none"
            :stroke="PALETTE.negative"
            stroke-width="1.3"
            stroke-opacity="0.9"
            stroke-linecap="round"
          />
        </g>

        <!-- 12 forward trajectories, revealed up to the shared cursor -->
        <g :clip-path="`url(#${uid}-sweep-${p.id})`">
          <path
            v-for="(d, j) in p.trajPaths"
            :key="`t-${j}`"
            :d="d"
            fill="none"
            :stroke="PALETTE.traj"
            stroke-width="0.85"
            stroke-opacity="0.5"
            stroke-linecap="round"
          />
        </g>

        <!-- moving cursor line + endpoint dots riding the trajectories -->
        <line
          v-if="cursor < 0.999"
          :x1="sweep[i].cursorX" :y1="p.plotY" :x2="sweep[i].cursorX" :y2="p.plotY + p.plotH"
          :stroke="PALETTE.ink" stroke-width="0.9" stroke-opacity="0.45"
        />
        <circle
          v-for="dot in sweep[i].dots"
          :key="`d-${dot.id}`"
          :cx="sweep[i].cursorX" :cy="dot.cy" r="2.6"
          :fill="PALETTE.trajMarkerFill" :stroke="PALETTE.trajMarkerEdge" stroke-width="0.8"
        />

      </g>

      <!-- shared play / pause control -->
      <g class="srfg-play" @pointerdown.prevent="togglePlay">
        <circle :cx="playBtn.x" :cy="playBtn.y" r="10.5" fill="#FFFFFF" stroke="#253A88" stroke-width="1.8" />
        <g v-if="playing">
          <rect :x="playBtn.x - 4" :y="playBtn.y - 4.4" width="2.8" height="8.8" rx="1" fill="#253A88" />
          <rect :x="playBtn.x + 1.4" :y="playBtn.y - 4.4" width="2.8" height="8.8" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${playBtn.x - 3} ${playBtn.y - 4.8} L ${playBtn.x + 5.2} ${playBtn.y} L ${playBtn.x - 3} ${playBtn.y + 4.8} Z`"
          fill="#253A88"
        />
      </g>

      <!-- shared time scrubber -->
      <g class="srfg-slider" @pointerdown.prevent="handleTimeDown">
        <text :x="tSlider.x - 10" :y="tSlider.y + 4" text-anchor="end" class="srfg-slider-text">time</text>
        <line :x1="tSlider.x" :y1="tSlider.y" :x2="tSlider.x + tSlider.w" :y2="tSlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="tSlider.x" :y1="tSlider.y"
          :x2="tSlider.x + tSlider.w * Math.max(0, Math.min(1, cursor))" :y2="tSlider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          :cx="tSlider.x + tSlider.w * Math.max(0, Math.min(1, cursor))" :cy="tSlider.y"
          r="9.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2"
        />
      </g>

      <!-- shared repulsive-strength detent slider: one alpha across all six worlds -->
      <g class="srfg-slider" @pointerdown.prevent="handleAlphaDown">
        <text :x="aSlider.x - 12" :y="aSlider.y + 4" text-anchor="end" class="srfg-slider-text">repulsive strength</text>
        <line :x1="aSlider.x" :y1="aSlider.y" :x2="aSlider.x + aSlider.w" :y2="aSlider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="aSlider.x" :y1="aSlider.y"
          :x2="aSlider.x + aSlider.w * alphaDetentFrac(alphaAnimG)" :y2="aSlider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          v-for="d in ALPHA_DETENTS"
          :key="`det-${d}`"
          :cx="aSlider.x + aSlider.w * alphaDetentFrac(d)" :cy="aSlider.y"
          r="2" fill="#FFFFFF" stroke="#3250BC" stroke-opacity="0.45" stroke-width="0.9"
        />
        <circle
          :cx="aSlider.x + aSlider.w * alphaDetentFrac(alphaAnimG)" :cy="aSlider.y"
          r="9.5" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2"
        />
      </g>
    </svg>
    <RfFigLabel :x="tSlider.x + tSlider.w + 14" :y="tSlider.y - 12" :w="90" :vb-h="height">
      <div class="srfg-readout" v-html="tReadout"></div>
    </RfFigLabel>
    <RfFigLabel :x="aSlider.x + aSlider.w + 16" :y="aSlider.y - 12" :w="100" :vb-h="height">
      <div class="srfg-readout" v-html="alphaReadout"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.srfg-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.srfg-svg {
  display: block;
  width: 100%;
  height: auto;
}

.srfg-play,
.srfg-slider {
  cursor: pointer;
}

.srfg-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}

.srfg-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}
</style>
