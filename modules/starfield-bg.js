// Starfield particle background effect - implemented with Three.js
class StarfieldBackground {
    constructor(options = {}) {
        // Default configuration
        this.config = {
            particleCount: options.particleCount || 35000,
            particleSize: options.particleSize || 3,
            zoomSmoothness: options.zoomSmoothness || 10,
            particleSpeed: options.particleSpeed || 100,
            container: options.container || document.body
        };
        
        // Initialize variables
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
        
        // Initialize
        this.init();
    }
    
    init() {
        // Ensure Three.js is loaded
        if (typeof THREE === 'undefined') {
            console.error('Three.js is not loaded. Please include Three.js before this script.');
            return;
        }
        
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            1, 
            3000
        );
        this.camera.position.z = this.currentCameraZ;
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Set canvas style
        this.renderer.domElement.style.position = 'fixed';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '-1';
        this.renderer.domElement.style.pointerEvents = 'none';
        
        // Append to container
        this.config.container.appendChild(this.renderer.domElement);
        
        // Create particles
        this.createParticles();
        
        // Add event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Start animation loop
        this.animate();
    }
    
    createParticles() {
        // If particles already exist, remove them from the scene
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        
        // Reset velocity and original position arrays
        this.velocities = [];
        this.originalPositions = [];
        
        // Particle geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.config.particleCount * 3);
        const colors = new Float32Array(this.config.particleCount * 3);
        const sizes = new Float32Array(this.config.particleCount);
        
        // Randomly generate particle positions, colors and sizes
        // Create a galactic cluster effect - particles are denser near the center
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // Create a galactic cluster distribution - denser near the center
            let radius;
            
            // 80% of particles in the central region, 20% in the outer region
            if (Math.random() < 0.8) {
                // Central region - dense
                radius = Math.random() * 400;
            } else {
                // Outer region - sparse
                radius = Math.random() * 1000 + 400;
            }
            
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            
            // Convert to Cartesian coordinates
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // Save the original position
            this.originalPositions[i3] = positions[i3];
            this.originalPositions[i3 + 1] = positions[i3 + 1];
            this.originalPositions[i3 + 2] = positions[i3 + 2];
            
            // Set color and brightness based on distance from center
            const distanceFromCenter = Math.sqrt(
                positions[i3] * positions[i3] + 
                positions[i3 + 1] * positions[i3 + 1] + 
                positions[i3 + 2] * positions[i3 + 2]
            );
            
            // Central particles are brighter, outer particles are dimmer
            const brightness = Math.max(0.3, 1 - (distanceFromCenter / 1400));
            
            // Random colors - predominantly blue tones with some variation
            colors[i3] = Math.random() * 0.2 * brightness + 0.7 * brightness;     // Red component
            colors[i3 + 1] = Math.random() * 0.3 * brightness + 0.7 * brightness; // Green component
            colors[i3 + 2] = Math.random() * 0.5 * brightness + 0.5 * brightness; // Blue component
            
            // Random size - larger particles near the center
            const sizeFactor = Math.max(0.5, 1 - (distanceFromCenter / 1400));
            sizes[i] = (Math.random() * this.config.particleSize + this.config.particleSize * 0.5) * sizeFactor;
            
            // Set a random velocity and direction for each particle
            this.velocities.push({
                x: (Math.random() - 0.5) * 0.5,
                y: (Math.random() - 0.5) * 0.5,
                z: (Math.random() - 0.5) * 0.5
            });
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Particle material - uses a circular sprite
        const material = new THREE.PointsMaterial({
            size: this.config.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            map: this.createCircleTexture()
        });
        
        // Create the particle system
        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }
    
    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        
        // Draw the circle
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
        // Convert mouse coordinates to normalized device coordinates (-1 to +1)
        this.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Calculate the mouse distance from the screen center (0 to 1)
        const distanceFromCenter = Math.min(1, Math.sqrt(this.mouseX * this.mouseX + this.mouseY * this.mouseY));
        
        // Set the target camera position based on distance
        // Screen edge (distance=1) -> deep space view (Z=800)
        // Screen center (distance=0) -> galaxy center view (Z=200)
        this.targetCameraZ = 200 + distanceFromCenter * 600;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Smoothly update camera position - controlled by the smoothness parameter
        const smoothFactor = 0.05 + (this.config.zoomSmoothness / 200);
        this.currentCameraZ += (this.targetCameraZ - this.currentCameraZ) * smoothFactor;
        this.camera.position.z = this.currentCameraZ;
        
        // Update particle positions
        const positions = this.particles.geometry.attributes.position.array;
        const time = Date.now() * 0.0001;
        const speedFactor = this.config.particleSpeed / 100;
        
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // Add mouse interaction effect
            const dx = positions[i3] - this.mouseX * 200;
            const dy = positions[i3 + 1] - this.mouseY * 200;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Particles within the mouse influence range
            if (distance < 100) {
                const force = (100 - distance) / 100 * 0.5;
                positions[i3] += dx * force * 0.05;
                positions[i3 + 1] += dy * force * 0.05;
            }
            
            // Update particle positions using the stored velocities
            positions[i3] += this.velocities[i].x * speedFactor;
            positions[i3 + 1] += this.velocities[i].y * speedFactor;
            positions[i3 + 2] += this.velocities[i].z * speedFactor;
            
            // Boundary check - if a particle goes out of bounds, wrap it to the other side
            if (Math.abs(positions[i3]) > 1500) positions[i3] = -positions[i3] * 0.9;
            if (Math.abs(positions[i3 + 1]) > 1500) positions[i3 + 1] = -positions[i3 + 1] * 0.9;
            if (Math.abs(positions[i3 + 2]) > 1500) positions[i3 + 2] = -positions[i3 + 2] * 0.9;
            
            // Add extra random motion
            positions[i3] += Math.sin(time + i) * 0.1;
            positions[i3 + 1] += Math.cos(time + i) * 0.1;
            positions[i3 + 2] += Math.sin(time + i * 0.5) * 0.1;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
        
        // Adjust particle opacity based on camera distance - fewer/fainter near, denser far
        const opacityFactor = 0.3 + (this.currentCameraZ - 200) / 600 * 0.7;
        this.particles.material.opacity = Math.min(0.9, opacityFactor);
        
        // Adjust particle size based on camera distance - larger near, smaller far
        const sizeFactor = 0.5 + (800 - this.currentCameraZ) / 600 * 0.5;
        this.particles.material.size = this.config.particleSize * sizeFactor;
        
        // Slowly rotate the entire particle system
        this.particles.rotation.x += 0.0002;
        this.particles.rotation.y += 0.0003;
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Configuration update method
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update particle size
        if (newConfig.particleSize !== undefined && this.particles) {
            this.particles.material.size = newConfig.particleSize;
        }
        
        // Update smoothness and speed - these take effect automatically in the animation loop
        
        // Update particle count - requires recreating particles
        if (newConfig.particleCount !== undefined) {
            this.createParticles();
        }
    }
    
    // Destroy method
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

// Initialize the starfield background when the document has finished loading
window.addEventListener('DOMContentLoaded', () => {
    // Wait for Three.js to finish loading
    if (typeof THREE !== 'undefined') {
        // Create the starfield background instance
        window.starfieldBackground = new StarfieldBackground({
            particleCount: 30000,  // Reduce particle count to improve performance
            particleSize: 3,       // Adjust particle size
            zoomSmoothness: 10,    // Keep the default smoothness
            particleSpeed: 100      // Slightly reduce speed
        });
    } else {
        console.warn('Three.js is not loaded yet. Starfield background will initialize when Three.js is available.');
    }
});