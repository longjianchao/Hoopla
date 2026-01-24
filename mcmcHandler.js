/**
 * MCMC建模相关功能处理
 */

// MCMC进度条相关变量
let mcmcStartTime = null;
let progressInterval = null;
let currentTimeThreshold = 3 * 60 * 1000; // 3分钟阈值（毫秒）

// 显示加载动画和禁用界面元素
function showLoading() {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'flex';
	
	// 重置进度条和时间
	mcmcStartTime = Date.now();
	currentTimeThreshold = 3 * 60 * 1000; // 重置为3分钟
	
	// 创建或更新进度条UI
	createProgressBar();
	
	// 开始时间跟踪
	trackProgress();
	
	// 禁用所有按钮和输入框
	document.querySelectorAll('button, input, select').forEach(el => {
		if (el.id !== 'closeMCMCResults') {
			el.disabled = true;
		}
	});
}

// 创建进度条UI
function createProgressBar() {
	// 进度条HTML结构已在index.html中定义，这里只需要初始化样式
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar.querySelector('.progress-fill');
	const progressGlow = progressBar.querySelector('.progress-glow');
	const timeEstimate = document.getElementById('timeEstimate');
	const progressText = document.getElementById('progressText');
	
	if (progressFill && progressGlow) {
		// 确保进度条初始状态
		progressBar.style.width = '0%';
		progressFill.style.width = '0%';
		
		// 触发重绘以确保动画效果
		setTimeout(() => {
			progressFill.style.width = '10%';
		}, 100);
	}
}

// 更新进度条
function updateProgressBar(elapsedTime, threshold, customText = null) {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const timeEstimate = document.getElementById('timeEstimate');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !timeEstimate || !progressText) return;
	
	// 计算进度百分比
	let progressPercent = Math.min((elapsedTime / threshold) * 100, 100);
	
	// 更新进度条
	const progressWidth = progressPercent + '%';
	progressBar.style.width = progressWidth;
	progressFill.style.width = progressWidth;
	
	// 更新文本 - 优先使用自定义文本
	if (customText) {
		progressText.textContent = customText;
	} else {
		// 格式化时间显示
		const formatTime = (ms) => {
			const minutes = Math.floor(ms / 60000);
			const seconds = Math.floor((ms % 60000) / 1000);
			return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		};
		
		// 更新文本
		if (progressPercent < 100) {
			progressText.textContent = 
				`${Math.round(progressPercent)}% 完成 (${formatTime(elapsedTime)} / ${formatTime(threshold)})`;
		} else {
			progressText.textContent = '✅ 建模完成！';
		}
	}
}

// 跟踪进度
function trackProgress() {
	const updateProgress = () => {
		if (!mcmcStartTime) return;
		
		const elapsedTime = Date.now() - mcmcStartTime;
		
		// 检查是否需要调整时间阈值
		let newThreshold = null;
		if (elapsedTime > 30 * 60 * 1000) { // 超过30分钟
			newThreshold = 60 * 60 * 1000; // 1小时
		} else if (elapsedTime > 20 * 60 * 1000) { // 超过20分钟
			newThreshold = 30 * 60 * 1000; // 30分钟
		} else if (elapsedTime > 10 * 60 * 1000) { // 超过10分钟
			newThreshold = 20 * 60 * 1000; // 20分钟
		} else if (elapsedTime > 5 * 60 * 1000) { // 超过5分钟
			newThreshold = 10 * 60 * 1000; // 10分钟
		} else if (elapsedTime > 3 * 60 * 1000) { // 超过3分钟
			newThreshold = 5 * 60 * 1000; // 5分钟
		}
		
		// 如果阈值发生变化，更新UI
		if (newThreshold && newThreshold !== currentTimeThreshold) {
			currentTimeThreshold = newThreshold;
			const timeEstimate = document.getElementById('timeEstimate');
			const totalMinutes = Math.floor(currentTimeThreshold / 60000);
			const thresholdText = totalMinutes >= 60 ? 
				`${Math.floor(totalMinutes / 60)}小时${totalMinutes % 60}分钟` : 
				`${totalMinutes}分钟`;
			timeEstimate.textContent = `预计建模时间: ${thresholdText}`;
		}
		
		updateProgressBar(elapsedTime, currentTimeThreshold);
	};
	
	// 立即更新一次
	updateProgress();
	
	// 每秒更新进度
	progressInterval = setInterval(updateProgress, 1000);
}

// 隐藏加载动画和启用界面元素
function hideLoading(callback) {
	// 清理进度条定时器
	if (progressInterval) {
		clearInterval(progressInterval);
		progressInterval = null;
	}
	
	// 如果建模时间很短，显示完成动画
	if (mcmcStartTime) {
		const elapsedTime = Date.now() - mcmcStartTime;
		
		// 如果建模时间少于5秒，显示完成动画
		if (elapsedTime < 5000) {
			animateQuickCompletion(() => {
				completeHideLoading(callback);
			});
			return;
		}
	}
	
	// 强制进度条到100%
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (progressBar && progressFill) {
		progressBar.style.width = '100%';
		progressFill.style.width = '100%';
		if (progressText) {
			progressText.textContent = '✅ 建模完成！';
		}
	}
	
	setTimeout(() => {
		completeHideLoading(callback);
	}, 500);
}

// 完成隐藏加载动画
function completeHideLoading(callback) {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'none';
	
	// 重置进度条到初始状态
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (progressBar && progressFill) {
		progressBar.style.width = '0%';
		progressFill.style.width = '0%';
	}
	
	if (progressText) {
		progressText.textContent = '0% 完成 (0:00 / 3:00)';
	}
	
	// 重置全局变量
	mcmcStartTime = null;
	currentTimeThreshold = 3 * 60 * 1000;
	
	// 重新启用所有按钮和输入框
	document.querySelectorAll('button, input, select').forEach(el => {
		el.disabled = false;
	});
	
	// 执行回调函数（显示提示框等）
	if (callback && typeof callback === 'function') {
		callback();
	}
}

// 快速建模完成动画
function animateQuickCompletion(callback) {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !progressText) return;
	
	// 立即设置进度条到100%，不等待过渡动画
	progressBar.style.transition = 'none'; // 禁用过渡动画
	progressFill.style.transition = 'none'; // 禁用过渡动画
	progressBar.style.width = '100%';
	progressFill.style.width = '100%';
	
	// 强制回流，确保样式立即应用
	progressBar.offsetHeight; // 触发回流
	
	// 恢复过渡动画
	progressBar.style.transition = '';
	progressFill.style.transition = '';
	
	// 添加完成状态样式
	progressBar.classList.add('completed');
	
	// 显示完成文本
	if (progressText) {
		progressText.textContent = '✅ 建模完成！';
	}
	
	// 如果有回调函数，则执行回调
	if (callback && typeof callback === 'function') {
		setTimeout(() => {
			completeHideLoading(callback);
		}, 500);
	}
}

// 只让进度条显示完成状态，不触发completeHideLoading
function finishProgressBarDisplay() {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !progressText) return;
	
	// 立即设置进度条到100%，不等待过渡动画
	progressBar.style.transition = 'none';
	progressFill.style.transition = 'none';
	progressBar.style.width = '100%';
	progressFill.style.width = '100%';
	
	// 强制回流，确保样式立即应用
	progressBar.offsetHeight;
	
	// 恢复过渡动画
	progressBar.style.transition = '';
	progressFill.style.transition = '';
	
	// 添加完成状态样式
	progressBar.classList.add('completed');
}

// 关闭MCMC结果显示
function closeMCMCResults() {
	document.getElementById('mcmcResults').style.display = 'none';
}

// 启动MCMC建模
async function startMCMC() {
	if (!window.lets || !window.lets.model || !window.lets.model.components) {
		alert('请先加载模型数据！');
		return;
	}
	try {
		// 显示加载动画
		showLoading();
		// 获取当前模型参数
		// 从fileHandler.js中获取scale变量，用于还原pixscale的原始值
		const modelData = {
			components: window.lets.model.components,
			pixscale: window.lets.pixscale * window.fileHandlerScale || window.lets.pixscale,
		};
		// 清空日志区域
		const log = document.getElementById("log");
		if (log) {
			log.textContent = "正在连接到服务器...\n";
		}
		// 连接WebSocket
		const ws = new WebSocket("ws://127.0.0.1:8080/model_status");
		// 保存所有非状态行内容
		let regularLog = '';
		// 保存Status状态行（只发送一次）
		let statusLine = '';
		// 保存Finished状态行
		let finishedLine = '';
		// 保存最新的处理状态行(Sampling/Computing/Bounding/Stopped)
		let processStatusLine = '';
		// 正则表达式匹配不同类型的状态行
		const statusLineRegex = /^Status\s*\|/m;
		const finishedLineRegex = /^Finished\s*\|/m;
		const processLineRegex = /^(Sampling|Computing|Bounding|Stopped)\s*\|/m;
		// 创建FormData对象，用于上传文件和模型数据
		const formData = new FormData();
		formData.append('model_data', JSON.stringify(modelData));
		let imageFile = window._uploadedImageFile;
		let noiseFile = window._uploadedNoiseFile;
		let psfFile = window._uploadedPSFFile;
		console.log('noiseFile:', noiseFile);
		console.log('psfFile:', psfFile);
		// 添加FITS文件（如果存在）
		if (imageFile) {
			formData.append('image_file', imageFile);
		}
		if (noiseFile) {
			formData.append('noise_file', noiseFile);
		}
		if (psfFile) {
			formData.append('psf_file', psfFile);
		}
		// 调试：打印FormData内容
		console.log('=== FormData 内容 ===');
		formData.forEach((value, key) => {
			if (value instanceof File) {
				console.log(`${key}:`, {
					name: value.name,
					size: value.size,
					type: value.type,
					lastModified: new Date(value.lastModified)
				});
			} else {
				console.log(`${key}:`, value);
			}
		});
		console.log('=== FormData 结束 ===');
		// 发送到后端
		const response = await fetch('http://127.0.0.1:8080/mcmc_modeling', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			throw new Error(`启动MCMC建模失败: ${response.status}`);
		}
		const mcmcResponseData = await response.json();
		console.log('MCMC建模任务启动响应:', mcmcResponseData);
		// 标记是否已处理完成事件
		let modelingCompleted = false;
		ws.onmessage = async(event) => {
			const data = event.data;
			const log = document.getElementById("log");
			// 分割消息中的每一行，处理不同的换行符格式
			const lines = data.split(/\r?\n/);
			lines.forEach(line => {
				// 去除行首尾空白
				const trimmedLine = line.trim();
				if (trimmedLine) {
					// 判断行类型并相应处理
					if (statusLineRegex.test(trimmedLine)) {
						// Status行：保留最新的Status行
						statusLine = trimmedLine + '\n';
					} else if (finishedLineRegex.test(trimmedLine)) {
						// Finished行：保存Finished行
						finishedLine = trimmedLine + '\n';
					} else if (processLineRegex.test(trimmedLine)) {
						// 处理状态行：实时更新
						processStatusLine = trimmedLine + '\n';
					} else {
						// 非状态行：直接追加
						regularLog += trimmedLine + '\n';
					}
				}
			});
			// 构建完整的日志内容
			let displayContent = '';
			// 先添加非状态行（保持原始顺序）
			if (regularLog) {
				displayContent += regularLog;
			}
			// 添加状态行到固定位置（在非状态行之后）
			if (statusLine) {
				displayContent += statusLine;
			}
			// 优先显示Finished行，否则显示处理状态行（在Status行之后）
			if (finishedLine) {
				displayContent += finishedLine;
			} else if (processStatusLine) {
				displayContent += processStatusLine;
			}
			log.textContent = displayContent;
			log.scrollTop = log.scrollHeight;

			// 检查是否收到了Finished行
			if (finishedLine) {
				// 清除进度条定时器，防止重复拉满
				if (progressInterval) {
					clearInterval(progressInterval);
					progressInterval = null;
				}
				
				// 进度条立即拉满，但不触发completeHideLoading
				finishProgressBarDisplay();
				
				if (!modelingCompleted && data.includes('✅ 模型运行结束')) {
					modelingCompleted = true;
					console.log('建模完成，正在获取结果数据...');
					try{
						const resultResponse = await fetch('http://127.0.0.1:8080/modeling_result');
						if (!resultResponse.ok) {
							throw new Error(`获取MCMC结果失败: ${resultResponse.status}`);
						}
						const result = await resultResponse.json();
						console.log('收到MCMC结果:', result);
						if(result.status=='success'){
							window.lets.setActived();
							window.lets.model.components = result.components;
							const angle = window.lets.lens.ang2pix({x: window.lets.model.components[0].x, y: window.lets.model.components[0].y});
							let p0 = [
								window.lets.model.components[1].x,
								window.lets.model.components[1].y,
								window.lets.model.components[1].theta_e,
								window.lets.model.components[1].ell,
								window.lets.model.components[1].ang,
								window.lets.model.components[0].x,
								window.lets.model.components[0].y,
								window.lets.model.components[0].size,
								window.lets.model.components[0].ell,
								window.lets.model.components[0].ang,
								window.lets.model.components[0].n_sersic,
							];
							window.lets.loadModel(window.lets.model.components);
							updateCanvas(window.lets.model.components);
							window.lets.update(angle);
							window.lets.setFreezed();
							console.log(window.lets.model.components);
							
							// 最终隐藏加载动画并显示成功提示
							hideLoading(() => {
								window.alert('MCMC建模成功!');
								// 用户确认后才显示建模结果图像
								showModelingResults(result);
							});
						}
						else{
							throw new Error(result.message||"获取MCMC结果失败");
						}
					}catch(error){
						console.error('处理建模时出错:', error);
						hideLoading();
						alert(`获取MCMC结果失败: ${error.message}`);
					} finally {
						// 确保关闭WebSocket连接
						ws.close();
					}
				}
			}
			// 检查是否有错误发生
			if (data.includes('❌ 模型运行出错')) {
				if (!modelingCompleted) {
					modelingCompleted = true;
					console.error('建模过程出错');
					// 隐藏加载动画，然后在进度条动画完成后显示错误提示
					hideLoading(() => {
						alert(`MCMC建模失败: ${data}`);
					});
					// 关闭WebSocket连接
					if (ws && ws.readyState === WebSocket.OPEN) {
						ws.close();
					}
				}
			}
		};
		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
		};
		ws.onclose = () => {
			console.log("WebSocket connection closed");
		};
	} catch (error) {
		console.error('MCMC建模失败:', error);
		// 隐藏加载动画，然后在进度条动画完成后显示错误提示
		hideLoading(() => {
			alert(`MCMC建模失败: ${error.message}`);
		});
	}
}

// 显示建模结果图像函数 - 只有在用户确认后才调用
function showModelingResults(result) {
	// 检查数据有效性和类型
	if (result.model_result && result.model_corner) {
		// 显示建模结果图像
		const container = document.getElementById("result-container");
		// 设置图片源
		document.getElementById("result-img").src = "data:image/png;base64," + result.model_result;
		document.getElementById("corner-img").src = "data:image/png;base64," + result.model_corner;
		// 显示容器
		container.style.display = "block";

		// 保存按钮逻辑
		document.getElementById("save-btn").onclick = () => {
			saveImage(result.model_result, "model_result.png");
			saveImage(result.model_corner, "model_corner.png");
			container.style.display = "none";
		};

		// 继续建模按钮逻辑
		document.getElementById("continue-btn").onclick = () => {
			container.style.display = "none";
		};
	} else {
		// 其他情况显示友好的提示
		console.log("MCMC结果数据格式错误");
	}
}

// 图片下载函数
function saveImage(base64Data, filename) {
	const a = document.createElement("a");
	a.href = "data:image/png;base64," + base64Data;
	a.download = filename;
	a.click();
}