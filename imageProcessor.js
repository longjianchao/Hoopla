/**
 * 图像处理模块
 * 包含前景去除、绘制mask等图像处理相关功能
 */

// 删除前景函数
async function delForeground() {
	// 获取上传的fits文件
	const imageFile = window._uploadedImageFile;
	if (!imageFile || !imageFile.name.match(/\.(fits|fit|fts)$/i)) {
		window.alert('请先上传有效的FITS文件！');
		return;
	}
	// 将fits文件传给后端进行前景去除
	let formData = new FormData();
	formData.append('file', imageFile); 
	console.log("上传的 imageFile:", imageFile);
	console.log("开始上传文件到后端...");
	try {
		let response = await fetch('http://127.0.0.1:8080/extract_background', {
			method: 'POST',
			body: formData,
			mode: 'cors',
			cache: 'no-cache'
		});
		let result = await response.json();
		// 解码 image_data（base64+gzip+float32）
		if (result.image_data) {
			function base64ToUint8Array(base64) {
				const binary_string = window.atob(base64);
				const len = binary_string.length;
				const bytes = new Uint8Array(len);
				for (let i = 0; i < len; i++) {
					bytes[i] = binary_string.charCodeAt(i);
				}
				return bytes;
			}
			let chi1 = result.chi_square_1,chi2 = result.chi_square_2;
			console.log("chi1:", chi1);
			console.log("chi2:", chi2);
			const compressed = base64ToUint8Array(result.image_data);
			const raw = pako.ungzip(compressed);
			const floatArray = new Float32Array(raw.buffer);
			let imageData = Array.from(floatArray);
			let width = result.width;
			let height = result.height;
			// window._uploadedImageFile = result.fits_file;
			let url = getImage(imageData, width, height, true);
			// 创建自定义确认对话框，询问是否下载
			const shouldDownload = window.confirm('前景去除成功！\n\n是否下载处理后的图像？');
			if (shouldDownload) {
				// 创建下载链接并触发下载
				const downloadLink = document.createElement('a');
				downloadLink.href = url;
				downloadLink.download = img_name+'_foreground_removed.png';
				document.body.appendChild(downloadLink);
				downloadLink.click();
				document.body.removeChild(downloadLink);
			}
			// 更新img元素和lets对象
			img0.src = url;
		} 
	} catch (error) {
		console.error('前景去除详细错误:', error);
		let errorMessage = '前景去除失败:\n';
		if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
			if (error.message.includes('CORS')) {
				errorMessage += 'CORS跨域问题，请检查后端配置:\n';
				errorMessage += '1. 确保后端添加了CORS头: Access-Control-Allow-Origin: *\n';
				errorMessage += '2. 或者使用相同的域名和端口\n';
				errorMessage += '3. 检查后端是否正确处理OPTIONS预检请求';
			} else {
				errorMessage += '网络连接失败，请检查:\n';
				errorMessage += '1. 后端服务器是否已启动\n';
				errorMessage += '2. 防火墙是否阻止了连接\n';
				errorMessage += '3. 服务器地址是否正确';
			}
		} else if (error.message) {
			errorMessage += error.message;
		} else {
			errorMessage += '未知错误，请查看控制台日志';
		}
		window.alert(errorMessage);
	}
	ms.reset();
	ms_src.reset();
}

// 应用掩码按钮点击事件
	function applyMask() {
		const radius = parseInt(document.getElementById('maskRadius').value) || 0;
		console.log("mask半径:", radius);
		// 确保img对象存在
		if (img && img.src) {
			// 创建新的Image对象，以img为模板
			const newImg = new Image();
			newImg.onload = function() {
				const width = newImg.width;
				const height = newImg.height;
				console.log("图像尺寸:", width, height);
				// 创建临时画布并绘制图像
				const tempCanvas = document.createElement('canvas');
				tempCanvas.width = width;
				tempCanvas.height = height;
				const tempCtx = tempCanvas.getContext('2d');
				tempCtx.drawImage(newImg, 0, 0, width, height);
				// 获取图像数据
				const imageData = tempCtx.getImageData(0, 0, width, height);
				const data = imageData.data;
				// 计算图像中心点
				const centerX = width / 2;
				const centerY = height / 2;
				// 遍历所有像素，应用掩码
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						// 计算当前像素到中心点的距离
						const dx = x - centerX;
						const dy = y - centerY;
						const distance = Math.sqrt(dx * dx + dy * dy);
						// 计算像素在数据数组中的索引
						const index = (y * width + x) * 4;
						// 如果像素在掩码外，设置为黑色
						if (distance > radius) {
							data[index] = 0;     // 红色通道
							data[index + 1] = 0; // 绿色通道
							data[index + 2] = 0; // 蓝色通道
							data[index + 3] = 255; // 透明度通道(完全不透明)
						}
						// 否则保持不变
					}
				}
				// 将修改后的图像数据放回画布
				tempCtx.putImageData(imageData, 0, 0);
				// 获取处理后的图像URL
				const maskedUrl = tempCanvas.toDataURL();
				img0.src = maskedUrl;
			};
			// 设置新图像的源为img的源
			newImg.src = img.src;
		} else {
			console.error("无法获取图像，请确保图像已加载。");
			window.alert("无法应用掩码：图像未加载。");
		}
	};

function getImage(imageData, width, height, convert){
	let canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	let minval = 1;
	let maxval = 0;
	for(let i = 0; i < imageData.length; i++){
		if(imageData[i] < minval){
			minval = imageData[i];
		}
		if(imageData[i] > maxval){
			maxval = imageData[i];
		}
	}
	console.log("maxval:", maxval);
	globalImageData = new Array(imageData.length);
	// for(let i = 0; i < imageData.length; i++){
	// 	imageData[i] = (imageData[i] - minval) / (maxval - minval);
	// }
	
	let ctx = canvas.getContext('2d');
	let canvasData = ctx.createImageData(width, height);
	for (let i = 0; i < height; i++) {
		let flipped_i = height - 1 - i;  // 从底部开始读取
		for (let j = 0; j < width; j++) {
			let val = imageData[i * width + j]; // 1D数组
			globalImageData[i * width + j] = val;
			if(convert){
				val = imageData[flipped_i * width + j];
				globalImageData[i * width + j] = val;
			}
			let idx = (i * width + j) * 4;
			canvasData.data[idx] = val/maxval*255; // R
			canvasData.data[idx + 1] = 0; // G
			canvasData.data[idx + 2] = 0; // B
			canvasData.data[idx + 3] = 255; // A
		}
	}
	// console.log("globalImageData:", globalImageData);
	ctx.putImageData(canvasData, 0, 0);
	// console.log("canvasData:", canvasData);
	url = canvas.toDataURL();
	return url;
}

// 公开函数接口
window.imageProcessor = {
	delForeground,
	applyMask,
	getImage,
};