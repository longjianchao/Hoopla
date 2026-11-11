/**
 * File handling module - responsible for all file-related operations
 */

// Global variable references
let  img0, convert, pixscale;
// WebGPU-related global variables
let webGPUWidth = 400; // default width
let webGPUHeight = 400; // default height
// Expose the scale variable to the window object for use by other modules
window.fileHandlerScale = null;

/**
 * Handle the image file upload
 * @param {File} imageFile - The uploaded image file
 * @returns {Promise} A Promise containing the image URL and name
 */
async function handleImageUpload(imageFile, type) {
  if (!imageFile || (!imageFile.name.endsWith('.h5') && !imageFile.name.match(/\.(fits|fit|fts)$/i) && !imageFile.name.endsWith('.png'))) {
    throw new Error('Only HDF5 (.h5) or Fits(.fits) or PNG files are allowed!');
  }
  if(type === "image"){
    window._uploadedImageFile = imageFile; // Save to global
  } else if(type === "noise"){
    window._uploadedNoiseFile = imageFile; // Save to global
  } else if(type === "psf"){
    window._uploadedPSFFile = imageFile; // Save to global
  }
  const url = window.URL.createObjectURL(imageFile);
  const imgName = imageFile.name.split('.')[0];
  
  return { url, imgName };
}

/**
 * Handle image file loading (based on file type)
 * @param {File} imageFile - The image file
 * @param {number} pixelScale - Pixel scale
 * @param {HTMLImageElement} imageObj - The image object
 * @param {Object} appInstance - The app instance object
 * @returns {Promise} A Promise resolving when loading completes
 */
function processImageFile(imageFile, pixelScale, imageObj, appInstance) {
  // Initialize global variables
  globalImageData = null;
  lets = appInstance;
  img0 = imageObj;
  return new Promise((resolve, reject) => {
    const handleImageLoaded = (result) => {
      // After the image is loaded, check whether WebGPU needs to be reinitialized
      if (typeof webgpuInitialized === 'undefined') {
        webgpuInitialized = false;
      }
      // Check whether the image dimensions changed, requiring WebGPU reinitialization
      const currentWidth = typeof window.fftConvolve !== 'undefined' ? window.fftConvolve.width : 0;
      const currentHeight = typeof window.fftConvolve !== 'undefined' ? window.fftConvolve.height : 0;
      
      if (currentWidth !== result.width || currentHeight !== result.height) {
        webgpuInitialized = false;
        console.log(`Image loaded with size ${result.width}x${result.height}, reinitializing WebGPU...`);
        // Reinitialize WebGPU using the original image size
        window.initWebGPU(result.width, result.height).then(() => {
          // Logic to run after WebGPU initialization (add here if needed)
          resolve(result);
        }).catch(err => {
          console.error('WebGPU initialization failed:', err);
          resolve(result);
        });
      } else {
        // No need to reinitialize WebGPU, return the result directly
        resolve(result);
      }
    };
    
    if(imageFile.name.endsWith('.h5')){
      loadH5File(imageFile, pixelScale).then(handleImageLoaded).catch(reject);
    } else if(imageFile.name.match(/\.(fits|fit|fts)$/i)){
      loadFitsFile(imageFile, pixelScale).then(handleImageLoaded).catch(reject);
    } else if(imageFile.name.endsWith('.png')){
      loadPngFile(imageFile, pixelScale).then(handleImageLoaded).catch(reject);
    } else {
      reject(new Error('Unsupported file type'));
    }
  });
}

/**
 * Load an H5 format file
 * @param {File} imageFile - The H5 file
 * @param {number} pixelScale - Pixel scale
 * @returns {Promise} A Promise resolving when loading completes
 */
function loadH5File(imageFile, pixelScale) {
  return new Promise((resolve, reject) => {
    try {
      let reader = new FileReader();
      reader.onloadend = function(evt) {
        try {
          let barr = evt.target.result;
          let f = new hdf5.File(barr, imageFile.name);
          let dataset = f.get('image');
          let imageData = dataset.value;
          let shape = dataset.shape;
          let height = shape[0];
          let width = shape[1];
          scale = lets.height/height;
          window.fileHandlerScale = scale;
          convert = false;
          
          // Process the image data using window.imageProcessor.getImage
          if (window.imageProcessor && window.imageProcessor.getImage) {
            let url = window.imageProcessor.getImage(imageData, width, height, convert);
            img0.src = url;
            lets.pixscale = pixelScale/scale;
            resolve({ url, width, height });
          } else {
            reject(new Error('imageProcessor module not available'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(imageFile);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Load a FITS format file
 * @param {File} imageFile - The FITS file
 * @param {number} pixelScale - Pixel scale
 * @returns {Promise} A Promise resolving when loading completes
 */
function loadFitsFile(imageFile, pixelScale) {
  return new Promise((resolve, reject) => {
    try {
      new astro.FITS(imageFile, function(fits) {
        try {
          const hdu = fits.getHDU();
          const header = hdu.header;
          const dataUnit = hdu.data;
          let width = header.get('NAXIS1');
          let height = header.get('NAXIS2');
          scale = lets.height/height;
          console.log("Scale ratio is: " + scale);
          window.fileHandlerScale = scale;
          convert = true;
          
          dataUnit.getFrame(0, function(imageData) {
            try {
              // Process the image data using window.imageProcessor.getImage
              if (window.imageProcessor && window.imageProcessor.getImage) {
                let url = window.imageProcessor.getImage(imageData, width, height, convert);
                img0.src = url;
                lets.pixscale = pixelScale/scale;
                console.log("Pixel scale after scaling is: " + lets.pixscale);
                resolve({ url, width, height });
              } else {
                reject(new Error('imageProcessor module not available'));
              }
            } catch (err) {
              reject(err);
            }
          });
        } catch (err) {
          reject(err);
        }
      }, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Load a PNG format file
 * @param {File} imageFile - The PNG file
 * @param {number} pixelScale - Pixel scale
 * @returns {Promise} A Promise resolving when loading completes
 */
function loadPngFile(imageFile, pixelScale) {
  return new Promise((resolve) => {
    const url = document.getElementById("imgURL").innerText;
    // Create a temporary image to get the actual dimensions
    const tempImg = new Image();
    tempImg.onload = function() {
      // Calculate the scale ratio
      scale = lets.height / tempImg.height;
      window.fileHandlerScale = scale;
      // Adjust the pixel scale proportionally
      lets.pixscale = pixelScale / scale;
      // Update the pixel scale in the model
      if (lets.model) {
        lets.model.pixscale = lets.pixscale;
      }
      
      // Create a canvas to process the PNG image data
      const canvas = document.createElement('canvas');
      canvas.width = tempImg.width;
      canvas.height = tempImg.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempImg, 0, 0);
      
      // Get the image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      
      // Use Float64Array for higher precision, consistent with Python's float64
      globalImageData = new Float64Array(data.length / 4);
      for (let i = 0, n = globalImageData.length; i < n; i++) {
        globalImageData[i] = data[i * 4] / 255; // normalized to the 0-1 range
      }
      
      // Set the image source
      img0.src = url;
      
      resolve({ url, width: tempImg.width, height: tempImg.height });
    };
    tempImg.onerror = function() {
      // If the image fails to load, at least set the pixel scale
      if (pixelScale && lets) {
        lets.pixscale = pixelScale;
        if (lets.model) {
          lets.model.pixscale = pixelScale;
        }
      }
      resolve({ url });
    };
    tempImg.src = url;
  });
}

/**
 * Load a model file
 * @param {File} modelFile - The model JSON file
 * @param {Object} ms - Marked surface object
 * @param {Object} ms_src - Source model marked surface object
 * @param {Function} updateCanvas - Canvas update function
 * @param {Function} showRes - Result display function
 * @param {Object} chartInstance - Chart instance reference
 * @param {Function} drawChiSquareCurve - Chi-square curve drawing function
 * @param {Object} appInstance - App instance object
 * @param {number} scaleValue - Scale value
 * @returns {Promise} A Promise resolving when loading completes
 */
function loadModelFile(modelFile, updateCanvas, showRes, appInstance, scaleValue) {
  // Initialize global variables
  lets = appInstance;
  // 优先采用图像载入时记录的缩放比；尚未载入图像时 window.fileHandlerScale 为 null，
  // 此时退回调用方传入的缩放比，避免 lets.pixscale 被算成 Infinity
  scale = window.fileHandlerScale || scaleValue || 1;
  if (!window.fileHandlerScale) {
    console.warn('尚未载入图像，模型将按调用方传入的缩放比解析：scale =', scale);
  }
  return new Promise((resolve, reject) => {
    if (!modelFile) {
      reject(new Error('Please select a valid file.'));
      return;
    }
    
    if (modelFile.type !== 'application/json') {
      reject(new Error('Model file must be a json file.'));
      return;
    }
    
    let reader = new FileReader();
    reader.onload = function() {
      try {
        let textdata = reader.result;
        const data = JSON.parse(textdata);
        const components = data.components;
        let pixscale = data.pixscale;
        
        lets.loadModel(components);
        lets.pixscale = pixscale/scale;
        lets.freezeSrcModel = true;
        updateCanvas(components);

        let xc1, xc2, re, ql, phl;
        xc1 = components[1].x;
        xc2 = components[1].y;
        re = components[1].theta_e;
        ql = components[1].ell;
        phl = components[1].ang;
        
        let yc1, yc2, sig2, qs, phs, n, Ie;
        yc1 = components[0].x;
        yc2 = components[0].y;
        sig2 = components[0].size;
        qs = components[0].ell;
        phs = components[0].ang;
        n = components[0].n_sersic;
        Ie = components[0].Ie;
        
        let p = [xc1, xc2, re, ql, phl, yc1, yc2, sig2, qs, phs, n, Ie];
        showRes(p);
        const x = components[0].x, y = components[0].y;
        const angle = lets.lens.ang2pix({x : x, y : y});  
        lets.update(angle);
        
        // Draw the parameter comparison lines after loading the model
        if (window.drawModelComparisonLines) {
            try {
                window.drawModelComparisonLines(p);
            } catch (err) {
                console.warn('Failed to draw model parameter comparison lines:', err);
            }
        }
        
        lets.setFreezed();
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(modelFile);
  });
}

/**
 * Save the model
 * @param {string} imageSrc - Image source URL
 * @param {Object} appInstance - App instance object
 */
function saveModelToFile(imageSrc, appInstance) {
  if (appInstance) {
    appInstance.saveModel(imageSrc);
  }
}

/**
 * Handle the PSF file upload
 * @param {File} psfFile - The uploaded PSF file
 * @returns {Promise} A Promise containing the PSF data
 */
async function handlePSFUpload(psfFile) {
  if (!psfFile || (!psfFile.name.match(/\.(fits|fit|fts)$/i) && !psfFile.name.endsWith('.h5'))) {
    throw new Error('Only FITS (.fits, .fit, .fts) or HDF5 (.h5) files are allowed for PSF!');
  }
  
  return new Promise((resolve, reject) => {
    try {
      let reader = new FileReader();
      reader.onloadend = function(evt) {
        try {
          let result = evt.target.result;
          if (psfFile.name.endsWith('.h5')) {
            // Handle HDF5 format
            let f = new hdf5.File(result, psfFile.name);
            let dataset = f.get('psf');
            let psfData = dataset.value;
            let shape = dataset.shape;
            
            // Perform PSF normalization
            const psfSum = psfData.reduce((sum, val) => sum + val, 0);
            let normalizedPsfData = psfData;
            if (psfSum !== 0) {
              normalizedPsfData = psfData.map(val => val / psfSum);
            }
            
            let psfInfo = {
              data: normalizedPsfData,
              width: shape[1],
              height: shape[0],
              type: 'h5',
            };
            // Save to a global variable
            window.globalPSFData = psfInfo;
            const kernelSize = Math.max(shape[1], shape[0], 17);
            // Ensure fftConvolve uses the correct kernelSize and dimensions
            if (fftConvolve.kernelSize !== kernelSize) {
                console.log(`lets.width/scale: ${lets.width/scale}, lets.height/scale: ${lets.height/scale}`)
                fftConvolve.init(Math.floor(lets.width/scale), Math.floor(lets.height/scale), kernelSize);
                console.log(`Initialized FFTConvolve with kernelSize: ${kernelSize}, width: ${shape[1]}, height: ${shape[0]}`);
            }
            resolve(psfInfo);
          } else {
            // Handle FITS format
            new astro.FITS(psfFile, function(fits) {
              try {
                const hdu = fits.getHDU();
                const header = hdu.header;
                const dataUnit = hdu.data;
                let width = header.get('NAXIS1');
                let height = header.get('NAXIS2');
                
                dataUnit.getFrame(0, function(psfData) {
                  try {
                    // Perform PSF normalization
                    const psfSum = psfData.reduce((sum, val) => sum + val, 0);
                    let normalizedPsfData = psfData;
                    if (psfSum !== 0) {
                      normalizedPsfData = psfData.map(val => val / psfSum);
                    }
                    console.log('PSF sum:', psfSum);
                    let psfInfo = {
                      data: normalizedPsfData,
                      width: width,
                      height: height,
                      type: 'fits',
                    };
                    // Save to a global variable
                    window.globalPSFData = psfInfo;
                    // Compute an appropriate kernelSize - the larger of the PSF's maximum dimension or 17
                    const kernelSize = Math.max(width, height, 17);
                    // Ensure fftConvolve uses the correct kernelSize and dimensions
                    if (fftConvolve.kernelSize !== kernelSize) {
                        fftConvolve.init(Math.floor(lets.width/scale), Math.floor(lets.height/scale), kernelSize);
                        console.log(`Initialized FFTConvolve with kernelSize: ${kernelSize}, width: ${width}, height: ${height}`);
                    }
                    resolve(psfInfo);
                  } catch (err) {
                    reject(err);
                  }
                });
              } catch (err) {
                reject(err);
              }
            }, reject);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(psfFile);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Handle a noise file and save it to the globalNoiseData array
 * @param {File} noiseFile - The noise file
 * @param {Object} appInstance - App instance object
 * @returns {Promise} A Promise containing noise data information
 */
function handleNoiseUpload(noiseFile) {
  globalNoiseData = null;
  
  return new Promise((resolve, reject) => {
    try {
      if (!noiseFile || (!noiseFile.name.endsWith('.h5') && !noiseFile.name.match(/\.(fits|fit|fts)$/i))) {
        throw new Error('Only HDF5 (.h5) or Fits(.fits) are allowed!');
      }
      
      let reader = new FileReader();
      reader.onloadend = function(evt) {
        try {
          let result = evt.target.result;
          
          if (noiseFile.name.endsWith('.h5')) {
            // Handle HDF5 format noise files
            let f = new hdf5.File(result, noiseFile.name);
            let dataset = f.get('noise');
            if (!dataset) {
              throw new Error('No noise or image dataset found in HDF5 file');
            }
            let noiseData = dataset.value;
            let shape = dataset.shape;
            
            // Save the noise data to a global variable
            globalNoiseData = new Float64Array(noiseData.length);
            for (let i = 0; i < noiseData.length; i++) {
              globalNoiseData[i] = noiseData[i];
            }
            
            console.log('Noise data loaded from HDF5 file:', globalNoiseData.length, 'values');
            resolve({ 
              name: noiseFile.name, 
              width: shape[1], 
              height: shape[0],
              size: globalNoiseData.length
            });
          } else if (noiseFile.name.match(/\.(fits|fit|fts)$/i)) {
            // Handle FITS format noise files
            new astro.FITS(noiseFile, function(fits) {
              try {
                const hdu = fits.getHDU();
                const dataUnit = hdu.data;
                
                dataUnit.getFrame(0, function(noiseData) {
                  try {
                    // Get the shape of the noise data
                    const width = hdu.header.get('NAXIS1');
                    const height = hdu.header.get('NAXIS2');
                    
                    // Save the noise data to a global variable
                    globalNoiseData = new Float64Array(noiseData.length);
                    for (let i = 0; i < height; i++) {
                      let flipped_i = height - 1 - i;  // read from the bottom
                      for (let j = 0; j < width; j++) {
                        let val = noiseData[flipped_i * width + j]; // 1D array
                        globalNoiseData[i * width + j] = val;
                      }
                    }
                    
                    console.log('Noise data loaded from FITS file:', globalNoiseData.length, 'values');
                    resolve({ 
                      name: noiseFile.name, 
                      width: width, 
                      height: height,
                      size: globalNoiseData.length
                    });
                  } catch (err) {
                    reject(err);
                  }
                });
              } catch (err) {
                reject(err);
              }
            }, reject);
          } 
        } catch (err) {
          reject(err);
        }
      }
      reader.onerror = reject;
      reader.readAsArrayBuffer(noiseFile);
    } catch (err) {
      reject(err);
    }
  });
}

// Export the file handling module
export {
  handleImageUpload,
  processImageFile,
  loadModelFile,
  saveModelToFile,
  handlePSFUpload,
  handleNoiseUpload
};