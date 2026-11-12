# Hoopla — Interactive Strong Gravitational Lensing Modeling

**English** | [简体中文](README.zh-CN.md)

Hoopla is a browser-based, human-in-the-loop tool for modelling galaxy-scale strong gravitational lenses. It answers one narrow but practical question: **given a lens image, what lens mass distribution and background source produce the arcs I see?**

Rather than repeatedly adjusting the initial parameters to obtain a reasonable range of parameter constraints before running Bayesian sampling, you draw an ellipse on the lens and another on the source, watch the predicted lensed image change in real time, and let a lightweight optimizer fit the model parameters in tens of seconds. The result is a physically sensible parameter set that can be exported as JSON and used as the starting point for full modelling.

Hoopla is not a substitute for a Bayesian solver: it does not produce final parameter constraints with statistical uncertainties. It handles the interactive initialisation stage — what you see is what you get.

**Try it online** — no installation needed: open <https://longjianchao.github.io/Hoopla/> to try the Hoopla frontend directly in your browser.

## What You Can Do

- **Load real or simulated images** — FITS and HDF5, with an optional per-pixel noise map and a PSF, plus the pixel scale in arcsec/pixel.
- **Build a model by drawing** — drag an ellipse on the `Mass Model` canvas to set the Singular Isothermal Ellipsoid (SIE) parameters (Einstein radius, axis ratio, position angle, centroid); drag on the `Source Model` canvas to set the elliptical Sérsic source (effective radius, axis ratio, position angle, centroid).
- **See the lensing prediction immediately** — the `Source Plane` canvas shows the source ellipse and the lens caustics; the `Image Plane` canvas shows the predicted lensed image and the critical curves, updated live as you move the source.
- **Refine the model automatically** — one click on `Optimization` fits all parameters at once by minimising the pixel-level χ², with the χ² curve, the traces of every parameter and the residual map refreshing as it runs.
- **Restrict the fit region** — `Mask Radius` + `Apply Mask` excludes the outer field (contaminating objects, noisy edges).
- **Keep and compare models** — `Save Models` writes the parameter set to a `.json` file; `Load Models` restores it and can overlay the loaded parameters on the convergence plots as a reference line.

## Installation

Requirements: Node.js (LTS, ≥ v14), a modern browser, and Python 3 for the `npm start` static server. No GPU is needed for the interactive modelling.

```bash
git clone https://gitee.com/long-jianchao/Hoopla-Preprocessing_input_pics.git
cd Hoopla-Preprocessing_input_pics
npm install
npm start
```

<br />

Other launch modes:

```bash
npm run dev     # development server with hot reload (port 8070); needs no Python
npm run build   # static build into ./dist, deployable to any web server
```

The page uses ES modules, so it must be served over HTTP — opening `index.html` directly from disk will not work.

## Preparing the Input Data

The three files must share the same pixel grid; FITS is the preferred format.

| File | Required | Requirements |
| --- | --- | --- |
| Lens image | Yes | Surface-brightness image of the lens system. It should already be reduced (bias/dark, flat-field, sky subtraction, cosmic-ray rejection); Hoopla does no upstream preprocessing. |
| Noise map | Recommended | Per-pixel 1σ surface-brightness uncertainty. It must be a smooth description of the noise level, not a noise realisation; values must be positive with no NaN. |
| PSF | Required for optimisation | Small 2D kernel, normalised to unit sum, peak centred on the central pixel. |

If no noise map is supplied, Hoopla estimates the noise from the image itself with a Poisson-like approximation; this is only rough, so always prefer a real noise map.

You also need the pixel scale of the observation in arcsec/pixel; it converts the drawn ellipses into angular sizes.

## How to Use

1. **Upload** — click `Upload Images`, select the lens image, the noise map and the PSF in the dialog, enter the pixel scale, and confirm. The status indicator at the bottom must read `PSF Uploaded` before you optimise.
2. **Draw the mass model** — click and drag on the `Mass Model` canvas. The ellipse size sets the Einstein radius (it is a scale reference, not a physical boundary); its shape and orientation set the axis ratio and position angle.
3. **Draw the source** — click and drag on the `Source Model` canvas to define the Sérsic source ellipse.
4. **Align the arcs** — move the cursor over the `Source Plane` canvas. The source position follows the cursor while the canvas is in `Interactive` mode, and the `Image Plane` re-renders continuously. Adjust it until the predicted blue contours reproduce the position, number and curvature of the observed arcs, then click to toggle to `Freezing`.
5. **Optimise** — click `Optimization`. The χ² curve should drop and then plateau; the parameter traces show whether each parameter has settled. When it finishes, the `Source Plane` switches to `Freezing` automatically.
6. **Inspect** — check the `Residual Map`: a noise-like residual is consistent with an adequate fit; coherent structures mean the model is still missing something.
7. **Save** — click `Save Models` to export the parameters. To compare against a known answer, `Load Models` a reference `.json` and keep `Draw Model Comparison Line` checked.
8. **Bayesian modelling (optional)** — click `Backend Sampling` to submit the current model to the backend service for full Bayesian sampling, accelerated by TinyLensGPU. The backend is deployed separately; see [Hoopla-Backend-Service](https://github.com/longjianchao/Hoopla-Backend-Service).

## Reading the Diagnostics

- **χ² curve** — fluctuations in the early iterations are normal for a derivative-free search; a persistent plateau indicates convergence, sustained large oscillations late in the run indicate failure.
- **Parameter traces** — 12 panels, one per free parameter. Use them to spot parameters still drifting or pushed to unphysical values.
- **Residual map** — the primary qualitative check. Judge the fit by whether the arcs are reproduced, not only by the final χ² value.

## Scope

Hoopla handles single-lens, single-source, galaxy-scale systems with an SIE mass model and an elliptical Sérsic source. It is not intended for cluster-scale lensing, multi-plane systems, or multi-component and pixelated reconstructions.

The parameters it returns are exploratory point estimates for initialisation. Statistically rigorous constraints require a full sampling run on top of them.
