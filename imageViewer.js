/**
 * Image viewer feature module
 */

// Image viewer state variables
let currentScale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Expose all related functions to the global scope
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;
window.handleWheel = handleWheel;
window.handleBackgroundClick = handleBackgroundClick;
window.handleMouseDown = handleMouseDown;
window.handleMouseMove = handleMouseMove;
window.handleMouseUp = handleMouseUp;
window.handleKeyDown = handleKeyDown;
window.updateImageTransform = updateImageTransform;

/**
 * Open the image viewer
 * @param {string} imgSrc - Image source URL
 */
function openImageViewer(imgSrc) {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  viewerImg.src = imgSrc;
  
  // Reset the state
  currentScale = 1;
  translateX = 0;
  translateY = 0;
  updateImageTransform();
  
  viewer.style.display = 'flex';
  
  // Add the wheel zoom event
  viewerImg.onwheel = handleWheel;
  viewer.onclick = handleBackgroundClick;
  
  // Add drag-related events
  viewerImg.onmousedown = function(event) {
    this.style.cursor = 'grabbing';
    handleMouseDown(event);
  };
  viewerImg.onmousemove = handleMouseMove;
  viewerImg.onmouseup = function(event) {
    this.style.cursor = 'grab';
    handleMouseUp(event);
  };
  viewerImg.onmouseleave = function(event) {
    this.style.cursor = 'grab';
    handleMouseUp(event);
  };
  
  // Add keyboard listener for the Esc key
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Close the image viewer
 */
function closeImageViewer() {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  viewer.style.display = 'none';
  
  // Clear all event listeners
  viewerImg.onwheel = null;
  viewer.onclick = null;
  viewerImg.onmousedown = null;
  viewerImg.onmousemove = null;
  viewerImg.onmouseup = null;
  viewerImg.onmouseleave = null;
  
  // Remove the keyboard event listener
  document.removeEventListener('keydown', handleKeyDown);
}

/**
 * Handle the keydown event
 * @param {KeyboardEvent} event - Keyboard event object
 */
function handleKeyDown(event) {
  // Listen for the Esc key (key code 27); close the viewer when pressed
  if (event.key === 'Escape' || event.keyCode === 27) {
    closeImageViewer();
  }
}

/**
 * Handle background click event
 * @param {MouseEvent} event - Mouse event object
 */
function handleBackgroundClick(event) {
  // Close only when the background area is clicked; do not close when the image is clicked
  if (event.target === document.getElementById('image-viewer')) {
    closeImageViewer();
  }
}

/**
 * Handle the wheel zoom event
 * @param {WheelEvent} event - Wheel event object
 */
function handleWheel(event) {
  event.preventDefault();
  
  // Compute the mouse position relative to the image (used to zoom around the cursor)
  const viewerImg = document.getElementById('viewer-img');
  const rect = viewerImg.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  
  // Wheel zoom logic
  const prevScale = currentScale;
  if (event.deltaY < 0) {
    // Scroll up to zoom in
    currentScale *= 1.1;
  } else {
    // Scroll down to zoom out
    currentScale /= 1.1;
  }
  
  // Set the zoom ratio limits
  currentScale = Math.max(0.1, Math.min(currentScale, 10));
  
  // Zoom around the mouse position
  const scaleDelta = currentScale - prevScale;
  translateX += mouseX * scaleDelta;
  translateY += mouseY * scaleDelta;
  
  updateImageTransform();
}

/**
 * Handle the mouse-down event (start dragging)
 * @param {MouseEvent} event - Mouse event object
 */
function handleMouseDown(event) {
  event.preventDefault();
  isDragging = true;
  startX = event.clientX - translateX;
  startY = event.clientY - translateY;
}

/**
 * Handle the mouse-move event (while dragging)
 * @param {MouseEvent} event - Mouse event object
 */
function handleMouseMove(event) {
  if (!isDragging) return;
  event.preventDefault();
  translateX = event.clientX - startX;
  translateY = event.clientY - startY;
  updateImageTransform();
}

/**
 * Handle the mouse-release event (end dragging)
 */
function handleMouseUp() {
  isDragging = false;
}

/**
 * Update the transform style of the image
 */
function updateImageTransform() {
  const viewerImg = document.getElementById('viewer-img');
  viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
}