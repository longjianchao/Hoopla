// 拟合优化建模相关功能

// 从npm导入ndarray相关库


//计算平均值
function average(data) {
	let sum = data.reduce(function (sum, value) {
		return sum + value;
	}, 0);
	return sum / data.length;
}

//计算标准差（使用样本标准差，与numpy.std()默认行为一致）
function standardDeviation(values) {
	if (values.length <= 1) return 0;
	let avg = average(values);
	let squareDiffs = values.map(function (value) {
		let diff = value - avg;
		return diff * diff;
	});
	// 使用样本标准差，除以N-1而不是N
	let avgSquareDiff = average(squareDiffs) * (values.length / (values.length - 1));
	return Math.sqrt(avgSquareDiff);
}

//计算单个镜头成像对图像（x，y）的弯曲效应
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

//根据弯曲后的点(x- αx, y-αy)计算该点在重构图像中的光度值。
function calImage(xs, ys, xsc, ysc, size, qs, phs, n, Ie) {
	// console.log('calImage');
	let res, phirad;
	// const n = 1.0;
	let b_n = 1.9992 * n - 0.3271;
	const Re = size;
	phirad = phs / 180 * Math.PI;
	// 重新进行坐标变换，得到了像素代表的坐标
	let xnew = (xs - xsc) * Math.cos(phirad) + (ys - ysc) * Math.sin(phirad);
	let ynew = (ys - ysc) * Math.cos(phirad) - (xs - xsc) * Math.sin(phirad);
	let r_ell = Math.sqrt((xnew * xnew) / qs + (ynew * ynew) * qs);
	// 归一化并代入 Sersic profile
	let rnorm = r_ell / Re;
	res = Ie * Math.exp(-b_n * (Math.pow(rnorm, 1 / n) - 1.0));
	return res;
}

//给定一组镜头参数,对每个图像点调用calAlpha()和calImage()计算预测图像光度值
function model_lensed_images(p, x1, x2) {
	let xc1, xc2, re, ql, phl;
	xc1 = p[0];
	xc2 = p[1];
	re = p[2];
	ql = p[3];
	phl = p[4];
	// 计算得到这个点对应的偏折角
	let alpha = calAlpha(x1, x2, xc1, xc2, re, ql, phl);
	// 计算源星系像的角位置
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
 * 执行 PSF 卷积 (纯 JavaScript 空间域实现)
 * * 注意：如果图像数值非常小 (如 1e-4)，在屏幕上会显示为黑色。
 * 建议在渲染时使用增益 (Gain) 或自动拉伸。
 */
function applyPSFCpu(image, width, height, psf, psfW, psfH) {
	if (!psf || !psf.length) return image;

	try {
		const result = new Float64Array(width * height);
		// PSF 归一化
		let psfSum = 0;
		for (let i = 0; i < psf.length; i++) psfSum += psf[i];
		if (Math.abs(psfSum) < 1e-12) psfSum = 1.0;

		// 计算 PSF 中心点
		const psfCenterX = Math.floor(psfW / 2);
		const psfCenterY = Math.floor(psfH / 2);

		// 空间域卷积
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let sum = 0;

				// 遍历 PSF
				for (let py = 0; py < psfH; py++) {
					for (let px = 0; px < psfW; px++) {
						// 计算图像中对应的像素位置
						const ix = x + px - psfCenterX;
						const iy = y + py - psfCenterY;

						// 边界检查
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
	// 如果WebGPU可用，使用WebGPU加速实现
	if (webgpuInitialized && fftConvolve) {
		try {
			// 将PSF数据填充到与图像相同大小，确保PSF中心点与图像中心点精确对齐
			let psfData = new Float64Array(width * height);
			// 计算PSF的中心点
			const psfCenterX = Math.floor(psfW / 2);
			const psfCenterY = Math.floor(psfH / 2);
			// 计算图像的中心点
			const imgCenterX = Math.floor(width / 2);
			const imgCenterY = Math.floor(height / 2);

			for (let y = 0; y < psfH; y++) {
				for (let x = 0; x < psfW; x++) {
					// 计算PSF像素相对于PSF中心的偏移
					const dx = x - psfCenterX;
					const dy = y - psfCenterY;
					// 将PSF像素放置到图像中心点对应的位置
					const ix = imgCenterX + dx;
					const iy = imgCenterY + dy;
					psfData[iy * width + ix] = psf[y * psfW + x];
				}
			}
			// 使用WebGPU执行FFT卷积
			const result = await fftConvolve.convolve(image, psfData);
			return result;
		} catch (error) {
			console.error('WebGPU PSF convolution failed, falling back to CPU implementation:', error);
			// 回退到CPU实现
		}
	}

	// 直接使用CPU实现 - 确保image是Float64Array
	return applyPSFCpu(image, width, height, psf, psfW, psfH);
}


async function chi2_rescale(p) {
	//重缩放因子，可以提高采样效率，但数值过大可能会导致图像失真
	const fscale = 4;
	const chi = new Array(Math.floor(globalImageData.length / fscale / fscale));
	const lightstd = standardDeviation(globalImageData);

	// 生成模型图像
	// 使用Float64Array提高精度，与Python的float64一致
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
	// 应用PSF卷积
	let convolvedImage;
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(modelImage, Math.floor(scaledWidth), Math.floor(scaledHeight),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		// 如果没有PSF数据，直接使用模型图像
		convolvedImage = modelImage;
	}
	let sigma;
	// 计算卡方值
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

	// 计算卡方值
	const chi2 = optimize.vector.dot(chi, chi);
	// 计算自由度：数据点数量 - 参数数量
	const dof = chi.length - 12;
	// 返回约化卡方
	return chi2 / dof;
}

// 计算残差向量（用于least_squares优化器）
// 与chi2_rescale类似，但返回残差向量 chi_i = (data_i - model_i)/sigma_i 而不是标量chi2
async function chi_residuals(p) {
	//重缩放因子，与chi2_rescale保持一致
	const fscale = 4;
	const residuals = [];

	// 生成模型图像
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
	// 应用PSF卷积
	let convolvedImage;
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(modelImage, Math.floor(scaledWidth), Math.floor(scaledHeight),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		convolvedImage = modelImage;
	}
	let sigma;
	// 计算残差向量 (data - model) / sigma
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
			console.log("图像加载完成，重新执行drawResiduals");
			drawResiduals();
		};
		return;
	}
	let c = document.getElementById("myCanvas");
	let ctx = c.getContext("2d");
	try {
		// 清除画布
		ctx.clearRect(0, 0, c.width, c.height);
		ctx.drawImage(imgd, 0, 0, c.width, c.height);
		// let dstdata = ctx.getImageData(0, 0, c.width, c.height);
		// ctx.putImageData(dstdata, 0, 0);
	} catch (error) {
		console.error("绘制过程中发生错误:", error);
	}
}

async function show_res(p) {
	let c = document.getElementById("myCanvas");
	let ctx = c.getContext("2d");
	let canvasWidth = c.width;
	let canvasHeight = c.height;
	// 直接使用globalImageData而不是从画布获取像素值
	if (!globalImageData) {
		console.error("globalImageData is not initialized");
		return;
	}
	const originPixscale = lets.pixscale * scale;
	const scaledWidth = imgd.width / scale;
	const scaledHeight = imgd.height / scale;
	let i, x, y;
	// 使用Float64Array提高精度，与Python的float64一致
	let testimg = new Float64Array(globalImageData.length);
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			let rowScaled = row / scale;
			let colScaled = col / scale;
			i = Math.floor(rowScaled) * Math.floor(scaledWidth) + Math.floor(colScaled);
			// 计算对应的坐标
			// x = col * lets.pixscale - lets.pixscale * imgd.width / 2 + lets.pixscale ;
			// y = -row * lets.pixscale + lets.pixscale * imgd.height / 2 - lets.pixscale ;
			x = (colScaled + 0.5 - scaledWidth / 2.0) * originPixscale;
			y = - (rowScaled + 0.5 - scaledHeight / 2.0) * originPixscale;
			testimg[i] = model_lensed_images(p, x, y);
		}
	}

	let convolvedImage;
	// 应用PSF卷积（WebGPU加速）
	if (globalPSFData && globalPSFData.data) {
		convolvedImage = await applyPSF(testimg, Math.floor(imgd.width / scale), Math.floor(imgd.height / scale),
			globalPSFData.data, globalPSFData.width, globalPSFData.height);
	} else {
		// 如果没有PSF数据，直接使用模型图像
		convolvedImage = testimg;
	}
	// 将convolvedImage保存在本地，格式为txt文件
	// const blob = new Blob([convolvedImage.join('\n')], { type: 'text/plain' });
	// const url = URL.createObjectURL(blob);
	// const a = document.createElement('a');
	// a.href = url;
	// a.download = 'convolvedImage_data.txt';
	// document.body.appendChild(a);
	// a.click();
	// document.body.removeChild(a);
	// URL.revokeObjectURL(url);

	// 计算chi-square和残差 - 使用原始图像尺寸
	let chi = new Float64Array(globalImageData.length);
	let residualImage = new Float64Array(globalImageData.length);
	let maxResidual = 0;
	let maxValue = 0;
	let sigma;
	// 计算残差和chi-square - 使用原始图像尺寸
	for (let row = 0; row < imgd.height; row += scale) {
		for (let col = 0; col < imgd.width; col += scale) {
			i = Math.floor(row / scale) * Math.floor(imgd.width / scale) + Math.floor(col / scale);
			if (globalNoiseData && globalNoiseData[i] > 0) {
				sigma = globalNoiseData[i];
			} else {
				sigma = Math.sqrt(globalImageData[i] + 1);
			}
			residualImage[i] = Math.abs(globalImageData[i] - convolvedImage[i]) / sigma;
			// 计算chi-square
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

	// 清除整个画布
	ctx.clearRect(0, 0, canvasWidth, canvasHeight);

	// 创建一个临时canvas用于绘制原始尺寸的残差图
	let tempCanvas = document.createElement('canvas');
	let tempWidth = imgd.width;
	let tempHeight = imgd.height;
	tempCanvas.width = tempWidth;
	tempCanvas.height = tempHeight;
	let tempCtx = tempCanvas.getContext('2d');
	let tempImageData = tempCtx.createImageData(tempWidth, tempHeight);
	let tempData = tempImageData.data;
	if (maxResidual < 1) maxResidual = 1;
	// 绘制原始尺寸的残差图到临时canvas
	for (let row = 0; row < tempHeight; row++) {
		for (let col = 0; col < tempWidth; col++) {
			let index = (row * tempWidth + col) * 4;
			let imgIndex = Math.floor(row / scale) * Math.floor(tempWidth / scale) + Math.floor(col / scale);
			// 归一化残差到[0, 1]范围
			let normalizedResidual = maxResidual > 0 ? residualImage[imgIndex] / maxResidual : 0;
			// 应用热图色标
			let rgb = hotColormap(normalizedResidual);
			// 设置RGB通道
			tempData[index] = rgb[0];    // red
			tempData[index + 1] = rgb[1];    // green
			tempData[index + 2] = rgb[2];    // blue
			tempData[index + 3] = 255;      // alpha
		}
	}

	// 将原始尺寸的残差图绘制到临时canvas上
	tempCtx.putImageData(tempImageData, 0, 0);
	// 使用drawImage将临时canvas上的图像放大绘制到主画布上
	// 这将自动处理图像拉伸，确保完整显示
	ctx.drawImage(tempCanvas, 0, 0, tempWidth, tempHeight, 0, 0, canvasWidth, canvasHeight);
	return res;
}

var chartInstance = null; // 声明一个全局变量来存储卡方值图表实例
var paramsChartInstances = paramsChartInstances || []; // 声明一个全局变量来存储参数趋势图表实例

// 修改绘制曲线函数，使其更适合显示优化过程
function drawChiSquareCurve(chiSquaredValues) {
	let ctx = document.getElementById("Curve");
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;  // 重要：将实例设置为null
	}

	// 确保chiSquaredValues是数组
	chiSquaredValues = chiSquaredValues || [];

	// 创建新图表，无论数据是否为空
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
			// 确保即使没有数据也显示轴线
			scales: {
				x: {
					display: true,
					title: {
						display: true,
						text: 'iteration number'
					},
					// 确保x轴始终显示
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
					// 使用对数刻度可能更好地显示函数值的变化
					type: 'logarithmic',
					// 确保y轴始终显示
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
 * 绘制参数趋势图（累加式更新）
 * @param {Array} paramsHistory - 包含每次迭代参数值的数组
 */
// 存储全局参数历史数据和图表实例，用于累加更新
window.globalParamsHistory = window.globalParamsHistory || [];
// 设置是否在上传模型后绘制对比线的开关
window.drawModelComparisonLine = true;

function drawParamsTrendChart(paramsHistory) {
	// 将新的参数历史数据追加到全局历史中
	if (paramsHistory && paramsHistory.length > 0) {
		window.globalParamsHistory = window.globalParamsHistory.concat(paramsHistory);
	}

	// 定义参数名称
	const paramNames = [
		'lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
		'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie'
	];

	// 颜色数组，用于为不同参数分配不同颜色
	const colors = [
		'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)',
		'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)',
		'rgb(199, 199, 199)', 'rgb(83, 102, 255)', 'rgb(40, 159, 64)',
		'rgb(210, 199, 199)', 'rgb(255, 99, 232)', 'rgb(50, 205, 50)'
	];

	// 获取参数趋势图的容器（在index.html中已预创建）
	let container = document.getElementById('paramsTrendContainer');
	if (!container) {
		// 作为后备，创建容器并确保添加到DOM
		container = document.createElement('div');
		container.id = 'paramsTrendContainer';
		container.style.flex = '1';
		container.style.minWidth = '0';
		// 查找flex容器并添加，或者添加到body
		const flexContainer = document.querySelector('div[style*="display: flex"]');
		if (flexContainer) {
			flexContainer.appendChild(container);
		} else {
			document.body.appendChild(container);
		}
	}

	// 查找网格容器（子元素）
	let gridContainer = container.querySelector('div[style*="display: grid"]');
	if (!gridContainer) {
		// 如果没有找到，创建网格容器
		gridContainer = document.createElement('div');
		gridContainer.style.display = 'grid';
		gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
		gridContainer.style.gridTemplateRows = 'repeat(4, auto)';
		gridContainer.style.gap = '4px';
		gridContainer.style.padding = '8px';
		container.appendChild(gridContainer);
	} else {
		// 更新网格容器的样式，但不改变布局
		gridContainer.style.gap = '4px';
		gridContainer.style.padding = '8px';
	}

	// 直接为每个参数创建或更新图表，无论是否有数据
	for (let i = 0; i < paramNames.length; i++) {
		let canvas = document.getElementById(`paramChart_${i}`);

		// 如果canvas不存在，输出警告但不创建（应该在HTML中已存在）
		if (!canvas) {
			console.warn(`Canvas with id paramChart_${i} not found. Please ensure it exists in the HTML.`);
			continue;
		}

		// 获取画布上下文
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			console.error(`Failed to get context for canvas paramChart_${i}`);
			continue;
		}

		// 提取当前参数的所有迭代值，如果全局历史为空则使用空数组
		const paramValues = window.globalParamsHistory.length > 0 ?
			window.globalParamsHistory.map(iteration => iteration[i]) : [];
		const labels = window.globalParamsHistory.length > 0 ?
			Array.from({ length: window.globalParamsHistory.length }, (_, idx) => idx + 1) :
			[1]; // 至少显示一个标签

		// 检查是否存在该参数的图表实例
		if (paramsChartInstances[i]) {
			// 更新现有图表
			paramsChartInstances[i].data.labels = labels;
			paramsChartInstances[i].data.datasets[0].data = paramValues;
			// 更新纵轴变化单位设置
			paramsChartInstances[i].options.scales.y.ticks.stepSize = ["lens_x", "lens_y"].includes(paramNames[i]) ? 0.01 : undefined;
			paramsChartInstances[i].update();
		} else {
			// 创建新图表，无论数据是否为空
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
					// 确保即使没有数据也显示轴线
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
								// 为lens_x和lens_y设置纵轴变化单位为0.01
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

			// 保存图表实例
			paramsChartInstances[i] = chart;
		}
	}
}


// 更新cleanupCanvas函数以清理参数趋势图
function cleanupCanvas() {
	// 清理卡方曲线图
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;
	}

	// 清理参数趋势图实例
	if (paramsChartInstances && Array.isArray(paramsChartInstances)) {
		paramsChartInstances.forEach(instance => {
			if (instance) {
				instance.destroy();
			}
		});
		paramsChartInstances = [];
	}

	// 清空全局参数历史数据
	if (globalParamsHistory) {
		globalParamsHistory = [];
	}

	// 重新绘制空的卡方曲线图
	if (typeof drawChiSquareCurve === 'function') {
		drawChiSquareCurve([]);
	}
	if (typeof drawParamsTrendChart === 'function') {
		drawParamsTrendChart([]);
	}

	// 清理mask
	if (lets && typeof lets.clearMask === 'function') {
		lets.clearMask();
	}
}

// 在上传模型后绘制参数对比线
function drawModelComparisonLines(modelParams) {
	// 检查是否启用了对比线功能
	if (!window.drawModelComparisonLine) {
		return;
	}

	// 检查参数趋势图实例是否存在
	if (!paramsChartInstances || paramsChartInstances.length === 0) {
		return;
	}

	// 检查全局参数历史是否为空
	if (!window.globalParamsHistory || window.globalParamsHistory.length === 0) {
		return;
	}

	// 定义参数名称
	const paramNames = [
		'lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
		'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie'
	];

	// 检查模型参数数量是否匹配
	if (!modelParams || modelParams.length !== paramNames.length) {
		console.warn('模型参数数量不匹配，无法绘制对比线');
		return;
	}

	// 获取标签数量（迭代次数）
	const labelsCount = window.globalParamsHistory.length;

	// 为每个参数绘制对比线
	for (let i = 0; i < modelParams.length; i++) {
		// 检查该参数的图表实例是否存在
		if (!paramsChartInstances[i]) {
			continue;
		}

		// 获取当前图表实例
		const chart = paramsChartInstances[i];

		// 创建对比线数据集
		const comparisonData = Array(labelsCount).fill(modelParams[i]);

		// 检查是否已存在对比线数据集，如果存在则更新，不存在则添加
		let comparisonDatasetIndex = -1;
		for (let j = 0; j < chart.data.datasets.length; j++) {
			if (chart.data.datasets[j].label === 'Model Comparison') {
				comparisonDatasetIndex = j;
				break;
			}
		}

		if (comparisonDatasetIndex !== -1) {
			// 更新现有对比线
			chart.data.datasets[comparisonDatasetIndex].data = comparisonData;
		} else {
			// 添加新的对比线数据集
			chart.data.datasets.push({
				label: 'Model Comparison',
				data: comparisonData,
				borderColor: 'rgba(0, 0, 0, 0.8)',
				borderWidth: 2,
				borderDash: [5, 5],
				pointRadius: 0,
				fill: false,
				tension: 0,
				order: 0 // 确保对比线在原始数据线下显示
			});
		}

		// 更新图表
		chart.update();
	}
}

// 确保函数在全局作用域中可用，以便其他模块调用
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
			console.log(p0);
			// 定义一个包装函数来处理数据类型转换
			const objectiveWrapper = async (params) => {
				const jsParams = Array.from(params);
				return await chi2_rescale(jsParams);
			};

			// 将包装函数暴露给Python

			// 残差向量包装函数（用于least_squares优化器）
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
# 存储优化过程中的约化chi2值和参数值
optimization_history = []
params_history = []

async def residual_async(x):
    """异步残差函数：调用JS端计算残差向量"""
    try:
        x_list = x.tolist() if hasattr(x, 'tolist') else list(x)
        # 调用JS端残差函数，返回残差向量 chi_i = (data_i - model_i)/sigma_i
        result_proxy = await residual_js(x_list)
        r = np.array(list(result_proxy), dtype=float)
        # 记录约化chi2和参数历史（用于前端绘图）
        chi2_val = float(np.sum(r**2))
        dof = len(r) - 12
        reduced_chi2 = chi2_val / dof if dof > 0 else chi2_val
        optimization_history.append(reduced_chi2)
        params_history.append(x_list.copy())
        return r
    except Exception as e:
        print(f"残差函数错误: {str(e)}")
        raise

def residual(x):
    """同步包装器，用于scipy.optimize.least_squares"""
    return asyncio.run(residual_async(x))

# 参数边界（least_squares格式：(lower, upper) 两个数组）
lower_bounds = [-5, -5, 0.01, 1.0+1e-6, -np.inf,   -10, -10, 0.01, 1.0, -np.inf,   0.3, 0.001]
upper_bounds = [ 5,  5, 10,   10,        np.inf,    10,  10, 5.0,  10,  np.inf,    6.0, 10.0]

def run_optimization():
    # 设置初始参数并裁剪至有效边界内，避免 x0 is infeasible 错误
    initial_params = np.array(${JSON.stringify(p0)})
    initial_params = np.clip(initial_params, lower_bounds, upper_bounds)
    print(f"初始参数(应用边界后): {initial_params}")

    try:
        # ====== 使用least_squares优化器（Trust Region Reflective算法）======
        # 优势：
        #   1) 专为非线性最小二乘问题设计，收敛速度远快于Nelder-Mead
        #   2) 优化过程中自动计算Jacobian矩阵
        #   3) 从Jacobian直接得到协方差矩阵，无需额外的Hessian计算
        #   4) 支持参数边界约束
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

        # 计算最终的约化chi2
        n_data = len(result.fun)
        n_params = len(result.x)
        dof = n_data - n_params
        chi2 = 2.0 * result.cost  # cost = 0.5 * sum(r^2)
        reduced_chi2 = chi2 / dof if dof > 0 else chi2

        print(f"优化完成: {result.message}")
        print(f"最终参数: {result.x}")
        print(f"约化chi2: {reduced_chi2:.6f}")
        print(f"函数评估次数: {result.nfev}")

        # ====== 从Jacobian计算协方差矩阵和参数误差 ======
        print()
        print("====== 从Jacobian计算参数误差估计 ======")

        sigma_values = [float('nan')] * n_params
        covariance_matrix = None
        error_estimation_success = False

        try:
            J = result.jac
            JTJ = J.T @ J

            print(f"数据点数: {n_data}, 参数数: {n_params}, 自由度: {dof}")
            print(f"约化chi2 (用于缩放协方差): {reduced_chi2:.6f}")

            # 检查JTJ是否可逆
            eigenvalues = np.linalg.eigvalsh(JTJ)
            cond_number = eigenvalues.max() / max(eigenvalues.min(), 1e-30)

            if np.all(eigenvalues > 0):
                # 协方差矩阵 = (J^T J)^(-1) * reduced_chi2
                covariance = np.linalg.inv(JTJ) * reduced_chi2
                covariance_matrix = covariance.tolist()

                for k in range(n_params):
                    if covariance[k, k] > 0:
                        sigma_values[k] = float(np.sqrt(covariance[k, k]))
                    else:
                        sigma_values[k] = float('nan')

                error_estimation_success = True
            else:
                print("警告：J^T J 非正定，使用Moore-Penrose伪逆")
                covariance = np.linalg.pinv(JTJ) * reduced_chi2
                covariance_matrix = covariance.tolist()
                for k in range(n_params):
                    if covariance[k, k] > 0:
                        sigma_values[k] = float(np.sqrt(covariance[k, k]))
                    else:
                        sigma_values[k] = float('nan')
                error_estimation_success = True

            # 打印误差估计结果
            param_names = ['lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
                           'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie']
            print()
            print("参数误差估计结果（1 sigma）：")
            for k in range(n_params):
                name = param_names[k] if k < len(param_names) else f"p{k}"
                print(f"  {name}: {result.x[k]:.6f} +/- {sigma_values[k]:.6f}")

            # ====== 验证1：检查条件数 ======
            print()
            print("====== 误差估计可靠性验证 ======")
            print(f"条件数 (JTJ矩阵): {cond_number:.2e}")
            if cond_number < 1e3:
                print("  ✓ 条件数良好，参数相关性低")
            elif cond_number < 1e6:
                print("  ⚠️ 条件数中等，存在一定参数相关性")
            else:
                print("  ✗ 条件数较大，参数高度相关，误差估计可能不可靠")

            # ====== 验证2：检查参数相关性矩阵 ======
            if covariance_matrix is not None:
                print()
                print("参数相关性矩阵（绝对值 > 0.5 的强相关）：")
                cov_np = np.array(covariance_matrix)
                corr_matrix = np.zeros_like(cov_np)
                for i in range(n_params):
                    for j in range(n_params):
                        denom = np.sqrt(cov_np[i, i]) * np.sqrt(cov_np[j, j])
                        if denom > 0:
                            corr_matrix[i, j] = cov_np[i, j] / denom
                
                strong_correlations = []
                for i in range(n_params):
                    for j in range(i+1, n_params):
                        if abs(corr_matrix[i, j]) > 0.5:
                            strong_correlations.append((param_names[i], param_names[j], corr_matrix[i, j]))
                
                if len(strong_correlations) == 0:
                    print("  ✓ 无强相关参数")
                else:
                    print("  ⚠️ 存在强相关参数对：")
                    for p1, p2, corr in strong_correlations:
                        print(f"    {p1} 与 {p2}: {corr:.3f}")

            # ====== 验证3：残差分布检查 ======
            print()
            print("残差分布统计：")
            residuals = result.fun
            if len(residuals) > 0:
                res_mean = np.mean(residuals)
                res_std = np.std(residuals)
                res_min = np.min(residuals)
                res_max = np.max(residuals)
                print(f"  均值: {res_mean:.4f} (期望: ~0)")
                print(f"  标准差: {res_std:.4f} (期望: ~1)")
                print(f"  范围: [{res_min:.2f}, {res_max:.2f}]")
                
                if abs(res_mean) < 0.1 and abs(res_std - 1) < 0.1:
                    print("  ✓ 残差分布符合预期")
                else:
                    print("  ⚠️ 残差分布偏离预期，建议检查模型或噪声估计")

            # ====== 验证4：Profile Likelihood 参数不确定性估计 ======
            print()
            print("====== Profile Likelihood 参数不确定性估计 ======")
            print("说明：通过固定单个参数，优化其他参数，测量χ²增加1时的参数范围")
            print("      这是从数据直接测量不确定性的客观方法")
            
            param_names = ['lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
                          'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie']
            
            # 定义参数边界（用于Profile Likelihood搜索）
            search_bounds = [
                (-0.5, 0.5),     # lens_x
                (-0.5, 0.5),     # lens_y
                (0.1, 5.0),      # theta_e
                (1.0+1e-6, 10),  # lens_ell
                (-180, 180),     # lens_ang
                (-1.0, 1.0),     # source_x
                (-1.0, 1.0),     # source_y
                (0.01, 2.0),     # source_size
                (1.0, 10),       # source_ell
                (-180, 180),     # source_ang
                (0.3, 6.0),      # n_sersic
                (0.001, 5.0),    # Ie
            ]
            
            # Profile Likelihood计算函数
            def profile_likelihood(param_index, param_value):
                """固定param_index为param_value，优化其他参数"""
                def constrained_residual(x):
                    x_fixed = x.copy()
                    x_fixed[param_index] = param_value
                    return residual(x_fixed)
                
                # 创建除固定参数外的边界
                lower = np.array(lower_bounds).copy()
                upper = np.array(upper_bounds).copy()
                lower[param_index] = param_value
                upper[param_index] = param_value
                
                x0 = result.x.copy()
                x0[param_index] = param_value
                
                res = optimize.least_squares(
                    constrained_residual,
                    x0,
                    method='trf',
                    bounds=(lower, upper),
                    max_nfev=100,
                    ftol=1e-6,
                    xtol=1e-6
                )
                return 2.0 * res.cost  # 返回chi2
            
            # 计算每个参数的Profile Likelihood
            sigma_profile = []
            chi2_min = 2.0 * result.cost  # 最优chi2
            
            for k in range(n_params):
                best_val = result.x[k]
                lb, ub = search_bounds[k]
                
                # 定义目标函数：找到使得chi2 = chi2_min + 1的参数值
                def find_bound(direction):
                    # direction = +1 找上边界，direction = -1 找下边界
                    target_chi2 = chi2_min + 1.0
                    
                    # 初始搜索范围
                    a, b = best_val, best_val + direction * (ub - lb) * 0.2
                    
                    # 二分搜索
                    for _ in range(20):
                        mid = (a + b) / 2
                        if mid < lb or mid > ub:
                            break
                        current_chi2 = profile_likelihood(k, mid)
                        
                        if current_chi2 < target_chi2:
                            a = mid  # 需要继续向外搜索
                        else:
                            b = mid
                    
                    return a
                
                try:
                    lower_bound = find_bound(-1)
                    upper_bound = find_bound(1)
                    sigma = (upper_bound - lower_bound) / 2.0
                    sigma_profile.append(max(sigma, 1e-10))
                except:
                    # 如果Profile Likelihood失败，使用Jacobian估计作为后备
                    sigma_profile.append(sigma_values[k])
            
            # 打印Profile Likelihood结果
            print()
            print("参数  | 最优值 | Profile误差(1σ) | 相对误差")
            print("------|--------|----------------|----------")
            for k in range(n_params):
                name = param_names[k] if k < len(param_names) else f"p{k}"
                val = result.x[k]
                sig = sigma_profile[k]
                rel = sig / abs(val) * 100 if abs(val) > 1e-10 else float('inf')
                print(f"{name:6s} | {val:.6f} | {sig:.6f} | {rel:.1f}%")
            
            # 与Jacobian估计对比
            print()
            print("Jacobian与Profile Likelihood对比：")
            print("参数  | Jacobian | Profile | 比值")
            print("------|----------|---------|------")
            for k in range(n_params):
                name = param_names[k] if k < len(param_names) else f"p{k}"
                jac = sigma_values[k]
                prof = sigma_profile[k]
                ratio = prof / jac if jac > 0 else float('nan')
                print(f"{name:6s} | {jac:.6f} | {prof:.6f} | {ratio:.2f}")
            
            # 使用Profile Likelihood结果作为最终的误差估计
            sigma_values = sigma_profile
            print()
            print("✓ 已将sigma_values更新为Profile Likelihood误差估计")

        except Exception as cov_err:
            print(f"协方差矩阵计算失败: {str(cov_err)}")
            error_estimation_success = False

        print("====== 误差估计完成 ======")
        print()

        # 确保镜头和源的角度始终在 0-180 之间
        result.x[4] = result.x[4] % 180
        result.x[9] = result.x[9] % 180

        # 返回结果（保持与前端兼容的接口格式）
        return {
            'x': result.x.tolist(),
            'fun': float(reduced_chi2),
            'iterations': int(result.nfev),
            'success': bool(result.success),
            'message': str(result.message),
            'history': optimization_history,
            'params_history': params_history,
            'sigma': sigma_values,
            'covariance': covariance_matrix,
            'error_estimation_success': error_estimation_success
        }

    except Exception as e:
        print(f"优化过程错误: {str(e)}")
        raise

# 执行函数并返回结果
run_optimization()
				`);
			// 处理结果 将Map转换为普通对象
			result = Object.fromEntries(result.toJs());
			console.log("优化结果:", result);

			// 输出参数误差估计结果
			if (result.error_estimation_success && result.sigma) {
				window.lets.model.sigma = result.sigma;
				const paramNames = [
					'lens_x', 'lens_y', 'theta_e', 'lens_ell', 'lens_ang',
					'source_x', 'source_y', 'source_size', 'source_ell', 'source_ang', 'n_sersic', 'Ie'
				];
				console.log("====== 参数误差估计 (1σ) ======");
				for (let k = 0; k < result.x.length; k++) {
					const name = paramNames[k] || `p${k}`;
					const val = result.x[k];
					const sig = result.sigma[k];
					console.log(`  ${name}: ${val.toFixed(6)} ± ${sig.toFixed(6)}`);
				}
			} else {
				console.warn("误差估计未成功，sigma值不可用");
			}

			if (!result.success) {
				console.warn("优化未成功收敛:", result.message);
			}

			let p1 = result.x;
			chiSquaredValues = chiSquaredValues.concat(result.history);
			drawChiSquareCurve(chiSquaredValues);
			// 如果有参数历史数据，绘制参数趋势图
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
			console.log(lets);
		} catch (error) {
			console.error("优化过程出错:", error);
		} finally {
			// 清理全局变量
			pyodide.globals.delete("objective_js");
			pyodide.globals.delete("residual_js");
		}
	}
};



// 优化入口函数
async function do_fit() {
	if (!pyodide) {
		console.log("Pyodide未初始化，尝试重新初始化...");
		const pyodideReady = await initPyodide();
		if (!pyodideReady) {
			window.alert('优化器初始化失败，请刷新页面重试！');
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
		await timer(6); // 执行6次timer函数
		// console.log(lets.model);
		tag2.style.display = 'none';
		lets.setFreezed();
	};
	try {
		await timerCallback(); // 将迭代次数作为参数传递给timerCallback函数
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

// 将show_res函数设置为全局函数，以便在其他模块中调用
window.drawResiduals = drawResiduals;
// 将do_fit函数暴露到全局作用域，以便在HTML中直接调用
window.do_fit = do_fit;
window.updateCanvas = updateCanvas;
window.show_res = show_res;
// 将图表绘制函数暴露到全局作用域
window.drawChiSquareCurve = drawChiSquareCurve;
window.drawParamsTrendChart = drawParamsTrendChart;
window.cleanupCanvas = cleanupCanvas;