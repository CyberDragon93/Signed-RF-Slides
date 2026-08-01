<script>
// Module-scope caches: per-dataset slices (simulations + background renders)
// are deterministic — compute once, share across instances, prewarm.
let g2dUidCounter = 0
const g2dMemo = new Map()
function g2dMemoGet(key, fn) {
  if (!g2dMemo.has(key)) g2dMemo.set(key, fn())
  return g2dMemo.get(key)
}
let g2dPrewarmed = false
</script>

<script setup>
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import { PALETTE } from './signedRfMath.js'
import {
  N_STEPS_2D,
  SWEEP_VALUES_2D,
  WORLDS_2D,
  branchLogp2d,
  seeds2d,
  signedDensity2d,
  simulateGuidance2d,
} from './signedRf2d.js'

const props = defineProps({
  height: { type: Number, default: 440 },
  autoplay: { type: Boolean, default: true },
})

// ---- Datasets ---------------------------------------------------------------
const DATASETS = [
  { id: 'shared_modes', label: 'shared' },
  { id: 'ring4', label: 'ring' },
  { id: 'unsafe_arc', label: 'arc' },
  { id: 'unsafe_sector', label: 'sector' },
]

const width = 900
const uid = `g2d-${g2dUidCounter++}`
const N_PARTICLES = 260
const SWEEP = 7.0
const HOLD = 2.2
const CYCLE = SWEEP + HOLD

// Paper palette (paper_2d_fancy_sweeps, cool_ultramarine_hot_magenta_soft).
const POS_RGB = [123, 149, 238] // #7B95EE
const NEG_RGB = [238, 116, 174] // #EE74AE
const TANH_SCALE = 0.18
const BLEND_GAMMA = 0.72
const IMAGE_ALPHA = 0.72
const PARTICLE_FILL = '#2E4FAF'
const PARTICLE_EDGE = '#D7F1FF'
const NEG_MARK = '#D7195A'
const ZOOM = 1.45

// ---- Layout -----------------------------------------------------------------
const COLS = SWEEP_VALUES_2D.length
const GAP = 8
const MARGIN_X = 24
const PANEL = (width - 2 * MARGIN_X - (COLS - 1) * GAP) / COLS // ~164
const CHIPS_Y = 8
const ROW0_Y = 48
const TITLE_H = 20
const ROW_STRIDE = PANEL + TITLE_H + 8

function panelRect(row, col) {
  return {
    x: MARGIN_X + col * (PANEL + GAP),
    y: ROW0_Y + row * ROW_STRIDE,
    w: PANEL,
    h: PANEL,
  }
}

const controlsY = computed(() => props.height - 22)

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- Per-dataset slice --------------------------------------------------------
// View window: square bbox of all component means padded, then zoomed in by
// the paper's SWEEP_ZOOM (crop about the centre).
function viewOf(w2) {
  let lo = Infinity
  let hi = -Infinity
  for (const br of [w2.plus, w2.minus]) {
    for (const m of br.means) {
      lo = Math.min(lo, m[0], m[1])
      hi = Math.max(hi, m[0], m[1])
    }
  }
  const pad = 4 * 0.6 + 0.8
  lo -= pad
  hi += pad
  const c = 0.5 * (lo + hi)
  const half = 0.5 * (hi - lo) / ZOOM
  return { lo: c - half, hi: c + half }
}

// Background canvas for one panel: signed density at t = 1, paper recipe.
function renderPanelBg(w2, a, view, maxAbs) {
  if (typeof document === 'undefined') return ''
  const G = 132
  const canvas = document.createElement('canvas')
  canvas.width = G
  canvas.height = G
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(G, G)
  const scale = Math.max(maxAbs * TANH_SCALE, 1e-12)
  for (let r = 0; r < G; r += 1) {
    const y = view.hi - ((r + 0.5) / G) * (view.hi - view.lo)
    for (let c = 0; c < G; c += 1) {
      const x = view.lo + ((c + 0.5) / G) * (view.hi - view.lo)
      const d = signedDensity2d(x, y, 1, w2, a)
      const strength = Math.tanh(d / scale)
      const blend = Math.pow(Math.abs(strength), BLEND_GAMMA) * IMAGE_ALPHA
      const target = strength > 0 ? POS_RGB : NEG_RGB
      const o = 4 * (r * G + c)
      img.data[o] = Math.round(255 * (1 - blend) + target[0] * blend)
      img.data[o + 1] = Math.round(255 * (1 - blend) + target[1] * blend)
      img.data[o + 2] = Math.round(255 * (1 - blend) + target[2] * blend)
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function buildSlice(datasetId) {
  const w2 = WORLDS_2D[datasetId]
  const view = viewOf(w2)
  const seeds = seeds2d(N_PARTICLES)

  // Shared colour normalization across every panel of the figure, as in the
  // paper: max |signed density| over all sweep values on the view grid.
  let maxAbs = 1e-12
  const G = 72
  for (const a of SWEEP_VALUES_2D) {
    for (let r = 0; r < G; r += 1) {
      const y = view.lo + (r / (G - 1)) * (view.hi - view.lo)
      for (let c = 0; c < G; c += 1) {
        const x = view.lo + (c / (G - 1)) * (view.hi - view.lo)
        const d = Math.abs(signedDensity2d(x, y, 1, w2, a))
        if (d > maxAbs) maxAbs = d
      }
    }
  }

  const panels = []
  for (let row = 0; row < 2; row += 1) {
    const mode = row === 0 ? 'cfg' : 'signed'
    for (let col = 0; col < COLS; col += 1) {
      const s = SWEEP_VALUES_2D[col]
      const frames = simulateGuidance2d(seeds, w2, mode, s)
      const last = frames[frames.length - 1]
      const negMask = new Uint8Array(N_PARTICLES)
      for (let i = 0; i < N_PARTICLES; i += 1) {
        if (signedDensity2d(last[2 * i], last[2 * i + 1], 1, w2, s) < 0) negMask[i] = 1
      }
      panels.push({
        row,
        col,
        mode,
        scale: s,
        frames,
        negMask,
        bg: renderPanelBg(w2, s, view, maxAbs),
      })
    }
  }
  return { view, panels }
}

function sliceFor(datasetId) {
  return g2dMemoGet(`g2d|${datasetId}`, () => buildSlice(datasetId))
}

const datasetId = ref('shared_modes')
const slice = computed(() => sliceFor(datasetId.value))

// ---- Titles ---------------------------------------------------------------------
const titles = computed(() => slice.value.panels.map(p => ({
  key: `${p.mode}-${p.scale}`,
  row: p.row,
  col: p.col,
  html: p.mode === 'cfg'
    ? `Constant ${mathHtml(`\\omega=${p.scale.toFixed(1)}`)}`
    : `Ours ${mathHtml(`\\alpha=${p.scale.toFixed(1)}`)}`,
})))

const tReadout = computed(() => mathHtml(`t = ${clamp(cursor.value).toFixed(2)}`))

// Grid lines every 2 world units inside the view window.
const gridLines = computed(() => {
  const { lo, hi } = slice.value.view
  const out = []
  for (let g = Math.ceil(lo / 2) * 2; g <= hi; g += 2) {
    out.push((g - lo) / (hi - lo))
  }
  return out
})

// ---- Animation ---------------------------------------------------------------------
const cursor = ref(1)
const playing = ref(props.autoplay)
const manual = ref(false)
const dragMode = ref(null)
let raf = 0
let refTs = 0
let phase0 = SWEEP // hold-first: open on the finished sweep

const isRunning = computed(() => playing.value && !manual.value)

const canvasEl = ref(null)

function draw() {
  const cv = canvasEl.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const S = cv.width / width // supersample factor
  ctx.clearRect(0, 0, cv.width, cv.height)
  const { view, panels } = slice.value
  const c = clamp(cursor.value)
  const fpos = c * N_STEPS_2D
  const k0 = Math.min(N_STEPS_2D - 1, Math.floor(fpos))
  const fr = fpos - k0
  const showNeg = c > 0.985
  for (const p of panels) {
    const rect = panelRect(p.row, p.col)
    const A = p.frames[k0]
    const B = p.frames[k0 + 1]
    const sx = x => (rect.x + ((x - view.lo) / (view.hi - view.lo)) * rect.w) * S
    const sy = y => (rect.y + ((view.hi - y) / (view.hi - view.lo)) * rect.h) * S
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x * S, rect.y * S, rect.w * S, rect.h * S)
    ctx.clip()
    ctx.lineWidth = 0.42 * S
    ctx.strokeStyle = PARTICLE_EDGE
    ctx.fillStyle = PARTICLE_FILL
    const r = 1.55 * S
    for (let i = 0; i < N_PARTICLES; i += 1) {
      const x = A[2 * i] + (B[2 * i] - A[2 * i]) * fr
      const y = A[2 * i + 1] + (B[2 * i + 1] - A[2 * i + 1]) * fr
      const px = sx(x)
      const py = sy(y)
      ctx.beginPath()
      ctx.arc(px, py, r, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
    }
    if (showNeg) {
      ctx.strokeStyle = NEG_MARK
      ctx.lineWidth = 0.85 * S
      const arm = 2.4 * S
      const F = p.frames[N_STEPS_2D]
      for (let i = 0; i < N_PARTICLES; i += 1) {
        if (!p.negMask[i]) continue
        const px = sx(F[2 * i])
        const py = sy(F[2 * i + 1])
        ctx.beginPath()
        ctx.moveTo(px - arm, py - arm)
        ctx.lineTo(px + arm, py + arm)
        ctx.moveTo(px - arm, py + arm)
        ctx.lineTo(px + arm, py - arm)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

function tick(now) {
  if (isRunning.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % CYCLE
    cursor.value = ph < SWEEP ? ph / SWEEP : 1
  } else {
    refTs = 0
    phase0 = SWEEP * cursor.value
  }
  draw()
  raf = requestAnimationFrame(tick)
}

function selectDataset(id) {
  if (id === datasetId.value) return
  datasetId.value = id
  // restart the sweep: nothing is mid-flight at t = 0, so the swap is clean
  manual.value = false
  playing.value = true
  cursor.value = 0
  refTs = 0
  phase0 = 0
  prewarm()
}

// ---- Interaction ----------------------------------------------------------------------
const slider = computed(() => ({ x: 330, y: controlsY.value, w: 220 }))

function svgX(event) {
  const el = event.currentTarget
  const host = el.ownerSVGElement || el
  const rect = host.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

function setCursorFrom(event) {
  const s = slider.value
  cursor.value = clamp((svgX(event) - s.x) / s.w)
}

function handleSliderDown(event) {
  dragMode.value = 'slider'
  manual.value = true
  setCursorFrom(event)
}

function handlePointerMove(event) {
  if (dragMode.value === 'slider') setCursorFrom(event)
}

function handlePointerUp() {
  dragMode.value = null
}

function togglePlay() {
  if (isRunning.value) {
    playing.value = false
  } else {
    manual.value = false
    playing.value = true
  }
}

function prewarm() {
  if (typeof window === 'undefined' || g2dPrewarmed) return
  g2dPrewarmed = true
  const queue = DATASETS.map(d => d.id).filter(id => id !== datasetId.value)
  const next = () => {
    const id = queue.shift()
    if (!id) return
    sliceFor(id)
    setTimeout(next, 250)
  }
  setTimeout(next, 2500)
}

watch(slice, () => draw())

onMounted(() => {
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (isPrint) {
    cursor.value = 1
    playing.value = false
    draw()
    return
  }
  raf = requestAnimationFrame(tick)
  prewarm()
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="g2d-wrap">
    <svg
      class="g2d-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerUp"
    >
      <!-- Panels -->
      <g v-for="p in slice.panels" :key="`p-${p.mode}-${p.scale}`">
        <rect
          :x="panelRect(p.row, p.col).x" :y="panelRect(p.row, p.col).y"
          :width="PANEL" :height="PANEL"
          fill="#FFFFFF"
        />
        <image
          v-if="p.bg"
          :x="panelRect(p.row, p.col).x" :y="panelRect(p.row, p.col).y"
          :width="PANEL" :height="PANEL"
          :href="p.bg" preserveAspectRatio="none"
        />
        <!-- world-unit grid, paper style -->
        <g>
          <line
            v-for="(f, gi) in gridLines"
            :key="`gv-${gi}`"
            :x1="panelRect(p.row, p.col).x + f * PANEL" :y1="panelRect(p.row, p.col).y"
            :x2="panelRect(p.row, p.col).x + f * PANEL" :y2="panelRect(p.row, p.col).y + PANEL"
            stroke="#DFE6EF" stroke-width="0.7" stroke-opacity="0.85"
          />
          <line
            v-for="(f, gi) in gridLines"
            :key="`gh-${gi}`"
            :x1="panelRect(p.row, p.col).x" :y1="panelRect(p.row, p.col).y + (1 - f) * PANEL"
            :x2="panelRect(p.row, p.col).x + PANEL" :y2="panelRect(p.row, p.col).y + (1 - f) * PANEL"
            stroke="#DFE6EF" stroke-width="0.7" stroke-opacity="0.85"
          />
        </g>
        <rect
          :x="panelRect(p.row, p.col).x" :y="panelRect(p.row, p.col).y"
          :width="PANEL" :height="PANEL"
          fill="none" stroke="#2B2B2B" stroke-width="1.15"
        />
      </g>

      <!-- Dataset chips -->
      <g v-for="(d, di) in DATASETS" :key="`ds-${d.id}`" class="g2d-chip" @pointerdown.prevent="selectDataset(d.id)">
        <rect
          :x="MARGIN_X + di * 66" :y="CHIPS_Y" width="60" height="21" rx="10.5"
          :fill="d.id === datasetId ? '#EAF0FF' : '#FFFFFF'"
          :stroke="d.id === datasetId ? '#253A88' : '#C9D2E8'"
          :stroke-width="d.id === datasetId ? 1.4 : 1"
        />
        <text
          :x="MARGIN_X + di * 66 + 30" :y="CHIPS_Y + 14.5"
          text-anchor="middle" class="g2d-chip-text"
          :class="{ 'g2d-chip-text--on': d.id === datasetId }"
        >{{ d.label }}</text>
      </g>

      <!-- Play / pause -->
      <g class="g2d-play" @pointerdown.prevent="togglePlay">
        <circle :cx="270" :cy="controlsY" r="11" fill="#FFFFFF" stroke="#253A88" stroke-width="1.9" />
        <g v-if="isRunning">
          <rect :x="265.8" :y="controlsY - 4.6" width="3" height="9.2" rx="1" fill="#253A88" />
          <rect :x="271.2" :y="controlsY - 4.6" width="3" height="9.2" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${266.8} ${controlsY - 5} L ${275.4} ${controlsY} L ${266.8} ${controlsY + 5} Z`"
          fill="#253A88"
        />
      </g>

      <!-- Shared time slider -->
      <g class="g2d-slider" @pointerdown.prevent="handleSliderDown">
        <text :x="slider.x - 12" :y="slider.y + 4" text-anchor="end" class="g2d-slider-text">time</text>
        <line :x1="slider.x" :y1="slider.y" :x2="slider.x + slider.w" :y2="slider.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="slider.x" :y1="slider.y"
          :x2="slider.x + slider.w * clamp(cursor)" :y2="slider.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          :cx="slider.x + slider.w * clamp(cursor)" :cy="slider.y"
          r="10" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.1"
        />
      </g>
    </svg>

    <!-- Particle layer: one canvas over the whole figure (fast + engine-safe) -->
    <canvas ref="canvasEl" class="g2d-canvas" :width="width * 2" :height="height * 2"></canvas>

    <!-- Titles + readout (HTML overlays; WebKit-safe) -->
    <RfFigLabel
      v-for="tt in titles"
      :key="tt.key"
      :x="panelRect(tt.row, tt.col).x" :y="panelRect(tt.row, tt.col).y - 19"
      :w="PANEL" :vb-h="height"
    >
      <div class="g2d-title" v-html="tt.html"></div>
    </RfFigLabel>

    <RfFigLabel :x="slider.x + slider.w + 16" :y="controlsY - 13" :w="86" :vb-h="height">
      <div class="g2d-readout" v-html="tReadout"></div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.g2d-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.g2d-svg {
  display: block;
  width: 100%;
  height: auto;
}

.g2d-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.g2d-title {
  color: #303a49;
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.g2d-title :deep(.katex) {
  font-size: 1.04em;
}

.g2d-chip {
  cursor: pointer;
}

.g2d-chip-text {
  fill: #536073;
  font-size: 11px;
  font-weight: 650;
  user-select: none;
}

.g2d-chip-text--on {
  fill: #253a88;
}

.g2d-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.g2d-slider,
.g2d-play {
  cursor: pointer;
}

.g2d-slider-text {
  fill: #536073;
  font-size: 12px;
  font-weight: 600;
}
</style>
