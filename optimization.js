// 拟合优化建模相关功能

//计算平均值
function average(data){
	let sum = data.reduce(function(sum, value){
		return sum + value;
	}, 0);
	return sum / data.length;
}

//计算标准差
function standardDeviation(values){
	let avg = average(values);
	let squareDiffs = values.map(function(value){
		let diff = value - avg;
		return diff * diff;
	});
	let avgSquareDiff = average(squareDiffs);
	return Math.sqrt(avgSquareDiff);
}

//计算单个镜头成像对图像（x，y）的弯曲效应
function calAlpha(xl, yl, xlc, ylc, re, ql, phl) {
	// console.log('calAlpha');
	if(ql <1.0){
		phl = Math.PI * ((90-phl) / 180);
	}
	else{
		ql = 1.0/ql-0.0000000001;
		phl = Math.PI * (phl / 180);
	}

	const alpha = {x: 0.0, y: 0.0};
	let x, y, cs, sn;
	let sx_r, sy_r, psi, sq, pd1, pd2, fx1, fx2, qs, a1, a2;
	const rc = 0.0;

	cs = Math.cos(phl);
	sn = Math.sin(phl);

	x = xl - xlc;
	y = yl - ylc;

	sx_r = x * cs + y * sn;
	sy_r = -x * sn + y * cs;

	psi = Math.sqrt(ql*ql*(rc*rc+sx_r*sx_r)+sy_r*sy_r);
	sq = Math.sqrt(1.0-ql*ql);
	pd1 = psi + rc;
	pd2 = psi + rc*ql*ql;
	fx1 = sq * sx_r / pd1;
	fx2 = sq * sy_r / pd2;
	qs = Math.sqrt(ql);

	a1 = qs / sq * Math.atan(fx1);
	a2 = qs / sq * Math.atanh(fx2);

	let dx = (a1 * cs - a2 * sn);
	let dy = (a2 * cs + a1 * sn);
	// Add lensing effects of just this component:
	alpha.x = re*dx;
	alpha.y = re*dy;
	return alpha;
}

//根据弯曲后的点(x- αx, y-αy)计算该点在重构图像中的光度值。
function calImage(xs, ys, xsc, ysc, size, qs, phs, n, Ie) {
	// console.log('calImage');
	let res, phirad;
	// const n = 1.0;
	let b_n = 1.9992 * n - 0.3271;
	const Re = size;
	phirad = phs/180*Math.PI;
	// 重新进行坐标变换，得到了像素代表的坐标
	let xnew = (xs-xsc) * Math.cos(phirad) + (ys-ysc) * Math.sin(phirad);
	let ynew = (ys-ysc) * Math.cos(phirad) - (xs-xsc) * Math.sin(phirad);
	let r_ell = Math.sqrt((xnew * xnew) / qs + (ynew * ynew) * qs);
	// 归一化并代入 Sersic profile
	let rnorm = r_ell / Re;
	// 避免数值问题
	if (rnorm === 0) {
		return 1.0; // 在中心处返回最大值
	}
	try {
		res = Ie * Math.exp(-b_n * (Math.pow(rnorm, 1/n)-1.0));
		// 检查结果是否为有效数字
		return isNaN(res) || !isFinite(res) ? 0 : res;
	} catch (e) {
		return 0;
	}
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

	let yc1, yc2, size, qs, phs, n;
	yc1 = p[5];
	yc2 = p[6];
	size = p[7];
	qs = p[8];
	phs = p[9];
	n = p[10];
	Ie = p[11];
	return calImage(y1, y2, yc1, yc2, size, qs, phs, n, Ie);
}

function chi2_rescale(p) {
	if(!globalImageData){
		let c = document.getElementById("myCanvas");
		c.willReadFrequently = true;
		let ctx = c.getContext("2d");
		ctx.drawImage(imgd, 0, 0);
		let dstdata = ctx.getImageData(0, 0, imgd.width, imgd.height);
		let data = dstdata.data;
		//图像存储方式为RGBA，一个像素就是由（R,G,B,A）来存储的，将图像映射到红色通道上，所以长度为原数据长度的1/4
		globalImageData = new Array(data.length/4);
		for (let i = 0, n = globalImageData.length; i < n; i ++){
			globalImageData[i] = data[i*4]/255;
		}
	}
		
	//重缩放因子，可以提高采样效率，但数值过大可能会导致图像失真
	const fscale = 4;
	const chi = new Array(globalImageData.length / fscale / fscale);
	const redstd = standardDeviation(globalImageData);

	for(let row = 0 ; row < imgd.height ; row+=fscale){
		for(let col = 0 ; col < imgd.width ; col+=fscale){
			let i,i2,x,y;
			i = row/scale * imgd.width/scale + col/scale;
			i2 = row/fscale*imgd.width/fscale+col/fscale;
			x = col* lets.pixscale - lets.pixscale*lets.width/2 + lets.pixscale/2;
			y = -row* lets.pixscale + lets.pixscale*lets.height/2 - lets.pixscale/2;
			val = model_lensed_images(p, x, y);
			chi[i2] = (globalImageData[i] - val)/redstd;
		}
	}
	// 计算卡方值
	const chi2 = optimize.vector.dot(chi, chi);
	// 计算自由度：数据点数量 - 参数数量
	const dof = chi.length - 11;
	// 返回约化卡方
	return chi2 / dof;
}


/**
 * 专门用于将imgd的红色通道绘制到myCanvas上的函数
 */
function drawResiduals() {
	if(!imgd.complete || imgd.naturalWidth === 0) {
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
		let dstdata = ctx.getImageData(0, 0, c.width, c.height);
		let data = dstdata.data;
		let red = new Array(data.length/4);
		for (let i = 0, n = red.length; i < n; i ++){
			red[i] = data[i*4]/255; // 提取红色通道值（0-1之间）
		}
		for (let x = 0; x < c.height; ++x) {
			for (let y = 0; y < c.width; ++y) {
				let index = (x * c.width + y) * 4;   // 4个通道：r,g,b,alpha
				let index2 = (x * c.width + y);      // 像素索引
				// 设置红色通道为原始红色值
				data[index]   = Math.round(red[index2] * 255);    // red
				data[++index] = 0;    // green
				data[++index] = 0;    // blue
				data[++index] = 255;  // alpha
			}
		}
		for (let i = 0; i < data.length; i++) {
			dstdata.data[i] = data[i];
		}
		ctx.putImageData(dstdata, 0, 0);
	} catch (error) {
		console.error("绘制过程中发生错误:", error);
	}
}

function show_res(p) {
	let c = document.getElementById("myCanvas");
	let ctx = c.getContext("2d");
	ctx.drawImage(imgd, 0, 0);
	let dstdata = ctx.getImageData(0, 0, imgd.width, imgd.height);
	let data = dstdata.data;
	let red = new Array(data.length/4);
	let maxRed = 0;
	for (let i = 0, n = red.length; i < n; i ++){
		red[i] = data[i*4]/255;
		if(maxRed<red[i]) maxRed=red[i];
	}
	console.log("像素最大值：",maxRed);
	let chi = new Array(red.length);
	let testimg = new Array(red.length);
	let redstd = standardDeviation(red);
	let i,x,y;
	let maxValue = 0;
	for (let row = 0; row < lets.height; row++) {
		for (let col = 0; col < lets.width; col++) {
			i = row * lets.width + col;
			x = col * lets.pixscale - lets.pixscale*lets.width/2 ;
			y = -row * lets.pixscale + lets.pixscale*lets.height/2 ;
			testimg[i] = model_lensed_images(p, x, y);
			if(maxValue<testimg[i]) maxValue = testimg[i];
			chi[i] = (red[i] - testimg[i]) / redstd / redstd;
		}
	}
	console.log("max value = ",maxValue);
	let res = optimize.vector.dot(chi, chi);
	if(isNaN(res)) {
		console.log('Error: NaN result');
	}
	console.log('res:'+res/red.length);
	let checkParams = p.map((param) => param === 0);
	
	for (let x = 0; x < imgd.height; ++x) {
		for (let y = 0; y < imgd.width; ++y) {
			let index = (x * imgd.width + y) * 4;   //4是image的4个通道r,g,b和透明度
			let index2 = (x * imgd.width + y);
			testimg[index2] /= maxValue;
			// data[index]   = Math.round(testimg[index2]*255);    // red
			data[index]   = Math.round(Math.abs(testimg[index2]-red[index2])*255);    // red
			data[++index] = 0;    // green
			data[++index] = 0;    // blue
			data[++index] = 255;      // alpha
		}
	}

	for (let i = 0; i < data.length; i++) {
		dstdata.data[i] = data[i];
	}
	ctx.putImageData(dstdata, 0, 0);
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
					min: 0.1,
					ticks: {
						min: 0.1,
						max: 100
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
								}
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

let timer = async(timeout) => {
	console.log("Modeling");
	let chiSquaredValues = [];
	window.globalParamsHistory = [];

	for (let i = 0; i < timeout; ++i){
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
			const objectiveWrapper = (params) => {
				// 确保输入是普通的JavaScript数组
				const jsParams = Array.from(params);
				let ptest = [
					0,
					0,
					0,
					1,
					0,
					jsParams[5],
					jsParams[6],
					jsParams[7],
					jsParams[8],
					jsParams[9],
					jsParams[10],
					jsParams[11],
				]
				return chi2_rescale(jsParams);
			};

			// 将包装函数暴露给Python
			pyodide.globals.set("objective_js", objectiveWrapper);

			// 执行优化
			let result = await pyodide.runPythonAsync(`
					import numpy as np
					from scipy import optimize
					# 存储优化过程中的函数值和参数值
					optimization_history = []
					# 存储每个参数在每次迭代中的值
					params_history = []
					def objective(x):
						try:
							x_list = x.tolist() if hasattr(x, 'tolist') else list(x)
							val = float(objective_js(x_list))
							optimization_history.append(val)
							params_history.append(x_list.copy())
							return val
						except Exception as e:
							print(f"目标函数错误: {str(e)}")
							raise
					bounds = [
							(-1, 1), (-1, 1), (0.1, 10), (1.0, 10), (0, 180),  			   # 透镜参数
							(-5, 5), (-5, 5), (0.01, 5.0), (1.0, 10), (0, 180),(0.3, 6.0), (0.1, 10.0)    # 源参数
					]
					def run_optimization():
						# 设置初始参数
						initial_params = np.array(${JSON.stringify(p0)})
						print(f"初始参数: {initial_params}")

						try:
							# 执行优化
							result = optimize.minimize(
								objective,
								initial_params,
								method='Nelder-Mead',
								options={
									'maxiter': 200,
									'disp': True
								},
								bounds=bounds
							)

							print(f"优化完成: {result.message}")
							print(f"最终参数: {result.x}")
							print(f"最终函数值: {result.fun}")

							# 创建并返回结果字典
							return {
								'x': result.x.tolist(),
								'fun': float(result.fun),
								'iterations': int(result.nit),
								'success': bool(result.success),
								'message': str(result.message),
								'history': optimization_history,
								'params_history': params_history
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

			if (!result.success) {
				console.warn("优化未成功收敛:", result.message);
			} else {
				i = timeout-1;
			}

			let p1 = result.x;
			chiSquaredValues = chiSquaredValues.concat(result.history);
			drawChiSquareCurve(chiSquaredValues);
			// 如果有参数历史数据，绘制参数趋势图
			if (result.params_history && result.params_history.length > 0) {
				drawParamsTrendChart(result.params_history);
			}
			show_res(p1);
			lets.model.components[1].x = p1[0];
			lets.model.components[1].y = p1[1];
			lets.model.components[1].theta_e = p1[2];
			lets.model.components[1].ell = p1[3];
			lets.model.components[1].ang = p1[4];
			// lets.model.components[1].x = 0;
			// lets.model.components[1].y = 0;
			// lets.model.components[1].theta_e = 0;
			// lets.model.components[1].ell = 1;
			// lets.model.components[1].ang = 0;
			lets.model.components[0].x = p1[5];
			lets.model.components[0].y = p1[6];
			lets.model.components[0].size = p1[7];
			lets.model.components[0].ell = p1[8];
			lets.model.components[0].ang = p1[9];
			lets.model.components[0].n_sersic = p1[10];
			lets.model.components[0].Ie = p1[11];
			lets.loadModel(lets.model.components);
			const angle = lets.lens.ang2pix({x: lets.model.components[0].x, y: lets.model.components[0].y});
			lets.update(angle);
			lets.freezeSrcModel = true;
			updateCanvas(lets.model.components);
			console.log(lets);
		} catch (error) {
			console.error("优化过程出错:", error);
		} finally {
			// 清理全局变量
			pyodide.globals.delete("objective_js");
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
	if(ms_src.tools.length === 0){ 
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
	let ang = lets.lens.ang2pix({x: components[1].x, y: components[1].y});
	ms.tools[0].mark.x = ang.x;
	ms.tools[0].mark.y = ang.y;
	ms.tools[0].mark.angle = components[1].ang ;
	ms.tools[0].mark.ry = components[1].theta_e/(lets.lens.pixscale*Math.sqrt(components[1].ell));
	ms.tools[0].mark.rx = ms.tools[0].mark.ry * components[1].ell;
	ms.renderTools();

	let ang2 = lets.lens.ang2pix({x: components[0].x, y: components[0].y});
	ms_src.tools[0].mark.x = ang2.x;
	ms_src.tools[0].mark.y = ang2.y;
	ms_src.tools[0].mark.angle = components[0].ang;
	ms_src.tools[0].mark.ry = components[0].size/(lets.lens.pixscale*Math.sqrt(components[0].ell));
	ms_src.tools[0].mark.rx = ms_src.tools[0].mark.ry *components[0].ell;
	ms_src.renderTools();
}

// 将show_res函数设置为全局函数，以便在其他模块中调用
window.drawResiduals = drawResiduals;
