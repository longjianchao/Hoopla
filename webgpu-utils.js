// WebGPU工具函数和上下文管理

// ---- WebGPUUtils: 修正 createBuffer 与 remove device.destroy() ----
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

    // 创建并初始化GPU缓冲区；data 可以是 TypedArray 或 null（创建空 buffer）
    createBuffer(data, usage, mappedAtCreation = false) {
        const byteLength = data ? data.byteLength : 4; // 最小长度
        const buf = this.device.createBuffer({
            size: byteLength,
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation
        });
        if (mappedAtCreation && data) {
            const arr = new Float32Array(buf.getMappedRange());
            arr.set(new Float32Array(data.buffer || data));
            buf.unmap();
        } else if (data) {
            // 若不映射，使用 queue.writeBuffer 更安全
            this.queue.writeBuffer(buf, 0, (data.buffer || data), (data.byteOffset || 0), data.byteLength);
        }
        return buf;
    }

    createShaderModule(code) {
        const mod = this.device.createShaderModule({ code });
        return mod;
    }

    // 注意：device.destroy() 不存在；移除该调用
    destroy() {
        // 清理时销毁 buffers/pipelines 在具体类中进行
        this.device = null;
        this.queue = null;
        this.adapter = null;
    }
}


// FFT卷积类
class WebGPUFFTConvolve {
    constructor(webgpuUtils) {
        this.webgpu = webgpuUtils;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.outputBuffer = null;
        this.width = 0;
        this.height = 0;

        // uniform buffer layout: width(u32), height(u32), kernelSize(i32), halfKernel(i32)
        this.uniformBuffer = null;
    }

    async init(width, height, kernelSize = 17) {
        this.width = width;
        this.height = height;
        this.kernelSize = kernelSize;
        this.halfKernel = Math.floor(kernelSize / 2);

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
    }

    _getComputeShaderCode() {
        // WGSL: use uniform struct for params and storage arrays for image/psf/output
        return `
const KERNEL_SIZE : i32 = 17;
const HALF_KERNEL : i32 = 8;

struct Buffer {
    data: array<f32>,
};

@group(0) @binding(0) var<storage, read> image : Buffer;
@group(0) @binding(1) var<storage, read> psf : Buffer;
@group(0) @binding(2) var<storage, read_write> output : Buffer;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let width : u32 = ${this.width}u;
    let height : u32 = ${this.height}u;

    if (gid.x >= width || gid.y >= height) {
        return;
    }

    let index = gid.y * width + gid.x;

    var sum : f32 = 0.0;

    let cx : i32 = i32(width) / 2;
    let cy : i32 = i32(height) / 2;

    for (var dy : i32 = -HALF_KERNEL; dy <= HALF_KERNEL; dy = dy + 1) {
        for (var dx : i32 = -HALF_KERNEL; dx <= HALF_KERNEL; dx = dx + 1) {

            let ix : i32 = i32(gid.x) + dx;
            let iy : i32 = i32(gid.y) + dy;

            if (ix >= 0 && ix < i32(width) &&
                iy >= 0 && iy < i32(height)) {

                let imgIndex : u32 = u32(iy) * width + u32(ix);

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

    // convolve: imageData and psfData are Float32Array with length = width*height
    async convolve(imageData, psfData) {
        const device = this.webgpu.device;

        // create or reuse buffers (image and psf are read-only storage)
        const imgBuf = this.webgpu.createBuffer(imageData, GPUBufferUsage.STORAGE);
        const psfBuf = this.webgpu.createBuffer(psfData, GPUBufferUsage.STORAGE);

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
        const mapped = new Float32Array(readBuf.getMappedRange()).slice();
        readBuf.unmap();

        // cleanup
        imgBuf.destroy();
        psfBuf.destroy();
        readBuf.destroy();

        return mapped;
    }

    destroy() {
        if (this.outputBuffer) { this.outputBuffer.destroy(); this.outputBuffer = null; }
        if (this.uniformBuffer) { this.uniformBuffer.destroy(); this.uniformBuffer = null; }
    }
}


// PSF计算类
class PSFComputer {
    constructor(webgpuUtils) {
        this.webgpu = webgpuUtils;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.outputBuffer = null;
        this.width = 0;
        this.height = 0;
    }

    // 初始化PSF计算
    async init(width, height) {
        this.width = width;
        this.height = height;

        // 创建着色器代码
        const computeShaderCode = this._getComputeShaderCode();
        const shaderModule = this.webgpu.createShaderModule(computeShaderCode);

        // 创建绑定组布局
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

        // 创建管道布局
        const pipelineLayout = this.webgpu.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // 创建计算管道
        this.pipeline = this.webgpu.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            }
        });

        // 创建输出缓冲区
        this.outputBuffer = this.webgpu.device.createBuffer({
            size: width * height * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
    }

    // 获取计算着色器代码
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

            // 简单的PSF计算示例，实际中应该使用更复杂的模型
            // 这里实现一个高斯PSF
            let centerX = f32(width) / 2.0;
            let centerY = f32(height) / 2.0;
            let x = f32(global_id.x) - centerX;
            let y = f32(global_id.y) - centerY;
            let sigma = 2.0;
            let pi = 3.14159;
            let psfValue = exp(-(x*x + y*y) / (2.0 * sigma * sigma)) / (2.0 * pi * sigma * sigma);
            
            output.data[index] = psfValue;
        }
        `;
    }

    // 计算PSF
    async computePSF() {
        // 创建输入缓冲区（这里为空，因为PSF计算通常不需要输入）
        const inputData = new Float32Array(this.width * this.height);
        const inputBuffer = this.webgpu.createBuffer(inputData, GPUBufferUsage.STORAGE);

        // 创建绑定组
        const bindGroup = this.webgpu.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: this.outputBuffer } }
            ]
        });

        // 创建命令编码器
        const encoder = this.webgpu.device.createCommandEncoder();
        
        // 开始计算通道
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        
        // 调度工作组
        const workgroupCountX = Math.ceil(this.width / 16);
        const workgroupCountY = Math.ceil(this.height / 16);
        pass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
        
        // 结束计算通道
        pass.end();

        // 创建读取缓冲区
        const readBuffer = this.webgpu.device.createBuffer({
            size: this.width * this.height * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        // 复制结果到读取缓冲区
        encoder.copyBufferToBuffer(
            this.outputBuffer,
            0,
            readBuffer,
            0,
            this.width * this.height * Float32Array.BYTES_PER_ELEMENT
        );

        // 提交命令
        this.webgpu.queue.submit([encoder.finish()]);

        // 映射读取缓冲区
        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(readBuffer.getMappedRange());
        const resultCopy = new Float32Array(result);
        readBuffer.unmap();

        // 销毁临时缓冲区
        inputBuffer.destroy();
        readBuffer.destroy();

        return resultCopy;
    }

    // 销毁资源
    destroy() {
        if (this.outputBuffer) {
            this.outputBuffer.destroy();
        }
    }
}

// 导出工具类
export { WebGPUUtils, WebGPUFFTConvolve, PSFComputer };

// 将类暴露到全局作用域，以便非module脚本访问
if (typeof window !== 'undefined') {
    window.WebGPUUtils = WebGPUUtils;
    window.WebGPUFFTConvolve = WebGPUFFTConvolve;
    window.PSFComputer = PSFComputer;
}