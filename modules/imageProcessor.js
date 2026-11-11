/**
 * Image processing module
 * Provides foreground removal and mask drawing functionality.
 */

// Global flag indicating whether a mask is being applied
let isApplyingMask = false;

// Remove foreground function
async function delForeground() {
	// Get the uploaded FITS file
	const imageFile = window._uploadedImageFile;
	if (!imageFile || !imageFile.name.match(/\.(fits|fit|fts)$/i)) {
		window.alert('Please upload a valid FITS file first!');
		return;
	}
	// Send the FITS file to the backend for foreground removal
	let formData = new FormData();
	formData.append('file', imageFile); 
	console.log("Uploaded imageFile:", imageFile);
	console.log("Uploading file to backend...");
	try {
		let response = await fetch('http://127.0.0.1:8080/extract_background', {
			method: 'POST',
			body: formData,
			mode: 'cors',
			cache: 'no-cache'
		});
		let result = await response.json();
		// Decode image_data (base64+gzip+float32)
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
			const floatArray = new Float64Array(raw.buffer);
			let imageData = Array.from(floatArray);
			let width = result.width;
			let height = result.height;
			let url = getImage(imageData, width, height, true);
			// Create a custom confirmation dialog asking whether to download
			const shouldDownload = window.confirm('Foreground removal succeeded!\n\nDownload the processed image?');
			if (shouldDownload) {
				// Create a download link and trigger the download
				const downloadLink = document.createElement('a');
				downloadLink.href = url;
				downloadLink.download = img_name+'_foreground_removed.png';
				document.body.appendChild(downloadLink);
				downloadLink.click();
				document.body.removeChild(downloadLink);
			}
			// Update the img element and the lets object
			img0.src = url;
		} 
	} catch (error) {
		console.error('Foreground removal detailed error:', error);
		let errorMessage = 'Foreground removal failed:\n';
		if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
			if (error.message.includes('CORS')) {
				errorMessage += 'CORS cross-origin issue. Please check the backend configuration:\n';
				errorMessage += '1. Ensure the backend sends the CORS header: Access-Control-Allow-Origin: *\n';
				errorMessage += '2. Or use the same domain and port\n';
				errorMessage += '3. Check that the backend handles OPTIONS preflight requests';
			} else {
				errorMessage += 'Network connection failed. Please check:\n';
				errorMessage += '1. Whether the backend server is running\n';
				errorMessage += '2. Whether the firewall is blocking the connection\n';
				errorMessage += '3. Whether the server address is correct';
			}
		} else if (error.message) {
			errorMessage += error.message;
		} else {
			errorMessage += 'Unknown error. Please check the console log';
		}
		window.alert(errorMessage);
	}
	ms.reset();
	ms_src.reset();
}

// Apply mask button click handler
	function applyMask() {
		const radius = parseInt(document.getElementById('maskRadius').value) || 0;
		console.log("Mask radius:", radius);
		// Ensure globalImageData and image dimensions exist
		if (globalImageData && globalImageData.length > 0 && imgd && imgd.width > 0 && imgd.height > 0) {
			// Use the actual image dimensions
			const width = Math.sqrt(globalImageData.length);
			const height = width;
			console.log("Image dimensions:", width, height);
			// Compute the ratio between the actual image and canvas sizes
			const scaleX = width / imgd.width;
			const scaleY = height / imgd.height;
			console.log("Scale ratios:", scaleX, scaleY);
			// Adjust the mask radius according to the ratio
			const scaledRadius = radius * Math.min(scaleX, scaleY);
			console.log("Scaled mask radius:", scaledRadius);
			// Compute the image center
			const centerX = width / 2;
			const centerY = height / 2;
			// Iterate over all pixels and apply the mask to the global data
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					// Distance from the current pixel to the center
					const dx = x - centerX;
					const dy = y - centerY;
					const distance = Math.sqrt(dx * dx + dy * dy);
					// Compute the index in the data array
					const index = y * width + x;
					// Zero out pixels outside the mask radius
					if (distance > scaledRadius) {
						globalImageData[index] = 0;
					}
				}
			}
			// Set a flag to prevent img0.onload from resetting the marking surface
			isApplyingMask = true;
			// Regenerate the image from the updated globalImageData
			const maskedUrl = getImage(Array.from(globalImageData), width, height, false);
			img0.src = maskedUrl;
			// Delay resetting the flag so the onload handler finishes first
			setTimeout(() => {
				isApplyingMask = false;
			}, 100);
		} else {
			console.error("Unable to access global image data or dimensions. Please ensure an image is loaded.");
			window.alert("Unable to apply mask: image not loaded.");
		}
	};

// Hot colormap function (imitates Python's matplotlib hot colormap)
function hotColormap(intensity) {
	// Clamp intensity to [0, 1]
	intensity = Math.max(0, Math.min(1, intensity));
	
	let r, g, b;
	
	if (intensity < 0.33) {
		// Black to red: 0.0 → 0.33
		r = intensity * 3;
		g = 0;
		b = 0;
	} else if (intensity < 0.66) {
		// Red to yellow: 0.33 → 0.66
		r = 1;
		g = (intensity - 0.33) * 3;
		b = 0;
	} else {
		// Yellow to white: 0.66 → 1.0
		r = 1;
		g = 1;
		b = (intensity - 0.66) * 3;
	}
	
	// Scale to 0-255
	return [
		Math.round(r * 255),
		Math.round(g * 255),
		Math.round(b * 255)
	];
}

function getImage(imageData, width, height, convert){  
	let canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	// Initialize to negative infinity so negative-valued data still normalizes correctly
	let maxval = -Infinity;
	for(let i = 0; i < imageData.length; i++){
		if(imageData[i] > maxval){
			maxval = imageData[i];
		}
	}
	// Avoid division by zero for a fully uniform (or all-negative) image
	if (!isFinite(maxval) || maxval === 0) maxval = 1;
	// Use Float64Array for higher precision
	globalImageData = new Float64Array(imageData.length);
	
	let ctx = canvas.getContext('2d');
	let canvasData = ctx.createImageData(width, height);
	for (let i = 0; i < height; i++) {
		let flipped_i = height - 1 - i;  // read from bottom when flipping Y axis
		for (let j = 0; j < width; j++) {
			// Apply the Y-axis flip only when convert is requested
			let src_i = convert ? flipped_i : i;
			let val = imageData[src_i * width + j]; // 1D array
			globalImageData[i * width + j] = val;
			// Normalize intensity to [0, 1]
			let normalizedIntensity = val / maxval;
			// Apply hot colormap
			let rgb = hotColormap(normalizedIntensity);
			let idx = (i * width + j) * 4;
			canvasData.data[idx] = rgb[0]; // R
			canvasData.data[idx + 1] = rgb[1]; // G
			canvasData.data[idx + 2] = rgb[2]; // B
			canvasData.data[idx + 3] = 255; // A
		}
	}
	ctx.putImageData(canvasData, 0, 0);
	const url = canvas.toDataURL();
	return url;
}

/**
 * Apply various stretch transforms (linear/log/asinh/sqrt) to image data
 * @param {Float32Array|Float64Array} data - raw floating-point image data
 * @param {number} width - image width
 * @param {number} height - image height
 * @param {boolean} convert - whether to flip the Y axis
 * @param {Object} params - stretch parameters
 * @param {string} params.stretchMode - stretch mode: 'linear'|'log'|'asinh'|'sqrt'
 * @param {number} params.stretchIntensity - stretch intensity (1-100)
 * @param {number} params.vminPercent - black point percentile (0-100)
 * @param {number} params.vmaxPercent - white point percentile (0-100)
 * @returns {string} canvas.toDataURL()
 */
function applyImageStretch(data, width, height, convert, params) {
	const stretchMode = params.stretchMode || 'log';
	const stretchIntensity = params.stretchIntensity || 50;
	const vminPercent = params.vminPercent || 1;
	const vmaxPercent = params.vmaxPercent || 99.5;

	// Compute vmin/vmax from percentiles, which is more robust than fixed min/max
	let sortedVals = [];
	// Sample at most 500k pixels for performance
	const totalPixels = data.length;
	const sampleStep = Math.max(1, Math.floor(totalPixels / 500000));
	for (let i = 0; i < totalPixels; i += sampleStep) {
		if (isFinite(data[i])) sortedVals.push(data[i]);
	}
	sortedVals.sort((a, b) => a - b);
	const idxLo = Math.floor(sortedVals.length * vminPercent / 100);
	const idxHi = Math.min(Math.floor(sortedVals.length * vmaxPercent / 100), sortedVals.length - 1);
	let vmin = sortedVals[idxLo] || 0;
	let vmax = sortedVals[idxHi] || 1;
	if (vmax <= vmin) vmax = vmin + 1e-10;

	// Asinh softening parameter: higher intensity narrows the linear range, revealing more faint detail
	const softening = 1.0 / (stretchIntensity * 0.1 + 0.5);

	let canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	let ctx = canvas.getContext('2d');
	let canvasData = ctx.createImageData(width, height);

	for (let i = 0; i < height; i++) {
		let srcRow = convert ? (height - 1 - i) : i;
		for (let j = 0; j < width; j++) {
			let rawVal = data[srcRow * width + j];
			if (!isFinite(rawVal)) rawVal = 0;

			// Normalize to [0, 1] (vmin→0, vmax→1)
			let normalized = (rawVal - vmin) / (vmax - vmin);
			normalized = Math.max(0, Math.min(1, normalized));

			let stretched;
			switch (stretchMode) {
				case 'linear':
					stretched = normalized;
					break;
				case 'log':
					// log10 stretch: add a small offset to avoid log(0);
					// higher intensity yields a smaller offset and reveals more faint detail
					const logOffset = 1.0 / (stretchIntensity * 0.5 + 1);
					stretched = Math.log10(1 + normalized * (1 / logOffset - 1)) /
					            Math.log10(1 + 1 / logOffset - 1);
					break;
				case 'asinh':
					// asinh stretch (astronomy standard): handles extreme dynamic range more smoothly than log
					stretched = Math.asinh(normalized / softening) /
					            Math.asinh(1.0 / softening);
					break;
				case 'sqrt':
					stretched = Math.sqrt(normalized);
					break;
				default:
					stretched = normalized;
			}

			stretched = Math.max(0, Math.min(1, stretched));

			let rgb = hotColormap(stretched);
			let idx = (i * width + j) * 4;
			canvasData.data[idx] = rgb[0];
			canvasData.data[idx + 1] = rgb[1];
			canvasData.data[idx + 2] = rgb[2];
			canvasData.data[idx + 3] = 255;
		}
	}
	ctx.putImageData(canvasData, 0, 0);
	return canvas.toDataURL();
}

// Public function interface
window.imageProcessor = {
	delForeground,
	applyMask,
	getImage,
	hotColormap,
	applyImageStretch
};