// Shared closed-form dynamics for the Signed RF demos.
//
// Faithful JS port of the paper's figure code:
//   Negative-Rectified-Flow/paper_plot/schema.py                (schema setup)
//   Negative-Rectified-Flow/paper_plot/paper_1d_density.py      (density setup)
//   Negative-Rectified-Flow/paper_plot/schema_1d_density_simulated.py
//
// Both branches use the Gaussian source pi_0 = N(0, 1) and Gaussian-mixture
// targets (variance parametrization, exactly as the paper scripts), so every
// quantity — branch marginals, branch velocities, the signed density, the
// Signed RF velocity, the zero boundary and the ghost boundary — is exact.
// The demos integrate the true ODE; nothing is choreographed.

// ---- Paper setups ------------------------------------------------------

// schema.py: single-Gaussian branches, a = 1.0, ylim (-3.2, 3.2).
export const SCHEMA = {
  plus: [{ w: 1.0, mu: -1.0, vr: 0.6 }],
  minus: [{ w: 1.0, mu: 1.8, vr: 0.8 }],
  alpha: 1.0,
  domain: [-3.2, 3.2],
}

// paper_1d_density.py: three-mode positive branch, centred negative branch,
// SIGNED_A = 0.85, X_LIM (-4.25, 4.25).
export const DENSITY = {
  plus: [
    { w: 0.53, mu: -2.45, vr: 0.28 },
    { w: 0.28, mu: 0.15, vr: 0.26 },
    { w: 0.19, mu: 2.78, vr: 0.2 },
  ],
  minus: [{ w: 1.0, mu: 0.0, vr: 0.42 }],
  alpha: 0.85,
  domain: [-4.25, 4.25],
}

export const V_CLIP = 200

// ---- Basic numerics ----------------------------------------------------

export function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function randn(rand) {
  const u = Math.max(rand(), 1e-9)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function gaussianPdf(x, mu, vr) {
  const d = x - mu
  return Math.exp(-0.5 * d * d / vr) / Math.sqrt(2 * Math.PI * vr)
}

// Abramowitz–Stegun 7.1.26, |error| <= 1.5e-7 — plenty for graphics.
export function erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
  return sign * y
}

export function gaussianCdf(x, mu, vr) {
  return 0.5 * (1 + erf((x - mu) / Math.sqrt(2 * vr)))
}

// Acklam's inverse normal CDF (relative error ~1.15e-9).
export function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

export function bisect(f, lo, hi, iters = 80) {
  let flo = f(lo)
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi)
    const fm = f(mid)
    if (fm === 0) return mid
    if ((flo < 0) === (fm < 0)) {
      lo = mid
      flo = fm
    } else {
      hi = mid
    }
  }
  return 0.5 * (lo + hi)
}

// ---- Branch quantities (source N(0,1), variance parametrization) --------

function compMeanVar(t, c) {
  return { m: t * c.mu, v: (1 - t) * (1 - t) + t * t * c.vr }
}

export function branchPdf(x, t, comps) {
  let p = 0
  for (const c of comps) {
    const { m, v } = compMeanVar(t, c)
    p += c.w * gaussianPdf(x, m, v)
  }
  return p
}

export function branchCdf(x, t, comps) {
  let p = 0
  for (const c of comps) {
    const { m, v } = compMeanVar(t, c)
    p += c.w * gaussianCdf(x, m, v)
  }
  return p
}

// v_t(x) = E[X1 - X0 | X_t = x]; per-component slope (t*vr - (1-t))/var_t.
export function branchVelocity(x, t, comps) {
  let num = 0
  let den = 0
  for (const c of comps) {
    const { m, v } = compMeanVar(t, c)
    const p = c.w * gaussianPdf(x, m, v)
    const vk = c.mu + ((t * c.vr - (1 - t)) / v) * (x - m)
    num += p * vk
    den += p
  }
  return den > 1e-300 ? num / den : 0
}

// ---- Signed quantities --------------------------------------------------

export function signedDensity(x, t, alpha, setup) {
  return (1 + alpha) * branchPdf(x, t, setup.plus) - alpha * branchPdf(x, t, setup.minus)
}

export function signedCdf(x, t, alpha, setup) {
  return (1 + alpha) * branchCdf(x, t, setup.plus) - alpha * branchCdf(x, t, setup.minus)
}

// Signed flux / signed density, clipped exactly as in schema.py.
export function signedVelocity(x, t, alpha, setup) {
  const pP = branchPdf(x, t, setup.plus)
  const pM = branchPdf(x, t, setup.minus)
  const num = (1 + alpha) * pP * branchVelocity(x, t, setup.plus) - alpha * pM * branchVelocity(x, t, setup.minus)
  const den = (1 + alpha) * pP - alpha * pM
  const v = Math.abs(den) > 1e-15 ? num / den : 0
  return Math.max(-V_CLIP, Math.min(V_CLIP, v))
}

// ---- Boundaries ----------------------------------------------------------

// All sign-change roots of pi_t^sign(x) = 0 along x at one time t.
export function zeroCrossings(t, alpha, setup, nGrid = 800) {
  const [lo, hi] = setup.domain
  const dx = (hi - lo) / nGrid
  const out = []
  let px = lo
  let pv = signedDensity(lo, t, alpha, setup)
  for (let i = 1; i <= nGrid; i++) {
    const x = lo + i * dx
    const v = signedDensity(x, t, alpha, setup)
    if ((pv < 0) !== (v < 0)) out.push(bisect(xx => signedDensity(xx, t, alpha, setup), px, x))
    px = x
    pv = v
  }
  return out
}

// Ghost boundaries: roots of signedCdf(x) - 1 = 0 (mass-1 level crossings).
// In the single-crossing schema setup the last root is the reachable/ghost
// frontier used by schema.py.
export function ghostCrossings(t, alpha, setup, nGrid = 800) {
  const [lo, hi] = setup.domain
  const dx = (hi - lo) / nGrid
  const out = []
  let px = lo
  let pv = signedCdf(lo, t, alpha, setup) - 1
  for (let i = 1; i <= nGrid; i++) {
    const x = lo + i * dx
    const v = signedCdf(x, t, alpha, setup) - 1
    if ((pv < 0) !== (v < 0)) out.push(bisect(xx => signedCdf(xx, t, alpha, setup) - 1, px, x))
    px = x
    pv = v
  }
  return out
}

// Boundary curves over a time grid: { ts, zero, ghost } where zero[i] and
// ghost[i] are the schema.py picks (first zero crossing, last ghost crossing)
// or NaN when absent.
export function boundaryCurves(alpha, setup, nT = 220, t0 = 0.01, t1 = 1.0) {
  const ts = new Float64Array(nT)
  const zero = new Float64Array(nT)
  const ghost = new Float64Array(nT)
  for (let k = 0; k < nT; k++) {
    const t = t0 + (k / (nT - 1)) * (t1 - t0)
    ts[k] = t
    const zc = zeroCrossings(t, alpha, setup)
    zero[k] = zc.length ? zc[0] : NaN
    const gc = ghostCrossings(t, alpha, setup)
    ghost[k] = gc.length ? gc[gc.length - 1] : NaN
  }
  return { ts, zero, ghost }
}

// ---- Integrators ----------------------------------------------------------

// RK4 with fixed dt from t=0 to t=1 (schema.py: 17 quantile-seeded particles).
export function quantileSeeds(n = 17) {
  const qs = [0.0001]
  for (let i = 0; i < n - 2; i++) qs.push(0.005 + (i / (n - 3)) * (0.995 - 0.005))
  qs.push(0.9999)
  return qs.map(invNorm)
}

export function simulateTrajectories(seeds, alpha, setup, nSteps = 640, tEnd = 1.0) {
  const dt = tEnd / nSteps
  const times = new Float64Array(nSteps + 1)
  for (let k = 0; k <= nSteps; k++) times[k] = k * dt
  const paths = seeds.map((x0) => {
    const p = new Float64Array(nSteps + 1)
    p[0] = x0
    let x = x0
    for (let k = 0; k < nSteps; k++) {
      const t = times[k]
      const k1 = signedVelocity(x, t, alpha, setup)
      const k2 = signedVelocity(x + 0.5 * dt * k1, Math.min(t + 0.5 * dt, tEnd), alpha, setup)
      const k3 = signedVelocity(x + 0.5 * dt * k2, Math.min(t + 0.5 * dt, tEnd), alpha, setup)
      const k4 = signedVelocity(x + dt * k3, Math.min(t + dt, tEnd), alpha, setup)
      x += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
      p[k + 1] = x
    }
    return p
  })
  return { times, paths }
}

// Adaptive RK4 (schema.py simulate_forward_adaptive): displacement-capped
// steps so pair trajectories seeded eps away from the singular boundary stay
// accurate. Returns { ts, xs } arrays.
export function simulateAdaptive(xStart, tStart, alpha, setup, opts = {}) {
  const tEnd = opts.tEnd ?? 1.0
  const dtMax = opts.dtMax ?? 0.0008
  const maxDisp = opts.maxDisp ?? 0.012
  const dtMin = opts.dtMin ?? 1e-9
  const maxIter = opts.maxIter ?? 60000
  let t = tStart
  let x = xStart
  const ts = [t]
  const xs = [x]
  for (let i = 0; i < maxIter && t < tEnd; i++) {
    const v = signedVelocity(x, t, alpha, setup)
    const av = Math.max(Math.abs(v), 1e-10)
    let step = av * dtMax <= maxDisp ? dtMax : maxDisp / av
    step = Math.max(step, dtMin)
    step = Math.min(step, tEnd - t)
    const k1 = signedVelocity(x, t, alpha, setup)
    const k2 = signedVelocity(x + 0.5 * step * k1, Math.min(t + 0.5 * step, tEnd), alpha, setup)
    const k3 = signedVelocity(x + 0.5 * step * k2, Math.min(t + 0.5 * step, tEnd), alpha, setup)
    const k4 = signedVelocity(x + step * k3, Math.min(t + step, tEnd), alpha, setup)
    x += (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    t += step
    ts.push(t)
    xs.push(x)
  }
  return { ts, xs }
}

// Pair-production trajectories: seeds at boundary +/- eps (schema.py).
export function pairTrajectories(pairTimes, alpha, setup, eps = 1e-4) {
  const out = []
  for (const pt of pairTimes) {
    const zc = zeroCrossings(pt, alpha, setup)
    if (!zc.length) continue
    const xb = zc[0]
    const left = simulateAdaptive(xb - eps, pt, alpha, setup)
    const right = simulateAdaptive(xb + eps, pt, alpha, setup)
    out.push({ t: pt, xb, left, right })
  }
  return out
}

// ---- Histogram ------------------------------------------------------------

export function histogramDensity(values, nBins, domain) {
  const [lo, hi] = domain
  const w = (hi - lo) / nBins
  if (values.length === 0) return []
  // The sampled law is truncated at the reachable-region edge. Scanning from
  // the negative side (high x) toward the positive side, the first sample
  // marks that cutoff — anchor the bin grid on it, so the edge falls exactly
  // on a bin boundary instead of mid-bin (which smears the shoulder and makes
  // the histogram look shifted against the true density).
  let edge = -Infinity
  for (const v of values) {
    if (v > edge) edge = v
  }
  if (edge > hi) edge = hi
  const nDown = Math.max(1, Math.ceil((edge - lo) / w))
  const counts = new Float64Array(nDown)
  let inside = 0
  for (const v of values) {
    const b = Math.floor((edge - v) / w)
    if (b >= 0 && b < nDown) {
      counts[b] += 1
      inside += 1
    }
  }
  const bins = []
  for (let b = 0; b < nDown; b++) {
    bins.push({ x0: edge - (b + 1) * w, x1: edge - b * w, density: inside > 0 ? counts[b] / (inside * w) : 0 })
  }
  return bins
}

// ---- Paper figure palette (schema.py / schema_1d_density_simulated.py) ----

export const PALETTE = {
  source: '#4969E2',
  sampling: '#4969E2',
  traj: '#3250BC',
  samplingDark: '#253A88',
  trajMarkerFill: '#2E4FAF',
  trajMarkerEdge: '#D7F1FF',
  buffer: '#9A9A9A',
  bufferDark: '#666666',
  bufferBg: '#E8E8E3',
  negative: '#E34A92',
  negativeDark: '#9D2D64',
  sampleHist: '#56B4E9',
  ink: '#202124',
  grid: '#D6DAE3',
  panel: '#FBFCFF',
  panelBorder: '#D6DDF3',
  textMuted: '#536073',
}

// ---- Backward tracing (physical picture) -----------------------------------

// Twin-negative gallery setup: one broad positive mode, negative mass on both
// flanks — the signed target develops TWO negative regions.
export const TWIN = {
  plus: [{ w: 1.0, mu: 0.0, vr: 0.55 }],
  minus: [
    { w: 0.5, mu: -1.7, vr: 0.3 },
    { w: 0.5, mu: 1.7, vr: 0.3 },
  ],
  alpha: 0.8,
  domain: [-3.6, 3.6],
}

// Integrate the Signed RF ODE BACKWARD from (x1, tStart~1) toward t=0.
// Honest dynamics: adaptive displacement-capped RK4 on the exact velocity.
// A trajectory either reaches t~0 (fate 'source') or runs into the moving
// zero set, detected by near-perfect cancellation of the two branches:
// |pi^sign| / ((1+a)pi^+ + a pi^-) below tol (fate 'annihilated').
export function simulateBackward(x1, alpha, setup, opts = {}) {
  const tStart = opts.tStart ?? 0.999
  const tEnd = opts.tEnd ?? 0.001
  const dtMax = opts.dtMax ?? 0.001
  const maxDisp = opts.maxDisp ?? 0.014
  const tol = opts.tol ?? 5e-3
  const maxIter = opts.maxIter ?? 40000
  let t = tStart
  let x = x1
  const ts = [t]
  const xs = [x]
  const d0 = signedDensity(x, t, alpha, setup)
  const charge = d0 >= 0 ? 1 : -1
  let fate = 'source'
  for (let i = 0; i < maxIter && t > tEnd; i++) {
    const v = signedVelocity(x, t, alpha, setup)
    const av = Math.max(Math.abs(v), 1e-10)
    let step = av * dtMax <= maxDisp ? dtMax : maxDisp / av
    step = Math.min(Math.max(step, 1e-9), t - tEnd)
    const k1 = v
    const k2 = signedVelocity(x - 0.5 * step * k1, Math.max(t - 0.5 * step, tEnd), alpha, setup)
    const k3 = signedVelocity(x - 0.5 * step * k2, Math.max(t - 0.5 * step, tEnd), alpha, setup)
    const k4 = signedVelocity(x - step * k3, Math.max(t - step, tEnd), alpha, setup)
    x -= (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    t -= step
    ts.push(t)
    xs.push(x)
    const d = signedDensity(x, t, alpha, setup)
    const total = (1 + alpha) * branchPdf(x, t, setup.plus) + alpha * branchPdf(x, t, setup.minus)
    if ((d >= 0 ? 1 : -1) !== charge || Math.abs(d) / Math.max(total, 1e-300) < tol) {
      fate = 'annihilated'
      break
    }
  }
  return { ts, xs, fate, charge }
}
