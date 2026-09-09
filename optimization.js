// Fit optimization modeling related functionality

// Import ndarray libraries from npm


// Calculate the mean
function average(data) {
	let sum = data.reduce(function (sum, value) {
		return sum + value;
	}, 0);
	return sum / data.length;
}

// Calculate the standard deviation (sample standard deviation, matching numpy.std() default behavior)
function standardDeviation(values) {
	if (values.length <= 1) return 0;
	let avg = average(values);
	let squareDiffs = values.map(function (value) {
		let diff = value - avg;
		return diff * diff;
	});
	// Use the sample standard deviation, dividing by N-1 instead of N
	let avgSquareDiff = average(squareDiffs) * (values.length / (values.length - 1));
	return Math.sqrt(avgSquareDiff);
}

// Calculate the lensing deflection effect of a single lens on image point (x, y)
function calAlpha(xl, yl, xlc, ylc, re, ql, phl) {
	if (ql < 1.0) {
		phl = Math.PI * ((90 - phl) / 180);
	}
	else {
		ql = 1.0 / ql - 0.0000000001;
		phl = Math.PI * (phl / 180);
	}

	const alpha = { x: 0.0, y: 0.0 };
	let x, y, cs, sn;
	let sx_r, sy_r, psi, sq, pd1, pd2, fx1, fx2, qs, a1, a2;
	const rc = 0.0;

	cs = Math.cos(phl);
	sn = Math.sin(phl);

	x = xl - xlc;
	y = yl - ylc;

	sx_r = x * cs + y * sn;
	sy_r = -x * sn + y * cs;

	psi = Math.sqrt(ql * ql * (rc * rc + sx_r * sx_r) + sy_r * sy_r);
	sq = Math.sqrt(1.0 - ql * ql);
	pd1 = psi + rc;
	pd2 = psi + rc * ql * ql;
	fx1 = sq * sx_r / pd1;
	fx2 = sq * sy_r / pd2;
	qs = Math.sqrt(ql);

	a1 = qs / sq * Math.atan(fx1);
	a2 = qs / sq * Math.atanh(fx2);

	let dx = (a1 * cs - a2 * sn);
	let dy = (a2 * cs + a1 * sn);
	// Add lensing effects of just this component:
	alpha.x = re * dx;
	alpha.y = re * dy;
	return alpha;
}

// Calculate the flux at the deflected point (x - αx, y - αy) in the reconstructed source image.
function calImage(xs, ys, xsc, ysc, size, qs, phs, n, Ie) {
	let res, phirad;
	let b_n = 1.9992 * n - 0.3271;
	const Re = size;
	phirad = phs / 180 * Math.PI;
	// Re-apply the coordinate transform to obtain the coordinate represented by the pixel
	let xnew = (xs - xsc) * Math.cos(phirad) + (ys - ysc) * Math.sin(phirad);
	let ynew = (ys - ysc) * Math.cos(phirad) - (xs - xsc) * Math.sin(phirad);
	let r_ell = Math.sqrt((xnew * xnew) / qs + (ynew * ynew) * qs);
	// Normalize and substitute into the Sersic profile
	let rnorm = r_ell / Re;
	res = Ie * Math.exp(-b_n * (Math.pow(rnorm, 1 / n) - 1.0));
	return res;
}

// Given a set of lens parameters, call calAlpha() and calImage() for each image point to compute the predicted image flux
function model_lensed_images(p, x1, x2) {
	let xc1, xc2, re, ql, phl;
	xc1 = p[0];
	xc2 = p[1];
	re = p[2];
	ql = p[3];
	phl = p[4];
	// Compute the deflection angle at this point
	let alpha = calAlpha(x1, x2, xc1, xc2, re, ql, phl);
	// Compute the angular position of the source galaxy image
	let y1 = x1 - alpha.x;
	let y2 = x2 - alpha.y;

	let yc1, yc2, size, qs, phs, n, Ie;
	yc1 = p[5];
	yc2 = p[6];
	size = p[7];
	qs = p[8];
	phs = p[9];
	n = p[10];
	Ie = p[11];
	return calImage(y1, y2, yc1, yc2, size, qs, phs, n, Ie);
}

// CPU-based PSF convolution (synchronous) - pure JavaScript implementation
/**
 * Perform PSF convolution (pure JavaScript spatial-domain implementation)
 * * Note: if the image values are very small (e.g. 1e-4), they will appear black on screen.
 * It is recommended to use Gain or auto-stretching when rendering.
 */
function applyPSFCpu(image, width, height, psf, psfW, psfH) {
	if (!psf || !psf.length) return image;

	try {
		const result = new Float64Array(width * height);
		// PSF normalization
		let psfSum = 0;
		for (let i = 0; i < psf.length; i++) psfSum += psf[i];
		if (Math.abs(psfSum) < 1e-12) psfSum = 1.0;

		// Compute the PSF center
		const psfCenterX = Math.floor(psfW / 2);
		const psfCenterY = Math.floor(psfH / 2);

		// Spatial-domain convolution
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let sum = 0;

				// Iterate over the PSF
				for (let py = 0; py < psfH; py++) {
					for (let px = 0; px < psfW; px++) {
						// Compute the corresponding pixel position in the image
						const ix = x + px - psfCenterX;
						const iy = y + py - psfCenterY;

						// Boundary check
						if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
							const imageIndex = iy * width + ix;
							const psfIndex = py * psfW + px;
							sum += image[imageIndex] * (psf[psfIndex] / psfSum);
						}
					}
				}

				result[y * width + x] = sum;
			}
		}

		return result;

	} catch (error) {
		console.error('CPU PSF Convolution failed:', error);
		return image;
	}
}


// FFT-based PSF convolution with WebGPU acceleration
async function applyPSF(image, width, height, psf, psfW, psfH) {
	// If WebGPU is available, use the WebGPU-accelerated implementation
	if (webgpuInitialized && fftConvolve) {
		try {
			// Fill the PSF data to match the image size so that the PSF center is precisely aligned with the image center
			let psfData = new Float64Array(width * height);
			// Compute the PSF center
			const psfCenterX = Math.floor(psfW / 2);
			const psfCenterY = Math.floor(psfH / 2);
			// Compute the image center
			const imgCenterX = Math.floor(width / 2);
			const imgCenterY = Math.floor(height / 2);

			for (let y = 0; y < psfH; y++) {
				for (let x = 0; x < psfW; x++) {
					// Compute the offset of a PSF pixel relative to the PSF center
					const dx = x - psfCenterX;
					const dy = y - psfCenterY;
					// Place the PSF pixel at the position corresponding to the image center
					const ix = imgCenterX + dx;
					const iy = imgCenterY + dy;
					psfData[iy * width + ix] = psf[y * psfW + x];
				}
			}
			// Perform FFT convolution using WebGPU
			const result = await fftConvolve.convolve(image, psfData);
			return result;
		} catch (error) {
			console.error('WebGPU PSF convolution failed, falling back to CPU implementation:', error);
			// Fall back to the CPU implementation
		}
	}

	// Use the CPU implementation directly - ensure image is a Float64Array
	return applyPSFCpu(image, width, height, psf, psfW, psfH);
}


async function chi2_rescale(p) {
	// Rescaling factor that improves sampling efficiency; an overly large value may distort the image
	const fscale = 4;
	const chi = new Array(Math.floor(globalImageData.length / fscale / fscale));
	const lightstd = standardDeviation(globalImageData);

	// Generate the model image
	// Use Float64Array for higher precision, consistent with Python's float64
	let modelImage = new Float64Array(globalImageData.length);
	const scaledWidth = imgd.width / scale;
	const scaledHeight = imgd.height / scale;
	const originPixscale = lets.pixscale * scale;
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			let rowScaled = row / scale;
			let colScaled = col / scale;
			let i = Math.floor(rowScaled) * Math.floor(scaledWidth) + Math.floor(colScaled);
			let x = (colScaled + 0.5 - scaledWidth / 2) * originPixscale;
			let y = - (rowScaled + 0.5 - scaledHeight / 2) * originPixscale;
			modelImage[i] = model_lensed_images(p, x, y);
		}
	}
	// Apply PSF convolution
	let convolvedImage;
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(modelImage, Math.floor(scaledWidth), Math.floor(scaledHeight),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		// If no PSF data, use the model image directly
		convolvedImage = modelImage;
	}
	let sigma;
	// Compute the chi-square value
	for (let row = 0; row < imgd.height; row += fscale) {
		for (let col = 0; col < imgd.width; col += fscale) {
			let i = Math.floor(row / scale) * Math.floor(scaledWidth) + Math.floor(col / scale);
			let i2 = Math.floor(row / fscale) * Math.floor(imgd.width / fscale) + Math.floor(col / fscale);
			if (globalNoiseData && globalNoiseData[i] > 0) {
				sigma = globalNoiseData[i];
			} else {
				sigma = Math.sqrt(globalImageData[i] + 1);
			}
			chi[i2] = (globalImageData[i] - convolvedImage[i]) / sigma;
		}
	}

	// Compute the chi-square value
	const chi2 = optimize.vector.dot(chi, chi);
	// Compute the degrees of freedom: number of data points - number of parameters
	const dof = chi.length - 12;
	// Return the reduced chi-square
	return chi2 / dof;
}

// Compute the residual vector (for the least_squares optimizer)
// Similar to chi2_rescale, but returns the residual vector chi_i = (data_i - model_i)/sigma_i instead of the scalar chi2
async function chi_residuals(p) {
	// Rescaling factor, kept consistent with chi2_rescale
	const fscale = 4;
	const residuals = [];

	// Generate the model image
	let modelImage = new Float64Array(globalImageData.length);
	const scaledWidth = imgd.width / scale;
	const scaledHeight = imgd.height / scale;
	const originPixscale = lets.pixscale * scale;
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			let rowScaled = row / scale;
			let colScaled = col / scale;
			let i = Math.floor(rowScaled) * Math.floor(scaledWidth) + Math.floor(colScaled);
			let x = (colScaled + 0.5 - scaledWidth / 2) * originPixscale;
			let y = - (rowScaled + 0.5 - scaledHeight / 2) * originPixscale;
			modelImage[i] = model_lensed_images(p, x, y);
		}
	}
	// Apply PSF convolution
	let convolvedImage;
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(modelImage, Math.floor(scaledWidth), Math.floor(scaledHeight),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		convolvedImage = modelImage;
	}
	let sigma;
	// Compute the residual vector (data - model) / sigma
	for (let row = 0; row < imgd.height; row += fscale) {
		for (let col = 0; col < imgd.width; col += fscale) {
			let i = Math.floor(row / scale) * Math.floor(scaledWidth) + Math.floor(col / scale);
			if (globalNoiseData && globalNoiseData[i] > 0) {
				sigma = globalNoiseData[i];
			} else {
				sigma = Math.sqrt(globalImageData[i] + 1);
			}
			residuals.push((globalImageData[i] - convolvedImage[i]) / sigma);
		}
	}
	return residuals;
}

function drawResiduals() {
	if (!imgd.complete || imgd.naturalWidth === 0) {
		imgd.onload = () => {
			console.log("Image loaded, re-running drawResiduals");
			drawResiduals();
		};
		return;
	}
	let c = document.getElementById("myCanvas");
	let ctx = c.getContext("2d");
	try {
		// Clear the canvas
		ctx.clearRect(0, 0, c.width, c.height);
		ctx.drawImage(imgd, 0, 0, c.width, c.height);
	} catch (error) {
		console.error("Error during drawing:", error);
	}
}

async function show_res(p) {
	let c = document.getElementById("myCanvas");
	let ctx = c.getContext("2d");
	let canvasWidth = c.width;
	let canvasHeight = c.height;
	// Use globalImageData directly instead of reading pixel values from the canvas
	if (!globalImageData) {
		console.error("globalImageData is not initialized");
		return;
	}
	const originPixscale = lets.pixscale * scale;
	const scaledWidth = imgd.width / scale;
	const scaledHeight = imgd.height / scale;
	let i, x, y;
	// Use Float64Array for higher precision, consistent with Python's float64
	let testimg = new Float64Array(globalImageData.length);
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			let rowScaled = row / scale;
			let colScaled = col / scale;
			i = Math.floor(rowScaled) * Math.floor(scaledWidth) + Math.floor(colScaled);
			// Compute the corresponding coordinates
			x = (colScaled + 0.5 - scaledWidth / 2.0) * originPixscale;
			y = - (rowScaled + 0.5 - scaledHeight / 2.0) * originPixscale;
			testimg[i] = model_lensed_images(p, x, y);
		}
	}

	let convolvedImage;
	// Apply PSF convolution (WebGPU acceleration)
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(testimg, Math.floor(imgd.width / scale), Math.floor(imgd.height / scale),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		// If no PSF data, use the model image directly
		convolvedImage = testimg;
	}

	// Compute chi-square and residuals - using the original image size
	let chi = new Float64Array(globalImageData.length);
	let residualImage = new Float64Array(globalImageData.length);
	let maxResidual = 0;
	let maxValue = 0;
	let sigma;
	// Compute the residuals and chi-square - using the original image size
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			i = Math.floor(row / scale) * Math.floor(imgd.width / scale) + Math.floor(col / scale);
			if (globalNoiseData && globalNoiseData[i] > 0) {
				sigma = globalNoiseData[i];
			} else {
				sigma = Math.sqrt(globalImageData[i] + 1);
			}
			residualImage[i] = Math.abs(globalImageData[i] - convolvedImage[i]) / sigma;
			// Compute chi-square
			chi[i] = (globalImageData[i] - convolvedImage[i]) / sigma;
			if (residualImage[i] > maxResidual) {
				maxResidual = residualImage[i];
			}
			if (convolvedImage[i] > maxValue) {
				maxValue = convolvedImage[i];
			}
		}
	}
	console.log("maxResidual:", maxResidual, "maxValue:", maxValue);
	let res = optimize.vector.dot(chi, chi);
	if (isNaN(res)) {
		console.log('Error: NaN result');
	}
	console.log('res:' + res / chi.length);

	// Clear the entire canvas
	ctx.clearRect(0, 0, canvasWidth, canvasHeight);

	// Create a temporary canvas for drawing the residual map at the original size
	let tempCanvas = document.createElement('canvas');
	let tempWidth = imgd.width;
	let tempHeight = imgd.height;
	tempCanvas.width = tempWidth;
	tempCanvas.height = tempHeight;
	let tempCtx = tempCanvas.getContext('2d');
	let tempImageData = tempCtx.createImageData(tempWidth, tempHeight);
	let tempData = tempImageData.data;
	if (maxResidual < 1) maxResidual = 1;
	// Draw the full-size residual map onto the temporary canvas
	for (let row = 0; row < tempHeight; row++) {
		for (let col = 0; col < tempWidth; col++) {
			let index = (row * tempWidth + col) * 4;
			let imgIndex = Math.floor(row / scale) * Math.floor(tempWidth / scale) + Math.floor(col / scale);
			// Normalize the residual to the [0, 1] range
			let normalizedResidual = maxResidual > 0 ? residualImage[imgIndex] / maxResidual : 0;
			// Apply the heat-map colormap
			let rgb = hotColormap(normalizedResidual);
			// Set the RGB channels
			tempData[index] = rgb[0];    // red
			tempData[index + 1] = rgb[1];    // green
			tempData[index + 2] = rgb[2];    // blue
			tempData[index + 3] = 255;      // alpha
		}
	}

	// Draw the full-size residual map onto the temporary canvas
	tempCtx.putImageData(tempImageData, 0, 0);
	// Use drawImage to scale up the temporary canvas onto the main canvas
	// This automatically handles image scaling to ensure it displays completely
	ctx.drawImage(tempCanvas, 0, 0, tempWidth, tempHeight, 0, 0, canvasWidth, canvasHeight);
	return res;
}

var chartInstance = null; // global variable to store the chi-square chart instance
var paramsChartInstances = paramsChartInstances || []; // global variable to store the parameter trend chart instances

// Modify the curve-drawing function to better suit the optimization process display
function drawChiSquareCurve(chiSquaredValues) {
	let ctx = document.getElementById("Curve");
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;  // Important: set the instance to null
	}

	// Ensure chiSquaredValues is an array
	chiSquaredValues = chiSquaredValues || [];

	// Create a new chart regardless of whether the data is empty
	chartInstance = new Chart(ctx, {
		type: 'line',
		data: {
			labels: Array.from({ length: chiSquaredValues.length || 1 }, (_, i) => i + 1),
			datasets: [{
				label: 'chi-squared value',
				data: chiSquaredValues.length > 0 ? chiSquaredValues : [],
				borderColor: 'rgb(75, 192, 192)',
				tension: 0.1,
				fill: false
			}]
		},
		options: {
			responsive: false,
			maintainAspectRatio: true,
			// Ensure axes are shown even when there is no data
			scales: {
				x: {
					display: true,
					title: {
						display: true,
						text: 'iteration number'
					},
					// Ensure the x-axis is always shown
					min: 0,
					beginAtZero: true,
					ticks: {
						stepSize: 1
					}
				},
				y: {
					display: true,
					title: {
						display: true,
						text: 'target function value'
					},
					// A logarithmic scale may better show variations in the function value
					type: 'logarithmic',
					// Ensure the y-axis is always shown
					min: 0,
					ticks: {
						min: 0.001,
						max: 10
					}
				}
			},
			plugins: {
				title: {
					display: true,
					text: 'optimization process'
				},
				legend: {
					position: 'top',
					display: true
				}
			}
		}
	});
}

/**
 * Draw the parameter trend chart (accumulative updates)
 * @param {Array} paramsHistory - array containing the parameter values at each iteration
 */
// Store the global parameter history and chart instances for cumulative updates
window.globalParamsHistory = window.globalParamsHistory || [];
// Toggle for drawing comparison lines after uploading the model
window.drawModelComparisonLine = true;

function drawParamsTrendChart(paramsHistory) {
	// Append the new parameter history to the global history
	if (paramsHistory && paramsHistory.length > 0) {
		window.globalParamsHistory = window.globalParamsHistory.concat(paramsHistory);
	}

	// Define parameter names
	const paramNames = [
		'lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
		'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie'
	];

	// Color array for assigning different colors to different parameters
	const colors = [
		'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)',
		'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)',
		'rgb(199, 199, 199)', 'rgb(83, 102, 255)', 'rgb(40, 159, 64)',
		'rgb(210, 199, 199)', 'rgb(255, 99, 232)', 'rgb(50, 205, 50)'
	];

	// Get the container for the parameter trend charts (pre-created in index.html)
	let container = document.getElementById('paramsTrendContainer');
	if (!container) {
		// Fallback: create the container and ensure it is added to the DOM
		container = document.createElement('div');
		container.id = 'paramsTrendContainer';
		container.style.flex = '1';
		container.style.minWidth = '0';
		// Find the flex container and append, or append to the body
		const flexContainer = document.querySelector('div[style*="display: flex"]');
		if (flexContainer) {
			flexContainer.appendChild(container);
		} else {
			document.body.appendChild(container);
		}
	}

	// Find the grid container (child element)
	let gridContainer = container.querySelector('div[style*="display: grid"]');
	if (!gridContainer) {
		// If not found, create the grid container
		gridContainer = document.createElement('div');
		gridContainer.style.display = 'grid';
		gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
		gridContainer.style.gridTemplateRows = 'repeat(4, auto)';
		gridContainer.style.gap = '4px';
		gridContainer.style.padding = '8px';
		container.appendChild(gridContainer);
	} else {
		// Update the grid container styles without changing the layout
		gridContainer.style.gap = '4px';
		gridContainer.style.padding = '8px';
	}

	// Create or update a chart for each parameter, regardless of whether there is data
	for (let i = 0; i < paramNames.length; i++) {
		let canvas = document.getElementById(`paramChart_${i}`);

		// If the canvas does not exist, warn but do not create (it should already exist in the HTML)
		if (!canvas) {
			console.warn(`Canvas with id paramChart_${i} not found. Please ensure it exists in the HTML.`);
			continue;
		}

		// Get the canvas 2D context
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			console.error(`Failed to get context for canvas paramChart_${i}`);
			continue;
		}

		// Extract all iteration values for the current parameter; use an empty array if the global history is empty
		const paramValues = window.globalParamsHistory.length > 0 ?
			window.globalParamsHistory.map(iteration => iteration[i]) : [];
		const labels = window.globalParamsHistory.length > 0 ?
			Array.from({ length: window.globalParamsHistory.length }, (_, idx) => idx + 1) :
			[1]; // Show at least one label

		// Check whether a chart instance already exists for this parameter
		if (paramsChartInstances[i]) {
			// Update the existing chart
			paramsChartInstances[i].data.labels = labels;
			paramsChartInstances[i].data.datasets[0].data = paramValues;
			// Update the y-axis tick step size
			paramsChartInstances[i].options.scales.y.ticks.stepSize = ["lens_x", "lens_y"].includes(paramNames[i]) ? 0.01 : undefined;
			paramsChartInstances[i].update();
		} else {
			// Create a new chart regardless of whether the data is empty
			const chart = new Chart(ctx, {
				type: 'line',
				data: {
					labels: labels,
					datasets: [{
						label: paramNames[i],
						data: paramValues,
						borderColor: colors[i % colors.length],
						tension: 0.1,
						fill: false
					}]
				},
				options: {
					responsive: false,
					maintainAspectRatio: true,
					backgroundColor: 'white',
					// Ensure axes are shown even when there is no data
					scales: {
						x: {
							display: true,
							title: {
								display: true,
								text: 'iteration number',
								color: '#333',
								font: {
									size: 10
								}
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							},
							ticks: {
								color: '#666',
								font: {
									size: 9
								}
							}
						},
						y: {
							display: true,
							title: {
								display: true,
								text: 'parameter value',
								color: '#333',
								font: {
									size: 10
								}
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							},
							ticks: {
								color: '#666',
								font: {
									size: 9
								},
								// Set the y-axis tick step size to 0.01 for lens_x and lens_y
								stepSize: ["lens_x", "lens_y"].includes(paramNames[i]) ? 0.01 : undefined
							}
						}
					},
					plugins: {
						title: {
							display: true,
							text: `Parameter: ${paramNames[i]}`,
							color: '#333',
							font: {
								size: 11,
								weight: 'bold'
							}
						},
						legend: {
							display: false
						},
						backgroundColor: 'white'
					}
				}
			});

			// Save the chart instance
			paramsChartInstances[i] = chart;
		}
	}
}


// Update cleanupCanvas to also clear the parameter trend charts
function cleanupCanvas() {
	// Clear the chi-square curve chart
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;
	}

	// Clear the parameter trend chart instances
	if (paramsChartInstances && Array.isArray(paramsChartInstances)) {
		paramsChartInstances.forEach(instance => {
			if (instance) {
				instance.destroy();
			}
		});
		paramsChartInstances = [];
	}

	// Clear the global parameter history
	if (globalParamsHistory) {
		globalParamsHistory = [];
	}

	// Re-draw the empty chi-square curve chart
	if (typeof drawChiSquareCurve === 'function') {
		drawChiSquareCurve([]);
	}
	if (typeof drawParamsTrendChart === 'function') {
		drawParamsTrendChart([]);
	}

	// Clear the mask
	if (lets && typeof lets.clearMask === 'function') {
		lets.clearMask();
	}
}

// Draw parameter comparison lines after uploading the model
function drawModelComparisonLines(modelParams) {
	// Check whether the comparison line feature is enabled
	if (!window.drawModelComparisonLine) {
		return;
	}

	// Check whether the parameter trend chart instances exist
	if (!paramsChartInstances || paramsChartInstances.length === 0) {
		return;
	}

	// Check whether the global parameter history is empty
	if (!window.globalParamsHistory || window.globalParamsHistory.length === 0) {
		return;
	}

	// Define parameter names
	const paramNames = [
		'lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
		'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie'
	];

	// Check whether the number of model parameters matches
	if (!modelParams || modelParams.length !== paramNames.length) {
		console.warn('Model parameter count does not match; cannot draw comparison lines');
		return;
	}

	// Get the number of labels (iterations)
	const labelsCount = window.globalParamsHistory.length;

	// Draw a comparison line for each parameter
	for (let i = 0; i < modelParams.length; i++) {
		// Check whether a chart instance exists for this parameter
		if (!paramsChartInstances[i]) {
			continue;
		}

		// Get the current chart instance
		const chart = paramsChartInstances[i];

		// Create the comparison-line dataset
		const comparisonData = Array(labelsCount).fill(modelParams[i]);

		// Check whether the comparison dataset already exists; update it if so, otherwise add it
		let comparisonDatasetIndex = -1;
		for (let j = 0; j < chart.data.datasets.length; j++) {
			if (chart.data.datasets[j].label === 'Model Comparison') {
				comparisonDatasetIndex = j;
				break;
			}
		}

		if (comparisonDatasetIndex !== -1) {
			// Update the existing comparison line
			chart.data.datasets[comparisonDatasetIndex].data = comparisonData;
		} else {
			// Add a new comparison-line dataset
			chart.data.datasets.push({
				label: 'Model Comparison',
				data: comparisonData,
				borderColor: 'rgba(0, 0, 0, 0.8)',
				borderWidth: 2,
				borderDash: [5, 5],
				pointRadius: 0,
				fill: false,
				tension: 0,
				order: 0 // ensure the comparison line is displayed below the original data line
			});
		}

		// Update the chart
		chart.update();
	}
}

// Ensure the functions are available in the global scope so other modules can call them
window.cleanupCanvas = cleanupCanvas;
window.drawModelComparisonLines = drawModelComparisonLines;

let timer = async (timeout) => {
	console.log("Modeling");
	let chiSquaredValues = [];
	window.globalParamsHistory = [];

	for (let i = 0; i < timeout; ++i) {
		try {
			let p0 = [
				lets.model.components[1].x,
				lets.model.components[1].y,
				lets.model.components[1].theta_e,
				lets.model.components[1].ell,
				lets.model.components[1].ang,
				lets.model.components[0].x,
				lets.model.components[0].y,
				lets.model.components[0].size,
				lets.model.components[0].ell,
				lets.model.components[0].ang,
				lets.model.components[0].n_sersic,
				lets.model.components[0].Ie,
			];
			// Define a wrapper function to handle data type conversion
			const objectiveWrapper = async (params) => {
				const jsParams = Array.from(params);
				return await chi2_rescale(jsParams);
			};

			// Expose the wrapper functions to Python

			// Residual vector wrapper function (for the least_squares optimizer)
			const residualWrapper = async (params) => {
				const jsParams = Array.from(params);
				return await chi_residuals(jsParams);
			};
			pyodide.globals.set("objective_js", objectiveWrapper);
			pyodide.globals.set("residual_js", residualWrapper);
			let result = await pyodide.runPythonAsync(`
import numpy as np
from scipy import optimize
import asyncio
# Store the reduced chi2 values and parameter values during optimization
optimization_history = []
params_history = []

async def residual_async(x):
    """Asynchronous residual function: call the JS side to compute the residual vector"""
    try:
        x_list = x.tolist() if hasattr(x, 'tolist') else list(x)
        # Call the JS residual function, returning the residual vector chi_i = (data_i - model_i)/sigma_i
        result_proxy = await residual_js(x_list)
        r = np.array(list(result_proxy), dtype=float)
        # Record the reduced chi2 and parameter history (for front-end plotting)
        chi2_val = float(np.sum(r**2))
        dof = len(r) - 12
        reduced_chi2 = chi2_val / dof if dof > 0 else chi2_val
        optimization_history.append(reduced_chi2)
        params_history.append(x_list.copy())
        return r
    except Exception as e:
        print(f"Residual function error: {str(e)}")
        raise

def residual(x):
    """Synchronous wrapper for scipy.optimize.least_squares"""
    return asyncio.run(residual_async(x))

# Parameter bounds (least_squares format: two arrays (lower, upper))
lower_bounds = [-5, -5, 0.01, 1.0+1e-6, -180.0,   -10, -10, 0.01, 1.0, -180.0,   0.3, 0.001]
upper_bounds = [ 5,  5, 10,   10,        180.0,    10,  10, 5.0,  10,  180.0,    6.0, 10.0]

def run_optimization():
    # Set the initial parameters and clip them within the valid bounds to avoid "x0 is infeasible" errors
    initial_params = np.array(${JSON.stringify(p0)})
    initial_params = np.clip(initial_params, lower_bounds, upper_bounds)
    print(f"Initial params (after clipping): {initial_params}")

    try:
        # ====== Use the least_squares optimizer (Trust Region Reflective algorithm) ======
        # Advantages:
        #   1) Designed for non-linear least-squares problems, converging much faster than Nelder-Mead
        #   2) Computes the Jacobian matrix automatically during optimization
        #   3) Obtains the covariance matrix directly from the Jacobian, without extra Hessian computation
        #   4) Supports parameter bound constraints
        result = optimize.least_squares(
            residual,
            initial_params,
            method='trf',
            bounds=(lower_bounds, upper_bounds),
            max_nfev=500,
            verbose=0,
            ftol=1e-8,
            xtol=1e-8,
            gtol=1e-8
        )

        # Compute the final reduced chi2
        n_data = len(result.fun)
        n_params = len(result.x)
        dof = n_data - n_params
        chi2 = 2.0 * result.cost  # cost = 0.5 * sum(r^2)
        reduced_chi2 = chi2 / dof if dof > 0 else chi2

        print(f"Optimization complete: {result.message}")
        print(f"Final params: {result.x}")
        print(f"Reduced chi2: {reduced_chi2:.6f}")
        print(f"Function evaluations: {result.nfev}")

        # Ensure the lens and source angles always stay within 0-180
        result.x[4] = result.x[4] % 180
        result.x[9] = result.x[9] % 180

        # Return the result
        return {
            'x': result.x.tolist(),
            'fun': float(reduced_chi2),
            'iterations': int(result.nfev),
            'success': bool(result.success),
            'message': str(result.message),
            'history': optimization_history,
            'params_history': params_history
        }

    except Exception as e:
        print(f"Optimization process error: {str(e)}")
        raise

# Run the function and return the result
run_optimization()
					`);
			// Process the result, converting the Map to a plain object
			result = Object.fromEntries(result.toJs());
			console.log("Optimization result:", result);

			if (!result.success) {
				console.warn("Optimization did not converge successfully:", result.message);
			}

			let p1 = result.x;
			chiSquaredValues = chiSquaredValues.concat(result.history);
			drawChiSquareCurve(chiSquaredValues);
			// If parameter history exists, draw the parameter trend chart
			if (result.params_history && result.params_history.length > 0) {
				drawParamsTrendChart(result.params_history);
			}
			await show_res(p1);
			lets.model.components[1].x = p1[0];
			lets.model.components[1].y = p1[1];
			lets.model.components[1].theta_e = p1[2];
			lets.model.components[1].ell = p1[3];
			lets.model.components[1].ang = p1[4];
			lets.model.components[0].x = p1[5];
			lets.model.components[0].y = p1[6];
			lets.model.components[0].size = p1[7];
			lets.model.components[0].ell = p1[8];
			lets.model.components[0].ang = p1[9];
			lets.model.components[0].n_sersic = p1[10];
			lets.model.components[0].Ie = p1[11];
			lets.loadModel(lets.model.components);
			const angle = lets.lens.ang2pix({ x: lets.model.components[0].x, y: lets.model.components[0].y });
			lets.update(angle);
			lets.freezeSrcModel = true;
			updateCanvas(lets.model.components);
		} catch (error) {
			console.error("Optimization process error:", error);
		} finally {
			// Clear global variables
			pyodide.globals.delete("objective_js");
			pyodide.globals.delete("residual_js");
		}
	}
};



// Optimization entry function
async function do_fit() {
	if (!pyodide) {
		console.log("Pyodide not initialized, attempting to re-initialize...");
		const pyodideReady = await initPyodide();
		if (!pyodideReady) {
			window.alert('Optimizer initialization failed. Please refresh the page and try again!');
			return;
		}
	}
	if (ms_src.tools.length === 0) {
		window.alert('Please input Source Model!');
		return;
	}
	let tag2 = document.getElementById('tag2');
	tag2.style.display = 'block';

	let timerCallback = async () => {
		await timer(6); // Run the timer function 6 times
		tag2.style.display = 'none';
		lets.setFreezed();
	};
	try {
		await timerCallback(); // Pass the iteration count to the timerCallback function
	} catch (error) {
		console.log("An error occurred:", error);
	}
}

function updateCanvas(components) {
	let ang = lets.lens.ang2pix({ x: components[1].x, y: components[1].y });
	ms.tools[0].mark.x = ang.x;
	ms.tools[0].mark.y = ang.y;
	ms.tools[0].mark.angle = components[1].ang;
	ms.tools[0].mark.ry = components[1].theta_e / (lets.lens.pixscale * Math.sqrt(components[1].ell));
	ms.tools[0].mark.rx = ms.tools[0].mark.ry * components[1].ell;
	ms.renderTools();

	let ang2 = lets.lens.ang2pix({ x: components[0].x, y: components[0].y });
	ms_src.tools[0].mark.x = ang2.x;
	ms_src.tools[0].mark.y = ang2.y;
	ms_src.tools[0].mark.angle = components[0].ang;
	ms_src.tools[0].mark.ry = components[0].size / (lets.lens.pixscale * Math.sqrt(components[0].ell));
	ms_src.tools[0].mark.rx = ms_src.tools[0].mark.ry * components[0].ell;
	ms_src.renderTools();
}

// Expose show_res as a global function so other modules can call it
window.drawResiduals = drawResiduals;
// Expose do_fit in the global scope so it can be called directly from HTML
window.do_fit = do_fit;
window.updateCanvas = updateCanvas;
window.show_res = show_res;
// Expose the chart-drawing functions in the global scope
window.drawChiSquareCurve = drawChiSquareCurve;
window.drawParamsTrendChart = drawParamsTrendChart;
window.cleanupCanvas = cleanupCanvas;