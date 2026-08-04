---
theme: scholarly
title: Signed Rectified Flow
titleTemplate: '%s — Negativity-Controlled Generation'
info: |
  Interactive slides for Signed Rectified Flow — extending rectified flow to
  signed targets that promote one distribution while provably excluding another.
favicon: 'https://rectifiedflow.github.io/Signed-RF/favicon.png'
seoMeta:
  ogTitle: Signed Rectified Flow — Negativity-Controlled Generation
  ogDescription: Interactive slides. Extend rectified flow to the signed target (1+α)π⁺ − απ⁻ — a provable exclusion barrier around negative regions, and a practical adaptive guidance rule.
  ogImage: https://rectifiedflow.github.io/Signed-RF/og-image.png
  ogUrl: https://rectifiedflow.github.io/Signed-RF/
  twitterCard: summary_large_image
  twitterTitle: Signed Rectified Flow — Negativity-Controlled Generation
  twitterDescription: Extend rectified flow to signed targets — exclusion barriers, ghost regions, and adaptive guidance, with live closed-form demos.
  twitterImage: https://rectifiedflow.github.io/Signed-RF/og-image.png
footerMiddle: Signed Rectified Flow
aspectRatio: 4/3
colorSchema: light
lang: en
fontsize:
  body: 1.07rem
  h1: 2.2rem
themeConfig:
  colorTheme: classic-blue
  fontTheme: contemporary
  colorMode: light
  outlineToc: true
  outlineTocOpen: false
---

# Signed Rectified Flow

Negativity-Controlled Generation

---

# Causalization by $L^2$ Fitting

<MarginalPreservationDemo :height="285" :show-marginals="false" autoplay />

- Couple $X_0\sim\pi_0$ and $X_1\sim\pi_1$, then interpolate
  $X_t=(1-t)X_0+tX_1$.

- **Causalize** the interpolation by fitting the velocity field that minimizes

$$
\int_0^1
\mathbb{E}_{(X_0,X_1)}
\left[
  \left\|\dot X_t-v_t(X_t)\right\|^2
\right]\mathrm dt,
\qquad
\dot X_t=X_1-X_0.
$$

The minimizer is $v_t^{\mathrm{RF}}(x)=\mathbb{E}\!\left[X_1-X_0\mid X_t=x\right]$,
which defines the causal ODE $\dot Z_t=v_t^{\mathrm{RF}}(Z_t)$.

---

# Marginal Preservation

<MarginalPreservationDemo :height="455" autoplay />

- **Causalization preserves every marginal**:

$$
\{Z_t\}=\mathtt{Rectify}\{X_t\}
\quad\Longrightarrow\quad
\operatorname{Law}(Z_t)=\operatorname{Law}(X_t),
\qquad t\in[0,1].
$$

---

# Training Objective

<div class="h-40"></div>

In practice, the optimal velocity is approximated by a neural network $v_t^\theta$ trained with

$$
\mathcal{L}(\theta)
 =
\int_0^1
\mathbb{E}
\left[
  \left\|
    v_t^\theta(X_t) - (X_1-X_0)
  \right\|^2
\right]
\mathrm{d}t.
$$

One network, one regression — the baseline everything that follows builds on.

---

# Convex Mixture Target

<ConvexMixture1D :height="355" autoplay />

- **Convex setting**: draw the target $X_1$ from a branch lottery, then run the usual RF construction.

$$
\pi_1^{\mathtt{mix}}
  =
  (1-\omega)\pi_1^+ + \omega\pi_1^-,
  \qquad \omega\in[0,1].
$$

Still an ordinary probability target — no sign in sight yet.

---

# RF Velocity Under a Mixture Target

<div class="h-4"></div>

From $X_t=(1-t)X_0+tX_1$,

$$
v_t^{\mathrm{RF}}(x)
=\mathbb{E}\!\left[X_1-X_0\mid X_t=x\right]
=\mathbb{E}\!\left[\frac{X_1-X_t}{1-t}\,\middle|\,X_t=x\right].
$$

Define the source coefficient $w_t(X_1,x)\coloneqq\pi_0\!\left((x-tX_1)/(1-t)\right)$.

Then

$$
v_t^{\mathrm{RF}}(x)
=
\frac{\mathbb{E}_{\pi_1}\!\left[w_t(X_1,x)\,(X_1-x)/(1-t)\right]}
     {\mathbb{E}_{\pi_1}\!\left[w_t(X_1,x)\right]}.
$$

For a mixture $\pi_1^{\mathtt{mix}}=(1-\omega)\pi_1^+ + \omega\pi_1^-$,

$$
v_t^{\mathtt{mix}}(x)
=
\frac{
(1-\omega)\,\mathbb{E}_{\pi_1^+}\!\left[w_t\,(X_1-x)/(1-t)\right]
+\omega\,\mathbb{E}_{\pi_1^-}\!\left[w_t\,(X_1-x)/(1-t)\right]
}{
(1-\omega)\,\mathbb{E}_{\pi_1^+}\!\left[w_t\right]
+\omega\,\mathbb{E}_{\pi_1^-}\!\left[w_t\right]
}.
$$


Let $(\pi_t^\pm,v_t^\pm)$ denote the RF marginal and velocity induced by $\pi_1^\pm$. Since $\mathbb{E}_{\pi_1^\pm}[w_t]=(1-t)^d\pi_t^\pm(x)$,

$$
v_t^{\mathtt{mix}}(x)
=
\frac{(1-\omega)\pi_t^+(x)v_t^+(x)+\omega\pi_t^-(x)v_t^-(x)}
     {(1-\omega)\pi_t^+(x)+\omega\pi_t^-(x)}.
$$

---

# Pool Two RF Populations

<div class="h-12"></div>

Imagine a large batch of particles:

- a fraction $1-\omega$ follows the $+$ branch;
- a fraction $\omega$ follows the $-$ branch.

At time $t$, the two groups have histograms $\pi_t^+$ and $\pi_t^-$. Pooling them gives

$$
\pi_t^{\mathtt{mix}}
=
(1-\omega)\pi_t^+ + \omega\pi_t^-.
$$

The velocity from the previous slide is exactly their **local mass-weighted average**: where more $+$ particles are present it is closer to $v_t^+$, and where more $-$ particles are present it is closer to $v_t^-$.

So one ODE driven by $v_t^{\mathtt{mix}}$ moves the pooled cloud exactly as the two groups move together:

$$
Z_0\sim\pi_0
\quad\Longrightarrow\quad
Z_t\sim\pi_t^{\mathtt{mix}},
\qquad
Z_1\sim\pi_1^{\mathtt{mix}}.
$$

For $\omega\in[0,1]$, this is an ordinary probability flow. What changes when $\omega<0$?

---
layout: intro
---

# Signed Mixtures

Take the same RF formula, but extrapolate beyond convexity.

---

# The Signed Target

<RfSignedEquation :height="320" autoplay />

Set $\omega=-\alpha$ with $\alpha>0$. The terminal target becomes

$$
\pi_1^{\mathtt{sign}}(x)
 \coloneqq
 (1+\alpha)\,\pi_1^+(x)
 -
 \alpha\,\pi_1^-(x).
$$

Unit total mass — but it need not be nonnegative.

---

# The Signed RF Velocity

<div class="h-10"></div>

Everything is linear in the target. Set $\omega=-\alpha$: the marginal stays signed,
$\pi_t^{\mathtt{sign}} = (1+\alpha)\,\pi_t^+ - \alpha\,\pi_t^-$ for every $t\in[0,1]$,
and the mixture velocity becomes **the signed flux over the signed density**:

$$
v_t^{\mathtt{signRF}}(x)
 =
 \frac{
   (1+\alpha)\,\pi_t^+(x)\,v_t^+(x)
   -
   \alpha\,\pi_t^-(x)\,v_t^-(x)
 }{
   \underbrace{(1+\alpha)\,\pi_t^+(x)
   -
   \alpha\,\pi_t^-(x)}_{\textstyle \pi_t^{\mathtt{sign}}(x)}
 }.
$$

- Well defined away from the **zero set** $\Omega_t^0 \coloneqq \{x:\pi_t^{\mathtt{sign}}(x)=0\}$ — singular on it.
- Sample with the source-initialized ODE $\dot Z_t = v_t^{\mathtt{signRF}}(Z_t)$, $Z_0\sim\pi_0$, and write
  $\pi_t^{\mathtt{signRF}}$ for the law of $Z_t$ — a safe start, since $\pi_0^{\mathtt{sign}}=(1+\alpha)\,\pi_0-\alpha\,\pi_0=\pi_0>0$.

---
layout: intro
---

# What Does It Sample?

The signed density is not itself a probability law, but the ODE trajectory law is.

---

# Just Run It

<RfSigned1D mode="simulate" :height="440" autoplay />

<div class="mt-2"></div>

Simulate $\dot Z_t = v_t^{\mathtt{signRF}}(Z_t)$ from $Z_0\sim\pi_0$ — just trajectories and their **empirical density**,
shown against the two ingredients $\pi_1^+$ and $\pi_1^-$ (dashed).

---

# Overlay the Signed Marginal

<RfSigned1D mode="overlay" :height="440" autoplay />

<div class="mt-2"></div>

- The magenta curve is the **zero set** $\Omega_t^0$ — trajectories approach it, then bend away.
- Wherever samples land, the histogram matches $\pi_t^{\mathtt{sign}}$ **exactly**; where it is negative, nothing lands.

---

# Always the Positive Side

<RfSignedGallery :height="430" />

<div class="mt-2"></div>

Different branches, different $\alpha$ — one rule: source-initialized trajectories stay in the
positive region $\Omega_t^+ \coloneqq \{\pi_t^{\mathtt{sign}}>0\}$ and never enter the negative region
$\Omega_t^- \coloneqq \{\pi_t^{\mathtt{sign}}<0\}$.

---

# The Working Example

<RfSigned1D mode="overlay" world="density" :height="440" autoplay />

<div class="mt-2"></div>

From here on, one world — the paper's setting: a three-mode $\pi_1^+$ with $\pi_1^-$ sitting in the middle.
Trajectories fork around the negative wedge, and the histogram still matches $\pi_t^{\mathtt{sign}}$ on both sides.

<div class="mt-2 text-center" style="font-size: 0.85em; opacity: 0.7;">

Explore live: <a href="./playground/1d.html" target="_blank">**1D playground ↗**</a>

</div>

---

# Why? Trace the Dynamics Backward

<ChargedParticles1D mode="uniform" :height="430" autoplay />

<div class="mt-2"></div>

Place particles uniformly on the terminal line and integrate the same ODE **backward**.
Two fates: some reach $t=0$, collectively recovering the source $\pi_0$;
the rest run into the **moving zero set** $\Omega_t^0$ and stop there, meeting in pairs.

---

# The Physical Picture: Charged Particles

<RfPairEmission :height="430" autoplay />

<div class="mt-2"></div>

- **Reachable particles** — transported from $\pi_0$ by the flow: exactly the Signed RF samples.
- **Ghost $+$ and negative $-$ particles** — the boundary $\Omega_t^0$ *creates* $\pm$ pairs that fly forward —
  **dark particles**, invisible to the source-initialized sampler. Run backward, they annihilate in pairs where they were born.

---

# Two Objects, One Flow

<div class="h-28"></div>

By construction, the trajectory law $\pi_t^{\mathtt{signRF}}$ is a **valid probability distribution**.

The signed marginal $\pi_t^{\mathtt{sign}}$ has unit total mass — but **may take negative values**.

Once negative regions emerge, the two can no longer coincide globally.

<div class="mt-6"></div>

> Which part of the signed marginal is realized by the source-initialized flow?

---

# Where the Trajectories Go

<RegionDecomposition :height="300" />

- **Stay positive**: trajectories remain in $\Omega_t^+$, never entering $\Omega_t^-$ — but they occupy only a subset,
  the **reachable region** $\Omega_t^r \coloneqq \operatorname{supp}(\pi_t^{\mathtt{signRF}})$.
- **Rectification**: on $\Omega_t^r$, the sampled density coincides *exactly* with the signed marginal:

$$
\pi_t^{\mathtt{signRF}}(x)
 =
 \pi_t^{\mathtt{sign}}(x)\,\mathbf{1}\{x\in\Omega_t^r\}.
$$

---

# The Ghost Region

<div class="h-24"></div>

The unreached part of the positive region is the **ghost region**:
$\;\Omega_t^g \coloneqq \Omega_t^+ \setminus \Omega_t^r$.

Both $\pi_t^{\mathtt{signRF}}$ and $\pi_t^{\mathtt{sign}}$ carry unit total mass, so

$$
\int_{\Omega_t^r} \pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x = 1
\qquad\Longrightarrow\qquad
\int_{\Omega_t^g} \pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x
+
\int_{\Omega_t^-} \pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x
= 0.
$$

The positive mass stranded in the ghost region **exactly balances** the negative mass excluded from the sampling law.

---

# Rectify, Literally

<div class="h-24"></div>

Signed RF *rectifies* the signed marginal into a valid probability law:
keep $\pi_t^{\mathtt{sign}}$ on the reachable region, zero elsewhere.

This is one of the **total-variation-optimal** nonnegative approximations:

$$
\pi_t^{\mathtt{signRF}}
\;\in\;
\arg\min_{\rho\in\mathcal P}\;
\mathrm{TV}\!\left(\rho,\;\pi_t^{\mathtt{sign}}\right).
$$

- The location of $\Omega_t^r$ is determined **implicitly by the dynamics** — it lies inside the positive
  region, separated from $\Omega_t^-$ by the ghost region.

---

# Why the Density Matches

<div class="h-12"></div>

Each branch obeys its continuity equation, $\;\partial_t\pi_t^\pm + \nabla\!\cdot(\pi_t^\pm v_t^\pm)=0$.
Taking the signed combination,

$$
\partial_t\pi_t^{\mathtt{sign}}
+
\nabla\!\cdot\!\left(\pi_t^{\mathtt{sign}}\,v_t^{\mathtt{signRF}}\right)
=0.
$$

So $\pi_t^{\mathtt{sign}}$ is a **signed** solution of the continuity equation driven by $v_t^{\mathtt{signRF}}$ — but that alone does not make it the law of $Z_t$.

Now restrict it to the reachable region: $\;\bar\pi_t(x) \coloneqq \pi_t^{\mathtt{sign}}(x)\,\mathbf 1\{x\in\Omega_t^r\}$.

- $\Omega_t^r$ is transported by the same flow — its moving boundary carries **no additional flux**.
- Hence $\bar\pi_t$ satisfies the same continuity equation *and* is a valid probability density.
- Under standard regularity, it must coincide with the law of the ODE: $\;\pi_t^{\mathtt{signRF}} = \bar\pi_t$.

---

# Guarantees

<div class="h-8"></div>

**Nonpenetration** *(Prop.)* — under regularity and a nondegenerate zero set,
source-initialized trajectories never reach $\Omega_t^0$: for every $t<1$,

$$
\pi_t^{\mathtt{signRF}}\!\left(\Omega_t^+\right) = 1.
$$

The mechanism is a Gaussian-source identity: on the zero set, the signed flux points strictly toward the positive side,

$$
\jmath_t^{\mathtt{sign}}
 \coloneqq
 (1+\alpha)\,\pi_t^+ v_t^+ - \alpha\,\pi_t^- v_t^-,
\qquad
\bigl(\nabla\pi_t^{\mathtt{sign}}\bigr)^{\!\top} \jmath_t^{\mathtt{sign}}
 =
 \frac{1-t}{t}\,\bigl\|\nabla\pi_t^{\mathtt{sign}}\bigr\|^2 \;>\; 0.
$$

**Sampling law** *(Thm.)* — signed mass is conserved along the flow map, giving

$$
\pi_t^{\mathtt{signRF}}(x)
 =
 \pi_t^{\mathtt{sign}}(x)\,\mathbf{1}\{x\in\Omega_t^r\},
\qquad
\int_{\Omega_t^r}\pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x = 1.
$$

---
layout: intro
---

# Practical Form

The signed velocity becomes an adaptive guidance rule.

---

# Guidance Form

<div class="h-20"></div>

Define the density ratio and the guidance direction

$$
r_t(x) \coloneqq \frac{\pi_t^-(x)}{\pi_t^+(x)},
\qquad
\Delta v_t(x) \coloneqq v_t^+(x) - v_t^-(x).
$$

Wherever $\pi_t^{\mathtt{sign}}(x)\neq 0$, the Signed RF velocity acts as guidance with a **state-dependent scale**:

$$
v_t^{\mathtt{signRF}}(x)
 =
 v_t^+(x)
 +
 \lambda_t^{\alpha}(x)\,\Delta v_t(x),
\qquad
\lambda_t^{\alpha}(x)
 =
 \frac{\alpha\, r_t(x)}{(1+\alpha) - \alpha\, r_t(x)}.
$$

Two ingredients: the branch velocities $v_t^{\pm}$ and the density ratio $r_t(x)$.

---

# An Adaptive Scale, Not a Schedule

<AdaptiveScaleCurve :height="340" autoplay />

- $r_t(x)$ small — the state looks positive — guidance nearly vanishes
- $r_t(x)$ large — the state leans negative — repulsion grows without bound
- The pole $(1+\alpha)-\alpha\, r_t(x)=0$ **is** the signed boundary $\pi_t^{\mathtt{sign}}(x)=0$

---

# Constant vs Signed, in 2D

<div class="flex justify-center mt-2">
  <BaseImg src="figures/gaussian_mixture_guidance_sweep_vec.svg" class="rounded shadow-sm" style="max-width: 92%; max-height: 430px; object-fit: contain;" />
</div>

<div class="mt-2 text-center" style="font-size: 0.82em; opacity: 0.75;">

Background: signed target $\pi^{\mathtt{sign}}$ — blue positive, pink negative. Dots: samples; red ×'s mark samples landing where $\pi^{\mathtt{sign}}<0$.

</div>

<div class="mt-2"></div>

- Constant guidance: weak $\omega$ leaves samples near negative modes; strong $\omega$ over-repels into low-density regions.
- Signed RF avoids the negative modes **while keeping the positive modes and coverage**.

<div class="mt-3 text-center" style="font-size: 0.85em; opacity: 0.7;">

Explore live: <a href="./playground/2d.html" target="_blank">**2D playground ↗**</a>

</div>

---

# Estimating the Ratio I: a Classifier

<div class="h-16"></div>

Train a binary classifier $p_t^{\phi}(y\mid x_t)$ on **balanced** noisy states
$x_t^+\sim\pi_t^+$ and $x_t^-\sim\pi_t^-$ (both from the standard RF interpolation), with binary cross-entropy:

$$
\mathcal{L}(\phi)
 =
 -\mathbb{E}_{x_t^+ \sim \pi_t^+}\!\left[\log p_t^\phi(y=+\mid x_t^+)\right]
 -\mathbb{E}_{x_t^- \sim \pi_t^-}\!\left[\log p_t^\phi(y=-\mid x_t^-)\right].
$$

Under balanced sampling, the Bayes-optimal classifier turns **odds into the ratio**:

$$
\frac{p_t^{*}(y=-\mid x)}{p_t^{*}(y=+\mid x)}
 =
 \frac{\pi_t^-(x)}{\pi_t^+(x)}
 =
 r_t(x).
$$

One auxiliary network, evaluated once per sampling step.

---

# Estimating the Ratio II: Online Tracking

<div class="h-16"></div>

No auxiliary model: track $u_t \coloneqq \log r_t(Z_t)$ **along each trajectory**, from $u_0 = 0$:

$$
\dot u_t
 =
 \nabla\!\cdot\Delta v_t(Z_t)
 +
 \Delta v_t(Z_t)^{\!\top} s_t^-(Z_t)
 +
 \lambda_t^{\alpha}(Z_t)\,\Delta v_t(Z_t)^{\!\top}\bigl(s_t^-(Z_t)-s_t^+(Z_t)\bigr),
$$

where $s_t^{\pm}=\nabla\log\pi_t^{\pm}$ are the branch scores.

- Scores come for free from the velocities (Gaussian source, Tweedie): $\;s_t^{\pm}(x) = \dfrac{t\,v_t^{\pm}(x)-x}{1-t}$.
- The divergence term is computed exactly when tractable, else with Hutchinson's trace estimator.
- Integrate jointly with the Signed RF ODE; recover $r_t(Z_t)=\exp(u_t)$ along the way.

---

# Stabilization

<div class="h-36"></div>

The singular denominator is meaningful mathematics — finite Euler steps are not.

$$
(1+\alpha)-\alpha\,r_t(Z_t)
\;\;\leadsto\;\;
\max\bigl((1+\alpha)-\alpha\,r_t(Z_t),\;\varepsilon\bigr),
\qquad
\lambda_t^{\alpha} \;\le\; \lambda_{\max}.
$$

A simple practical modification, empirically robust to moderate choices of the cap $\lambda_{\max}$.

---

# What It Does in Practice

<div class="h-10"></div>

| Setting | Negative branch $\pi^-$ | Result |
|---|---|---|
| **PointMaze planning** | wall interiors (missing negatives) | removes wall crossings, keeps path diversity |
| **ImageNet-256 CFG** | unconditional branch | FID 2.38 → **1.82** at 16 NFE, higher recall |
| **Anti-memorization** | training set (analytic flow) | ≈ SPELL-50 protection at FID **2.03** vs 7.41 |
| **Nudity prevention** | unsafe LoRA branch (SD 3.5-M) | ASR 15.19% → **6.33%**, CLIP/AES preserved |
| **Concept&nbsp;suppression** | negative prompt branch (Z-Image) | removes identity, keeps pose & composition |

<div class="mt-4"></div>

One framework — the negative branch is whatever you must avoid: a region, a dataset, a concept.

---

# KL-Regularized Flow RL Is Exponential Tilting

<div class="h-10"></div>

For a frozen base endpoint $\pi_{\mathrm{base}}$, Flow RL solves

$$
\max_{\pi}\;
\mathbb E_{X_1\sim\pi}[r(X_1)]
-
\beta\,\mathrm{KL}\!\left(\pi\,\middle\|\,\pi_{\mathrm{base}}\right).
$$

Its closed-form target is

$$
\pi^\star(x_1)
=
\frac{
\pi_{\mathrm{base}}(x_1)\exp\!\left(r(x_1)/\beta\right)
}{
\mathbb E_{\pi_{\mathrm{base}}}\!\left[\exp\!\left(r(X_1)/\beta\right)\right]
}.
$$

Flow RL is therefore distribution matching toward a **positive exponential tilt** of the base endpoint.

---

# The Tilt Is an Exact Weighted RF Loss

For this exponential tilt, use the terminal weight

$$
w_R(X_1)\coloneqq \exp\!\left(r(X_1)/\beta\right)>0.
$$

Draw $X_1\sim\pi_{\mathrm{base}}$, $X_0\sim\pi_0$, and set
$X_t=(1-t)X_0+tX_1$, $\Delta X\coloneqq X_1-X_0$. Then train with

$$
\mathcal L_{w_R}(\theta)
=
\mathbb E\!\left[
w_R(X_1)
\left\|v_t^\theta(X_t)-\Delta X\right\|^2
\right].
$$

Because $w_R$ depends only on $X_1$, it leaves the source marginal unchanged and replaces the endpoint by

$$
\pi^{w_R}(x_1)
=
\frac{w_R(x_1)\pi_{\mathrm{base}}(x_1)}
{\mathbb E_{\pi_{\mathrm{base}}}[w_R(X_1)]}
=
\pi^\star(x_1).
$$

At the population optimum, one positive weighted RF loss learns the exact Flow-RL tilt.

---

# Generalize the Terminal Weight

<div class="h-4"></div>

The population construction depends only on the terminal weight. Let $w(X_1)$ be real-valued with

$$
Z_w\coloneqq\mathbb E_{\pi_{\mathrm{base}}}[w(X_1)]>0,
\qquad
\pi_1^w(x_1)\coloneqq
\frac{w(x_1)\pi_{\mathrm{base}}(x_1)}{Z_w}.
$$

The corresponding RF field is

$$
v_t^w(x)
=
\frac{
\mathbb E\!\left[w(X_1)(X_1-X_0)\mid X_t=x\right]
}{
\mathbb E\!\left[w(X_1)\mid X_t=x\right]
},
$$

wherever the denominator is nonzero.

- If $w\ge 0$, this is an ordinary probability tilt.
- If $w$ changes sign, $\pi_1^w$ is a signed endpoint and the same ratio is exactly the **Signed RF field**, now written with one terminal weight.

---

# Negative Weights Need Two Regressions

**What fails is the training objective, not the signed target.** At fixed $(x,t)$, the quadratic coefficient of the direct weighted MSE is

$$
m_t^\star(x)\coloneqq\mathbb E\!\left[w(X_1)\mid X_t=x\right].
$$

Where $m_t^\star(x)<0$, that objective is **unbounded below**. Instead, regress the numerator and denominator with two ordinary MSEs:

$$
\begin{aligned}
\mathcal L_g
&=\mathbb E\!\left[\left\|g_t(X_t)-w(X_1)(X_1-X_0)\right\|^2\right],\\[2pt]
\mathcal L_m
&=\mathbb E\!\left[\left(m_t(X_t)-w(X_1)\right)^2\right].
\end{aligned}
$$

At the population optimum,

$$
g_t^\star(x)=\mathbb E\!\left[w(X_1)(X_1-X_0)\mid X_t=x\right],
\qquad
m_t^\star(x)=\mathbb E\!\left[w(X_1)\mid X_t=x\right],
\qquad
v_t^w(x)=\frac{g_t^\star(x)}{m_t^\star(x)}.
$$

This is Signed RF in trainable loss form: two nonnegative regressions followed by a ratio. The field remains singular where $m_t^\star=0$.

---

# Why Use a Signed Reward Weight?

<div class="h-4"></div>

The terminal weight is a design choice. For example, choose

$$
w(x_1)=f\!\left(r(x_1)\right),
\qquad
Z_w=\mathbb E_{\pi_{\mathrm{base}}}[w(X_1)]>0,
$$

Choose $f$ to cross zero at the desired reward threshold; for example, map negative reward to negative weight:

$$
r(x_1)<0
\quad\Longrightarrow\quad
w(x_1)=f\!\left(r(x_1)\right)<0.
$$

Then $\pi_1^w(x_1)=w(x_1)\pi_{\mathrm{base}}(x_1)/Z_w$ is negative on
$\mathcal N_w\coloneqq\{x_1:w(x_1)<0\}$. Under the same assumptions as the Signed RF guarantee,

$$
\mathbb P\!\left(Z_1\in\mathcal N_w\right)=0.
$$

- Different choices of $f$ encode different reward-based exclusion regions.
- The exponential Flow-RL weight $e^{r/\beta}$ is strictly positive, so it can only downweight low- or negative-reward regions; a signed weight can make them theoretically unsampled.

<div class="mt-3 text-center" style="font-size: 0.78em; opacity: 0.68;">
The guarantee follows the sign of $w$: avoiding a negative-reward region requires mapping that region to negative weight.
</div>

---

# Core Message

<div class="h-16"></div>

Signed RF turns negative information into **distributional semantics**.

- **One extrapolation** — the same RF formula, applied to the signed target $(1+\alpha)\,\pi^+ - \alpha\,\pi^-$
- **A valid sampler** — the signed density is preserved on the reachable region, zero elsewhere
- **Exclusion built in** — the zero set is a repulsive barrier; ghost mass balances negative mass
- **A practical rule** — guidance with state-dependent scale $\lambda_t^{\alpha}(x)$, driven by the ratio $r_t(x)$
- **Two estimators** — a ratio classifier or online tracking along the trajectory
