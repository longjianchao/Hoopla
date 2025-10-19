/**
 * 文件处理模块 - 负责所有文件相关操作
 */

// 全局变量引用
let lets, img0, scale, convert, pixscale;
// 暴露scale变量给window对象，供其他模块使用
window.fileHandlerScale = null;

/**
 * 处理图像文件上传
 * @param {File} imageFile - 上传的图像文件
 * @returns {Promise} 包含图像URL和名称的Promise
 */
async function handleImageUpload(imageFile) {
  if (!imageFile || (!imageFile.name.endsWith('.h5') && !imageFile.name.match(/\.(fits|fit|fts)$/i) && !imageFile.name.endsWith('.png'))) {
    throw new Error('Only HDF5 (.h5) or Fits(.fits) or PNG files are allowed!');
  }
  
  window._uploadedImageFile = imageFile; // 保存到全局
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
  lets = appInstance;
  img0 = imageObj;
  return new Promise((resolve, reject) => {
    if(imageFile.name.endsWith('.h5')){
      loadH5File(imageFile, pixelScale).then(resolve).catch(reject);
    } else if(imageFile.name.match(/\.(fits|fit|fts)$/i)){
      loadFitsFile(imageFile, pixelScale).then(resolve).catch(reject);
    } else if(imageFile.name.endsWith('.png')){
      loadPngFile(imageFile, pixelScale).then(resolve).catch(reject);
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
    img0.src = url;
    
    // 为PNG文件也添加像素比例调整逻辑
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
        let data = JSON.parse(textdata);
        let components = data.components;
        let pixscale = data.pixscale;
        
        lets.loadModel(components);
        lets.pixscale = pixscale/scale;
        lets.freezeSrcModel = true;
        updateCanvas(components);
        
        const angle = lets.lens.ang2pix({x: components[0].x, y: components[0].y});
        lets.update(angle);

        let xc1, xc2, re, ql, phl;
        xc1 = lets.model.components[1].x;
        xc2 = lets.model.components[1].y;
        re = lets.model.components[1].theta_e;
        ql = lets.model.components[1].ell;
        phl = lets.model.components[1].ang;
        
        let yc1, yc2, sig2, qs, phs, n;
        yc1 = lets.model.components[0].x;
        yc2 = lets.model.components[0].y;
        sig2 = lets.model.components[0].size;
        qs = lets.model.components[0].ell;
        phs = lets.model.components[0].ang;
        n = lets.model.components[0].n_sersic;
        
        let p = [xc1, xc2, re, ql, phl, yc1, yc2, sig2, qs, phs, n];
        showRes(p);
        
        // 在加载模型后绘制参数对比线
        if (window.drawModelComparisonLines) {
            try {
                window.drawModelComparisonLines(p);
            } catch (err) {
                console.warn('绘制模型参数对比线失败:', err);
            }
        }
        
        // 导入UI处理模块并调用清理函数
          import('./uiHandler.js').then(uiModule => {
            uiModule.cleanupCanvas();
          }).catch(error => {
            console.error('Error importing uiHandler module for cleanup:', error);
            // 备用清理逻辑
            if (window.chartInstance) {
              try {
                window.chartInstance.destroy();
                window.chartInstance = null;
              } catch (e) {
                console.warn('Failed to destroy chart instance:', e);
              }
            }
          });
        
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

// 导出文件处理模块
export {
  handleImageUpload,
  processImageFile,
  loadModelFile,
  saveModelToFile
};