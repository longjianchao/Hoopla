/**
 * 文件处理模块 - 负责所有文件相关操作
 */

// 全局变量引用
let  img0, convert, pixscale;
// WebGPU相关全局变量
let webGPUWidth = 400; // 默认宽度
let webGPUHeight = 400; // 默认高度
// 暴露scale变量给window对象，供其他模块使用
window.fileHandlerScale = null;

/**
 * 处理图像文件上传
 * @param {File} imageFile - 上传的图像文件
 * @returns {Promise} 包含图像URL和名称的Promise
 */
async function handleImageUpload(imageFile, type) {
  if (!imageFile || (!imageFile.name.endsWith('.h5') && !imageFile.name.match(/\.(fits|fit|fts)$/i) && !imageFile.name.endsWith('.png'))) {
    throw new Error('Only HDF5 (.h5) or Fits(.fits) or PNG files are allowed!');
  }
  if(type === "image"){
    window._uploadedImageFile = imageFile; // 保存到全局
  } else if(type === "noise"){
    window._uploadedNoiseFile = imageFile; // 保存到全局
  } else if(type === "psf"){
    window._uploadedPSFFile = imageFile; // 保存到全局
  }
  const url = window.URL.createObjectURL(imageFile);
  const imgName = imageFile.name.split('.')[0];
  
  return { url, imgName };
}

/**
 * 处理图像文件加载（根据文件类型）
 * @param {File} imageFile - 图像文件
 * @param {number} pixelScale - 像素比例
 * @param {HTMLImageElement} imageObj - 图像对象
 * @param {Object} appInstance - 应用实例对象
 * @returns {Promise} 加载完成的Promise
 */
function processImageFile(imageFile, pixelScale, imageObj, appInstance) {
  // 初始化全局变量
  globalImageData = null;
  lets = appInstance;
  img0 = imageObj;
  return new Promise((resolve, reject) => {
    const handleImageLoaded = (result) => {
      // 图像加载完成后，检查是否需要重新初始化WebGPU
      if (typeof webgpuInitialized === 'undefined') {
        webgpuInitialized = false;
      }
      // 检查图像尺寸是否变化，需要重新初始化WebGPU
      const currentWidth = typeof window.fftConvolve !== 'undefined' ? window.fftConvolve.width : 0;
      const currentHeight = typeof window.fftConvolve !== 'undefined' ? window.fftConvolve.height : 0;
      
      if (currentWidth !== result.width || currentHeight !== result.height) {
        webgpuInitialized = false;
        console.log(`Image loaded with size ${result.width}x${result.height}, reinitializing WebGPU...`);
        // 重新初始化WebGPU，使用原始图像大小
        window.initWebGPU(result.width, result.height).then(() => {
          // WebGPU 初始化完成后的逻辑（如有需要可在此补充）
          resolve(result);
        }).catch(err => {
          console.error('WebGPU 初始化失败:', err);
          resolve(result);
        });
      } else {
        // 不需要重新初始化WebGPU，直接返回结果
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
 * 加载H5格式文件
 * @param {File} imageFile - H5文件
 * @param {number} pixelScale - 像素比例
 * @returns {Promise} 加载完成的Promise
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
          
          // 使用window.imageProcessor.getImage处理图像数据
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
 * 加载FITS格式文件
 * @param {File} imageFile - FITS文件
 * @param {number} pixelScale - 像素比例
 * @returns {Promise} 加载完成的Promise
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
          console.log("缩放比例是："+scale);
          window.fileHandlerScale = scale;
          convert = true;
          
          dataUnit.getFrame(0, function(imageData) {
            try {
              // 使用window.imageProcessor.getImage处理图像数据
              if (window.imageProcessor && window.imageProcessor.getImage) {
                let url = window.imageProcessor.getImage(imageData, width, height, convert);
                img0.src = url;
                lets.pixscale = pixelScale/scale;
                console.log("缩放后的像素 scale 是："+lets.pixscale);
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
 * 加载PNG格式文件
 * @param {File} imageFile - PNG文件
 * @param {number} pixelScale - 像素比例
 * @returns {Promise} 加载完成的Promise
 */
function loadPngFile(imageFile, pixelScale) {
  return new Promise((resolve) => {
    const url = document.getElementById("imgURL").innerText;
    // 创建一个临时图像来获取实际尺寸
    const tempImg = new Image();
    tempImg.onload = function() {
      // 计算缩放比例
      scale = lets.height / tempImg.height;
      window.fileHandlerScale = scale;
      // 按比例调整像素比例
      lets.pixscale = pixelScale / scale;
      // 更新模型中的像素比例
      if (lets.model) {
        lets.model.pixscale = lets.pixscale;
      }
      
      // 创建画布来处理PNG图像数据
      const canvas = document.createElement('canvas');
      canvas.width = tempImg.width;
      canvas.height = tempImg.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempImg, 0, 0);
      
      // 获取图像数据
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      
      // 使用Float64Array提高精度，与Python的float64一致
      globalImageData = new Float64Array(data.length / 4);
      for (let i = 0, n = globalImageData.length; i < n; i++) {
        globalImageData[i] = data[i * 4] / 255; // 归一化到0-1范围
      }
      
      // 设置图像源
      img0.src = url;
      
      resolve({ url, width: tempImg.width, height: tempImg.height });
    };
    tempImg.onerror = function() {
      // 如果图像加载失败，至少设置像素比例
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
 * 加载模型文件
 * @param {File} modelFile - 模型JSON文件
 * @param {Object} ms - 标记表面对象
 * @param {Object} ms_src - 源模型标记表面对象
 * @param {Function} updateCanvas - 更新画布函数
 * @param {Function} showRes - 显示结果函数
 * @param {Object} chartInstance - 图表实例引用
 * @param {Function} drawChiSquareCurve - 绘制卡方曲线函数
 * @param {Object} appInstance - 应用实例对象
 * @param {number} scaleValue - 缩放比例
 * @returns {Promise} 加载完成的Promise
 */
function loadModelFile(modelFile, updateCanvas, showRes, appInstance, scaleValue) {
  // 初始化全局变量
  lets = appInstance;
  scale = scaleValue;
  scale = window.fileHandlerScale;
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
        // console.log("p:", p);
        const x = components[0].x, y = components[0].y;
        const angle = lets.lens.ang2pix({x : x, y : y});  
        lets.update(angle);
        // console.log("components:", components);
        
        // 在加载模型后绘制参数对比线
        if (window.drawModelComparisonLines) {
            try {
                window.drawModelComparisonLines(p);
            } catch (err) {
                console.warn('绘制模型参数对比线失败:', err);
            }
        }
        
        // 导入UI处理模块并调用清理函数
          // import('./uiHandler.js').then(uiModule => {
          //   uiModule.cleanupCanvas();
          // }).catch(error => {
          //   console.error('Error importing uiHandler module for cleanup:', error);
          //   // 备用清理逻辑
          //   if (window.chartInstance) {
          //     try {
          //       window.chartInstance.destroy();
          //       window.chartInstance = null;
          //     } catch (e) {
          //       console.warn('Failed to destroy chart instance:', e);
          //     }
          //   }
          // });
        
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
 * 保存模型
 * @param {string} imageSrc - 图像源URL
 * @param {Object} appInstance - 应用实例对象
 */
function saveModelToFile(imageSrc, appInstance) {
  if (appInstance) {
    appInstance.saveModel(imageSrc);
  }
}

/**
 * 处理PSF文件上传
 * @param {File} psfFile - 上传的PSF文件
 * @returns {Promise} 包含PSF数据的Promise
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
            // 处理HDF5格式
            let f = new hdf5.File(result, psfFile.name);
            let dataset = f.get('psf');
            let psfData = dataset.value;
            let shape = dataset.shape;
            
            // 执行PSF归一化
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
            // 保存到全局变量
            window.globalPSFData = psfInfo;
            const kernelSize = Math.max(shape[1], shape[0], 17);
            // 确保fftConvolve使用正确的kernelSize和尺寸
            if (fftConvolve.kernelSize !== kernelSize) {
                console.log(`lets.width/scale: ${lets.width/scale}, lets.height/scale: ${lets.height/scale}`)
                fftConvolve.init(Math.floor(lets.width/scale), Math.floor(lets.height/scale), kernelSize);
                console.log(`Initialized FFTConvolve with kernelSize: ${kernelSize}, width: ${shape[1]}, height: ${shape[0]}`);
            }
            resolve(psfInfo);
          } else {
            // 处理FITS格式
            new astro.FITS(psfFile, function(fits) {
              try {
                const hdu = fits.getHDU();
                const header = hdu.header;
                const dataUnit = hdu.data;
                let width = header.get('NAXIS1');
                let height = header.get('NAXIS2');
                
                dataUnit.getFrame(0, function(psfData) {
                  try {
                    // 执行PSF归一化
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
                    // 保存到全局变量
                    window.globalPSFData = psfInfo;
                    // 计算合适的kernelSize - 使用PSF的最大尺寸或17，取较大值
                    const kernelSize = Math.max(width, height, 17);
                    // 确保fftConvolve使用正确的kernelSize和尺寸
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
      // window._uploadedPSFFile = null;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 处理噪声文件并保存到globalNoiseData数组
 * @param {File} noiseFile - 噪声文件
 * @param {Object} appInstance - 应用实例对象
 * @returns {Promise} 包含噪声数据信息的Promise
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
            // 处理HDF5格式噪声文件
            let f = new hdf5.File(result, noiseFile.name);
            let dataset = f.get('noise');
            if (!dataset) {
              throw new Error('No noise or image dataset found in HDF5 file');
            }
            let noiseData = dataset.value;
            let shape = dataset.shape;
            
            // 将噪声数据保存到全局变量
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
            // 处理FITS格式噪声文件
            new astro.FITS(noiseFile, function(fits) {
              try {
                const hdu = fits.getHDU();
                const dataUnit = hdu.data;
                
                dataUnit.getFrame(0, function(noiseData) {
                  try {
                    // 获取噪声数据的形状
                    const width = hdu.header.get('NAXIS1');
                    const height = hdu.header.get('NAXIS2');
                    
                    // 将噪声数据保存到全局变量
                    globalNoiseData = new Float64Array(noiseData.length);
                    for (let i = 0; i < height; i++) {
                      let flipped_i = height - 1 - i;  // 从底部开始读取
                      for (let j = 0; j < width; j++) {
                        let val = noiseData[flipped_i * width + j]; // 1D数组
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
      // window._uploadedNoiseFile = null;
    } catch (err) {
      reject(err);
    }
  });
}

// 导出文件处理模块
export {
  handleImageUpload,
  processImageFile,
  loadModelFile,
  saveModelToFile,
  handlePSFUpload,
  handleNoiseUpload
};