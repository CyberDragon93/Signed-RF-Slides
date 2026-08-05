// Signed RF · 2D playground — the paper's live two-row guidance sweep.
// Standalone master of components/Rf2DGuidance.vue: identical numeric recipe,
// ported out of Vue onto one dpr-aware canvas + HTML title overlays.

import {
  N_STEPS_2D,
  SWEEP_VALUES_2D,
  WORLDS_2D,
  seeds2d,
  signedDensity2d,
  simulateGuidance2d,
} from './lib/signedRf2d.js'

// ---- Datasets: the paper's full preset library ------------------------------
const DATASETS = [
  { id: 'shared_modes', label: 'shared' },
  { id: 'ring4', label: 'ring4' },
  { id: 'unsafe_arc', label: 'arc' },
  { id: 'unsafe_sector', label: 'sector' },
  { id: 'unsafe_core', label: 'core' },
  { id: 'ring_vs_core', label: 'ring6' },
  { id: 'plus_two_minus_one', label: '2v1' },
  { id: 'plus_three_minus_one', label: '3v1' },
  { id: 'cross', label: 'cross' },
  { id: 'triangles', label: 'tri' },
  { id: 'teaser_arc3', label: 'arc3' },
  { id: 'five_negative', label: '5neg' },
  { id: 'diagonal_point', label: 'point' },
  { id: 'memo_points', label: 'memo' },
]

const N_PARTICLES = 260
// Broad single-Gaussian toys read better with a denser cloud.
const PARTICLE_COUNTS = { diagonal_point: 520, memo_points: 520 }
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
const GRID_STROKE = '#DFE6EF'
const PANEL_BORDER = '#2B2B2B'

// ---- Layout (internal fixed coordinate system) -------------------------------
const WIDTH = 900
const COLS = SWEEP_VALUES_2D.length
const GAP = 7
const MARGIN_X = 10
const PANEL = (WIDTH - 2 * MARGIN_X - (COLS - 1) * GAP) / COLS // ~170
const TITLE_H = 20
const ROW0_Y = 26
const ROW_STRIDE = PANEL + TITLE_H + 9
const HEIGHT = ROW0_Y + ROW_STRIDE + PANEL + 12

function panelRect(row, col) {
  return {
    x: MARGIN_X + col * (PANEL + GAP),
    y: ROW0_Y + row * ROW_STRIDE,
    w: PANEL,
    h: PANEL,
  }
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

// ---- Per-dataset slice ---------------------------------------------------------
// View window, exactly the paper's recipe (paper_2d_fancy_sweeps.branch_limits
// -> _square_limits -> _zoom_limits): per-axis mean bounds padded by
// 4 * max(all sigmas, 1) + 0.8 and clamped to at least [-extent, extent],
// squared to a shared span about per-axis centres, then zoomed by SWEEP_ZOOM.
// The old single-interval window with a hardcoded sigma = 0.6 pad cropped up
// to half the samples on the broad-sigma toys (point, memo).
function squareLimits(xl, yl) {
  const xc = 0.5 * (xl[0] + xl[1])
  const yc = 0.5 * (yl[0] + yl[1])
  const half = 0.5 * Math.max(xl[1] - xl[0], yl[1] - yl[0])
  return [[xc - half, xc + half], [yc - half, yc + half]]
}

function zoomLimits(l, zoom) {
  const c = 0.5 * (l[0] + l[1])
  const half = 0.5 * (l[1] - l[0]) / zoom
  return [c - half, c + half]
}

function viewOf(w2) {
  let sigMax = 1.0
  let xLo = Infinity
  let xHi = -Infinity
  let yLo = Infinity
  let yHi = -Infinity
  for (const br of [w2.plus, w2.minus]) {
    for (const s of br.sigmas) sigMax = Math.max(sigMax, s)
    for (const m of br.means) {
      xLo = Math.min(xLo, m[0])
      xHi = Math.max(xHi, m[0])
      yLo = Math.min(yLo, m[1])
      yHi = Math.max(yHi, m[1])
    }
  }
  const extent = 4.0 * sigMax + 0.8
  let xlim = [Math.min(xLo - extent, -extent), Math.max(xHi + extent, extent)]
  let ylim = [Math.min(yLo - extent, -extent), Math.max(yHi + extent, extent)]
  ;[xlim, ylim] = squareLimits(xlim, ylim)
  ;[xlim, ylim] = squareLimits(zoomLimits(xlim, ZOOM), zoomLimits(ylim, ZOOM))
  return { xLo: xlim[0], xHi: xlim[1], yLo: ylim[0], yHi: ylim[1] }
}

// Background canvas for one panel: signed density at t = 1, paper recipe.
function renderPanelBg(w2, a, view, maxAbs) {
  const G = 132
  const canvas = document.createElement('canvas')
  canvas.width = G
  canvas.height = G
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(G, G)
  const scale = Math.max(maxAbs * TANH_SCALE, 1e-12)
  for (let r = 0; r < G; r += 1) {
    const y = view.yHi - ((r + 0.5) / G) * (view.yHi - view.yLo)
    for (let c = 0; c < G; c += 1) {
      const x = view.xLo + ((c + 0.5) / G) * (view.xHi - view.xLo)
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
  const nP = PARTICLE_COUNTS[datasetId] || N_PARTICLES
  const seeds = seeds2d(nP)

  // Shared colour normalization across every panel of the figure, as in the
  // paper: max |signed density| over all sweep values on the view grid.
  let maxAbs = 1e-12
  const G = 72
  for (const a of SWEEP_VALUES_2D) {
    for (let r = 0; r < G; r += 1) {
      const y = view.yLo + (r / (G - 1)) * (view.yHi - view.yLo)
      for (let c = 0; c < G; c += 1) {
        const x = view.xLo + (c / (G - 1)) * (view.xHi - view.xLo)
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
      const negMask = new Uint8Array(nP)
      for (let i = 0; i < nP; i += 1) {
        if (signedDensity2d(last[2 * i], last[2 * i + 1], 1, w2, s) < 0) negMask[i] = 1
      }
      // Violation marks as one vector path per panel (crisp at any zoom).
      const rect = panelRect(row, col)
      const sx = x => rect.x + ((x - view.xLo) / (view.xHi - view.xLo)) * rect.w
      const sy = y => rect.y + ((view.yHi - y) / (view.yHi - view.yLo)) * rect.h
      const arm = 2.4
      let marksD = ''
      for (let i = 0; i < nP; i += 1) {
        if (!negMask[i]) continue
        const px = sx(last[2 * i])
        const py = sy(last[2 * i + 1])
        marksD += `M${(px - arm).toFixed(2)},${(py - arm).toFixed(2)}L${(px + arm).toFixed(2)},${(py + arm).toFixed(2)}`
          + `M${(px - arm).toFixed(2)},${(py + arm).toFixed(2)}L${(px + arm).toFixed(2)},${(py - arm).toFixed(2)}`
      }
      panels.push({
        row,
        col,
        mode,
        scale: s,
        frames,
        negMask,
        marksD,
        bg: renderPanelBg(w2, s, view, maxAbs),
      })
    }
  }

  // Grid line fractions: world-unit lines every 2 units, per axis (the view
  // is square in span but its x/y centres differ).
  const gridX = []
  for (let g = Math.ceil(view.xLo / 2) * 2; g <= view.xHi; g += 2) {
    gridX.push((g - view.xLo) / (view.xHi - view.xLo))
  }
  const gridY = []
  for (let g = Math.ceil(view.yLo / 2) * 2; g <= view.yHi; g += 2) {
    gridY.push((g - view.yLo) / (view.yHi - view.yLo))
  }
  return { view, panels, gridX, gridY }
}

const sliceCache = new Map()
function sliceFor(datasetId) {
  if (!sliceCache.has(datasetId)) sliceCache.set(datasetId, buildSlice(datasetId))
  return sliceCache.get(datasetId)
}

// ---- DOM -----------------------------------------------------------------------
const stage = document.getElementById('stage')
const svParts = document.getElementById('svParts')
const svBase = document.getElementById('svBase')
const svTop = document.getElementById('svTop')
const titlesEl = document.getElementById('titles')
const worldChipsEl = document.getElementById('worldChips')
const displayChipsEl = document.getElementById('displayChips')
const speedChipsEl = document.getElementById('speedChips')
const playBtn = document.getElementById('playBtn')
const timeSlider = document.getElementById('timeSlider')
const timeReadout = document.getElementById('timeReadout')

// ---- SVG scaffolding ---------------------------------------------------------------
// Static chrome (panel bg images, grid, borders) and the violation marks are
// vector SVG; only the moving particles are canvas. Built once, re-pointed on
// world switches.
const SVG_NS = 'http://www.w3.org/2000/svg'
function mkSvg(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.appendChild(el)
  return el
}

svBase.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
svParts.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
svTop.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)

const bgImages = []
const gridPaths = []
const markPaths = []
// Particles are vector too: one path per panel holding every dot as a pair of
// arcs — a single attribute swap per panel per frame keeps the DOM cost flat.
const partPaths = []
{
  const partDefs = mkSvg('defs', {}, svParts)
  const topDefs = mkSvg('defs', {}, svTop)
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const rect = panelRect(row, col)
      mkSvg('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: '#FFFFFF' }, svBase)
      bgImages.push(mkSvg('image', {
        x: rect.x, y: rect.y, width: rect.w, height: rect.h, preserveAspectRatio: 'none',
      }, svBase))
      gridPaths.push(mkSvg('path', {
        fill: 'none', stroke: GRID_STROKE, 'stroke-width': 0.7, 'stroke-opacity': 0.85,
      }, svBase))
      mkSvg('rect', {
        x: rect.x, y: rect.y, width: rect.w, height: rect.h,
        fill: 'none', stroke: PANEL_BORDER, 'stroke-width': 1.15,
      }, svBase)
      const k = row * COLS + col
      const cp = mkSvg('clipPath', { id: `g2dClip${k}` }, topDefs)
      mkSvg('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, cp)
      markPaths.push(mkSvg('path', {
        fill: 'none', stroke: NEG_MARK, 'stroke-width': 0.85, 'clip-path': `url(#g2dClip${k})`,
      }, svTop))
      const pcp = mkSvg('clipPath', { id: `g2dPClip${k}` }, partDefs)
      mkSvg('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, pcp)
      partPaths.push(mkSvg('path', {
        fill: PARTICLE_FILL, stroke: PARTICLE_EDGE, 'stroke-width': 0.42,
        'clip-path': `url(#g2dPClip${k})`,
      }, svParts))
    }
  }
}

// Point the vector chrome at the current world's slice.
function applyWorld() {
  const { view, panels, gridX, gridY } = sliceFor(datasetId)
  let gridD = ''
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const rect = panelRect(row, col)
      let d = ''
      for (const f of gridX) {
        const gx = (rect.x + f * rect.w).toFixed(2)
        d += `M${gx},${rect.y.toFixed(2)}L${gx},${(rect.y + rect.h).toFixed(2)}`
      }
      for (const f of gridY) {
        const gy = (rect.y + (1 - f) * rect.h).toFixed(2)
        d += `M${rect.x.toFixed(2)},${gy}L${(rect.x + rect.w).toFixed(2)},${gy}`
      }
      gridPaths[row * COLS + col].setAttribute('d', d)
    }
  }
  for (const p of panels) {
    const k = p.row * COLS + p.col
    bgImages[k].setAttribute('href', p.bg)
    markPaths[k].setAttribute('d', p.marksD)
  }
  void gridD
}

// ---- State -----------------------------------------------------------------------
let datasetId = 'shared_modes'
let cursor = 1
let playing = true
let manual = false
let speed = 1
let phase = SWEEP // hold-first: open on the finished sweep
let lastTs = 0
let raf = 0
let dirty = true
const show = { bg: true, grid: true, marks: true }

function isRunning() {
  return playing && !manual && !document.hidden
}

// ---- KaTeX helpers -----------------------------------------------------------------
function whenKatex(cb) {
  if (window.katex) {
    cb()
    return
  }
  const iv = setInterval(() => {
    if (window.katex) {
      clearInterval(iv)
      cb()
    }
  }, 50)
  setTimeout(() => clearInterval(iv), 12000)
}

function mathHtml(tex) {
  return window.katex
    ? window.katex.renderToString(tex, { throwOnError: false })
    : tex
}

const readoutCache = new Map()
function readoutHtml(c) {
  const key = c.toFixed(2)
  if (!window.katex) return `t = ${key}`
  if (!readoutCache.has(key)) {
    readoutCache.set(key, mathHtml(`t = ${key}`))
  }
  return readoutCache.get(key)
}

// ---- Panel titles (static overlay: sweep values never change) -----------------------
function buildTitles() {
  titlesEl.innerHTML = ''
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const s = SWEEP_VALUES_2D[col]
      const rect = panelRect(row, col)
      const div = document.createElement('div')
      div.className = 'g2d-title'
      div.style.left = `${(rect.x / WIDTH) * 100}%`
      div.style.top = `${((rect.y - 24) / HEIGHT) * 100}%`
      div.style.width = `${(rect.w / WIDTH) * 100}%`
      div.style.height = `${(20 / HEIGHT) * 100}%`
      div.innerHTML = row === 0
        ? `Constant&nbsp;CFG&nbsp;${mathHtml(`= ${s.toFixed(1)}`)}`
        : `Ours&nbsp;${mathHtml(`\\alpha=${s.toFixed(1)}`)}`
      titlesEl.appendChild(div)
    }
  }
}

// ---- Sizing: every layer is SVG and scales itself; only the HTML title
// overlay needs its font matched to the stage width.
function resize() {
  const cwCss = stage.clientWidth
  if (!cwCss) return
  titlesEl.style.fontSize = `${(12.5 * cwCss / WIDTH).toFixed(2)}px`
  invalidate()
}

// ---- Drawing ------------------------------------------------------------------------
// Every dot is two SVG arcs inside its panel's single path: one path-data swap
// per panel per frame, vector-crisp at any zoom.
const DOT_R = 1.55
const DOT_A1 = `a${DOT_R},${DOT_R} 0 1,0 ${(-2 * DOT_R).toFixed(2)},0`
const DOT_A2 = `a${DOT_R},${DOT_R} 0 1,0 ${(2 * DOT_R).toFixed(2)},0`

function draw() {
  const { view, panels } = sliceFor(datasetId)
  const c = clamp(cursor)
  const fpos = c * N_STEPS_2D
  const k0 = Math.min(N_STEPS_2D - 1, Math.floor(fpos))
  const fr = fpos - k0

  // Vector layers: bg/grid via display, marks appear at the terminal hold.
  for (const img of bgImages) img.setAttribute('display', show.bg ? '' : 'none')
  for (const gp of gridPaths) gp.setAttribute('display', show.grid ? '' : 'none')
  svTop.style.display = show.marks && c > 0.985 ? '' : 'none'

  for (const p of panels) {
    const rect = panelRect(p.row, p.col)
    const A = p.frames[k0]
    const B = p.frames[k0 + 1]
    const kx = rect.w / (view.xHi - view.xLo)
    const ky = rect.h / (view.yHi - view.yLo)
    const nP = A.length >> 1
    let d = ''
    for (let i = 0; i < nP; i += 1) {
      const x = A[2 * i] + (B[2 * i] - A[2 * i]) * fr
      const y = A[2 * i + 1] + (B[2 * i + 1] - A[2 * i + 1]) * fr
      const px = rect.x + (x - view.xLo) * kx
      const py = rect.y + (view.yHi - y) * ky
      d += `M${(px + DOT_R).toFixed(2)},${py.toFixed(2)}${DOT_A1}${DOT_A2}`
    }
    partPaths[p.row * COLS + p.col].setAttribute('d', d)
  }
}

// ---- Time UI ---------------------------------------------------------------------------
function updateTimeUI() {
  const c = clamp(cursor)
  timeSlider.value = String(Math.round(c * 1000))
  timeSlider.style.setProperty('--fill', `${(c * 100).toFixed(1)}%`)
  timeReadout.innerHTML = readoutHtml(c)
}

const PLAY_ICON = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M 2.4 1 L 11 6 L 2.4 11 Z" fill="#253A88"/></svg>'
const PAUSE_ICON = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.6" y="1.2" width="3.2" height="9.6" rx="1" fill="#253A88"/><rect x="7.2" y="1.2" width="3.2" height="9.6" rx="1" fill="#253A88"/></svg>'

function updatePlayBtn() {
  playBtn.innerHTML = playing && !manual ? PAUSE_ICON : PLAY_ICON
}

// ---- Animation loop -----------------------------------------------------------------------
function tick(ts) {
  raf = 0
  if (isRunning()) {
    if (lastTs) phase = (phase + ((ts - lastTs) / 1000) * speed) % CYCLE
    lastTs = ts
    cursor = phase < SWEEP ? phase / SWEEP : 1
    dirty = true
  } else {
    lastTs = 0
  }
  if (dirty) {
    dirty = false
    draw()
    updateTimeUI()
  }
  if (isRunning()) schedule()
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick)
}

function invalidate() {
  dirty = true
  schedule()
}

// ---- Controls --------------------------------------------------------------------------------
function selectDataset(id) {
  if (id === datasetId) return
  datasetId = id
  for (const btn of worldChipsEl.children) {
    btn.classList.toggle('on', btn.dataset.id === id)
  }
  applyWorld()
  // restart the sweep: nothing is mid-flight at t = 0, so the swap is clean
  manual = false
  playing = true
  cursor = 0
  phase = 0
  lastTs = 0
  updatePlayBtn()
  invalidate()
  prewarm()
}

for (const d of DATASETS) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pg-chip'
  btn.dataset.id = d.id
  btn.textContent = d.label
  if (d.id === datasetId) btn.classList.add('on')
  btn.addEventListener('click', () => selectDataset(d.id))
  worldChipsEl.appendChild(btn)
}

for (const btn of displayChipsEl.querySelectorAll('.pg-toggle')) {
  btn.addEventListener('click', () => {
    const layer = btn.dataset.layer
    show[layer] = !show[layer]
    btn.classList.toggle('on', show[layer])
    invalidate()
  })
}

for (const btn of speedChipsEl.querySelectorAll('.pg-chip')) {
  btn.addEventListener('click', () => {
    speed = Number(btn.dataset.speed)
    for (const b of speedChipsEl.children) b.classList.toggle('on', b === btn)
  })
}

playBtn.addEventListener('click', () => {
  if (playing && !manual) {
    playing = false
  } else {
    manual = false
    playing = true
    lastTs = 0
  }
  updatePlayBtn()
  invalidate()
})

// Scrubbing pauses until play; grabbing the thumb alone already pauses.
timeSlider.addEventListener('pointerdown', () => {
  manual = true
  updatePlayBtn()
})
timeSlider.addEventListener('input', () => {
  manual = true
  cursor = clamp(Number(timeSlider.value) / 1000)
  phase = SWEEP * cursor
  updatePlayBtn()
  invalidate()
})

document.addEventListener('visibilitychange', () => {
  lastTs = 0
  if (!document.hidden) invalidate()
})

window.addEventListener('resize', resize)

// ---- Prewarm the other datasets in the background --------------------------------------------
let prewarmed = false
function prewarm() {
  if (prewarmed) return
  prewarmed = true
  const queue = DATASETS.map(d => d.id).filter(id => id !== datasetId)
  const next = () => {
    const id = queue.shift()
    if (!id) return
    sliceFor(id)
    setTimeout(next, 250)
  }
  setTimeout(next, 2500)
}

// ---- Boot --------------------------------------------------------------------------------------
whenKatex(() => {
  buildTitles()
  updateTimeUI()
})

buildTitles() // plain-text fallback until KaTeX loads
updatePlayBtn()
resize()
sliceFor(datasetId)
applyWorld()
updateTimeUI()
schedule()
prewarm()
