/**
 * User interface interaction handler module - handles user interface interaction logic
 */

// Import the file handling module
import * as fileHandler from './fileHandler.js';

// Global variable references
let lets, img0, img, img_src, imgd, ms, ms_src, chartInstance, scale, pixscale;

/**
 * Initialize the user interface handler module
 * @param {Object} appInstance - The application instance object
 * @param {Object} uiElements - An object containing the UI elements
 */
function initUIHandler(appInstance, uiElements) {
  lets = appInstance;
  img0 = uiElements.img0;
  img = uiElements.img;
  img_src = uiElements.img_src;
  imgd = uiElements.imgd;
  ms = uiElements.ms;
  ms_src = uiElements.ms_src;
  chartInstance = uiElements.chartInstance;
  
  // Initialize UI event listeners
  initEventListeners();
  
  console.log('UI Handler initialized');
}

/**
 * Set up event listeners
 */
function initEventListeners() {
  // Bind the image upload button click event
  const imageUploadBtn = document.getElementById('imageUpload');
  if (imageUploadBtn) {
    imageUploadBtn.addEventListener('click', () => {
      document.getElementById("imgURL").innerText = "";
      document.getElementById("pixel-scale").value = "";
      document.querySelector('.popup-form').classList.add('active');
    });
  }

  // Bind the close form button click event
  const closeFormBtn = document.getElementById("close-form-button");
  if (closeFormBtn) {
    closeFormBtn.addEventListener('click', () => {
      document.querySelector('.popup-form').classList.remove('active');
    });
  }

  // Bind the image selection input change event
  const imageUrlInput = document.getElementById("image-url");
  if (imageUrlInput) {
    imageUrlInput.addEventListener('change', async function () {
      let imageFile = this.files[0];
      try {
        const result = await fileHandler.handleImageUpload(imageFile);
        document.getElementById("imgURL").innerText = result.url;
        // Update the image name (global variable)
        if (typeof img_name !== 'undefined') {
          img_name = result.imgName;
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  // Bind the confirm button click event
  const confirmBtn = document.getElementById("confirm");
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      try {
        await handleConfirmButtonClick();
      } catch (error) {
        console.error("Error in confirm button handler:", error);
        window.alert("An error occurred while processing the image.");
      }
    });
  }

  // Bind the save model button click event
  const saveModelBtn = document.getElementById("saveModel");
  if (saveModelBtn) {
    saveModelBtn.addEventListener('click', () => {
      fileHandler.saveModelToFile(img_src.src, lets); // Pass the application instance object
    });
  }

  // Bind the model upload input change event
  const modelUploadBtn = document.getElementById('modelUpload');
  if (modelUploadBtn) {
    modelUploadBtn.addEventListener('change', (e) => {
      handleModelUpload(e);
    });
  }
}

/**
 * Handle the confirm button click event
 */
async function handleConfirmButtonClick() {
  let url = document.getElementById("imgURL").innerText;
  let imageFile = window._uploadedImageFile;
  let pixelScaleInput = document.getElementById("pixel-scale").value;
  
  // Validate inputs
  if (!imageFile) {
    window.alert('Please select a valid file!');
    return;
  }
  
  if ((url === '' || !url) || (pixelScaleInput === '' || !pixelScaleInput)) {
    window.alert("Please input entire information of image!");
    return;
  }
  
  // Validate the pixel scale format
  const regex = /^\d{0,2}(\.\d{0,6})?$/;
  if (!regex.test(pixelScaleInput)) {
    window.alert('Please re-enter the pixel scale of the image correctly!');
    return;
  }
  
  pixscale = parseFloat(pixelScaleInput);
  
  // Destroy the existing chart
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  
  // Process the image file
  try {
    await fileHandler.processImageFile(imageFile, pixscale, img0, lets);
    // Clear the file input field to allow re-uploading the same file
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    // Reset the reference to the uploaded file
    window._uploadedImageFile = null;
  } catch (error) {
    console.error("Error processing image file:", error);
    window.alert("Error processing image: " + error.message);
    return;
  }
  
  // Update model and UI state - pixel scale has already been set correctly in fileHandler.js based on image scaling
  
  // Reset the marking surfaces
  if (ms) ms.reset();
  if (ms_src) ms_src.reset();
  
  // Update the pixel scale display
  document.getElementById('newPixelScale').value = pixelScaleInput;
  
  // Close the popup
  document.querySelector('.popup-form').classList.remove('active');
  
  // Clear the mask
  if (lets && typeof lets.clearMask === 'function') {
    lets.clearMask();
  }
}

/**
 * Handle model file upload
 * @param {Event} e - The event object
 */
async function handleModelUpload(e) {
  let input = e.target;
  let modelFile = input.files[0];
  
  try {
    await fileHandler.loadModelFile(
      modelFile, 
      window.updateCanvas || function() {}, 
      window.show_res || function() {}, 
      lets, 
      scale || 1 
    );
    // Whether it succeeds or fails, clear the file input field to allow re-uploading the same file
    input.value = '';
  } catch (error) {
    window.alert(error.message);
    input.value = ''; // Clear the file input
  }
}

/**
 * Clean up the UI after the image has loaded
 */
function cleanupCanvas() {
  // Destroy the chi-square curve chart
  if (chartInstance) {
    chartInstance.destroy(); // Destroy the existing chart instance
    chartInstance = null; // Set the instance to null
  }
  
  // Redraw the chart or handle other logic
  if (window.drawChiSquareCurve) {
    window.drawChiSquareCurve([]); // Pass an empty array to clear the chart
  }
  // Clear the mask
  if (lets && typeof lets.clearMask === 'function') {
    lets.clearMask();
  }
}

/**
 * Set the callback for image-loaded events
 * @param {HTMLImageElement} imgElement - The image element
 * @param {Function} callback - The callback function
 */
function setupImageLoadHandler(imgElement, callback) {
  imgElement.onload = function() {
    // Get the target dimensions of the application instance
    const targetWidth = lets && lets.width ? lets.width : 400;
    const targetHeight = lets && lets.height ? lets.height : 400;
    
    // Compute the scale factor
    const scaleX = targetWidth / imgElement.naturalWidth;
    const scaleY = targetHeight / imgElement.naturalHeight;
    const newScale = Math.min(scaleX, scaleY); // Use the smaller scale factor to ensure the image is fully displayed
    scale = newScale; // Update the global scale factor
    
    // Compute the scaled image dimensions
    const scaledWidth = imgElement.naturalWidth * newScale;
    const scaledHeight = imgElement.naturalHeight * newScale;
    
    // Create a temporary canvas for image scaling
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Clear the temporary canvas
    tempCtx.clearRect(0, 0, targetWidth, targetHeight);
    
    // Draw the scaled image centered on the temporary canvas
    const xOffset = (targetWidth - scaledWidth) / 2;
    const yOffset = (targetHeight - scaledHeight) / 2;
    tempCtx.drawImage(imgElement, xOffset, yOffset, scaledWidth, scaledHeight);
    
    // Get the scaled image URL
    const scaledUrl = tempCanvas.toDataURL();
    
    // Update the size of the marking surfaces
    if (ms) ms.setSize(targetWidth, targetHeight);
    if (ms_src) ms_src.setSize(targetWidth, targetHeight);
    
    // Invoke the callback with the scaled URL and dimensions
    if (typeof callback === 'function') {
      callback(scaledUrl, targetWidth, targetHeight);
    }
  };
}

/**
 * Update all image and canvas elements
 * @param {string} scaledUrl - The scaled image URL
 * @param {number} targetWidth - The target width
 * @param {number} targetHeight - The target height
 */
function updateImageElements(scaledUrl, targetWidth, targetHeight) {
  // Update the application instance dimensions
  if (lets) {
    lets.width = targetWidth;
    lets.height = targetHeight;
    
    // Reset the lens parameters
    lets.resetLens(targetWidth, targetHeight, lets.pixscale);
  }
  
  // Update the image elements
  if (img) img.src = scaledUrl;
  if (img_src) img_src.src = scaledUrl;
  if (imgd) {
    imgd.src = scaledUrl;
    imgd.width = targetWidth;
    imgd.height = targetHeight;
  }
  
  // Update the canvas in the application instance
  if (lets) {
    if (lets.srcmodelPaper) {
      lets.srcmodelPaper.clear();
      lets.srcmodelPaper.src = scaledUrl;
      lets.srcmodelPaper.width = targetWidth;
      lets.srcmodelPaper.height = targetHeight;
    }
    
    if (lets.predictionPaper) {
      lets.predictionPaper.clear();
      lets.predictionPaper.src = scaledUrl;
      lets.predictionPaper.width = targetWidth;
      lets.predictionPaper.height = targetHeight;
    }
    
    if (lets.paper) {
      lets.paper.src = scaledUrl;
      lets.paper.width = targetWidth;
      lets.paper.height = targetHeight;
    }
  }
  
  // Update all bar elements
  updateBarElements(scaledUrl, targetWidth, targetHeight);
}

/**
 * Update the styles of all bar and canvas elements
 * @param {string} scaledUrl - The scaled image URL
 * @param {number} targetWidth - The target width
 * @param {number} targetHeight - The target height
 */
function updateBarElements(scaledUrl, targetWidth, targetHeight) {
  // Update bar elements
  let bar = document.getElementsByClassName("bar");
  for (let i = 0; i < bar.length; i++){
    bar[i].style.backgroundImage = "url(" + scaledUrl + ")";
    bar[i].style.height = targetHeight + "px";
    bar[i].style.width = targetWidth + "px";
    // Ensure the background image covers the entire bar
    bar[i].style.backgroundSize = "cover";
    bar[i].style.backgroundPosition = "center";
  }
  
  // Update canvas elements
  let canvas = document.querySelectorAll('canvas');
  for (let i = 0; i < canvas.length; i++){
    canvas[i].height = targetHeight;
    canvas[i].width = targetWidth;
  }
  
  // Update the barTitle elements
  let barTitle = document.getElementsByClassName("barTitle");
  for (let i = 0; i < barTitle.length; i++){
    barTitle[i].style.width = targetWidth + "px";
  }
}

/**
 * Reset the pixel scale
 * @param {string} pixscale - The pixel scale value
 * @param {Object} letsInstance - The application instance object
 * @param {number} scaleValue - The scale factor value
 * @returns {boolean} - Whether the reset succeeded
 */
function resetPixelScale(pixscale, letsInstance, scaleValue) {
  const regex = /^\d{0,2}(\.\d{0,6})?$/;
  
  // Validate parameters
  if (!regex.test(pixscale)) {
    window.alert('Please input the pixel scale correctly!');
    return false;
  }
  
  // Ensure letsInstance exists
  if (!letsInstance) {
    console.warn('letsInstance is undefined, cannot update pixel scale');
    return false;
  }
  
  // Adjust using the passed scaleValue (if provided)
  const adjustedPixscale = scaleValue ? parseFloat(pixscale) / scaleValue : parseFloat(pixscale);
  
  // Set the pixel scale safely
  try {
    letsInstance.pixscale = adjustedPixscale;
    if (letsInstance.model) {
      letsInstance.model.pixscale = adjustedPixscale;
    }
    
    console.log('Updated pixel scale:', letsInstance.pixscale);
    console.log(letsInstance);
    // Reset the marking surfaces
    if (ms) ms.reset();
    if (ms_src) ms_src.reset();
    
    return true;
  } catch (error) {
    console.error('Error updating pixel scale:', error);
    return false;
  }
}

// Initialize the loading overlay
function initializeLoadingOverlay() {
  // Check whether the loading overlay container already exists
  let loadingOverlay = document.getElementById('loading-overlay');
  
  if (!loadingOverlay) {
    // Create the loading overlay container
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.classList.add('loading-overlay');
    loadingOverlay.style.display = 'none';
    
    // Create the loading content
    const loadingContent = document.createElement('div');
    loadingContent.classList.add('loading-content');
    
    // Create the loading spinner
    const loadingSpinner = document.createElement('div');
    loadingSpinner.classList.add('loading-spinner');
    
    // Create the loading text
    const loadingText = document.createElement('p');
    loadingText.classList.add('loading-text');
    loadingText.textContent = 'Running MCMC modeling, please wait...';
    
    // Assemble the elements
    loadingContent.appendChild(loadingSpinner);
    loadingContent.appendChild(loadingText);
    loadingOverlay.appendChild(loadingContent);
    
    // Append to the body
    document.body.appendChild(loadingOverlay);
  }
}

// Show the loading animation
function showLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }
}

// Hide the loading animation
function hideLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

// Handle the MCMC button click event
function startMCMC() {
  // Show the loading animation
  showLoading();
  
  // Execute the MCMC-related logic
  // Assume window.lets.runMCMC exists
  if (window.lets && window.lets.runMCMC) {
    window.lets.runMCMC()
      .then(() => {
        // Hide the loading animation after MCMC finishes
        hideLoading();
      })
      .catch(error => {
        console.error('MCMC execution error:', error);
        hideLoading();
        window.alert('MCMC execution error: ' + error.message);
      });
  } else {
    hideLoading();
    window.alert('MCMC feature is unavailable');
  }
}

// Modify initEventListeners to add support for the MCMC button and the loading overlay
function enhanceEventListeners() {
  // Initialize the loading overlay
  initializeLoadingOverlay();
  
  // MCMC button click event
  const startMCMCButton = document.getElementById('startMCMCButton');
  if (startMCMCButton) {
    startMCMCButton.addEventListener('click', startMCMC);
  }
}

// Export the UI handler module
export {
  initUIHandler,
  setupImageLoadHandler,
  updateImageElements,
  resetPixelScale,
  handleConfirmButtonClick,
  handleModelUpload,
  cleanupCanvas,
  showLoading,
  hideLoading,
  initializeLoadingOverlay,
  enhanceEventListeners
};