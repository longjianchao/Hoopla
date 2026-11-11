/**
 * MCMC modeling related functions
 */

// MCMC progress bar related variables
let mcmcStartTime = null;
let progressInterval = null;
let currentTimeThreshold = 3 * 60 * 1000; // 3-minute threshold (milliseconds)

// Show loading animation and disable UI elements
function showLoading() {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'flex';
	
	const closeBtn = document.getElementById('closeLoadingBtn');
	if (closeBtn) closeBtn.style.display = 'none';
	
	// Reset progress bar and time
	mcmcStartTime = Date.now();
	currentTimeThreshold = 3 * 60 * 1000; // Reset to 3 minutes
	
	// Create or update the progress bar UI
	createProgressBar();
	
	// Start time tracking
	trackProgress();
	
	// Disable all buttons and input fields
	document.querySelectorAll('button, input, select').forEach(el => {
		if (el.id !== 'closeMCMCResults') {
			el.disabled = true;
		}
	});
}

// Create the progress bar UI
function createProgressBar() {
	// The progress bar HTML structure is defined in index.html; only initialization styles are needed here
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar.querySelector('.progress-fill');
	const progressGlow = progressBar.querySelector('.progress-glow');
	const timeEstimate = document.getElementById('timeEstimate');
	const progressText = document.getElementById('progressText');
	
	if (progressFill && progressGlow) {
		// Ensure the progress bar initial state
		progressBar.style.width = '0%';
		progressFill.style.width = '0%';
		
		// Trigger a reflow to ensure the animation takes effect
		setTimeout(() => {
			progressFill.style.width = '10%';
		}, 100);
	}
}

// Update the progress bar
function updateProgressBar(elapsedTime, threshold, customText = null) {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const timeEstimate = document.getElementById('timeEstimate');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !timeEstimate || !progressText) return;
	
	// Calculate progress percentage
	let progressPercent = Math.min((elapsedTime / threshold) * 100, 100);
	
	// Update the progress bar
	const progressWidth = progressPercent + '%';
	progressBar.style.width = progressWidth;
	progressFill.style.width = progressWidth;
	
	// Update the text - prioritize custom text
	if (customText) {
		progressText.textContent = customText;
	} else {
		// Format the time display
		const formatTime = (ms) => {
			const minutes = Math.floor(ms / 60000);
			const seconds = Math.floor((ms % 60000) / 1000);
			return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		};
		
		// Update the text
		if (progressPercent < 100) {
			progressText.textContent = 
				`${Math.round(progressPercent)}% complete (${formatTime(elapsedTime)} / ${formatTime(threshold)})`;
		} else {
			progressText.textContent = '✅ Modeling complete!';
		}
	}
}

// Track progress
function trackProgress() {
	const updateProgress = () => {
		if (!mcmcStartTime) return;
		
		const elapsedTime = Date.now() - mcmcStartTime;
		
		// Check whether the time threshold needs to be adjusted
		let newThreshold = null;
		if (elapsedTime > 30 * 60 * 1000) { // Over 30 minutes
			newThreshold = 60 * 60 * 1000; // 1 hour
		} else if (elapsedTime > 20 * 60 * 1000) { // Over 20 minutes
			newThreshold = 30 * 60 * 1000; // 30 minutes
		} else if (elapsedTime > 10 * 60 * 1000) { // Over 10 minutes
			newThreshold = 20 * 60 * 1000; // 20 minutes
		} else if (elapsedTime > 5 * 60 * 1000) { // Over 5 minutes
			newThreshold = 10 * 60 * 1000; // 10 minutes
		} else if (elapsedTime > 3 * 60 * 1000) { // Over 3 minutes
			newThreshold = 5 * 60 * 1000; // 5 minutes
		}
		
		// If the threshold changed, update the UI
		if (newThreshold && newThreshold !== currentTimeThreshold) {
			currentTimeThreshold = newThreshold;
			const timeEstimate = document.getElementById('timeEstimate');
			const totalMinutes = Math.floor(currentTimeThreshold / 60000);
			const thresholdText = totalMinutes >= 60 ? 
				`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : 
				`${totalMinutes}m`;
			timeEstimate.textContent = `Estimated modeling time: ${thresholdText}`;
		}
		
		updateProgressBar(elapsedTime, currentTimeThreshold);
	};
	
	// Update once immediately
	updateProgress();
	
	// Update progress every second
	progressInterval = setInterval(updateProgress, 1000);
}

// Hide loading animation and enable UI elements
function hideLoading(callback) {
	// Clear the progress bar timer
	if (progressInterval) {
		clearInterval(progressInterval);
		progressInterval = null;
	}
	
	// If modeling finished in a very short time, show the completion animation
	if (mcmcStartTime) {
		const elapsedTime = Date.now() - mcmcStartTime;
		
		// If modeling took less than 5 seconds, show the completion animation
		if (elapsedTime < 5000) {
			animateQuickCompletion(() => {
				completeHideLoading(callback);
			});
			return;
		}
	}
	
	// Force the progress bar to 100%
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (progressBar && progressFill) {
		progressBar.style.width = '100%';
		progressFill.style.width = '100%';
		if (progressText) {
			progressText.textContent = '✅ Modeling complete!';
		}
	}
	
	setTimeout(() => {
		completeHideLoading(callback);
	}, 500);
}

// Complete hiding the loading animation
function completeHideLoading(callback) {
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.display = 'none';
	
	// Reset the progress bar to its initial state
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (progressBar && progressFill) {
		progressBar.style.width = '0%';
		progressFill.style.width = '0%';
	}
	
	if (progressText) {
		progressText.textContent = '0% complete (0:00 / 3:00)';
	}
	
	// Reset global variables
	mcmcStartTime = null;
	currentTimeThreshold = 3 * 60 * 1000;
	
	// Re-enable all buttons and input fields
	document.querySelectorAll('button, input, select').forEach(el => {
		el.disabled = false;
	});
	
	// Execute the callback function (e.g., show a dialog)
	if (callback && typeof callback === 'function') {
		callback();
	}
}

// Quick modeling completion animation
function animateQuickCompletion(callback) {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !progressText) return;
	
	// Immediately set the progress bar to 100% without waiting for the transition animation
	progressBar.style.transition = 'none'; // Disable transition animation
	progressFill.style.transition = 'none'; // Disable transition animation
	progressBar.style.width = '100%';
	progressFill.style.width = '100%';
	
	// Force a reflow to ensure styles are applied immediately
	progressBar.offsetHeight; // Trigger reflow
	
	// Restore transition animations
	progressBar.style.transition = '';
	progressFill.style.transition = '';
	
	// Add the completion state style
	progressBar.classList.add('completed');
	
	// Display the completion text
	if (progressText) {
		progressText.textContent = '✅ Modeling complete!';
	}
	
	// If a callback exists, execute it
	if (callback && typeof callback === 'function') {
		setTimeout(() => {
			completeHideLoading(callback);
		}, 500);
	}
}

// Only show the progress bar in the completed state without triggering completeHideLoading
function finishProgressBarDisplay() {
	const progressBar = document.getElementById('mcmcProgressBar');
	const progressFill = progressBar?.querySelector('.progress-fill');
	const progressText = document.getElementById('progressText');
	
	if (!progressBar || !progressFill || !progressText) return;
	
	// Immediately set the progress bar to 100% without waiting for the transition animation
	progressBar.style.transition = 'none';
	progressFill.style.transition = 'none';
	progressBar.style.width = '100%';
	progressFill.style.width = '100%';
	
	// Force a reflow to ensure styles are applied immediately
	progressBar.offsetHeight;
	
	// Restore transition animations
	progressBar.style.transition = '';
	progressFill.style.transition = '';
	
	// Add the completion state style
	progressBar.classList.add('completed');
}

// Close the MCMC results display
function closeMCMCResults() {
	document.getElementById('mcmcResults').style.display = 'none';
}

window.closeLoadingCustom = function() {
	if (window.lastModelingResult) {
		completeHideLoading(() => {
			showModelingResults(window.lastModelingResult);
			window.lastModelingResult = null;
		});
	} else {
		completeHideLoading();
	}
	const closeBtn = document.getElementById('closeLoadingBtn');
	if (closeBtn) closeBtn.style.display = 'none';
};

// Start MCMC modeling
async function startMCMC() {
	if (!window.lets || !window.lets.model || !window.lets.model.components) {
		alert('Please load model data first!');
		return;
	}
	try {
		// Show the loading animation
		showLoading();
		// Get the current model parameters
		// Obtain the scale variable from fileHandler.js to restore the original pixscale value
		const modelData = {
			components: window.lets.model.components,
			pixscale: window.lets.pixscale * window.fileHandlerScale || window.lets.pixscale,
			sigma: window.lets.model.sigma || null,
		};
		// Clear the log area
		const log = document.getElementById("log");
		if (log) {
			log.textContent = "Connecting to server...\n";
		}
		// Connect to the WebSocket
		const ws = new WebSocket("ws://127.0.0.1:8080/model_status");
		// Store all non-status line content
		let regularLog = '';
		// Store the Status status line (sent only once)
		let statusLine = '';
		// Store the Finished status line
		let finishedLine = '';
		// Store the latest processing status line (Sampling/Computing/Bounding/Stopped)
		let processStatusLine = '';
		// Regexes matching different types of status lines
		const statusLineRegex = /^Status\s*\|/m;
		const finishedLineRegex = /^Finished\s*\|/m;
		const processLineRegex = /^(Sampling|Computing|Bounding|Stopped)\s*\|/m;
		// Create a FormData object for uploading files and model data
		const formData = new FormData();
		formData.append('model_data', JSON.stringify(modelData));
		let imageFile = window._uploadedImageFile;
		let noiseFile = window._uploadedNoiseFile;
		let psfFile = window._uploadedPSFFile;
		console.log('noiseFile:', noiseFile);
		console.log('psfFile:', psfFile);
		// Add FITS files (if present)
		if (imageFile) {
			formData.append('image_file', imageFile);
		}
		if (noiseFile) {
			formData.append('noise_file', noiseFile);
		}
		if (psfFile) {
			formData.append('psf_file', psfFile);
		}
		// Debug: print the FormData contents
		console.log('=== FormData contents ===');
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
		console.log('=== FormData end ===');
		// Send to the backend
		const response = await fetch('http://127.0.0.1:8080/mcmc_modeling', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			throw new Error(`Failed to start MCMC modeling: ${response.status}`);
		}
		const mcmcResponseData = await response.json();
		console.log('MCMC modeling task start response:', mcmcResponseData);
		// Flag whether the completion event has been handled
		let modelingCompleted = false;
		ws.onmessage = async(event) => {
			const data = event.data;
			const log = document.getElementById("log");
			// Split each line of the message to handle different newline formats
			const lines = data.split(/\r?\n/);
			lines.forEach(line => {
				// Trim leading and trailing whitespace
				const trimmedLine = line.trim();
				if (trimmedLine) {
					// Determine the line type and handle accordingly
					if (statusLineRegex.test(trimmedLine)) {
						// Status line: keep the latest Status line
						statusLine = trimmedLine + '\n';
					} else if (finishedLineRegex.test(trimmedLine)) {
						// Finished line: store the Finished line
						finishedLine = trimmedLine + '\n';
					} else if (processLineRegex.test(trimmedLine)) {
						// Processing status line: update in real time
						processStatusLine = trimmedLine + '\n';
					} else {
						// Non-status line: append directly
						regularLog += trimmedLine + '\n';
					}
				}
			});
			// Build the complete log content
			let displayContent = '';
			// Add non-status lines first (preserving original order)
			if (regularLog) {
				displayContent += regularLog;
			}
			// Add status lines to their fixed position (after non-status lines)
			if (statusLine) {
				displayContent += statusLine;
			}
			// Prefer showing the Finished line, otherwise show the processing status line (after the Status line)
			if (finishedLine) {
				displayContent += finishedLine;
			} else if (processStatusLine) {
				displayContent += processStatusLine;
			}
			log.textContent = displayContent;
			log.scrollTop = log.scrollHeight;

			// Check whether the Finished line was received
			if (finishedLine) {
				// Clear the progress bar timer to prevent repeated filling
				if (progressInterval) {
					clearInterval(progressInterval);
					progressInterval = null;
				}
				
				// Immediately fill the progress bar without triggering completeHideLoading
				finishProgressBarDisplay();
			}
			
			// The completion marker may arrive in a different WebSocket message than
			// the "Finished |" line, so check it independently of finishedLine.
			if (!modelingCompleted && data.includes('✅ Modeling finished.')) {
					modelingCompleted = true;
					console.log('Modeling complete, fetching result data...');
					try{
						const resultResponse = await fetch('http://127.0.0.1:8080/modeling_result');
						if (!resultResponse.ok) {
							throw new Error(`Failed to get MCMC result: ${resultResponse.status}`);
						}
						const result = await resultResponse.json();
						console.log('Received MCMC result:', result);
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
							
							// Finally hide the loading animation and show a success prompt
							// Stop the progress bar timer
							if (progressInterval) {
								clearInterval(progressInterval);
								progressInterval = null;
							}
							
							// Show the close button
							const closeBtn = document.getElementById('closeLoadingBtn');
							if (closeBtn) {
								closeBtn.style.display = 'block';
							}
							
							// Update the text prompt
							const progressText = document.getElementById('progressText');
							if (progressText) {
								progressText.textContent = '✅ Modeling complete! Please check the log or click Close in the top-right to view the image result.';
							}
							
							// Save the result for use after the close button is clicked
							window.lastModelingResult = result;
						}
						else{
							throw new Error(result.message||"Failed to get modeling result");
						}
					}catch(error){
						console.error('Error during modeling processing:', error);
						if (progressInterval) {
							clearInterval(progressInterval);
							progressInterval = null;
						}
						const progressText = document.getElementById('progressText');
						if (progressText) progressText.textContent = '❌ Failed to get modeling result';
						const closeBtn = document.getElementById('closeLoadingBtn');
						if (closeBtn) closeBtn.style.display = 'block';
					} finally {
						// Ensure the WebSocket connection is closed
						ws.close();
					}
				}
			// Check whether an error occurred
			if (data.includes('❌ Error running the model')) {
				if (!modelingCompleted) {
					modelingCompleted = true;
					console.error('Error during modeling process');
					if (progressInterval) {
						clearInterval(progressInterval);
						progressInterval = null;
					}
					const progressText = document.getElementById('progressText');
					if (progressText) progressText.textContent = '❌ Modeling failed, please check the log';
					const closeBtn = document.getElementById('closeLoadingBtn');
					if (closeBtn) closeBtn.style.display = 'block';
					// Close the WebSocket connection
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
		console.error('Modeling failed:', error);
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
		const progressText = document.getElementById('progressText');
		if (progressText) progressText.textContent = '❌ Modeling failed: ' + error.message;
		const closeBtn = document.getElementById('closeLoadingBtn');
		if (closeBtn) closeBtn.style.display = 'block';
	}
}

// Function to display the modeling result images - only invoked after user confirmation
function showModelingResults(result) {
	// Check data validity and type
	if (result.model_result && result.model_corner) {
		// Show the modeling result images
		const container = document.getElementById("result-container");
		// Set the image sources
		document.getElementById("result-img").src = "data:image/png;base64," + result.model_result;
		document.getElementById("corner-img").src = "data:image/png;base64," + result.model_corner;
		// Show the container
		container.style.display = "block";

		// Save button logic
		document.getElementById("save-btn").onclick = () => {
			saveImage(result.model_result, "model_result.png");
			saveImage(result.model_corner, "model_corner.png");
			container.style.display = "none";
		};

		// Continue modeling button logic
		document.getElementById("continue-btn").onclick = () => {
			container.style.display = "none";
		};
	} else {
		// Show a friendly prompt in other cases
		console.log("Invalid MCMC result data format");
	}
}

// Image download function
function saveImage(base64Data, filename) {
	const a = document.createElement("a");
	a.href = "data:image/png;base64," + base64Data;
	a.download = filename;
	a.click();
}