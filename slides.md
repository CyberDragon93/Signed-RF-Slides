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

<div class="title-author">Qiang Liu</div>

<style>
.title-author {
  margin-top: 2rem;
  color: #3156b3;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}
</style>

---
clicks: 2
---

# Rectified Flow in a Nutshell

<div class="rf-nutshell-grid">
<div class="rf-nutshell-copy">

<div class="rf-nutshell-stage rf-nutshell-intro">

- **Coupling:** Sample from a noise–data pair $(X_0,X_1)$.

- **Interpolation:** Construct interpolation:

  $$
  X_t=tX_1+(1-t)X_0.
  $$

</div>

<div v-if="$clicks >= 1" class="rf-nutshell-stage rf-nutshell-causalization">

- **Causalization:** Convert interpolation to a causal process:

  $$
  \dot Z_t=v_t(Z_t)
  $$

  by minimizing:

  $$
  \min_v\int_0^1
  \mathbb E_{(X_0,X_1)}
  \!\left[\left\|{\color{#274bdb}\dot X_t}-v_t(X_t)\right\|^2\right]\,\mathrm dt,
  $$

  where $\color{#274bdb}{\dot X_t=X_1-X_0}$ are the line directions.

</div>

<div v-if="$clicks >= 2" class="rf-nutshell-stage rf-nutshell-reflow">

- **Reflow:** Simulate ODE $\dot Z_t=v_t(Z_t)$ to obtain new couplings $(Z_0,Z_1)$. <span class="rf-nutshell-repeat">**Repeat.**</span>

</div>

</div>

<div class="rf-nutshell-visuals">
  <div class="rf-nutshell-visual-slot">
    <RfNutshellAnimation
      sequence="nutshell-interpolation"
      alt="Animated interpolation coupling between noise and data distributions"
    />
  </div>
  <div class="rf-nutshell-visual-slot">
    <RfNutshellAnimation
      v-if="$clicks >= 1"
      sequence="nutshell-rf1"
      alt="Animated causalized trajectories between the marginals"
    />
  </div>
  <div class="rf-nutshell-visual-slot">
    <RfNutshellAnimation
      v-if="$clicks >= 2"
      sequence="nutshell-rf2"
      alt="Animated straighter trajectories after reflow"
    />
  </div>
  <BaseImg
    v-if="$clicks < 2"
    src="figures/cmu/rf-nutshell-interpolation-cartoon.png"
    alt="Interpolation transition cartoon"
    class="rf-nutshell-cartoon rf-nutshell-cartoon-interpolation"
  />
  <BaseImg
    v-if="$clicks === 1"
    src="figures/cmu/rf-nutshell-flow-cartoon.png"
    alt="Causal flow transition cartoon"
    class="rf-nutshell-cartoon rf-nutshell-cartoon-flow"
  />
</div>
</div>

<style>
.rf-nutshell-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.92fr) minmax(230px, 0.76fr);
  gap: 1rem;
  align-items: start;
  margin-top: 0.1rem;
}
.rf-nutshell-copy {
  position: relative;
  height: 520px;
  font-size: 1.07rem;
  line-height: 1.18;
}
.rf-nutshell-stage {
  position: absolute;
  left: 0;
  right: 0;
}
.rf-nutshell-intro {
  top: 0;
}
.rf-nutshell-causalization {
  top: 139px;
}
.rf-nutshell-reflow {
  top: 430px;
}
.rf-nutshell-copy .katex-display {
  margin: 0.08rem 0;
  font-size: 0.88em;
}
.rf-nutshell-causalization .katex-display:nth-of-type(2) {
  font-size: 0.78em;
}
.rf-nutshell-repeat {
  color: #274bdb;
}
.rf-nutshell-visuals {
  position: relative;
  display: grid;
  grid-template-rows: repeat(3, 144px);
  gap: 24px;
  align-content: start;
  height: 480px;
  margin-top: -0.2rem;
}
.rf-nutshell-visual-slot {
  position: relative;
  z-index: 1;
  min-height: 0;
}
.rf-nutshell-visual-slot .rf-nutshell-animation {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.rf-nutshell-cartoon {
  position: absolute;
  left: 50%;
  z-index: 3;
  display: block;
  width: 122px;
  height: auto;
  transform: translateX(-50%);
  filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.08));
}
.rf-nutshell-cartoon-interpolation {
  top: 132px;
}
.rf-nutshell-cartoon-flow {
  top: 300px;
}
</style>

<!--
[Sources]
- `rectified_flow_cmu_lecture_2026_slides/tex/flow_intro.tex`, frame “Rectified Flow in a Nutshell”
- Original CMU lecture assets: 20-frame interpolation, causalization, and reflow sequences at 5 fps, plus `interp_demo.png` and `flow_demo.png`
-->

---
class: rf-cartoon-redraw-slide
disabled: true
---

# Rectified Flow in a Nutshell — Vue Redraw

<div class="rf-cartoon-redraw-grid">
  <figure>
    <RfTransitionCartoon mode="coupling" :height="235" />
    <figcaption>
      <strong>Interpolation:</strong> a sampled coupling connects noise and data.
    </figcaption>
  </figure>
  <figure>
    <RfTransitionCartoon mode="flow" :height="235" />
    <figcaption>
      <strong>Causalization:</strong> the learned velocity defines a directed ODE flow.
    </figcaption>
  </figure>
</div>

<div class="rf-cartoon-redraw-takeaway">
  Same endpoint roles; a lighter palette and trajectory language shared with the interactive Vue figures.
</div>

<style>
.rf-cartoon-redraw-slide h1 {
  margin-bottom: 0.75rem;
}
.rf-cartoon-redraw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.3rem;
  align-items: start;
  width: 92%;
  margin: 0.65rem auto 0;
}
.rf-cartoon-redraw-grid figure {
  margin: 0;
  text-align: center;
}
.rf-cartoon-redraw-grid figcaption {
  max-width: 390px;
  margin: 0.18rem auto 0;
  color: #536073;
  font-size: 0.96rem;
  line-height: 1.2;
}
.rf-cartoon-redraw-grid figcaption strong {
  color: #253a88;
}
.rf-cartoon-redraw-takeaway {
  max-width: 780px;
  margin: 1.15rem auto 0;
  color: #303a49;
  font-size: 1.08rem;
  line-height: 1.2;
  text-align: center;
}
</style>

<!--
[Sources]
- Redrawn as Vue/SVG from the transition-cartoon roles in `rectified_flow_cmu_lecture_2026_slides/tex/flow_intro.tex`.
-->

---
class: rf-cmu-projection-slide
---

# From Interpolation to Generation

<div class="rf-projection-layout">

<div class="rf-cmu-copy rf-projection-copy">

- Rectified flow: Projecting the Interpolation Process $\{X_t\}$ to the ODE $\{Z_t\}$:

  $$
  \min_v\;\mathbb E_{(X_0,X_1,t)}
  \left[\left\|\dot X_t-v_t(X_t)\right\|^2\right]
  \quad\Longrightarrow\quad
  v^*_t(x)
  =\mathbb E\!\left[
    {\color{#f47c20}\dot X_t}
    \;\middle|\;
    {\color{#f47c20}X_t}=x
  \right].
  $$

    - The “mean field” velocity: Take the average direction whenever intersection happens.

</div>

<div class="rf-mean-field-figures">
  <BaseImg
    src="figures/cmu/rf-velocity-intersection.png"
    alt="Two crossing interpolation velocities and their mean direction"
  />
  <BaseImg
    src="figures/cmu/rf-intro-mean-velocity.png"
    alt="Many interpolation directions whose conditional average defines the local ODE velocity"
  />
</div>

</div>

<div class="projection-marginal-copy">

- $\{X_t\}$ and $\{Z_t\}$: different joint distributions, but the same time-wise marginals:

  $$
  \rho_t = \operatorname{Law}(X_t) = \operatorname{Law}(Z_t),
  $$

  where $\rho_t$ satisfies the **continuity equation**

  $$
  \dot \rho_t = -\nabla\!\cdot(v_t\rho_t).
  $$

</div>

<div class="projection-marginal-examples">
  <figure>
    <BaseImg
      src="figures/cmu/rf-rewire-close-up.png"
      alt="Velocity averaging at crossings rewires intersecting trajectories into a non-crossing ODE flow"
    />
    <figcaption>Velocity averaging rewires crossings</figcaption>
  </figure>
  <figure>
    <BaseImg
      src="figures/cmu/flow0.gif"
      alt="Animated interpolation trajectories with crossed pairings"
    />
    <figcaption>Interpolation coupling</figcaption>
  </figure>
  <figure>
    <BaseImg
      src="figures/cmu/flow1.gif"
      alt="Animated rewired ODE trajectories after velocity averaging"
    />
    <figcaption>ODE coupling — same marginals</figcaption>
  </figure>
</div>

<!--
[Sources]
- `rectified_flow_cmu_lecture_2026_slides/tex/two_point_flow.tex`, frames “From Interpolation to Generation,” “How Does Rewiring Actually Happen by Velocity Averaging?,” and “Marginal Preservation”
- Original CMU lecture assets: `figures_ppt/intro_mean_velocity.png`, `figures/rewire_close_up.png`, `videos/flow1/traj0.png`, and `videos/flow0/traj3.png`
- Intersection diagram rendered directly from the frame's original TikZ source
-->

---
class: rf-projection-redraw-slide
disabled: true
---

# From Interpolation to Generation — Vue Redraw

<RfProjectionRedraw :height="455" />

<div class="rf-projection-redraw-equation">

$v_t^*(x)=\mathbb E[\dot X_t\mid X_t=x]$
<span aria-hidden="true">⟹</span>
same time-wise marginals, non-crossing ODE trajectories.

</div>

<style>
.rf-projection-redraw-slide h1 {
  margin-bottom: 0.18rem;
}
.rf-projection-redraw-slide .projection-redraw-wrap {
  margin-top: -0.05rem;
}
.rf-projection-redraw-equation {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  margin-top: 0.2rem;
  color: #303a49;
  font-size: 1.02rem;
}
.rf-projection-redraw-equation .katex {
  color: #253a88;
}
</style>

<!--
[Sources]
- Redrawn as Vue/SVG from `rectified_flow_cmu_lecture_2026_slides/tex/two_point_flow.tex`, frames “From Interpolation to Generation,” “How Does Rewiring Actually Happen by Velocity Averaging?,” and “Marginal Preservation.”
-->

---
class: rf-cmu-rewiring-slide
disabled: true
---

# How Does Rewiring Actually Happen by Velocity Averaging?

<div class="rf-cmu-copy rf-rewiring-copy">

- How Does Averaging Velocity Lead to Trajectory Rewiring?

</div>

<!--
[Sources]
- `rectified_flow_cmu_lecture_2026_slides/tex/two_point_flow.tex`, frame “How Does Rewiring Actually Happen by Velocity Averaging?”
-->

---
class: marginal-preservation-slide
disabled: true
---

# Marginal Preservation

- **Interpolation Process** $\{X_t\}$ $\longrightarrow$ **ODE Process** $\{Z_t\}$

  $$
  \boldsymbol Z = \mathtt{Rectify}(\boldsymbol X).
  $$

- For a time-differentiable process $\{X_t\}$, its rectified flow $\{Z_t\}$ is the ODE process $
  \dot Z_t = v_t(Z_t)$, $Z_0 = X_0,$
  with

  $$
  v_t(x) = \mathbb E[\dot X_t \mid X_t=x].
  $$

<!--
[Sources]
- `rectified_flow_cmu_lecture_2026_slides/tex/two_point_flow.tex`, frame “Marginal Preservation”
-->

---

# Learning Preferences

- Today: Incorporate positive and negative preferences into generative models.

<PreferencePointPanels :height="365" />

<div class="preference-motivation-question">
  <strong>Applications:</strong> copyright protection, safety constraints, and anti-memorization.
</div>

<style>
.preference-motivation-question {
  max-width: 790px;
  margin: 0.05rem auto 0;
  color: #26334d;
  font-size: 1.26rem;
  line-height: 1.25;
  text-align: center;
}
</style>

<!--
[Sources]
- Signed Rectified Flow: Negativity-Controlled Generation, arXiv:2607.18516 — experiments on IP protection, nudity prevention, anti-memorization, and PointMaze navigation.
-->

---
class: exponential-tilting-slide
---

# Exponential Tilting

- A common preference mechanism reweights a base law $p_0$ by a score $f$:

  $$
  p_f(x)=\frac{p_0(x)e^{f(x)}}{Z_f},
  \qquad
  Z_f=\mathbb E_{X\sim p_0}\!\left[e^{f(X)}\right].
  $$

- Avoidance can be represented by assigning zero probability, $p_f(x)=0$.

    - It cannot represent degrees of avoidance beyond complete exclusion.
    - In learning settings, it is difficult to distinguish missing data from explicit avoidance.


- Computing or estimating $Z_f$ introduces additional optimization and learning overhead.

<style>
.exponential-tilting-slide > ul {
  max-width: 900px;
  margin: 0.85rem auto 0;
  padding-left: 1.6rem;
  color: #4b5568;
  font-size: 1.14rem;
  line-height: 1.28;
}

.exponential-tilting-slide > ul > li {
  margin-bottom: 1.4rem;
  padding-left: 0.35rem;
}

.exponential-tilting-slide > ul > li > ul {
  max-width: none;
  margin: 0.45rem 0 0;
  padding-left: 1.35rem;
  color: #6b7280;
  font-size: 0.92em;
  line-height: 1.3;
}

.exponential-tilting-slide > ul > li > ul > li {
  margin-bottom: 0.25rem;
  padding-left: 0.1rem;
}

.exponential-tilting-slide > ul > li strong {
  color: #26334d;
  font-size: 1.1em;
}

.exponential-tilting-slide > ul > li .katex-display {
  margin: 0.28rem 0 0.34rem;
  color: #26334d;
  font-size: 1.05em;
}

.exponential-tilting-slide > ul > li:first-child .katex-display {
  margin: 0.4rem 0 0.55rem;
  color: #243f91;
  font-size: 1.14em;
}
</style>

---

# Signed Measures

<div class="signed-measures-points">

- A signed density may take **negative values**.

- A value $\pi^{\mathtt{sign}}(x)<0$ indicates negative preference at $x$.

- We aim to sample from the **positive regions**, where $\pi^{\mathtt{sign}}(x)>0$.

- The negative magnitude measures avoidance: the positive density needed to offset it.

- A simple construction is the **signed mixture**:

  $$
  \pi^{\mathtt{sign}}(x)
  =
  (1+\alpha)\,\pi_1^+(x)
  -
  \alpha\,\pi_1^-(x),
  \qquad \alpha\ge 0.
  $$

</div>

<div class="signed-measures-visual">
  <div v-click class="signed-measures-question">
    How can we “sample” from a signed measure?
  </div>
  <RfSigned1D mode="target" :height="295" :autoplay="false" />
</div>

---
class: warmup-mixture-slide
---

# Warm up: Rectified Flow for standard mixtures.

- Assume the target distribution is a mixture:
$$
\pi_1^{\mathtt{mix}}
=
(1-\omega)\,\pi_1^+
+
\omega\,\pi_1^-,
\qquad 0\le \omega\le 1.
$$

- The mixture RF velocity field is determined by the components via

  $$
  {\color{#2f855a}v_t^{\mathtt{mix}}(x)}
  =
  \frac{
  (1-\omega)\,{\color{#3156b3}\pi_t^+(x)}\,{\color{#2f855a}v_t^+(x)}
  +
  \omega\,{\color{#3156b3}\pi_t^-}\,{\color{#2f855a}v_t^-(x)}
  }{
  (1-\omega)\,{\color{#3156b3}\pi_t^+(x)}
  +
  \omega\,{\color{#3156b3}\pi_t^-(x)}}
  $$

  - ${\color{#2f855a}v_t^\pm}$ are the RF velocity fields for rectified flows with targets ${\color{#3156b3}\pi_1^\pm}$.

  - ${\color{#3156b3}\pi_t^\pm}$ are the corresponding path marginals of $X_t^\pm = t X_1^\pm + (1-t) X_0$ at time $t$.



---
class: signed-mixture-rf-slide
---

# Rectified Flow for Signed Mixture

- Let us formally substitute ${\color{#c43d4d}\omega=-\alpha}$, even though it may not “make sense”:

  $$
  {\color{#c43d4d}\pi_1^{\mathtt{sign}}}
  =
  {\color{#c43d4d}(1+\alpha)}\,{\color{#3156b3}\pi_1^+}
  {\color{#c43d4d}-\alpha}\,{\color{#3156b3}\pi_1^-},
  \qquad {\color{#c43d4d}\alpha\ge 0}.
  $$

- The mixture RF velocity field is determined by the components via

  $$
  {\color{#2f855a}v_t^{{\color{#c43d4d}\mathtt{sign}}}(x)}
  =
  \frac{
  {\color{#c43d4d}(1+\alpha)}\,{\color{#3156b3}\pi_t^+(x)}\,{\color{#2f855a}v_t^+(x)}
  {\color{#c43d4d}-\alpha}\,{\color{#3156b3}\pi_t^-}\,{\color{#2f855a}v_t^-(x)}
  }{
  {\color{#c43d4d}(1+\alpha)}\,{\color{#3156b3}\pi_t^+(x)}
  {\color{#c43d4d}-\alpha}\,{\color{#3156b3}\pi_t^-(x)}}
  $$

  - ${\color{#2f855a}v_t^\pm}$ are the RF velocity fields for rectified flows with targets ${\color{#3156b3}\pi_1^\pm}$.

  - ${\color{#3156b3}\pi_t^\pm}$ are the corresponding path marginals of $X_t^\pm = t X_1^\pm + (1-t) X_0$ at time $t$.

<div aria-hidden="true" style="height: 1.5em;"></div>

- Regardless of theory, we get an  (singular) ODE.
- Physicists use such tricks a lot.
- Curious to run it anyway, and see what it gives?

---

# Signed Rectified Flow 

<BaseImg
  src="figures/paper/signed_density_evolution.svg"
  alt="Figure 2 showing signed-density evolution across time"
  style="display: block; width: 94%; margin: 0.1rem auto 0.3rem;"
/>

<RfSigned1D mode="overlay" world="density" :height="285" autoplay />

<div class="mt-1"></div>

- We obtain a **truncated distribution inside the positive support**. 
- Wherever samples land, **the histogram matches $\pi_t^{\mathtt{sign}}$ exactly**.


---
class: signed-barrier-slide
---

# The Zero Set Is a Singular Barrier

<RfSigned1D mode="overlay" world="density" :height="270" autoplay />

<div class="mt-1"></div>

- **Zero set.** The purple boundary marks where the signed density vanishes:

  $$
  {\color{#E34A92}{\Omega_t^0}}
  = \left\{x:\pi_t^{\mathtt{sign}}(x)=0\right\},
  \qquad
  \pi_t^{\mathtt{sign}}(x)
  = (1+\alpha)\pi_t^+(x)-\alpha\pi_t^-(x).
  $$

- **Singular wall.** The signed density is the velocity denominator, so $v_t^{\mathtt{signRF}}$ is singular on $\Omega_t^0$:

  $$
  v_t^{\mathtt{signRF}}(x)
  =
  \frac{
    (1+\alpha)\pi_t^+(x)v_t^+(x)-\alpha\pi_t^-(x)v_t^-(x)
  }{
    \underbrace{\pi_t^{\mathtt{sign}}(x)}_{\to 0\text{ on }\Omega_t^0}
  },
  $$

- **No crossing.** Since $\pi_0^{\mathtt{sign}}=\pi_0>0$, source trajectories start in $\Omega_0^+$; the repulsive singularity keeps them in $\Omega_t^+$ and out of $\Omega_t^-$.

<div style="position: absolute; top: 2.55rem; right: 3.2rem; font-size: 0.82em; opacity: 0.75;">

Explore live: <a href="./playground/1d.html" target="_blank">**1D playground ↗**</a>

</div>

<style>
.signed-barrier-slide h1 {
  margin-bottom: 0.12rem;
}
.signed-barrier-slide > ul {
  max-width: 920px;
  margin: 0.2rem auto 0;
  color: #465168;
  font-size: 1.02rem;
  line-height: 1.2;
}
.signed-barrier-slide > ul > li {
  margin-bottom: 0.34rem;
}
.signed-barrier-slide > ul > li strong {
  color: #26334d;
}
.signed-barrier-slide .katex-display {
  margin: 0.12rem 0 0.16rem;
  color: #243f91;
  font-size: 0.95em;
}
</style>

<!--
[Sources]
- `Signed_Rectified_Flow_Overleaf_Paper/contents/methods.tex`, paragraph “Rectified Flow for Signed Mixtures” and Eq. `eq:signed_rf_velocity`.
- `Signed_Rectified_Flow_Overleaf_Paper/contents/appendix_theory.tex`, positivity-preservation argument for source-initialized trajectories.
-->

---

# Signed Rectified Flow

<RfSignedGallery :height="580" />

---
class: tweedie-barrier-slide
---

# Tweedie's Formula

<div class="tweedie-barrier-copy">

- Assume $X_t=tX_1+(1-t)X_0$ with $X_0\sim\mathcal N(0,I)$ independent of $X_1$.

- The standard Tweedie identities hold for signed RF:

  $$
  v_t^{\mathtt{signRF}}(x)
  =\frac{x}{t}+\frac{1-t}{t}\,\nabla\log\pi_t^{\mathtt{sign}}(x)
  \qquad
  \text{where we define }
  \nabla\log\pi_t(x)=\frac{\nabla\pi_t(x)}{\pi_t(x)}.
  $$

  on the positive side $\pi_t^{\mathtt{sign}}(x)>0$.

- With this, we can show that along a trajectory $Z_t$, as $\pi_t^{\mathtt{sign}}(Z_t)\downarrow0$,

  $$
  \frac{\mathrm d}{\mathrm dt}\pi_t^{\mathtt{sign}}(Z_t)>0
  \quad\Longrightarrow\quad
  \frac{\mathrm d}{\mathrm dt}\log\pi_t^{\mathtt{sign}}(Z_t)>0.
  $$

  Hence, trajectories are repelled from the zero boundary and remain in the positive region $\Omega_t^+$.


</div>

<!--
[Sources]
- `Signed_Rectified_Flow_Overleaf_Paper/contents/appendix_theory.tex`, Gaussian-source Tweedie identity and nonpenetration proof near the signed zero set.
-->

---
class: buffer-zone-slide
---

<RfSignedBufferBalance :height="215" />

<div class="buffer-zone-copy">

- **Signed measure** $\pi_t^{\mathtt{sign}}=(1+\alpha)\pi_t^+-\alpha\pi_t^-$: a unit-mass density that may take negative values.

  - **Positive support** $\Omega_t^+ \coloneqq \{x \colon \pi_t^{\mathtt{sign}}(x)>0\}$.
  - **Negative support** $\Omega_t^- \coloneqq \{x \colon \pi_t^{\mathtt{sign}}(x)<0\}$.

- **Particle distribution** $\pi_t^{\mathtt{flow}}\ge 0$: the law of $Z_t$ transported by $\dot Z_t=v_t(Z_t)$.

  - **Reachable zone** $\Omega_t^r \coloneqq \{x \colon \pi_t^{\mathtt{flow}}(x)>0\}\subseteq\Omega_t^+$.
  - **Buffer zone** $\Omega_t^b \coloneqq \Omega_t^+\setminus\Omega_t^r$: positive support not reached by the flow.

- **Main result**:

<div class="buffer-main-result">

$$
\displaystyle
\textcolor{blue}{
\pi_{t}^{\mathtt{flow}}(x) = \pi_{t}^{\mathtt{sign}}(x)\,
\mathbb{I}(x\in \Omega_t^r)}.
$$

</div>

- For normalization, we must have

$$
\int_{\Omega_t^r}\pi_t^{\mathtt{sign}}(x) = 1, ~~~~
~~~~~~
A = {\color{#666666}\int_{\Omega_t^b}\pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x}
  =
  -{\color{#E34A92}\int_{\Omega_t^-}\pi_t^{\mathtt{sign}}(x)\,\mathrm{d}x}.
$$

</div>

<style>
.buffer-zone-copy {
  margin: 0.05rem auto 0;
  max-width: 960px;
  color: #465168;
  font-size: 1.07rem;
  line-height: 1.08;
}
.buffer-zone-copy ul {
  margin: 0;
  padding-left: 1.35rem;
}
.buffer-zone-copy ul ul {
  margin: 0.02rem 0 0.05rem;
  padding-left: 1.6rem;
}
.buffer-zone-copy li {
  margin-bottom: 0.11rem;
}
.buffer-zone-copy .katex-display {
  margin: 0.04rem 0 0.08rem;
  font-size: 0.86em;
}
.buffer-zone-copy .buffer-main-result .katex-display {
  margin: -0.06rem 0 0.14rem;
  font-size: 1.08em;
}
.buffer-zone-copy strong {
  color: #26334d;
}
.buffer-discrepancy {
  color: #9d2d64;
  font-weight: 750;
}
</style>

---
class: continuity-proof-slide
---

# Signed Continuity Equation

<div class="continuity-proof-copy">

- Like regular RF, the signed marginal also satisfies the **continuity equation:**

$$
\partial_t \pi_t^{\mathtt{sign}}
= -\nabla\!\cdot\!\left(\pi_t^{\mathtt{sign}}v_t\right).
$$

<div class="continuity-proof-box">

<div class="continuity-proof-label">Proof.</div>

Each branch obeys $\partial_t\pi_t^\pm=-\nabla\!\cdot(\pi_t^\pm v_t^\pm)$. By linearity,

$$
\begin{aligned}
\partial_t\pi_t^{\mathtt{sign}}
&= (1+\alpha)\,\partial_t\pi_t^+ - \alpha\,\partial_t\pi_t^- \\
&= -\nabla\!\cdot\!\left[(1+\alpha)\pi_t^+v_t^+-\alpha\pi_t^-v_t^-\right] \\
&= -\nabla\!\cdot\!\left(\pi_t^{\mathtt{sign}}v_t\right).
\end{aligned}
$$

</div>

- But once $\pi_t^{\mathtt{sign}}$ takes negative values, it can no longer be the probability density of
  $\dot Z_t=v_t(Z_t)$ on the whole space.

- If the continuity equation holds and $\pi_0>0$, then the ODE density
  $\pi_t^{\mathtt{flow}}$ matches $\pi_t^{\mathtt{sign}}$ on the reachable region:

  $$
  \textcolor{blue}{
  \pi_t^{\mathtt{flow}}(x)
  =\pi_t^{\mathtt{sign}}(x)\,\mathbb{I}(x\in\Omega_t^r)}.
  $$

<div class="continuity-tv-optimal">

This is one of the **total-variation-optimal** nonnegative approximations:

$$
\pi_t^{\mathtt{signRF}}
\;\in\;
\arg\min_{\rho\in\mathcal P}\;
\mathrm{TV}\!\left(\rho,\;\pi_t^{\mathtt{sign}}\right).
$$

</div>

</div>

<style>
.continuity-proof-copy {
  margin: 0.72rem auto 0;
  max-width: 1000px;
  color: #465168;
  font-size: 1.07rem;
  line-height: 1.22;
}
.continuity-proof-copy > ul {
  margin: 0;
  padding-left: 1.45rem;
}
.continuity-proof-copy li {
  margin-bottom: 0.48rem;
}
.continuity-proof-copy .katex-display {
  margin: 0.22rem 0 0.3rem;
  font-size: 0.94em;
}
.continuity-proof-box {
  margin: 0.22rem 0.75rem 0.58rem;
  padding: 0.52rem 0.82rem 0.28rem;
  border: 1.5px solid #b9c7e8;
  border-left: 0.28rem solid #3156b3;
  border-radius: 0.45rem;
  background: rgba(49, 86, 179, 0.045);
}
.continuity-proof-label {
  margin-bottom: 0.08rem;
  color: #3156b3;
  font-weight: 750;
}
.continuity-proof-box p {
  margin: 0.12rem 0 0;
}
.continuity-proof-box .katex-display {
  margin: 0.18rem 0 0.02rem;
  font-size: 0.9em;
}
.continuity-proof-copy li:last-child .katex-display:last-child {
  margin-top: 0.36rem;
  font-size: 1.05em;
}
.continuity-tv-optimal {
  margin-top: 0.3rem;
  color: #26334d;
  text-align: center;
}
.continuity-tv-optimal .katex-display {
  margin: 0.18rem 0 0;
  font-size: 1em;
}
.continuity-proof-copy strong {
  color: #26334d;
}
</style>

<!--
[Sources]
- `Signed_Rectified_Flow_Overleaf_Paper/contents/appendix_theory.tex`, signed continuity equation and proof of the Signed RF sampling law.
- `Signed_Rectified_Flow_Overleaf_Paper/contents/methods.tex`, TV-optimal approximation remark; see also Proposition `prop:tv_optimal_probability_approximation` in `appendix_theory.tex`.
-->

---
disabled: true
---

# Start with a Standard Mixture

<div class="standard-mixture-equation">

$$
\pi_1^{\omega}
=
(1-\omega)\,\pi_1^+
+
\omega\,\pi_1^-,
\qquad 0\le \omega\le 1.
$$

</div>

<ConvexMixture1D :height="365" autoplay />

<div class="standard-mixture-caption">
Choose the + branch with probability 1−ω and the − branch with probability ω.
</div>

<style>
.standard-mixture-equation .katex-display {
  margin: 0.65rem 0 0.15rem;
  color: #243f91;
  font-size: 1.12em;
}
.standard-mixture-caption {
  margin-top: 0.15rem;
  color: #465168;
  font-size: 1rem;
  text-align: center;
}
</style>

---
disabled: true
---

# RF Mixes Velocities Locally

<div class="mixture-decomp-lead">
Each branch has its own RF pair: (πₜ⁺, vₜ⁺) and (πₜ⁻, vₜ⁻).
</div>

<div class="mixture-decomp-main">

$$
v_t^{\omega}(x)
=
\underbrace{
\frac{(1-\omega)\,\pi_t^+(x)}{\pi_t^{\omega}(x)}
}_{\displaystyle \gamma_t^+(x)}
v_t^+(x)
+
\underbrace{
\frac{\omega\,\pi_t^-(x)}{\pi_t^{\omega}(x)}
}_{\displaystyle \gamma_t^-(x)}
v_t^-(x).
$$

</div>

<div class="mixture-decomp-density">

$$
\pi_t^{\omega}(x)
=
(1-\omega)\,\pi_t^+(x)
+
\omega\,\pi_t^-(x),
\qquad
\gamma_t^+(x)+\gamma_t^-(x)=1.
$$

</div>

<div class="mixture-decomp-takeaway">
At each (t, x), the <b>denser branch contributes more</b> to the mixture velocity.
</div>

<style>
.mixture-decomp-lead {
  max-width: 820px;
  margin: 1.35rem auto 0;
  color: #4a556b;
  font-size: 1.02rem;
  text-align: center;
}
.mixture-decomp-main .katex-display {
  margin: 2.1rem 0 1.6rem;
  color: #243f91;
  font-size: 1.13em;
}
.mixture-decomp-density .katex-display {
  margin: 0;
  color: #37445c;
  font-size: 0.96em;
}
.mixture-decomp-takeaway {
  max-width: 825px;
  margin: 2.15rem auto 0;
  padding-top: 0.8rem;
  border-top: 1px solid #d9e0ef;
  color: #37445c;
  font-size: 1.02rem;
  text-align: center;
}
</style>

---
disabled: true
---

# Formally, Replace ω by −α

<div class="signed-preference-bridge">Extrapolate the ordinary mixture beyond convex weights.</div>

<div class="signed-preference-equation">

$$
\pi_1^{\mathtt{sign}}(x)
=
(1+\alpha)\,\pi_1^+(x)
-
\alpha\,\pi_1^-(x),
\qquad \alpha\ge 0.
$$

</div>

<div class="signed-preference-key">
<div><span class="signed-preference-plus">π₁⁺</span><b>preferred examples</b></div>
<div><span class="signed-preference-minus">π₁⁻</span><b>unwanted examples</b></div>
<div><span class="signed-preference-alpha">α</span><b>avoidance strength</b></div>
</div>

<RfSignedEquation :height="285" autoplay />

<div class="signed-preference-footer">
<div><b>Negative mass:</b> active repulsion beyond zero probability.</div>
<div><b>But:</b> unit total mass does not make this a probability law.</div>
</div>

<style>
.signed-preference-bridge {
  margin-top: 0.55rem;
  color: #4b5568;
  font-size: 1rem;
  text-align: center;
}
.signed-preference-equation .katex-display {
  margin: 0.2rem 0 0.35rem;
  color: #243f91;
  font-size: 1.08em;
}
.signed-preference-key {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.7rem;
  max-width: 790px;
  margin: 0 auto 0.25rem;
  color: #4b5568;
  font-size: 0.95rem;
  text-align: center;
}
.signed-preference-key span {
  display: inline-block;
  min-width: 2.7rem;
  margin-right: 0.35rem;
  font-size: 1.05rem;
  font-weight: 750;
}
.signed-preference-plus {
  color: #3156b3;
}
.signed-preference-minus {
  color: #c6536a;
}
.signed-preference-alpha {
  color: #6d4db5;
}
.signed-preference-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  max-width: 850px;
  margin: 0.3rem auto 0;
  color: #37445c;
  font-size: 0.92rem;
  line-height: 1.25;
  text-align: center;
}
.signed-preference-footer > div {
  padding: 0.42rem 0.65rem;
  border: 1px solid #d9e0ef;
  border-radius: 8px;
  background: #f7f9ff;
}
.signed-preference-footer > div:last-child {
  border-color: #d8e7d6;
  background: #f6fbf5;
}
</style>

---
disabled: true
---

# It Still Defines an ODE

<div class="signed-ode-lead">Apply the same decomposition formula with ω = −α:</div>

<div class="signed-ode-velocity">

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

</div>

<div class="signed-ode-system">

$$
\dot Z_t=v_t^{\mathtt{signRF}}(Z_t),
\qquad Z_0\sim\pi_0.
$$

</div>

<div class="signed-ode-caution">
<b>Formal only:</b> the denominator may vanish, so this is not yet guaranteed to be a valid probability flow.
</div>

<div class="signed-ode-conclusion">
Away from the zero set, however, it is a concrete ODE that we can integrate numerically.
</div>

<style>
.signed-ode-lead {
  margin-top: 1.3rem;
  color: #4b5568;
  font-size: 1.05rem;
  text-align: center;
}
.signed-ode-velocity .katex-display {
  margin: 1.5rem 0 1.25rem;
  color: #243f91;
  font-size: 1.02em;
}
.signed-ode-system .katex-display {
  margin: 0;
  color: #26334d;
  font-size: 1.03em;
}
.signed-ode-caution,
.signed-ode-conclusion {
  max-width: 835px;
  margin-right: auto;
  margin-left: auto;
  font-size: 1rem;
  line-height: 1.3;
  text-align: center;
}
.signed-ode-caution {
  margin-top: 1.55rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e3d6dc;
  color: #8a3c55;
}
.signed-ode-conclusion {
  margin-top: 0.6rem;
  color: #3156b3;
  font-weight: 650;
}
</style>

---
disabled: true
---

# Here Is What Happens

<RfSigned1D mode="simulate" :height="440" autoplay />

<div class="mt-2"></div>

Start from $Z_0\sim\pi_0$ and integrate forward. The histogram is the empirical law of the trajectories.

<div class="mt-2 text-center" style="font-size: 0.85em; opacity: 0.7;">

Explore live: <a href="./playground/1d.html" target="_blank">**1D playground ↗**</a>

</div>

---

# Trace the Dynamics Backward

<ChargedParticles1D mode="uniform" :height="360" autoplay />

- Place charged particles and run the ODE **backward**.
- **Negative particles:** all hit the moving zero set $\Omega_t^0$.
- **Positive particles:** either
  - reach $t=0$, collectively recovering $\pi_0$; or
  - hit $\Omega_t^0$ and pair with negative particles.

---

# The Physical Picture: Charged Particles

<RfPairEmission :height="430" autoplay />

<div class="mt-2"></div>

- **Noise $\to$ data:** We would recover the full signed target if the zero boundary emitted paired positive and negative particles at the correct rates.
- **In practice:** An ordinary sampler cannot generate negative-probability particles. This is why the buffer and negative regions contain no sampled particles.

---
hide: true
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
disabled: true
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
disabled: true
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
disabled: true
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
class: signed-rf-2d-playground-slide
---

# Signed RF in 2D — Interactive Playground

<div class="signed-rf-2d-playground-demo">
  <Rf2DGuidance :height="440" autoplay />
</div>

<div class="signed-rf-2d-playground-notes">

- **Upper panels:** constant guidance $v_t^{\mathrm{const}}=(1+\omega)v_t^+-\omega v_t^-.$
- **Lower panels:** Signed RF with adaptive guidance $v_t^+ + \lambda_t^\alpha(x)(v_t^+-v_t^-).$

</div>

<div class="signed-rf-2d-playground-link">
  <a href="./playground/2d.html" target="_blank">Open the full playground ↗</a>
</div>

<style>
.signed-rf-2d-playground-slide h1 {
  margin-bottom: 0.1rem;
  font-size: 1.85rem !important;
  white-space: nowrap;
}
.signed-rf-2d-playground-demo {
  width: 100%;
  margin: 0 auto;
}
.signed-rf-2d-playground-notes {
  margin-top: -0.35rem;
  font-size: 0.76rem;
  line-height: 1.25;
}
.signed-rf-2d-playground-notes ul {
  margin: 0;
}
.signed-rf-2d-playground-link {
  margin-top: -0.35rem;
  font-size: 0.78rem;
  text-align: right;
}
.signed-rf-2d-playground-link a {
  color: #3156b3;
  text-decoration: none;
}
.signed-rf-2d-playground-link a:hover {
  text-decoration: underline;
}
</style>

---
disabled: true
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
disabled: true
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

# Concept Suppression

<div class="mt-1"></div>

<div class="grid gap-x-3 gap-y-1 items-center" style="grid-template-columns: 6rem repeat(4, 1fr);">
  <div></div>
  <div class="text-center text-sm" style="font-weight: 650;">&ldquo;Mickey Mouse&rdquo;</div>
  <div class="text-center text-sm" style="font-weight: 650;">&ldquo;trees &amp; grass&rdquo;</div>
  <div class="text-center text-sm" style="font-weight: 650;">&ldquo;red / crimson&rdquo;</div>
  <div class="text-center text-sm" style="font-weight: 650;">&ldquo;old white man&rdquo;</div>
  <div class="text-sm text-right pr-2" style="opacity: 0.75;">Baseline CFG</div>
  <BaseImg src="figures/concept/mouse-base.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/greenery-base.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/red-base.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/man-base.jpg" class="w-full rounded" />
  <div class="text-sm text-right pr-2" style="font-weight: 650; color: #253A88;">Signed RF</div>
  <BaseImg src="figures/concept/mouse-ours.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/greenery-ours.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/red-ours.jpg" class="w-full rounded" />
  <BaseImg src="figures/concept/man-ours.jpg" class="w-full rounded" />
</div>

<div class="mt-1" style="font-size: 0.76em; color: #536073; text-align: center;">

**Concept suppression** — same seed and prompt per column; the quoted concept is what must disappear.

</div>

<div class="mt-1" style="font-size: 0.9em;">

- **One pretrained model** (Z-Image): $v^+$ conditioned on the prompt, $v^-$ on the concept to remove — no retraining.
- **Online ratio tracking** along the trajectory sets the adaptive scale $\lambda_t^\alpha(x)$.
- **The concept is erased**; the requested appearance, pose, and composition survive.

</div>

---

# Anti-Memorization on ImageNet

<div class="flex justify-center mt-1">
  <div class="relative" style="width: 78%;">
    <BaseImg src="figures/imagenet_memorization_7col.jpg" class="rounded shadow-sm w-full block" />
    <div class="abs-label" style="top: 12.5%;">Base</div>
    <div class="abs-label" style="top: 37.5%; opacity: 0.72;">top match</div>
    <div class="abs-label abs-label-ours" style="top: 62.5%;">Signed RF</div>
    <div class="abs-label" style="top: 87.5%; opacity: 0.72;">top match</div>
  </div>
</div>

<div class="mt-1" style="font-size: 0.76em; color: #536073; text-align: center;">

**Anti-memorization** — each column shares one seed; every generation sits above its nearest training image.
Base reproduces its match down to borders and watermarks; Signed RF breaks the copy.

</div>

<div class="mt-1" style="font-size: 0.9em;">

- **Negative branch is the training set itself**: $\pi^- = \frac{1}{N}\sum_i \delta_{x^{(i)}}$ over the class's stored training latents.
- **Analytic flow** — for a mixture of Diracs, $v_t^-$ and $\pi_t^-$ are available in closed form: nothing to train.
- **Positive branch** $\pi^+$ is the pretrained class-conditional flow; the ratio is tracked online along the trajectory.

</div>

<style>
.abs-label {
  position: absolute;
  right: 100%;
  transform: translateY(-50%);
  padding-right: 10px;
  font-size: 0.72em;
  font-weight: 650;
  color: #536073;
  white-space: nowrap;
}
.abs-label-ours { color: #253a88; }
</style>

---

# ImageNet-256: Against Tuned Guidance

<RfImagenetFid :height="410" />

<div class="mt-1" style="font-size: 0.76em; color: #536073; text-align: center;">

solid = Euler &nbsp;·&nbsp; dashed = second-order &nbsp;·&nbsp; one 320-epoch backbone, every guidance scale swept, best-FID protocol

</div>

<div class="mt-2" style="font-size: 0.9em;">

- **The CFG pair, reused**: $\pi^+$ = the class-conditional flow, $\pi^-$ = the unconditional flow — nothing new to train.
- **Lowest FID at every NFE, both solvers** — 1.39 at 32 steps, below CFG at 64 and REPA at 250.

</div>

---

# The Missing Negative Data: 2D Maze

<div class="mt-2"></div>

<div class="flex items-center justify-center gap-4 mt-6">
  <BaseImg src="figures/pointmaze_trajectories.svg" style="width: 71%;" />
  <BaseImg src="figures/pointmaze_pareto_front.svg" style="width: 25%;" />
</div>

<div class="mt-8" style="font-size: 0.95em;">

- The demonstrations contain only feasible paths ($\pi^+$), so the planner has never seen a wall interior and crosses them freely (a). Signed RF supplies the missing negatives: $\pi^-$ = wall-interior points, with a trained $v^-$ and a ratio classifier.
- Constant guidance buys safety with diversity: a weak scale leaves violations (b), a strong one collapses the paths onto a single route (<span>c</span>).
- Signed RF eliminates wall crossings and keeps the full spread of feasible paths (d); the Pareto front (e) makes the trade-off explicit.

</div>

---
disabled: true
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
disabled: true
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
disabled: true
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
disabled: true
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

# Thank You

<div class="h-16"></div>

- Rectified flow formally extended to the signed target $(1+\alpha)\,\pi^+ - \alpha\,\pi^-$

- Yields sampling within the positive region of the signed mixture.

- Yields an adaptive guidance algorithm for practical applications.

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
