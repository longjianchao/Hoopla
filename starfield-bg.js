// 星空粒子背景特效 - 使用Three.js实现
class StarfieldBackground {
    constructor(options = {}) {
        // 默认配置
        this.config = {
            particleCount: options.particleCount || 35000,
            particleSize: options.particleSize || 3,
            zoomSmoothness: options.zoomSmoothness || 10,
            particleSpeed: options.particleSpeed || 100,
            container: options.container || document.body
        };
        
        // 初始化变量
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particles = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetCameraZ = 800;
        this.currentCameraZ = 800;
        this.velocities = [];
        this.originalPositions = [];
        
        // 初始化
        this.init();
    }
    
    init() {
        // 确保Three.js已加载
        if (typeof THREE === 'undefined') {
            console.error('Three.js is not loaded. Please include Three.js before this script.');
            return;
        }
        
        // 创建场景
        this.scene = new THREE.Scene();
        
        // 创建相机
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            1, 
            3000
        );
        this.camera.position.z = this.currentCameraZ;
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // 设置canvas样式
        this.renderer.domElement.style.position = 'fixed';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '-1';
        this.renderer.domElement.style.pointerEvents = 'none';
        
        // 添加到容器
        this.config.container.appendChild(this.renderer.domElement);
        
        // 创建粒子
        this.createParticles();
        
        // 添加事件监听
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // 开始动画循环
        this.animate();
    }
    
    createParticles() {
        // 如果已有粒子，从场景中移除
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        
        // 重置速度和原始位置数组
        this.velocities = [];
        this.originalPositions = [];
        
        // 粒子几何体
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.config.particleCount * 3);
        const colors = new Float32Array(this.config.particleCount * 3);
        const sizes = new Float32Array(this.config.particleCount);
        
        // 随机生成粒子位置、颜色和大小
        // 创建星系团效果 - 粒子在中心区域更密集
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // 创建星系团分布 - 中心区域更密集
            let radius;
            
            // 80%的粒子在中心区域，20%的粒子在外围
            if (Math.random() < 0.8) {
                // 中心区域 - 密集
                radius = Math.random() * 400;
            } else {
                // 外围区域 - 稀疏
                radius = Math.random() * 1000 + 400;
            }
            
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            
            // 转换为笛卡尔坐标
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // 保存原始位置
            this.originalPositions[i3] = positions[i3];
            this.originalPositions[i3 + 1] = positions[i3 + 1];
            this.originalPositions[i3 + 2] = positions[i3 + 2];
            
            // 根据距离中心的远近设置颜色和亮度
            const distanceFromCenter = Math.sqrt(
                positions[i3] * positions[i3] + 
                positions[i3 + 1] * positions[i3 + 1] + 
                positions[i3 + 2] * positions[i3 + 2]
            );
            
            // 中心区域粒子更亮，外围粒子较暗
            const brightness = Math.max(0.3, 1 - (distanceFromCenter / 1400));
            
            // 随机颜色 - 主要为蓝色调，添加一些变化
            colors[i3] = Math.random() * 0.2 * brightness + 0.7 * brightness;     // 红色分量
            colors[i3 + 1] = Math.random() * 0.3 * brightness + 0.7 * brightness; // 绿色分量
            colors[i3 + 2] = Math.random() * 0.5 * brightness + 0.5 * brightness; // 蓝色分量
            
            // 随机大小 - 中心区域粒子更大
            const sizeFactor = Math.max(0.5, 1 - (distanceFromCenter / 1400));
            sizes[i] = (Math.random() * this.config.particleSize + this.config.particleSize * 0.5) * sizeFactor;
            
            // 为每个粒子设置随机速度和方向
            this.velocities.push({
                x: (Math.random() - 0.5) * 0.5,
                y: (Math.random() - 0.5) * 0.5,
                z: (Math.random() - 0.5) * 0.5
            });
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // 粒子材质 - 使用圆形精灵
        const material = new THREE.PointsMaterial({
            size: this.config.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            map: this.createCircleTexture()
        });
        
        // 创建粒子系统
        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }
    
    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        
        // 绘制圆形
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.5, 'rgba(200,220,255,0.8)');
        gradient.addColorStop(1, 'rgba(100,150,255,0)');
        
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(16, 16, 16, 0, Math.PI * 2);
        context.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    onMouseMove(event) {
        // 将鼠标坐标转换为归一化设备坐标 (-1到+1)
        this.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // 计算鼠标距离屏幕中心的距离 (0到1)
        const distanceFromCenter = Math.min(1, Math.sqrt(this.mouseX * this.mouseX + this.mouseY * this.mouseY));
        
        // 根据距离设置目标相机位置
        // 屏幕边缘(距离=1) -> 外太空视角 (Z=800)
        // 屏幕中心(距离=0) -> 星系中心视角 (Z=200)
        this.targetCameraZ = 200 + distanceFromCenter * 600;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // 平滑更新相机位置 - 使用平滑度参数控制
        const smoothFactor = 0.05 + (this.config.zoomSmoothness / 200);
        this.currentCameraZ += (this.targetCameraZ - this.currentCameraZ) * smoothFactor;
        this.camera.position.z = this.currentCameraZ;
        
        // 更新粒子位置
        const positions = this.particles.geometry.attributes.position.array;
        const time = Date.now() * 0.0001;
        const speedFactor = this.config.particleSpeed / 100;
        
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // 添加鼠标交互效果
            const dx = positions[i3] - this.mouseX * 200;
            const dy = positions[i3 + 1] - this.mouseY * 200;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 鼠标影响范围内的粒子
            if (distance < 100) {
                const force = (100 - distance) / 100 * 0.5;
                positions[i3] += dx * force * 0.05;
                positions[i3 + 1] += dy * force * 0.05;
            }
            
            // 使用存储的速度更新粒子位置
            positions[i3] += this.velocities[i].x * speedFactor;
            positions[i3 + 1] += this.velocities[i].y * speedFactor;
            positions[i3 + 2] += this.velocities[i].z * speedFactor;
            
            // 边界检查 - 如果粒子超出边界，从另一侧出现
            if (Math.abs(positions[i3]) > 1500) positions[i3] = -positions[i3] * 0.9;
            if (Math.abs(positions[i3 + 1]) > 1500) positions[i3 + 1] = -positions[i3 + 1] * 0.9;
            if (Math.abs(positions[i3 + 2]) > 1500) positions[i3 + 2] = -positions[i3 + 2] * 0.9;
            
            // 添加额外的随机运动
            positions[i3] += Math.sin(time + i) * 0.1;
            positions[i3 + 1] += Math.cos(time + i) * 0.1;
            positions[i3 + 2] += Math.sin(time + i * 0.5) * 0.1;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
        
        // 根据相机距离调整粒子透明度 - 实现近少远多效果
        const opacityFactor = 0.3 + (this.currentCameraZ - 200) / 600 * 0.7;
        this.particles.material.opacity = Math.min(0.9, opacityFactor);
        
        // 根据相机距离调整粒子大小 - 近大远小
        const sizeFactor = 0.5 + (800 - this.currentCameraZ) / 600 * 0.5;
        this.particles.material.size = this.config.particleSize * sizeFactor;
        
        // 缓慢旋转整个粒子系统
        this.particles.rotation.x += 0.0002;
        this.particles.rotation.y += 0.0003;
        
        // 渲染场景
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // 配置更新方法
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // 更新粒子大小
        if (newConfig.particleSize !== undefined && this.particles) {
            this.particles.material.size = newConfig.particleSize;
        }
        
        // 更新平滑度和速度 - 这些会在动画循环中自动生效
        
        // 更新粒子数量 - 需要重新创建粒子
        if (newConfig.particleCount !== undefined) {
            this.createParticles();
        }
    }
    
    // 销毁方法
    destroy() {
        window.removeEventListener('resize', this.onWindowResize.bind(this));
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));
        
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    }
}

// 当文档加载完成后初始化星空背景
window.addEventListener('DOMContentLoaded', () => {
    // 等待Three.js加载完成
    if (typeof THREE !== 'undefined') {
        // 创建星空背景实例
        window.starfieldBackground = new StarfieldBackground({
            particleCount: 30000,  // 减少粒子数量以提高性能
            particleSize: 3,       // 调整粒子大小
            zoomSmoothness: 10,    // 保持默认平滑度
            particleSpeed: 100      // 稍微降低速度
        });
    } else {
        console.warn('Three.js is not loaded yet. Starfield background will initialize when Three.js is available.');
    }
});