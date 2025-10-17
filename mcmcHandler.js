/**
 * MCMC建模相关功能处理
 */

// 显示加载动画和禁用界面元素
function showLoading() {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'flex';
	// 禁用所有按钮和输入框
	document.querySelectorAll('button, input, select').forEach(el => {
		if (el.id !== 'closeMCMCResults') {
			el.disabled = true;
		}
	});
}

// 隐藏加载动画和启用界面元素
function hideLoading() {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'none';
	// 重新启用所有按钮和输入框
	document.querySelectorAll('button, input, select').forEach(el => {
		el.disabled = false;
	});
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
		console.log('发送MCMC请求，参数:', modelData);
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
		// 发送到后端
		const response = await fetch('http://127.0.0.1:8080/mcmc_modeling', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(modelData)
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
			if (finishedLine && data.includes('✅ 模型运行结束')) {
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
						window.alert('MCMC建模成功!');
						// 显示建模结果图像
						const container = document.getElementById("result-container");
						// 检查数据有效性和类型
						if (result.model_result && result.model_corner) {
							// 设置图片源
							document.getElementById("result-img").src = "data:image/png;base64," + result.model_result;
							document.getElementById("corner-img").src = "data:image/png;base64," + result.model_corner;
							// 显示容器
							container.style.display = "block";
						} else {
							// 其他情况显示友好的提示
							console.log("MCMC结果数据格式错误");
						}

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
						// 隐藏加载动画
						hideLoading();
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
			// 检查是否有错误发生
			if (data.includes('❌ 模型运行出错')) {
				if (!modelingCompleted) {
					modelingCompleted = true;
					console.error('建模过程出错');
					hideLoading();
					alert(`MCMC建模失败: ${data}`);
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
		hideLoading();
		alert(`MCMC建模失败: ${error.message}`);
	}
}

// 图片下载函数
function saveImage(base64Data, filename) {
	const a = document.createElement("a");
	a.href = "data:image/png;base64," + base64Data;
	a.download = filename;
	a.click();
}