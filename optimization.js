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
		phl = Math.PI * ((phl) / 180);
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
function calImage(xs, ys, xsc, ysc, size, qs, phs, n = 1.0) {
	// console.log('calImage');
	let r2, res, phirad;
	// const n = 1.0;
	let b_n = 1.9992 * n - 0.3271;
	const Re = size;
	// let Ie = 1.0 / (2 * Math.PI * Re**2 * n * Math.exp(b_n) / b_n**(2*n));  // 保证总光度一致
	// Loop over x and y. Store 1-D pixel index as i.
	phirad = phs/180*Math.PI;
	// 重新进行坐标变换，得到了像素代表的坐标
	let xnew = (xs-xsc) * Math.cos(phirad) + (ys-ysc) * Math.sin(phirad);
	let ynew = (ys-ysc) * Math.cos(phirad) - (xs-xsc) * Math.sin(phirad);
	// Gaussian方法
	// r2 = ( xnew*xnew/qs + ynew*ynew*qs );
	// 计算得到区域亮度因子
	// let sig2 = size ** 2 * 0.693;
	// res = Math.exp(-r2/(2.0 * sig2));
	let r_ell = Math.sqrt((xnew * xnew) / qs + (ynew * ynew) * qs);
	// 归一化并代入 Sersic profile（n = 1）
	let rnorm = r_ell / Re;
	res = Math.exp(-b_n * (rnorm**(1/n)));  //这里做了sersic函数的归一化处理
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
	return calImage(y1, y2, yc1, yc2, size, qs, phs, n);
}

//考虑放缩因子，对图像downsampling后进行最小二乘拟合,加快计算速度
function chi2_rescale(p) {
	// console.log(imgd.width,imgd.height);
	let c = document.getElementById("myCanvas");
	c.willReadFrequently = true;
	let ctx = c.getContext("2d");
	ctx.drawImage(imgd, 0, 0);
	let dstdata = ctx.getImageData(0, 0, imgd.width, imgd.height);
	let data = dstdata.data;
	//图像存储方式为RGBA，一个像素就是由（R,G,B,A）来存储的，将图像映射到红色通道上，所以长度为原数据长度的1/4
	let red = new Array(data.length/4);
	for (let i = 0, n = red.length; i < n; i ++){
		red[i] = data[i*4]/255;
	}
	//重缩放因子，可以提高采样效率，但数值过大可能会导致图像失真
	const fscale = 4;
	const chi = new Array(red.length / fscale / fscale);
	const testimg = new Array(red.length);
	const redstd = standardDeviation(red);

	for(let row = 0 ; row < imgd.height ; row+=fscale){
		for(let col = 0 ; col < imgd.width ; col+=fscale){
			let i,i2,x,y;
			i = row * imgd.width + col;
			i2 = row/fscale*imgd.width/fscale+col/fscale;
			x = col* lets.pixscale - lets.pixscale*lets.width/2 + lets.pixscale/2;
			y = -row* lets.pixscale + lets.pixscale*lets.height/2 - lets.pixscale/2;
			testimg[i] = model_lensed_images(p, x, y);
			chi[i2] = (red[i] - testimg[i])/redstd/redstd/(chi.length);
		}
	}
	return optimize.vector.dot(chi, chi);
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

var chartInstance = null; // 声明一个全局变量来存储 Chart 实例

// 修改绘制曲线函数，使其更适合显示优化过程
function drawChiSquareCurve(chiSquaredValues) {
	let ctx = document.getElementById("Curve");
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;  // 重要：将实例设置为null
	}
	if (chartInstance) {
		// 更新现有图表
		chartInstance.data.labels = Array.from({ length: chiSquaredValues.length }, (_, i) => i + 1);
		chartInstance.data.datasets[0].data = chiSquaredValues;
		chartInstance.update();
	} else {
		// 创建新图表
		chartInstance = new Chart(ctx, {
			type: 'line',
			data: {
				labels: Array.from({ length: chiSquaredValues.length }, (_, i) => i + 1),
				datasets: [{
					label: '卡方值',
					data: chiSquaredValues,
					borderColor: 'rgb(75, 192, 192)',
					tension: 0.1,
					fill: false
				}]
			},
			options: {
				responsive: true,
				scales: {
					x: {
						title: {
							display: true,
							text: '迭代次数'
						}
					},
					y: {
						title: {
							display: true,
							text: '目标函数值'
						},
						// 使用对数刻度可能更好地显示函数值的变化
						type: 'logarithmic'
					}
				},
				plugins: {
					title: {
						display: true,
						text: '优化过程中的卡方值变化'
					},
					legend: {
						position: 'top',
					}
				}
			}
		});
	}
}

let timer = async(timeout) => {
	console.log("Modeling");
	let chiSquaredValues = [];
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
			];
			console.log(p0);
			// 定义一个包装函数来处理数据类型转换
			const objectiveWrapper = (params) => {
				// 确保输入是普通的JavaScript数组
				const jsParams = Array.from(params);
				return chi2_rescale(jsParams);
			};

			// 将包装函数暴露给Python
			pyodide.globals.set("objective_js", objectiveWrapper);

			// 执行优化
			let result = await pyodide.runPythonAsync(`
					import numpy as np
					from scipy import optimize
					# 存储优化过程中的函数值
					optimization_history = []
					def objective(x):
						try:
							x_list = x.tolist() if hasattr(x, 'tolist') else list(x)
							val = float(objective_js(x_list))
							optimization_history.append(val)
							return val
						except Exception as e:
							print(f"目标函数错误: {str(e)}")
							raise
					bounds = [
							(-5, 5), (-5, 5), (0, 10), (0.0, 100), (-360, 360),  # 透镜参数
							(-5, 5), (-5, 5), (0, 5.0), (0.0, 100), (-360, 360),(0.3, 6.0)    # 源参数
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
								'history': optimization_history
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
			show_res(p1);
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