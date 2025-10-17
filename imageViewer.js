/**
 * 图片查看器功能模块
 */

// 图片查看器状态变量
let currentScale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

/**
 * 打开图片查看器
 * @param {string} imgSrc - 图片源URL
 */
function openImageViewer(imgSrc) {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  viewerImg.src = imgSrc;
  
  // 重置状态
  currentScale = 1;
  translateX = 0;
  translateY = 0;
  updateImageTransform();
  
  viewer.style.display = 'flex';
  
  // 添加滚轮缩放事件
  viewerImg.onwheel = handleWheel;
  viewer.onclick = handleBackgroundClick;
  
  // 添加拖拽相关事件
  viewerImg.onmousedown = handleMouseDown;
  viewerImg.onmousemove = handleMouseMove;
  viewerImg.onmouseup = handleMouseUp;
  viewerImg.onmouseleave = handleMouseUp;
  
  // 添加键盘Esc键监听
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * 关闭图片查看器
 */
function closeImageViewer() {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  viewer.style.display = 'none';
  
  // 清除所有事件监听器
  viewerImg.onwheel = null;
  viewer.onclick = null;
  viewerImg.onmousedown = null;
  viewerImg.onmousemove = null;
  viewerImg.onmouseup = null;
  viewerImg.onmouseleave = null;
  
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleKeyDown);
}

/**
 * 处理键盘按下事件
 * @param {KeyboardEvent} event - 键盘事件对象
 */
function handleKeyDown(event) {
  // 监听Esc键(键码27)，按下时退出图片查看器
  if (event.key === 'Escape' || event.keyCode === 27) {
    closeImageViewer();
  }
}

/**
 * 处理背景点击事件
 * @param {MouseEvent} event - 鼠标事件对象
 */
function handleBackgroundClick(event) {
  // 只有点击背景区域时才退出，点击图片不退出
  if (event.target === document.getElementById('image-viewer')) {
    closeImageViewer();
  }
}

/**
 * 处理滚轮缩放事件
 * @param {WheelEvent} event - 滚轮事件对象
 */
function handleWheel(event) {
  event.preventDefault();
  
  // 计算鼠标位置在图片上的相对位置（用于以鼠标为中心缩放）
  const viewerImg = document.getElementById('viewer-img');
  const rect = viewerImg.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  
  // 滚轮缩放逻辑
  const prevScale = currentScale;
  if (event.deltaY < 0) {
    // 向上滚轮，放大
    currentScale *= 1.1;
  } else {
    // 向下滚轮，缩小
    currentScale /= 1.1;
  }
  
  // 设置缩放比例限制
  currentScale = Math.max(0.1, Math.min(currentScale, 10));
  
  // 以鼠标位置为中心缩放
  const scaleDelta = currentScale - prevScale;
  translateX += mouseX * scaleDelta;
  translateY += mouseY * scaleDelta;
  
  updateImageTransform();
}

/**
 * 处理鼠标按下事件（开始拖拽）
 * @param {MouseEvent} event - 鼠标事件对象
 */
function handleMouseDown(event) {
  event.preventDefault();
  isDragging = true;
  startX = event.clientX - translateX;
  startY = event.clientY - translateY;
}

/**
 * 处理鼠标移动事件（拖拽中）
 * @param {MouseEvent} event - 鼠标事件对象
 */
function handleMouseMove(event) {
  if (!isDragging) return;
  event.preventDefault();
  translateX = event.clientX - startX;
  translateY = event.clientY - startY;
  updateImageTransform();
}

/**
 * 处理鼠标释放事件（结束拖拽）
 */
function handleMouseUp() {
  isDragging = false;
}

/**
 * 更新图片的变换样式
 */
function updateImageTransform() {
  const viewerImg = document.getElementById('viewer-img');
  viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
}