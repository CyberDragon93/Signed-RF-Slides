// Signed RF 1D playground — the (t, x) anatomy of Signed RF sampling.
// Master version of the deck's "Working Example" page (RfPairEmission.vue),
// driven by the closed-form engine in lib/signedRfMath.js. All line work is
// SVG (vector-crisp at any zoom); only the density heatmap is an image.

import {
  ALPHA_DETENTS,
  DENSITY,
  PALETTE,
  SKEW,
  TWIN,
  gaussianPdf,
  quantileSeeds,
  signedDensity,
  simulateAdaptive,
  simulateTrajectories,
  zeroBranches,
  zeroCrossings,
} from './lib/signedRfMath.js'

// ---- Candidate toy worlds (same Gaussian-mixture form as the engine setups) --
// comb: broad positive sheet, three narrow negative teeth. The teeth are born
// in sequence (outer pair first, centre last) and slice the flow into four
// channels; at small alpha no tooth opens at all.
const COMB = {
  plus: [{ w: 1.0, mu: 0.0, vr: 2.6 }],
  minus: [
    { w: 1 / 3, mu: -1.8, vr: 0.05 },
    { w: 1 / 3, mu: 0.0, vr: 0.05 },
    { w: 1 / 3, mu: 1.8, vr: 0.05 },
  ],
  alpha: 0.85,
  domain: [-4.5, 4.5],
}

// needle: an ultra-narrow negative spike off-centre. At small alpha it is a
// late-born lancet the flow forks around; at larger alpha its boundary sweeps
// early and shoves every trajectory to one side — a one-sided exclusion with
// a huge stranded ghost tail.
const NEEDLE = {
  plus: [{ w: 1.0, mu: -0.3, vr: 1.1 }],
  minus: [{ w: 1.0, mu: 1.1, vr: 0.015 }],
  alpha: 0.85,
  domain: [-3.8, 3.8],
}

// canyon: two far positive banks, one broad negative river between them.
// The wedge opens early and wide; the flow must commit to a bank at once.
const CANYON = {
  plus: [
    { w: 0.5, mu: -2.5, vr: 0.35 },
    { w: 0.5, mu: 2.5, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 0.0, vr: 1.1 }],
  alpha: 0.85,
  domain: [-4.6, 4.6],
}

// island: a sharp positive core inside a broad negative sea, with two shores.
// Below alpha ~ 1 the core is a reachable channel threaded between the two
// wedges; at larger alpha the sea is born first and the island splits later
// inside it — the whole core strands as ghost mass. A phase transition on
// the alpha slider.
const ISLAND = {
  plus: [
    { w: 0.30, mu: 0.0, vr: 0.06 },
    { w: 0.35, mu: -2.6, vr: 0.35 },
    { w: 0.35, mu: 2.6, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 0.0, vr: 1.0 }],
  alpha: 0.9,
  domain: [-4.6, 4.6],
}

const WORLDS = [
  { id: 'paper', setup: DENSITY },
  { id: 'twin', setup: TWIN },
  { id: 'skew', setup: SKEW },
  { id: 'comb', setup: COMB },
  { id: 'needle', setup: NEEDLE },
  { id: 'canyon', setup: CANYON },
  { id: 'island', setup: ISLAND },
]

// ---- Internal layout (fixed 900 x 560 coordinate system) --------------------
const W = 900
const H = 560
const panelX = 104
const panelW = 640
const panelY = 56
const panelH = 460
const panelY1 = panelY + panelH
const stripX = 22
const stripW = 70
const stripRight = stripX + stripW
const RSTRIP_X = 764
const RSTRIP_W = 104
const SWEEP = 7.0 // seconds at 1x, forward t: 0 -> 1
const HOLD = 1.6 // seconds held at t = 1
const FLASH = 0.06 // pair-production flash span in t-units

const ZONE_DARK = { reach: PALETTE.samplingDark, ghost: PALETTE.bufferDark, neg: PALETTE.negativeDark }

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const tX = t => panelX + panelW * t

function makeY(domain) {
  const [lo, hi] = domain
  const k = panelH / (hi - lo)
  return x => panelY + (hi - x) * k
}

// ---- Slice recipes -----------------------------------------------------------

function frontAt(curve, t) {
  const { ts, xs } = curve
  const n = ts.length
  if (t < ts[0]) return NaN
  if (t >= ts[n - 1]) return xs[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const span = ts[hi] - ts[lo]
  return span > 0 ? xs[lo] + ((t - ts[lo]) / span) * (xs[hi] - xs[lo]) : xs[lo]
}

// Interpolate a zero-branch line (array of [t, x] points, ascending t) at t.
function lineAt(line, t) {
  const n = line.length
  if (t < line[0][0] || n < 2) return NaN
  if (t >= line[n - 1][0]) return line[n - 1][1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (line[m][0] <= t) lo = m
    else hi = m
  }
  const span = line[hi][0] - line[lo][0]
  return span > 0 ? line[lo][1] + ((t - line[lo][0]) / span) * (line[hi][1] - line[lo][1]) : line[lo][1]
}

// Pair emissions seeded directly on the zero-set branches — topology-agnostic.
// A pair is born on the boundary; which side is the ghost (+) and which the
// negative (-) particle is decided by where each trajectory actually lands.
function buildEmissions(a, su, zeroLines) {
  const dts = zeroLines.length > 2 ? [0.16] : [0.09, 0.33]
  const eps = 0.07
  const pairs = []
  for (let k = 0; k < zeroLines.length; k += 1) {
    const line = zeroLines[k]
    if (line.length < 2) continue
    for (const dt of dts) {
      const t0 = Math.min(0.97, line[0][0] + dt)
      const xb = lineAt(line, t0)
      if (!Number.isFinite(xb)) continue
      const below = simulateAdaptive(xb - eps, t0, a, su)
      const above = simulateAdaptive(xb + eps, t0, a, su)
      const sideSign = c => Math.sign(signedDensity(c.xs[c.xs.length - 1], 1, a, su))
      const sb = sideSign(below)
      if (sb === sideSign(above)) continue // degenerate seed: one regime
      pairs.push({
        id: `z${k}-${dt}`,
        t: t0,
        xb,
        ghost: sb > 0 ? below : above,
        reject: sb > 0 ? above : below,
      })
    }
  }
  pairs.sort((a2, b2) => a2.t - b2.t)
  return pairs
}

// Wedge frontiers for every birth event. Scan the zero-root count over t;
// each time it grows, pair the sorted roots into consecutive candidate
// wedges, validate (negative just inside; frontier landings inside the reach
// envelope; not already tracked) and start an adaptive frontier pair.
function allFrontiers(a, su, reachLo, reachHi) {
  const eps = 1e-4
  const NT = 220
  const out = []
  let prevCount = 0
  for (let i = 1; i <= NT; i += 1) {
    const t = 0.01 + (i / NT) * 0.985
    const roots = zeroCrossings(t, a, su)
    if (roots.length > prevCount) {
      // Refine the birth time by bisection on the root count.
      let lo = 0.01 + ((i - 1) / NT) * 0.985
      let hi = t
      for (let k = 0; k < 26; k += 1) {
        const m = 0.5 * (lo + hi)
        if (zeroCrossings(m, a, su).length > prevCount) hi = m
        else lo = m
      }
      const t0 = Math.min(hi + 2e-3, 1)
      const rr = zeroCrossings(t0, a, su)
      for (let j = 0; j + 1 < rr.length; j += 2) {
        const rl = rr[j]
        const ru = rr[j + 1]
        const mid = 0.5 * (rl + ru)
        if (signedDensity(mid, Math.min(t0 + 0.01, 1), a, su) >= 0) continue
        let tracked = false
        for (const f of out) {
          const gl = frontAt(f.left, t0)
          const gh = frontAt(f.right, t0)
          if (Number.isFinite(gl) && mid >= gl && mid <= gh) {
            tracked = true
            break
          }
        }
        if (tracked) continue
        const left = simulateAdaptive(rl - eps, t0, a, su)
        const right = simulateAdaptive(ru + eps, t0, a, su)
        const lEnd = left.xs[left.xs.length - 1]
        const rEnd = right.xs[right.xs.length - 1]
        if (lEnd < reachLo - 0.05 || rEnd > reachHi + 0.05) continue
        out.push({ tTip: t0, left, right })
      }
    }
    prevCount = roots.length
  }
  return out
}

// Terminal zones, robust to any topology: negative where pi_1^sign < 0;
// ghost where positive but unreachable — outside the transported span
// [reachLo, reachHi] (edges = landings of extreme source trajectories) or
// inside a validated interior-wedge frontier gap; reachable otherwise.
function buildZones1(a, su, frontiers, reachLo, reachHi) {
  const [lo, hi] = su.domain
  const gaps = frontiers.map(f => [f.left.xs[f.left.xs.length - 1], f.right.xs[f.right.xs.length - 1]])
  const typeOf = (x) => {
    if (signedDensity(x, 1, a, su) < 0) return 'neg'
    if (x < reachLo || x > reachHi) return 'ghost'
    for (const [gl, gh] of gaps) {
      if (x >= gl && x <= gh) return 'ghost'
    }
    return 'reach'
  }
  const n = 640
  const segs = []
  let cur = null
  for (let i = 0; i <= n; i += 1) {
    const x = lo + (i / n) * (hi - lo)
    const ty = typeOf(x)
    if (!cur || cur.type !== ty) {
      cur = { type: ty, x0: x, x1: x }
      segs.push(cur)
    } else {
      cur.x1 = x
    }
  }
  return segs
}

// Heatmap: pointwise signed density with reach-aware colouring — blue where
// the density is positive AND the point is reachable at that time, magenta
// where it is negative, and PURE WHITE over the ghost region (positive but
// unreachable: outside the transported envelope or inside a wedge-frontier
// gap). Region boundaries come from the same exact curves the layers draw.
function renderHeat(a, su, extL, extR, frontiers) {
  const HW = 300
  const HH = 220
  const canvas = document.createElement('canvas')
  canvas.width = HW
  canvas.height = HH
  const hctx = canvas.getContext('2d')
  const [dLo, dHi] = su.domain
  const img = hctx.createImageData(HW, HH)
  const cPos = [73, 105, 226]
  const cNeg = [227, 74, 146]
  const vals = new Float64Array(HW * HH)
  let maxAbs = 1e-12
  const colL = new Float64Array(HW)
  const colU = new Float64Array(HW)
  const colGaps = []
  for (let px = 0; px < HW; px += 1) {
    const t = px / (HW - 1)
    const L = frontAt(extL, t)
    const U = frontAt(extR, t)
    colL[px] = Number.isFinite(L) ? L : -Infinity
    colU[px] = Number.isFinite(U) ? U : Infinity
    colGaps.push(frontiers.map(f => [frontAt(f.left, t), frontAt(f.right, t)]))
    for (let py = 0; py < HH; py += 1) {
      const x = dHi - (py / (HH - 1)) * (dHi - dLo)
      const v = signedDensity(x, t, a, su)
      vals[py * HW + px] = v
      const av = Math.abs(v)
      if (av > maxAbs) maxAbs = av
    }
  }
  for (let py = 0; py < HH; py += 1) {
    const x = dHi - (py / (HH - 1)) * (dHi - dLo)
    for (let px = 0; px < HW; px += 1) {
      const v = vals[py * HW + px]
      const o = 4 * (py * HW + px)
      let alpha = 0
      let c = cPos
      if (v < 0) {
        c = cNeg
        alpha = 0.02 + 0.28 * Math.pow(-v / maxAbs, 0.75)
      } else {
        let ghost = x < colL[px] || x > colU[px]
        if (!ghost) {
          for (const [gl, gh] of colGaps[px]) {
            if (Number.isFinite(gl) && x >= gl && x <= gh) {
              ghost = true
              break
            }
          }
        }
        if (!ghost) alpha = 0.02 + 0.28 * Math.pow(v / maxAbs, 0.75)
      }
      img.data[o] = c[0]
      img.data[o + 1] = c[1]
      img.data[o + 2] = c[2]
      img.data[o + 3] = Math.round(255 * clamp(alpha))
    }
  }
  hctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

// ---- d-string path builders ---------------------------------------------------

function curveD(c, y, targetPts = 260) {
  const n = c.ts.length
  const stride = Math.max(1, Math.floor(n / targetPts))
  let d = `M${tX(c.ts[0]).toFixed(2)},${y(c.xs[0]).toFixed(2)}`
  for (let i = stride; i < n; i += stride) d += `L${tX(c.ts[i]).toFixed(2)},${y(c.xs[i]).toFixed(2)}`
  d += `L${tX(c.ts[n - 1]).toFixed(2)},${y(c.xs[n - 1]).toFixed(2)}`
  return d
}

// ---- Slice cache: everything deterministic per (world, alpha) ------------------

const memo = new Map()

function sliceFor(wid, a) {
  const key = `${wid}|${a.toFixed(2)}`
  if (memo.has(key)) return memo.get(key)
  const su = WORLDS.find(w => w.id === wid).setup
  const y = makeY(su.domain)
  const [dLo, dHi] = su.domain

  // True reach envelope: transported images of extreme source quantiles.
  const extL = simulateAdaptive(-4.2, 0, a, su)
  const extR = simulateAdaptive(4.2, 0, a, su)
  const reachLo = extL.xs[extL.xs.length - 1]
  const reachHi = extR.xs[extR.xs.length - 1]
  const frontiers = allFrontiers(a, su, reachLo, reachHi)

  const zeroLines = zeroBranches(a, su, 160)
  const transported = simulateTrajectories(quantileSeeds(17), a, su, 480)
  const pairs = buildEmissions(a, su, zeroLines)
  const zones1 = buildZones1(a, su, frontiers, reachLo, reachHi)
  const heatUrl = renderHeat(a, su, extL, extR, frontiers)

  // -- geometry as SVG path data --
  const zeroD = zeroLines.map((line) => {
    let d = ''
    for (const [t, xv] of line) d += (d ? 'L' : 'M') + tX(t).toFixed(2) + ',' + y(xv).toFixed(2)
    return d
  })
  // Ghost-boundary display: validated wedge frontiers, plus the reach
  // envelope itself whenever it converges to the panel interior (twin-style
  // worlds — for interior-wedge worlds it hugs the domain edge, so skip it).
  const edgeCut = 0.88 * Math.max(Math.abs(dLo), Math.abs(dHi))
  const ghostCurves = frontiers.flatMap(f => [f.left, f.right])
  if (Math.abs(reachLo) < edgeCut) ghostCurves.push(extL)
  if (Math.abs(reachHi) < edgeCut) ghostCurves.push(extR)
  const ghostD = ghostCurves.map(c => curveD(c, y))

  const { times, paths } = transported
  // Truncate at annihilation: a measure-zero seed on a symmetry axis rides
  // v = 0 straight into the wedge born there; in exact math it terminates at
  // the tip, so clip the drawn curve there and mark it.
  const trajData = paths.map((arr) => {
    let cut = arr.length - 1
    for (let i = 1; i < arr.length; i += 1) {
      if (signedDensity(arr[i], times[i], a, su) < -1e-12) {
        cut = Math.max(1, i - 1)
        break
      }
    }
    let d = `M${tX(times[0]).toFixed(2)},${y(arr[0]).toFixed(2)}`
    for (let i = 3; i < cut; i += 3) d += `L${tX(times[i]).toFixed(2)},${y(arr[i]).toFixed(2)}`
    d += `L${tX(times[cut]).toFixed(2)},${y(arr[cut]).toFixed(2)}`
    return {
      d,
      arr,
      cut,
      annihilated: cut < arr.length - 1,
      tEnd: times[cut],
      xEnd: arr[cut],
    }
  })
  const pairGeo = pairs.map(p => ({
    id: p.id,
    t: p.t,
    cx: tX(p.t),
    cy: y(p.xb),
    ghost: p.ghost,
    reject: p.reject,
    ghostD: curveD(p.ghost, y),
    rejectD: curveD(p.reject, y),
  }))

  // -- source strip (pi_0 = N(0,1) silhouette bulging left) --
  const srcK = 58 / 0.42
  let srcLineD = ''
  let srcAreaD = `M${stripRight},${y(dLo).toFixed(2)}`
  for (let i = 0; i <= 180; i += 1) {
    const x = dLo + (i / 180) * (dHi - dLo)
    const px = (stripRight - srcK * gaussianPdf(x, 0, 1)).toFixed(2)
    const py = y(x).toFixed(2)
    srcLineD += (srcLineD ? 'L' : 'M') + px + ',' + py
    srcAreaD += `L${px},${py}`
  }
  srcAreaD += `L${stripRight},${y(dHi).toFixed(2)}Z`

  // -- right strip: ONE continuous dense terminal profile + zone fills --
  let maxAbs = 1e-9
  for (let i = 0; i <= 640; i += 1) {
    const x = dLo + (i / 640) * (dHi - dLo)
    maxAbs = Math.max(maxAbs, Math.abs(signedDensity(x, 1, a, su)))
  }
  const baseX = RSTRIP_X + 34
  const rk = (RSTRIP_W - 40) / maxAbs
  let profileD = ''
  for (let i = 0; i <= 700; i += 1) {
    const x = dLo + (i / 700) * (dHi - dLo)
    const px = (baseX + rk * signedDensity(x, 1, a, su)).toFixed(2)
    profileD += (profileD ? 'L' : 'M') + px + ',' + y(x).toFixed(2)
  }
  const rsegs = zones1.map((seg) => {
    // Sampling density proportional to the segment's share of the domain, so
    // narrow features (comb teeth) stay smooth inside wide segments too.
    const nS = Math.max(24, Math.round(((seg.x1 - seg.x0) / (dHi - dLo)) * 700))
    let areaD = `M${baseX},${y(seg.x0).toFixed(2)}`
    for (let i = 0; i <= nS; i += 1) {
      const x = seg.x0 + (i / nS) * (seg.x1 - seg.x0)
      areaD += `L${(baseX + rk * signedDensity(x, 1, a, su)).toFixed(2)},${y(x).toFixed(2)}`
    }
    areaD += `L${baseX},${y(seg.x1).toFixed(2)}Z`
    return {
      type: seg.type,
      areaD,
      yTop: y(seg.x1),
      yBot: y(seg.x0),
      midY: y(0.5 * (seg.x0 + seg.x1)),
      span: Math.abs(y(seg.x1) - y(seg.x0)),
    }
  })
  const zoneLabels = []
  for (const ty of ['reach', 'ghost', 'neg']) {
    const cands = rsegs.filter(s => s.type === ty && s.span > 8)
    if (!cands.length) continue
    const best = cands.reduce((p, q) => (q.span > p.span ? q : p))
    zoneLabels.push({ type: ty, y: clamp(best.midY, panelY + 14, panelY1 - 12) })
  }

  // -- curve label anchors (clamped inside the panel) --
  const cxc = v => clamp(v, panelX + 6, panelX + panelW - 156)
  const cyc = v => clamp(v, panelY + 4, panelY1 - 26)
  const labels = {}
  if (zeroLines.length && zeroLines[0].length) {
    const [tz, xz] = zeroLines[0][0]
    labels.zero = { x: cxc(tX(tz) - 152), y: cyc(y(xz) - 12) }
  }
  {
    const tg = 0.78
    let gx = NaN
    if (ghostCurves.length) gx = frontAt(ghostCurves[ghostCurves.length - 1], tg)
    if (Number.isFinite(gx)) labels.ghost = { x: cxc(tX(tg) + 8), y: cyc(y(gx) - 24) }
  }

  // -- pair-production callout anchored on the first emission --
  let callout = null
  if (pairGeo.length) {
    const p = pairGeo[0]
    callout = {
      bx: clamp(p.cx - 40, panelX + 96, panelX + panelW - 240),
      by: 30,
      mx: p.cx,
      my: p.cy,
    }
  }

  const slice = {
    setup: su,
    y,
    heatUrl,
    transported,
    geom: {
      zeroD,
      ghostD,
      trajData,
      pairs: pairGeo,
      srcAreaD,
      srcLineD,
      baseX,
      profileD,
      rsegs,
      zoneLabels,
      labels,
      callout,
    },
  }
  memo.set(key, slice)
  return slice
}

// ---- State ----------------------------------------------------------------------

let worldId = 'paper'
let alphaSel = 0.85
const layers = { heat: true, zero: true, ghost: true, traj: true, pairs: false, strip: true, labels: false }
let slice = null
// Smooth alpha morphs: commits snap the DATA, the visuals glide — the heat
// and buffer curves crossfade, zero curves and the terminal profile are
// re-evaluated live at an eased alphaAnim, and the 17 trajectories (shared
// seeds and time grid across every cached slice) lerp point-wise.
let morphFrom = null
let alphaAnim = 0.85
let blendW = 1

let cursor = 1
let playing = true
let manual = false
let speed = 1
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete t = 1 picture
let raf = 0
let needsDraw = false

const cycleSweep = () => SWEEP / speed
const isRunning = () => playing && !manual && !document.hidden

// ---- Live morph evaluators ----------------------------------------------------
// Cheap enough for one evaluation per frame: ~13k density evals for the
// low-res zero curves + ~1.4k for the terminal profile.
function liveZeroD(a, su, y) {
  return zeroBranches(a, su, 60, 0.35, 220).map((line) => {
    let d = ''
    for (const [t, xv] of line) d += (d ? 'L' : 'M') + tX(t).toFixed(2) + ',' + y(xv).toFixed(2)
    return d
  })
}

function liveProfileD(a, su, y) {
  const [dLo, dHi] = su.domain
  let maxAbs = 1e-9
  for (let i = 0; i <= 320; i += 1) {
    const x = dLo + (i / 320) * (dHi - dLo)
    maxAbs = Math.max(maxAbs, Math.abs(signedDensity(x, 1, a, su)))
  }
  const baseX = RSTRIP_X + 34
  const rk = (RSTRIP_W - 40) / maxAbs
  let d = ''
  for (let i = 0; i <= 480; i += 1) {
    const x = dLo + (i / 480) * (dHi - dLo)
    d += (d ? 'L' : 'M') + (baseX + rk * signedDensity(x, 1, a, su)).toFixed(2) + ',' + y(x).toFixed(2)
  }
  return d
}

// ---- SVG scaffolding ---------------------------------------------------------------
// Built once; slices swap path data, frames only touch the reveal clip, the
// cursor, the riding dots and the flashes.

const SVG_NS = 'http://www.w3.org/2000/svg'
const svg = document.getElementById('sv')

function mk(tag, attrs = {}, parent = svg) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.appendChild(el)
  return el
}

const defs = mk('defs')
const clipPanel = mk('clipPath', { id: 'pg1dPanel' }, defs)
mk('rect', { x: panelX, y: panelY, width: panelW, height: panelH }, clipPanel)
const clipReveal = mk('clipPath', { id: 'pg1dReveal' }, defs)
const revealRect = mk('rect', { x: panelX, y: panelY, width: 0, height: panelH }, clipReveal)

mk('rect', { x: panelX, y: panelY, width: panelW, height: panelH, fill: '#FBFCFF' })
// Outgoing heat/buffer layers: fade out under the incoming ones during a
// smooth alpha morph.
const heatImgPrev = mk('image', {
  x: panelX, y: panelY, width: panelW, height: panelH,
  preserveAspectRatio: 'none', 'clip-path': 'url(#pg1dPanel)', opacity: 0,
})
const heatImg = mk('image', {
  x: panelX, y: panelY, width: panelW, height: panelH,
  preserveAspectRatio: 'none', 'clip-path': 'url(#pg1dPanel)',
})
const gGhostPrev = mk('g', {
  'clip-path': 'url(#pg1dPanel)', fill: 'none',
  stroke: PALETTE.buffer, 'stroke-width': 1.5, 'stroke-opacity': 0.95, 'stroke-linejoin': 'round',
  opacity: 0,
})
const gGhost = mk('g', {
  'clip-path': 'url(#pg1dPanel)', fill: 'none',
  stroke: PALETTE.buffer, 'stroke-width': 1.5, 'stroke-opacity': 0.95, 'stroke-linejoin': 'round',
})
const gZero = mk('g', {
  'clip-path': 'url(#pg1dPanel)', fill: 'none',
  stroke: PALETTE.negative, 'stroke-width': 1.6, 'stroke-opacity': 0.9, 'stroke-linejoin': 'round',
})
// Forward-swept content: revealed up to the cursor only.
const gTraj = mk('g', {
  'clip-path': 'url(#pg1dReveal)', fill: 'none',
  stroke: PALETTE.traj, 'stroke-width': 0.9, 'stroke-opacity': 0.5, 'stroke-linejoin': 'round',
})
const gPairTrails = mk('g', { 'clip-path': 'url(#pg1dReveal)', fill: 'none', 'stroke-linejoin': 'round' })
const gEmDots = mk('g')
const cursorLine = mk('line', {
  y1: panelY, y2: panelY1,
  stroke: 'rgba(32, 33, 36, 0.42)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4',
})
const gFlash = mk('g', { fill: 'none' })
const gDots = mk('g')
const gPairDots = mk('g', { 'font-family': 'KaTeX_Main, Georgia, serif', 'font-size': 10.5, 'font-weight': 800 })
mk('rect', {
  x: panelX, y: panelY, width: panelW, height: panelH,
  fill: 'none', stroke: '#D6DDF3', 'stroke-width': 1,
})

// Left strip: pi_0 silhouette.
const srcArea = mk('path', { fill: 'rgba(73, 105, 226, 0.14)' })
const srcLine = mk('path', { fill: 'none', stroke: PALETTE.sampling, 'stroke-width': 2, 'stroke-linecap': 'round' })
mk('line', { x1: stripRight, y1: panelY, x2: stripRight, y2: panelY1, stroke: 'rgba(37, 58, 136, 0.35)', 'stroke-width': 1 })

// Right strip: baseline + zone fills + one continuous profile + brackets.
const gStrip = mk('g')
const stripBase = mk('line', { stroke: 'rgba(83, 96, 115, 0.45)', 'stroke-width': 0.9, y1: panelY, y2: panelY1 }, gStrip)
const gZoneFills = mk('g', {}, gStrip)
const profilePath = mk('path', { fill: 'none', stroke: '#202124', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, gStrip)
const gBrackets = mk('g', { 'stroke-width': 1.2, 'stroke-opacity': 0.75 }, gStrip)

// Callout arrow (labels + pair layers).
const calloutPath = mk('path', { fill: 'none', stroke: '#202124', 'stroke-width': 1.1 })
const calloutHead = mk('path', { fill: '#202124' })

// Ghost carries NO fill: white background is the ghost region's colour.
const ZONE_FILL = { reach: PALETTE.sampling, ghost: 'none', neg: PALETTE.negative }
const ZONE_LINE_OP = { reach: 0.2, ghost: 0, neg: 0.2 }

// Per-slice dynamic node pools.
let trajDots = []
let annMarks = []
let pairDotGs = []
let flashRings = []

function clearChildren(g) {
  while (g.firstChild) g.removeChild(g.firstChild)
}

function applySlice() {
  const g = slice.geom
  heatImg.setAttribute('href', slice.heatUrl)

  clearChildren(gGhost)
  for (const d of g.ghostD) mk('path', { d }, gGhost)
  clearChildren(gZero)
  for (const d of g.zeroD) mk('path', { d }, gZero)

  clearChildren(gTraj)
  for (const td of g.trajData) mk('path', { d: td.d }, gTraj)

  clearChildren(gPairTrails)
  for (const p of g.pairs) {
    mk('path', { d: p.rejectD, stroke: PALETTE.negative, 'stroke-width': 4.8, 'stroke-opacity': 0.14 }, gPairTrails)
    mk('path', { d: p.ghostD, stroke: PALETTE.buffer, 'stroke-width': 4.8, 'stroke-opacity': 0.14 }, gPairTrails)
    mk('path', { d: p.rejectD, stroke: PALETTE.negative, 'stroke-width': 2.4, 'stroke-opacity': 0.95, 'stroke-dasharray': '2.2 1.6' }, gPairTrails)
    mk('path', { d: p.ghostD, stroke: PALETTE.buffer, 'stroke-width': 2.4, 'stroke-opacity': 0.95, 'stroke-dasharray': '2.2 1.6' }, gPairTrails)
  }

  clearChildren(gEmDots)
  for (const p of g.pairs) {
    mk('circle', {
      cx: p.cx, cy: p.cy, r: 2.9,
      fill: '#FFFFFF', stroke: PALETTE.negativeDark, 'stroke-width': 0.9, visibility: 'hidden',
    }, gEmDots)
  }

  clearChildren(gDots)
  trajDots = slice.geom.trajData.map(() => mk('circle', {
    r: 3.2, fill: PALETTE.trajMarkerFill, stroke: PALETTE.trajMarkerEdge, 'stroke-width': 0.8,
  }, gDots))
  annMarks = slice.geom.trajData.map(td => mk('circle', {
    cx: tX(td.tEnd), cy: slice.y(td.xEnd), r: 3.4,
    fill: '#FFFFFF', stroke: PALETTE.negativeDark, 'stroke-width': 1.1,
    visibility: 'hidden',
  }, gDots))

  clearChildren(gPairDots)
  pairDotGs = g.pairs.map((p) => {
    const grp = mk('g', { visibility: 'hidden' }, gPairDots)
    const mkDot = (fill, sign) => {
      const c = mk('circle', { r: 7, fill, stroke: '#FFFFFF', 'stroke-width': 1.6 }, grp)
      const t = mk('text', {
        fill: '#FFFFFF', 'text-anchor': 'middle', dy: 3.6,
      }, grp)
      t.textContent = sign
      return { c, t }
    }
    return { p, ghost: mkDot(PALETTE.buffer, '+'), reject: mkDot(PALETTE.negative, '−') }
  })

  clearChildren(gFlash)
  flashRings = g.pairs.map(p => ({
    p,
    outer: mk('circle', { cx: p.cx, cy: p.cy, stroke: PALETTE.negativeDark, 'stroke-width': 2.4, opacity: 0 }, gFlash),
    inner: mk('circle', { cx: p.cx, cy: p.cy, stroke: PALETTE.bufferDark, 'stroke-width': 2, opacity: 0 }, gFlash),
  }))

  srcArea.setAttribute('d', g.srcAreaD)
  srcLine.setAttribute('d', g.srcLineD)

  stripBase.setAttribute('x1', g.baseX)
  stripBase.setAttribute('x2', g.baseX)
  clearChildren(gZoneFills)
  for (const seg of g.rsegs) {
    mk('path', { d: seg.areaD, fill: ZONE_FILL[seg.type], 'fill-opacity': ZONE_LINE_OP[seg.type] }, gZoneFills)
  }
  profilePath.setAttribute('d', g.profileD)
  clearChildren(gBrackets)
  const bx = RSTRIP_X + RSTRIP_W - 22
  for (const seg of g.rsegs) {
    if (seg.span <= 6) continue
    const yT = clamp(seg.yTop + 1, panelY, panelY1)
    const yB = clamp(seg.yBot - 1, panelY, panelY1)
    mk('path', {
      d: `M${bx - 4},${yT.toFixed(1)}L${bx},${yT.toFixed(1)}L${bx},${yB.toFixed(1)}L${bx - 4},${yB.toFixed(1)}`,
      fill: 'none', stroke: ZONE_DARK[seg.type],
    }, gBrackets)
  }

  if (g.callout) {
    const { bx: cbx, by, mx, my } = g.callout
    const sx = cbx + 30
    const sy = by + 12
    const qx = mx - 30
    const qy = (by + my) / 2 + 12
    const ex = mx - 4
    const ey = my - 12
    calloutPath.setAttribute('d', `M${sx},${sy}Q${qx},${qy} ${ex},${ey}`)
    const ang = Math.atan2(ey - qy, ex - qx)
    calloutHead.setAttribute('d', [
      `M${ex},${ey}`,
      `L${(ex - 7 * Math.cos(ang - 0.42)).toFixed(1)},${(ey - 7 * Math.sin(ang - 0.42)).toFixed(1)}`,
      `L${(ex - 7 * Math.cos(ang + 0.42)).toFixed(1)},${(ey - 7 * Math.sin(ang + 0.42)).toFixed(1)}`,
      'Z',
    ].join(''))
  }

  applyLayerVisibility()
}

function applyLayerVisibility() {
  const show = (el, on) => el.setAttribute('display', on ? '' : 'none')
  show(heatImg, layers.heat)
  show(gGhost, layers.ghost)
  show(gGhostPrev, layers.ghost)
  show(gZero, layers.zero)
  show(gTraj, layers.traj)
  show(gDots, layers.traj)
  show(gPairTrails, layers.pairs)
  show(gEmDots, layers.pairs)
  show(gPairDots, layers.pairs)
  show(gFlash, layers.pairs)
  show(gStrip, layers.strip)
  show(gBrackets, layers.strip && layers.labels)
  const co = layers.pairs && layers.labels && slice && slice.geom.callout
  show(calloutPath, co)
  show(calloutHead, co)
}

// ---- Frame updates ---------------------------------------------------------------

function updateFrame() {
  needsDraw = false
  const c = clamp(cursor)
  const cx = tX(c)
  const g = slice.geom
  const y = slice.y

  revealRect.setAttribute('width', Math.max(0, cx - panelX))
  cursorLine.setAttribute('x1', cx)
  cursorLine.setAttribute('x2', cx)

  const { times } = slice.transported
  const last = times.length - 1
  const idx = Math.max(0, Math.min(last, Math.round(c * last)))
  const lerpTraj = morphFrom && blendW < 1 && morphFrom.geom.trajData.length === g.trajData.length
  for (let i = 0; i < g.trajData.length; i += 1) {
    const td = g.trajData[i]
    const cutI = lerpTraj ? Math.min(morphFrom.geom.trajData[i].cut, td.cut) : td.cut
    if (idx > cutI) {
      trajDots[i].setAttribute('visibility', 'hidden')
      annMarks[i].setAttribute('visibility', td.annihilated && !lerpTraj ? 'visible' : 'hidden')
    } else {
      const xv = lerpTraj
        ? morphFrom.geom.trajData[i].arr[idx] + (td.arr[idx] - morphFrom.geom.trajData[i].arr[idx]) * blendW
        : td.arr[idx]
      trajDots[i].setAttribute('visibility', 'visible')
      trajDots[i].setAttribute('cx', cx)
      trajDots[i].setAttribute('cy', y(xv))
      annMarks[i].setAttribute('visibility', 'hidden')
    }
  }

  const emCircles = gEmDots.childNodes
  for (let i = 0; i < g.pairs.length; i += 1) {
    emCircles[i].setAttribute('visibility', c >= g.pairs[i].t ? 'visible' : 'hidden')
  }

  for (const pd of pairDotGs) {
    if (c < pd.p.t) {
      pd.grpVisible = false
      pd.ghost.c.parentNode.setAttribute('visibility', 'hidden')
      continue
    }
    const grp = pd.ghost.c.parentNode
    grp.setAttribute('visibility', 'visible')
    const gxv = frontAt(pd.p.ghost, c)
    const rxv = frontAt(pd.p.reject, c)
    for (const [node, xv] of [[pd.ghost, gxv], [pd.reject, rxv]]) {
      const ok = Number.isFinite(xv)
      node.c.setAttribute('visibility', ok ? 'visible' : 'hidden')
      node.t.setAttribute('visibility', ok ? 'visible' : 'hidden')
      if (ok) {
        const py = y(xv)
        node.c.setAttribute('cx', cx)
        node.c.setAttribute('cy', py)
        node.t.setAttribute('x', cx)
        node.t.setAttribute('y', py)
      }
    }
  }

  for (const fr of flashRings) {
    const d = c - fr.p.t
    if (d <= 0 || d > FLASH) {
      fr.outer.setAttribute('opacity', 0)
      fr.inner.setAttribute('opacity', 0)
      continue
    }
    const prog = d / FLASH
    fr.outer.setAttribute('opacity', (0.65 * (1 - prog)).toFixed(3))
    fr.outer.setAttribute('r', (5 + 22 * prog).toFixed(2))
    fr.inner.setAttribute('opacity', (0.65 * (1 - prog)).toFixed(3))
    fr.inner.setAttribute('r', (3 + 15 * prog).toFixed(2))
  }
}

// ---- KaTeX helpers -----------------------------------------------------------------

function mathHtml(tex) {
  if (window.katex) return window.katex.renderToString(tex, { throwOnError: false })
  return null
}

function setMath(el, tex, fallback) {
  const html = mathHtml(tex)
  if (html !== null) el.innerHTML = html
  else if (fallback !== undefined) el.textContent = fallback
}

// ---- Overlays -----------------------------------------------------------------------

const $ = id => document.getElementById(id)
const ovSrc = $('ovSrc')
const ovStripTitle = $('ovStripTitle')
const ovZero = $('ovZero')
const ovZeroChip = $('ovZeroChip')
const ovGhost = $('ovGhost')
const ovZones = $('ovZones')
const ovCallout = $('ovCallout')
const ovLegend = $('ovLegend')
const ovT0 = $('ovT0')
const ovT1 = $('ovT1')

function posPct(el, x, y) {
  el.style.left = `${(x / W * 100).toFixed(3)}%`
  el.style.top = `${(y / H * 100).toFixed(3)}%`
}

function renderStaticMath() {
  setMath(ovSrc, '\\pi_0 = \\mathcal{N}(0,1)')
  setMath(ovStripTitle, '\\pi_1^{\\mathtt{sign}}')
  const om = mathHtml('\\Omega_t^0')
  if (om !== null) ovZeroChip.innerHTML = `zero set ${om}`
  setMath(ovT0, 't = 0', 't = 0')
  setMath(ovT1, 't = 1', 't = 1')
  const omZero = mathHtml('\\Omega_t^0') || '&Omega;<sub>t</sub><sup>0</sup>'
  const pi0 = mathHtml('\\pi_0') || '&pi;&#8320;'
  ovLegend.innerHTML = [
    '<span class="lg-key"><span class="lg-chip lg-ghost">+</span>buffer particle</span>',
    '<span class="lg-key"><span class="lg-chip lg-neg">−</span>negative particle</span>',
    `<span class="lg-note">created in pairs on ${omZero} — never transported from ${pi0}</span>`,
  ].join('')
  for (const el of document.querySelectorAll('.ktx')) {
    const html = mathHtml(el.getAttribute('data-tex'))
    if (html !== null) el.innerHTML = html
  }
  updateAlphaReadout()
  lastTReadout = ''
  updateTimeUI(true)
}

const ZONE_TEX = { reach: '\\Omega^{r}', ghost: '\\Omega^{g}', neg: '\\Omega^{-}' }
const ZONE_TXT = { reach: 'Ω^r', ghost: 'Ω^g', neg: 'Ω^−' }

function updateOverlays() {
  const g = slice.geom

  // curve label chips (annotation: labels layer, default off)
  if (layers.labels && layers.zero && g.labels.zero) {
    posPct(ovZero, g.labels.zero.x, g.labels.zero.y)
    ovZero.style.display = ''
  } else {
    ovZero.style.display = 'none'
  }
  if (layers.labels && layers.ghost && g.labels.ghost) {
    posPct(ovGhost, g.labels.ghost.x, g.labels.ghost.y)
    ovGhost.style.display = ''
  } else {
    ovGhost.style.display = 'none'
  }

  // right-strip zone labels
  ovZones.innerHTML = ''
  ovStripTitle.style.display = layers.strip ? '' : 'none'
  if (layers.strip && layers.labels) {
    for (const zl of g.zoneLabels) {
      const div = document.createElement('div')
      div.className = 'ov ov-zonebox'
      const span = document.createElement('span')
      span.className = 'ov-zone'
      span.style.color = ZONE_DARK[zl.type]
      span.style.borderColor = ZONE_DARK[zl.type]
      const html = mathHtml(ZONE_TEX[zl.type])
      if (html !== null) span.innerHTML = html
      else span.textContent = ZONE_TXT[zl.type]
      div.appendChild(span)
      posPct(div, RSTRIP_X + RSTRIP_W - 18, zl.y)
      ovZones.appendChild(div)
    }
  }

  // callout + legend follow the pair-emission layer AND the labels layer
  if (layers.labels && layers.pairs && g.callout) {
    posPct(ovCallout, g.callout.bx, g.callout.by)
    ovCallout.style.display = ''
  } else {
    ovCallout.style.display = 'none'
  }
  ovLegend.style.display = layers.labels && layers.pairs ? '' : 'none'
}

// ---- Controls -------------------------------------------------------------------------

const alphaRange = $('alphaRange')
const alphaReadout = $('alphaReadout')
const alphaTicks = $('alphaTicks')
const timeRange = $('timeRange')
const timeReadout = $('timeReadout')
const playBtn = $('playBtn')

const PLAY_SVG = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.4 L10.6 6 L3 10.6 Z" fill="#253A88"/></svg>'
const PAUSE_SVG = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.2" y="1.6" width="2.9" height="8.8" rx="1" fill="#253A88"/><rect x="6.9" y="1.6" width="2.9" height="8.8" rx="1" fill="#253A88"/></svg>'

function setFill(input) {
  const min = parseFloat(input.min)
  const max = parseFloat(input.max)
  const v = parseFloat(input.value)
  input.style.setProperty('--fill', `${((v - min) / (max - min) * 100).toFixed(2)}%`)
}

function updateAlphaReadout() {
  const v = parseFloat(alphaRange.value)
  setMath(alphaReadout, `\\alpha = ${v.toFixed(2)}`, `α = ${v.toFixed(2)}`)
}

let lastTReadout = ''
function updateTimeUI(force) {
  const c = clamp(cursor)
  timeRange.value = String(c)
  setFill(timeRange)
  const label = c.toFixed(2)
  if (force || label !== lastTReadout) {
    lastTReadout = label
    setMath(timeReadout, `t = ${label}`, `t = ${label}`)
  }
}

function updatePlayIcon() {
  playBtn.innerHTML = playing && !manual ? PAUSE_SVG : PLAY_SVG
}

// ---- Animation loop ----------------------------------------------------------------------

function schedule() {
  if (!raf) raf = requestAnimationFrame(frame)
}

function scheduleDraw() {
  needsDraw = true
  schedule()
}

function snapshotPhase() {
  phase0 = cursor < 1 ? cycleSweep() * cursor : cycleSweep()
  refTs = 0
}

function frame(now) {
  raf = 0
  const morphing = blendW < 1
  if (morphing) {
    alphaAnim += (alphaSel - alphaAnim) * 0.18
    const nb = blendW + (1 - blendW) * 0.16
    if (nb > 0.99 && Math.abs(alphaSel - alphaAnim) < 2e-3) {
      finalizeMorph()
    } else {
      blendW = nb
      updateMorph()
    }
  }
  if (isRunning()) {
    if (!refTs) refTs = now
    const cs = cycleSweep()
    const ph = ((now - refTs) / 1000 + phase0) % (cs + HOLD)
    cursor = ph < cs ? ph / cs : 1
    updateFrame()
    updateTimeUI()
    raf = requestAnimationFrame(frame)
  } else if (needsDraw || morphing) {
    updateFrame()
    updateTimeUI()
    if (blendW < 1) raf = requestAnimationFrame(frame)
  }
}

function restartSweep() {
  manual = false
  playing = true
  cursor = 0
  refTs = 0
  phase0 = 0
  updatePlayIcon()
  schedule()
}

// ---- Commits (debounced alpha, cached per world x alpha-0.05) --------------------------------

let alphaTimer = 0

function commitAlpha(v) {
  const a = Math.round(v * 20) / 20
  if (a === alphaSel) return
  const prev = slice
  alphaSel = a
  slice = sliceFor(worldId, alphaSel)
  // Glide instead of snapping: remember the outgoing slice, crossfade its
  // heat/buffer layers, and let frame() ease alphaAnim toward the target.
  morphFrom = prev
  blendW = 0
  heatImgPrev.setAttribute('href', prev.heatUrl)
  heatImgPrev.setAttribute('opacity', 1)
  clearChildren(gGhostPrev)
  for (const d of prev.geom.ghostD) mk('path', { d }, gGhostPrev)
  applySlice()
  gGhost.setAttribute('opacity', 0)
  gZoneFills.setAttribute('opacity', 0)
  updateOverlays()
  updateMorph()
  scheduleDraw()
}

function updateMorph() {
  const y = slice.y
  const su = slice.setup
  heatImgPrev.setAttribute('opacity', (1 - blendW).toFixed(3))
  gGhostPrev.setAttribute('opacity', (1 - blendW).toFixed(3))
  gGhost.setAttribute('opacity', blendW.toFixed(3))
  gZoneFills.setAttribute('opacity', blendW.toFixed(3))
  // Zero curves + terminal profile track the eased alpha exactly.
  clearChildren(gZero)
  for (const d of liveZeroD(alphaAnim, su, y)) mk('path', { d }, gZero)
  profilePath.setAttribute('d', liveProfileD(alphaAnim, su, y))
  // Trajectories lerp point-wise between the cached slices.
  if (morphFrom && morphFrom.geom.trajData.length === slice.geom.trajData.length) {
    const A = morphFrom.geom.trajData
    const B = slice.geom.trajData
    const { times } = slice.transported
    const paths = gTraj.childNodes
    for (let i = 0; i < B.length; i += 1) {
      const a1 = A[i].arr
      const b1 = B[i].arr
      const cut = Math.min(A[i].cut, B[i].cut)
      let d = `M${tX(times[0]).toFixed(2)},${y(a1[0] + (b1[0] - a1[0]) * blendW).toFixed(2)}`
      for (let k = 3; k < cut; k += 3) {
        d += `L${tX(times[k]).toFixed(2)},${y(a1[k] + (b1[k] - a1[k]) * blendW).toFixed(2)}`
      }
      d += `L${tX(times[cut]).toFixed(2)},${y(a1[cut] + (b1[cut] - a1[cut]) * blendW).toFixed(2)}`
      paths[i].setAttribute('d', d)
    }
  }
}

function finalizeMorph() {
  morphFrom = null
  blendW = 1
  alphaAnim = alphaSel
  heatImgPrev.setAttribute('opacity', 0)
  clearChildren(gGhostPrev)
  gGhost.setAttribute('opacity', 1)
  gZoneFills.setAttribute('opacity', 1)
  // Snap the live layers back to the committed full-resolution slice.
  const g = slice.geom
  clearChildren(gZero)
  for (const d of g.zeroD) mk('path', { d }, gZero)
  profilePath.setAttribute('d', g.profileD)
  const paths = gTraj.childNodes
  for (let i = 0; i < g.trajData.length; i += 1) paths[i].setAttribute('d', g.trajData[i].d)
  needsDraw = true
}

function selectWorld(id) {
  if (id === worldId) return
  worldId = id
  slice = sliceFor(worldId, alphaSel)
  morphFrom = null
  blendW = 1
  alphaAnim = alphaSel
  heatImgPrev.setAttribute('opacity', 0)
  clearChildren(gGhostPrev)
  gGhost.setAttribute('opacity', 1)
  gZoneFills.setAttribute('opacity', 1)
  applySlice()
  updateOverlays()
  restartSweep()
  scheduleDraw()
  prewarmDetents()
}

// Warm the current world's detent ladder in the background.
const prewarmed = new Set()
function prewarmDetents() {
  if (prewarmed.has(worldId)) return
  prewarmed.add(worldId)
  const wid = worldId
  const queue = ALPHA_DETENTS.filter(a => a >= 0.05 && a !== alphaSel)
    .sort((a, b) => Math.abs(a - alphaSel) - Math.abs(b - alphaSel))
  const next = () => {
    const a = queue.shift()
    if (a === undefined) return
    if (wid === worldId || memo.size < 64) sliceFor(wid, a)
    setTimeout(next, 260)
  }
  setTimeout(next, 2500)
}

// ---- Wire up ----------------------------------------------------------------------------------

function init() {
  slice = sliceFor(worldId, alphaSel)
  applySlice()

  // world chips
  for (const btn of document.querySelectorAll('#worldChips .pg-chip')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#worldChips .pg-chip')) b.classList.toggle('on', b === btn)
      selectWorld(btn.dataset.world)
    })
  }

  // alpha slider: instrument-style integer scale under the track
  setFill(alphaRange)
  for (const v of [0, 1, 2, 3, 4]) {
    const frac = (Math.max(v, 0.05) - 0.05) / (4 - 0.05)
    const tk = document.createElement('span')
    tk.className = 'tk'
    tk.style.left = `${(frac * 100).toFixed(2)}%`
    const line = document.createElement('i')
    const label = document.createElement('b')
    label.textContent = String(v)
    tk.appendChild(line)
    tk.appendChild(label)
    alphaTicks.appendChild(tk)
  }
  alphaRange.addEventListener('input', () => {
    setFill(alphaRange)
    updateAlphaReadout()
    clearTimeout(alphaTimer)
    alphaTimer = setTimeout(() => commitAlpha(parseFloat(alphaRange.value)), 120)
  })

  // layer toggles
  for (const btn of document.querySelectorAll('#layerChips .pg-toggle')) {
    btn.addEventListener('click', () => {
      const k = btn.dataset.layer
      layers[k] = !layers[k]
      btn.classList.toggle('on', layers[k])
      applyLayerVisibility()
      updateOverlays()
      scheduleDraw()
    })
  }

  // motion
  playBtn.addEventListener('click', () => {
    if (playing && !manual) {
      snapshotPhase()
      playing = false
    } else {
      manual = false
      playing = true
      snapshotPhase()
    }
    updatePlayIcon()
    schedule()
  })
  for (const btn of document.querySelectorAll('#speedChips .pg-chip')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#speedChips .pg-chip')) b.classList.toggle('on', b === btn)
      speed = parseFloat(btn.dataset.speed)
      snapshotPhase()
      schedule()
    })
  }
  timeRange.addEventListener('input', () => {
    manual = true // scrubbing pauses the loop until play is pressed again
    cursor = parseFloat(timeRange.value)
    snapshotPhase()
    updatePlayIcon()
    setFill(timeRange)
    scheduleDraw()
  })

  // static overlays
  posPct(ovSrc, stripX - 4, panelY - 28)
  posPct(ovStripTitle, RSTRIP_X + RSTRIP_W / 2, panelY - 28)
  posPct(ovT0, panelX, panelY1 + 8)
  posPct(ovT1, panelX + panelW, panelY1 + 8)
  posPct(ovLegend, panelX + panelW / 2, panelY1 + 26)
  renderStaticMath()
  updateOverlays()
  updatePlayIcon()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      snapshotPhase()
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    } else {
      scheduleDraw()
    }
  })

  scheduleDraw()
  prewarmDetents()
}

init()

// KaTeX arrives deferred from the CDN: re-render labels once it is ready.
if (!window.katex) {
  let tries = 0
  const poll = setInterval(() => {
    tries += 1
    if (window.katex) {
      clearInterval(poll)
      renderStaticMath()
      updateOverlays()
    } else if (tries > 200) {
      clearInterval(poll)
    }
  }, 50)
}

// Test hook (read-only state snapshot for the verification harness).
window.__pg1d = {
  get state() {
    return {
      worldId,
      alphaSel,
      cursor,
      playing,
      manual,
      speed,
      layers: { ...layers },
      cached: memo.size,
      alphaAnim,
      blendW,
    }
  },
}
