// WebGPU utility functions and context management.

// ---- WebGPUUtils: fix createBuffer and remove device.destroy() ----
class WebGPUUtils {
    constructor() {
        this.device = null;
        this.queue = null;
        this.adapter = null;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._initializeWebGPU();
        return this.initPromise;
    }

    async _initializeWebGPU() {
        if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser.');
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) throw new Error('Failed to get WebGPU adapter.');
        this.device = await this.adapter.requestDevice();
        this.queue = this.device.queue;
        console.log('WebGPU device initialized.', this.adapter.name ?? '');
        return this;
    }

    // Create and initialize a GPU buffer; data may be a TypedArray, a plain array, or null (creating an empty buffer).
    createBuffer(data, usage, mappedAtCreation = false) {
        let typedData;
        // Ensure data is a TypedArray so that a valid byteLength can be obtained.
        if (Array.isArray(data)) {
            // Convert a plain array to a Float32Array.
            typedData = new Float32Array(data);
        } else if (data && typeof data === 'object' && 'byteLength' in data && typeof data.byteLength === 'number') {
            // TypedArray or ArrayBuffer; ensure byteLength is a number.
            typedData = data;
        } else if (data) {
            // Try to convert other types to a Float32Array.
            typedData = new Float32Array(data);
        } else {
            // Empty buffer.
            typedData = null;
        }
        
        // Ensure byteLength is a valid number of at least 4 bytes.
        const byteLength = typedData && typeof typedData.byteLength === 'number' ? typedData.byteLength : 4;
        
        // Ensure size is a valid positive number.
        const safeSize = Math.max(byteLength, 4);
        
        const buf = this.device.createBuffer({
            size: safeSize,
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation
        });
        
        if (typedData) {
            if (mappedAtCreation) {
                const arr = new Float32Array(buf.getMappedRange());
                arr.set(new Float32Array(typedData.buffer || typedData));
                buf.unmap();
            } else {
                // If not mapped at creation, queue.writeBuffer is safer.
                this.queue.writeBuffer(buf, 0, (typedData.buffer || typedData), (typedData.byteOffset || 0), typedData.byteLength);
            }
        }
        return buf;
    }

    createShaderModule(code) {
        const mod = this.device.createShaderModule({ code });
        return mod;
    }

    // Note: device.destroy() does not exist; that call has been removed.
    destroy() {
        // Destroy buffers/pipelines during cleanup in the specific classes.
        this.device = null;
        this.queue = null;
        this.adapter = null;
    }
}


// WebGPU convolution class - implemented using spatial-domain convolution.
class WebGPUFFTConvolve {
    constructor(webgpuUtils) {
        if (!webgpuUtils) {
            throw new Error('webgpuUtils is required');
        }
        this.webgpu = webgpuUtils;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.outputBuffer = null;
        this.width = 0;
        this.height = 0;
        this.kernelSize = null;
        this.halfKernel = null;

        // uniform buffer layout: width(u32), height(u32), kernelSize(i32), halfKernel(i32)
        this.uniformBuffer = null;
    }

    async init(width, height, kernelSize = 17) {
        // Validate the parameters.
        if (typeof width !== 'number' || width <= 0 || !Number.isInteger(width)) {
            throw new Error('width must be a positive integer');
        }
        if (typeof height !== 'number' || height <= 0 || !Number.isInteger(height)) {
            throw new Error('height must be a positive integer');
        }
        if (typeof kernelSize !== 'number' || kernelSize <= 0 || !Number.isInteger(kernelSize)) {
            throw new Error('kernelSize must be a positive integer');
        }
        // Ensure kernelSize is odd.
        if (kernelSize % 2 === 0) {
            kernelSize += 1; // Convert to an odd number.
            console.warn(`kernelSize must be odd, using ${kernelSize} instead`);
        }

        this.width = width;
        this.height = height;
        this.kernelSize = kernelSize;
        this.halfKernel = Math.floor(kernelSize / 2);

        try {
            const shaderModule = this.webgpu.createShaderModule(this._getComputeShaderCode());

            // bind layout: 0 image, 1 psf, 2 output, 3 uniforms
            this.bindGroupLayout = this.webgpu.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
                ]
            });

            const pipelineLayout = this.webgpu.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

            this.pipeline = this.webgpu.device.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'main' }
            });

            // output buffer (reuse if exists)
            const outputSize = width * height * Float32Array.BYTES_PER_ELEMENT;
            if (!this.outputBuffer || this.outputBuffer.size !== outputSize) {
                if (this.outputBuffer) this.outputBuffer.destroy();
                this.outputBuffer = this.webgpu.device.createBuffer({
                    size: outputSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                });
            }

            // uniform buffer (u32,u32,i32,i32) => 16 bytes (align 4)
            const u8 = new Uint32Array([this.width, this.height, this.kernelSize, this.halfKernel]);
            if (this.uniformBuffer) this.uniformBuffer.destroy();
            this.uniformBuffer = this.webgpu.device.createBuffer({
                size: u8.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            // initialize uniform buffer
            new Uint32Array(this.uniformBuffer.getMappedRange()).set(u8);
            this.uniformBuffer.unmap();

            return this;
        } catch (error) {
            console.error('Failed to initialize WebGPUFFTConvolve:', error);
            // Clean up any resources that may already have been created.
            this.destroy();
            throw error;
        }
    }

    _getComputeShaderCode() {
        return `
struct Uniforms {
    width: u32,
    height: u32,
    kernelSize: i32,
    halfKernel: i32,
};

struct Buffer {
    data: array<f32>,
};

@group(0) @binding(0) var<storage, read> image : Buffer;
@group(0) @binding(1) var<storage, read> psf : Buffer;
@group(0) @binding(2) var<storage, read_write> output : Buffer;
@group(0) @binding(3) var<uniform> uniforms : Uniforms;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let width : u32 = uniforms.width;
    let height : u32 = uniforms.height;
    let halfKernel : i32 = uniforms.halfKernel;

    if (gid.x >= width || gid.y >= height) {
        return;
    }

    let index = gid.y * width + gid.x;

    var sum : f32 = 0.0;

    // Image center position.
    let cx : i32 = i32(width) / 2;
    let cy : i32 = i32(height) / 2;

    // Convolution: iterate over the PSF kernel.
    for (var dy : i32 = -halfKernel; dy <= halfKernel; dy = dy + 1) {
        for (var dx : i32 = -halfKernel; dx <= halfKernel; dx = dx + 1) {

            // Coordinate in the image.
            let ix : i32 = i32(gid.x) + dx;
            let iy : i32 = i32(gid.y) + dy;

            if (ix >= 0 && ix < i32(width) &&
                iy >= 0 && iy < i32(height)) {

                let imgIndex : u32 = u32(iy) * width + u32(ix);

                // Corresponding coordinate in the PSF (center-aligned).
                let px : i32 = cx + dx;
                let py : i32 = cy + dy;

                if (px >= 0 && px < i32(width) &&
                    py >= 0 && py < i32(height)) {

                    let psfIndex : u32 = u32(py) * width + u32(px);
                    sum = sum + image.data[imgIndex] * psf.data[psfIndex];
                }
            }
        }
    }

    output.data[index] = sum;
}

        `;
    }

    // convolve: imageData and psfData are Float64Array with length = width*height
    async convolve(imageData, psfData) {
        // Validate the parameters.
        if (!imageData || !(imageData instanceof Float64Array)) {
            throw new Error('imageData must be a Float64Array');
        }
        if (!psfData || !(psfData instanceof Float64Array)) {
            throw new Error('psfData must be a Float64Array');
        }
        if (imageData.length !== this.width * this.height) {
            throw new Error(`imageData length ${imageData.length} does not match expected ${this.width * this.height}`);
        }
        if (psfData.length !== this.width * this.height) {
            throw new Error(`psfData length ${psfData.length} does not match expected ${this.width * this.height}`);
        }
        
        // Check that the required resources are initialized.
        if (!this.webgpu || !this.webgpu.device) {
            throw new Error('webgpu device not initialized');
        }
        if (!this.pipeline) {
            throw new Error('pipeline not initialized, call init() first');
        }
        if (!this.bindGroupLayout) {
            throw new Error('bindGroupLayout not initialized, call init() first');
        }
        if (!this.outputBuffer) {
            throw new Error('outputBuffer not initialized, call init() first');
        }
        if (!this.uniformBuffer) {
            throw new Error('uniformBuffer not initialized, call init() first');
        }

        try {
            const device = this.webgpu.device;
            
            // Convert the Float64Array to a Float32Array for WebGPU computation.
            const imageData32 = new Float32Array(imageData);
            const psfData32 = new Float32Array(psfData);

            // create or reuse buffers (image and psf are read-only storage)
            const imgBuf = this.webgpu.createBuffer(imageData32, GPUBufferUsage.STORAGE);
            const psfBuf = this.webgpu.createBuffer(psfData32, GPUBufferUsage.STORAGE);

            const bindGroup = device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: imgBuf } },
                    { binding: 1, resource: { buffer: psfBuf } },
                    { binding: 2, resource: { buffer: this.outputBuffer } },
                    { binding: 3, resource: { buffer: this.uniformBuffer } }
                ]
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, bindGroup);

            const wgX = Math.ceil(this.width / 16);
            const wgY = Math.ceil(this.height / 16);
            pass.dispatchWorkgroups(wgX, wgY);
            pass.end();

            // copy results to read buffer
            const readBuf = device.createBuffer({
                size: this.width * this.height * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            encoder.copyBufferToBuffer(this.outputBuffer, 0, readBuf, 0, this.width * this.height * Float32Array.BYTES_PER_ELEMENT);

            device.queue.submit([encoder.finish()]);

            // await and read
            await readBuf.mapAsync(GPUMapMode.READ);
            const mapped32 = new Float32Array(readBuf.getMappedRange());
            // Convert the result back to a Float64Array.
            const mapped64 = new Float64Array(mapped32);
            readBuf.unmap();

            // cleanup
            imgBuf.destroy();
            psfBuf.destroy();
            readBuf.destroy();

            return mapped64;
        } catch (error) {
            console.error('WebGPU convolution failed:', error);
            throw error;
        }
    }

    destroy() {
        // Destroy all resources to avoid memory leaks.
        if (this.outputBuffer) {
            this.outputBuffer.destroy();
            this.outputBuffer = null;
        }
        if (this.uniformBuffer) {
            this.uniformBuffer.destroy();
            this.uniformBuffer = null;
        }
        // Note: pipeline and bindGroupLayout are destroyed automatically when the device is destroyed.
        // For code completeness, destruction logic could be added here.
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.width = 0;
        this.height = 0;
        this.kernelSize = null;
        this.halfKernel = null;
    }
}


// PSF computation class.
class PSFComputer {
    constructor(webgpuUtils) {
        this.webgpu = webgpuUtils;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.outputBuffer = null;
        this.width = 0;
        this.height = 0;
    }

    // Initialize PSF computation.
    async init(width, height) {
        this.width = width;
        this.height = height;

        // Create the shader code.
        const computeShaderCode = this._getComputeShaderCode();
        const shaderModule = this.webgpu.createShaderModule(computeShaderCode);

        // Create the bind group layout.
        this.bindGroupLayout = this.webgpu.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: 'read-only-storage'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: 'storage'
                    }
                }
            ]
        });

        // Create the pipeline layout.
        const pipelineLayout = this.webgpu.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // Create the compute pipeline.
        this.pipeline = this.webgpu.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            }
        });

        // Create the output buffer.
        this.outputBuffer = this.webgpu.device.createBuffer({
            size: width * height * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
    }

    // Get the compute shader code.
    _getComputeShaderCode() {
        return `
        struct Buffer {
            data: array<f32>,
        };

        @group(0) @binding(0) var<storage, read> input: Buffer;
        @group(0) @binding(1) var<storage, read_write> output: Buffer;

        @compute @workgroup_size(16, 16)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let width : u32 = ${this.width}u;
            let height : u32 = ${this.height}u;
            let index = global_id.y * width + global_id.x;
            
            if (global_id.x >= width || global_id.y >= height) {
                return;
            }

            // Simple PSF computation example; in practice a more complex model should be used.
            // A Gaussian PSF is implemented here.
            let centerX = f32(width) / 2.0;
            let centerY = f32(height) / 2.0;
            let x = f32(global_id.x) - centerX;
            let y = f32(global_id.y) - centerY;
            let sigma = 1.0;
            let pi = 3.14159;
            let psfValue = exp(-(x*x + y*y) / (2.0 * sigma * sigma)) / (2.0 * pi * sigma * sigma);
            
            output.data[index] = psfValue;
        }
        `;
    }

    // Compute the PSF.
    async computePSF() {
        // Create the input buffer (empty here, since PSF computation usually needs no input).
        const inputData = new Float32Array(this.width * this.height);
        const inputBuffer = this.webgpu.createBuffer(inputData, GPUBufferUsage.STORAGE);

        // Create the bind group.
        const bindGroup = this.webgpu.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: this.outputBuffer } }
            ]
        });

        // Create the command encoder.
        const encoder = this.webgpu.device.createCommandEncoder();
        
        // Begin the compute pass.
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        
        // Dispatch workgroups.
        const workgroupCountX = Math.ceil(this.width / 16);
        const workgroupCountY = Math.ceil(this.height / 16);
        pass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
        
        // End the compute pass.
        pass.end();

        // Create the read buffer.
        const readBuffer = this.webgpu.device.createBuffer({
            size: this.width * this.height * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        // Copy the result to the read buffer.
        encoder.copyBufferToBuffer(
            this.outputBuffer,
            0,
            readBuffer,
            0,
            this.width * this.height * Float32Array.BYTES_PER_ELEMENT
        );

        // Submit the command.
        this.webgpu.queue.submit([encoder.finish()]);

        // Map the read buffer.
        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(readBuffer.getMappedRange());
        const resultCopy = new Float32Array(result);
        readBuffer.unmap();

        // Destroy temporary buffers.
        inputBuffer.destroy();
        readBuffer.destroy();

        return resultCopy;
    }

    // Destroy resources.
    destroy() {
        if (this.outputBuffer) {
            this.outputBuffer.destroy();
        }
    }
}

// Export the utility classes.
export { WebGPUUtils, WebGPUFFTConvolve, PSFComputer };

// Expose the classes to the global scope so that non-module scripts can access them.
if (typeof window !== 'undefined') {
    window.WebGPUUtils = WebGPUUtils;
    window.WebGPUFFTConvolve = WebGPUFFTConvolve;
    window.PSFComputer = PSFComputer;
}