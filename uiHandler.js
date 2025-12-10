/**
 * 界面交互处理模块 - 处理用户界面交互逻辑
 */

// 导入文件处理模块
import * as fileHandler from './fileHandler.js';

// 全局变量引用
let lets, img0, img, img_src, imgd, ms, ms_src, chartInstance, scale, pixscale;

/**
 * 初始化用户界面处理模块
 * @param {Object} appInstance - 应用实例对象
 * @param {Object} uiElements - 包含UI元素的对象
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
  
  // 初始化UI事件监听器
  initEventListeners();
  
  console.log('UI Handler initialized');
}

/**
 * 设置事件监听器
 */
function initEventListeners() {
  // 绑定图片上传按钮点击事件
  const imageUploadBtn = document.getElementById('imageUpload');
  if (imageUploadBtn) {
    imageUploadBtn.addEventListener('click', () => {
      document.getElementById("imgURL").innerText = "";
      document.getElementById("pixel-scale").value = "";
      document.querySelector('.popup-form').classList.add('active');
    });
  }

  // 绑定关闭表单按钮点击事件
  const closeFormBtn = document.getElementById("close-form-button");
  if (closeFormBtn) {
    closeFormBtn.addEventListener('click', () => {
      document.querySelector('.popup-form').classList.remove('active');
    });
  }

  // 绑定图像选择输入变更事件
  const imageUrlInput = document.getElementById("image-url");
  if (imageUrlInput) {
    imageUrlInput.addEventListener('change', async function () {
      let imageFile = this.files[0];
      try {
        const result = await fileHandler.handleImageUpload(imageFile);
        document.getElementById("imgURL").innerText = result.url;
        // 更新图像名称（全局变量）
        if (typeof img_name !== 'undefined') {
          img_name = result.imgName;
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  // 绑定确认按钮点击事件
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

  // 绑定保存模型按钮点击事件
  const saveModelBtn = document.getElementById("saveModel");
  if (saveModelBtn) {
    saveModelBtn.addEventListener('click', () => {
      fileHandler.saveModelToFile(img_src.src, lets); // 传递应用实例对象
    });
  }

  // 绑定模型上传输入变更事件
  const modelUploadBtn = document.getElementById('modelUpload');
  if (modelUploadBtn) {
    modelUploadBtn.addEventListener('change', (e) => {
      handleModelUpload(e);
    });
  }
}

/**
 * 处理确认按钮点击事件
 */
async function handleConfirmButtonClick() {
  let url = document.getElementById("imgURL").innerText;
  let imageFile = window._uploadedImageFile;
  let pixelScaleInput = document.getElementById("pixel-scale").value;
  
  // 验证输入
  if (!imageFile) {
    window.alert('Please select a valid file!');
    return;
  }
  
  if ((url === '' || !url) || (pixelScaleInput === '' || !pixelScaleInput)) {
    window.alert("Please input entire information of image!");
    return;
  }
  
  // 验证像素比例格式
  const regex = /^\d{0,2}(\.\d{0,6})?$/;
  if (!regex.test(pixelScaleInput)) {
    window.alert('Please re-enter the pixel scale of the image correctly!');
    return;
  }
  
  pixscale = parseFloat(pixelScaleInput);
  
  // 清理现有图表
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  
  // 处理图像文件
  try {
    await fileHandler.processImageFile(imageFile, pixscale, img0, lets);
    // 清空文件输入字段，允许重新上传相同文件
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    // 重置上传的文件引用
    window._uploadedImageFile = null;
  } catch (error) {
    console.error("Error processing image file:", error);
    window.alert("Error processing image: " + error.message);
    return;
  }
  
  // 更新模型和界面状态 - 像素比例已在fileHandler.js中根据图像缩放比例正确设置
  
  // 重置标记表面
  if (ms) ms.reset();
  if (ms_src) ms_src.reset();
  
  // 更新像素比例显示
  document.getElementById('newPixelScale').value = pixelScaleInput;
  
  // 关闭弹窗
  document.querySelector('.popup-form').classList.remove('active');
  
  // 清理掩码
  if (lets && typeof lets.clearMask === 'function') {
    lets.clearMask();
  }
}

/**
 * 处理模型文件上传
 * @param {Event} e - 事件对象
 */
async function handleModelUpload(e) {
  let input = e.target;
  let modelFile = input.files[0];
  
  try {
    await fileHandler.loadModelFile(
      modelFile, 
      ms, 
      ms_src, 
      window.updateCanvas || function() {}, 
      window.show_res || function() {}, 
      chartInstance, 
      window.drawChiSquareCurve || function() {},
      lets, // 传递应用实例对象
      scale || 1 // 传递缩放比例
    );
    // 无论成功或失败，都清空文件输入字段，允许重新上传相同文件
    input.value = '';
  } catch (error) {
    window.alert(error.message);
    input.value = ''; // 清空文件输入
  }
}

/**
 * 图像加载后清理界面
 */
function cleanupCanvas() {
  // 清理卡方曲线图
  if (chartInstance) {
    chartInstance.destroy(); // 销毁现有图表实例
    chartInstance = null; // 将实例设置为null
  }
  
  // 重新绘制图表或其他逻辑
  if (window.drawChiSquareCurve) {
    window.drawChiSquareCurve([]); // 传入空数组以清空图表
  }
  // 清理mask
  if (lets && typeof lets.clearMask === 'function') {
    lets.clearMask();
  }
}

/**
 * 设置图像加载完成后的回调函数
 * @param {HTMLImageElement} imgElement - 图像元素
 * @param {Function} callback - 回调函数
 */
function setupImageLoadHandler(imgElement, callback) {
  imgElement.onload = function() {
    // 获取应用实例的目标尺寸
    const targetWidth = lets && lets.width ? lets.width : 400;
    const targetHeight = lets && lets.height ? lets.height : 400;
    
    // 计算缩放比例
    const scaleX = targetWidth / imgElement.naturalWidth;
    const scaleY = targetHeight / imgElement.naturalHeight;
    const newScale = Math.min(scaleX, scaleY); // 取较小的缩放比例以确保图像完全显示
    scale = newScale; // 更新全局缩放比例
    
    // 计算缩放后的图像尺寸
    const scaledWidth = imgElement.naturalWidth * newScale;
    const scaledHeight = imgElement.naturalHeight * newScale;
    
    // 创建临时画布进行图像缩放
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // 清除临时画布
    tempCtx.clearRect(0, 0, targetWidth, targetHeight);
    
    // 在临时画布中央绘制缩放后的图像
    const xOffset = (targetWidth - scaledWidth) / 2;
    const yOffset = (targetHeight - scaledHeight) / 2;
    tempCtx.drawImage(imgElement, xOffset, yOffset, scaledWidth, scaledHeight);
    
    // 获取缩放后的图像URL
    const scaledUrl = tempCanvas.toDataURL();
    
    // 更新标记表面大小
    if (ms) ms.setSize(targetWidth, targetHeight);
    if (ms_src) ms_src.setSize(targetWidth, targetHeight);
    
    // 调用回调函数，传递缩放后的URL和尺寸
    if (typeof callback === 'function') {
      callback(scaledUrl, targetWidth, targetHeight);
    }
  };
}

/**
 * 更新所有图像和画布元素
 * @param {string} scaledUrl - 缩放后的图像URL
 * @param {number} targetWidth - 目标宽度
 * @param {number} targetHeight - 目标高度
 */
function updateImageElements(scaledUrl, targetWidth, targetHeight) {
  // 更新应用实例尺寸
  if (lets) {
    lets.width = targetWidth;
    lets.height = targetHeight;
    
    // 重置镜头参数
    lets.resetLens(targetWidth, targetHeight, lets.pixscale);
  }
  
  // 更新图像元素
  if (img) img.src = scaledUrl;
  if (img_src) img_src.src = scaledUrl;
  if (imgd) {
    imgd.src = scaledUrl;
    imgd.width = targetWidth;
    imgd.height = targetHeight;
  }
  
  // 更新应用实例中的画布
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
  
  // 更新所有bar元素
  updateBarElements(scaledUrl, targetWidth, targetHeight);
}

/**
 * 更新所有bar和canvas元素样式
 * @param {string} scaledUrl - 缩放后的图像URL
 * @param {number} targetWidth - 目标宽度
 * @param {number} targetHeight - 目标高度
 */
function updateBarElements(scaledUrl, targetWidth, targetHeight) {
  // 更新bar元素
  let bar = document.getElementsByClassName("bar");
  for (let i = 0; i < bar.length; i++){
    bar[i].style.backgroundImage = "url(" + scaledUrl + ")";
    bar[i].style.height = targetHeight + "px";
    bar[i].style.width = targetWidth + "px";
    // 确保背景图像覆盖整个bar
    bar[i].style.backgroundSize = "cover";
    bar[i].style.backgroundPosition = "center";
  }
  
  // 更新canvas元素
  let canvas = document.querySelectorAll('canvas');
  for (let i = 0; i < canvas.length; i++){
    canvas[i].height = targetHeight;
    canvas[i].width = targetWidth;
  }
  
  // 更新barTitle元素
  let barTitle = document.getElementsByClassName("barTitle");
  for (let i = 0; i < barTitle.length; i++){
    barTitle[i].style.width = targetWidth + "px";
  }
}

/**
 * 重置像素比例
 * @param {string} pixscale - 像素比例值
 * @param {Object} letsInstance - 应用实例对象
 * @param {number} scaleValue - 缩放比例值
 * @returns {boolean} - 是否成功重置
 */
function resetPixelScale(pixscale, letsInstance, scaleValue) {
  const regex = /^\d{0,2}(\.\d{0,6})?$/;
  
  // 参数验证
  if (!regex.test(pixscale)) {
    window.alert('Please input the pixel scale correctly!');
    return false;
  }
  
  // 确保letsInstance存在
  if (!letsInstance) {
    console.warn('letsInstance is undefined, cannot update pixel scale');
    return false;
  }
  
  // 使用传入的scaleValue进行调整（如果提供）
  const adjustedPixscale = scaleValue ? parseFloat(pixscale) / scaleValue : parseFloat(pixscale);
  
  // 安全设置像素比例
  try {
    letsInstance.pixscale = adjustedPixscale;
    if (letsInstance.model) {
      letsInstance.model.pixscale = adjustedPixscale;
    }
    
    console.log('Updated pixel scale:', letsInstance.pixscale);
    console.log(lets);
    // 重置标记表面
    if (ms) ms.reset();
    if (ms_src) ms_src.reset();
    
    return true;
  } catch (error) {
    console.error('Error updating pixel scale:', error);
    return false;
  }
}

// 初始化加载动画覆盖层
function initializeLoadingOverlay() {
  // 检查是否已存在加载动画容器
  let loadingOverlay = document.getElementById('loading-overlay');
  
  if (!loadingOverlay) {
    // 创建加载动画容器
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.classList.add('loading-overlay');
    loadingOverlay.style.display = 'none';
    
    // 创建加载内容
    const loadingContent = document.createElement('div');
    loadingContent.classList.add('loading-content');
    
    // 创建加载图标
    const loadingSpinner = document.createElement('div');
    loadingSpinner.classList.add('loading-spinner');
    
    // 创建加载文本
    const loadingText = document.createElement('p');
    loadingText.classList.add('loading-text');
    loadingText.textContent = '正在进行MCMC建模，请稍候...';
    
    // 组合元素
    loadingContent.appendChild(loadingSpinner);
    loadingContent.appendChild(loadingText);
    loadingOverlay.appendChild(loadingContent);
    
    // 添加到body
    document.body.appendChild(loadingOverlay);
  }
}

// 显示加载动画
function showLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }
}

// 隐藏加载动画
function hideLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

// 处理MCMC按钮点击事件
function startMCMC() {
  // 显示加载动画
  showLoading();
  
  // 执行MCMC相关逻辑
  // 这里假设存在window.lets.runMCMC方法
  if (window.lets && window.lets.runMCMC) {
    window.lets.runMCMC()
      .then(() => {
        // MCMC完成后隐藏加载动画
        hideLoading();
      })
      .catch(error => {
        console.error('MCMC execution error:', error);
        hideLoading();
        window.alert('MCMC执行出错: ' + error.message);
      });
  } else {
    hideLoading();
    window.alert('MCMC功能不可用');
  }
}

// 修改initEventListeners以添加MCMC按钮和加载动画支持
function enhanceEventListeners() {
  // 初始化加载动画
  initializeLoadingOverlay();
  
  // MCMC按钮点击事件
  const startMCMCButton = document.getElementById('startMCMCButton');
  if (startMCMCButton) {
    startMCMCButton.addEventListener('click', startMCMC);
  }
}

// 导出UI处理模块
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