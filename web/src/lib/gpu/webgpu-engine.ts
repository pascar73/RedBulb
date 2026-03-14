/**
 * WebGPU Rendering Engine for RapidRAW-style photo adjustments
 * Implements real-time compute shader processing for develop adjustments
 */

export interface AdjustmentParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  brightness: number;
}

export class WebGPUEngine {
  private device: GPUDevice | null = null;
  private queue: GPUCommandQueue | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  
  private inputTexture: GPUTexture | null = null;
  private outputTexture: GPUTexture | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  
  private initialized = false;
  private currentWidth = 0;
  private currentHeight = 0;

  /**
   * Initialize WebGPU context and create compute pipeline
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    // Request adapter and device
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });
    
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice();
    this.queue = this.device.queue;

    // Load shader code
    const shaderResponse = await fetch('/shaders/shader.wgsl');
    if (!shaderResponse.ok) {
      throw new Error('Failed to load shader file');
    }
    const shaderCode = await shaderResponse.text();

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'RapidRAW Compute Shader',
      code: shaderCode
    });

    // Create bind group layout
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Adjustments Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: 'float',
            viewDimension: '2d'
          }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'rgba8unorm',
            viewDimension: '2d'
          }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'uniform',
            minBindingSize: 32 // 7 f32 + 1 pad = 8 * 4 bytes
          }
        }
      ]
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Adjustments Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // Create compute pipeline
    this.pipeline = this.device.createComputePipeline({
      label: 'RapidRAW Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      }
    });

    // Create uniform buffer (will be updated with actual values)
    this.uniformBuffer = this.device.createBuffer({
      label: 'Adjustments Uniform Buffer',
      size: 32, // 8 * f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.initialized = true;
  }

  /**
   * Create GPU texture from image source
   */
  private async createTextureFromImage(
    imageBitmap: ImageBitmap,
    width: number,
    height: number
  ): Promise<GPUTexture> {
    if (!this.device) {
      throw new Error('WebGPU not initialized');
    }

    const texture = this.device.createTexture({
      label: 'Input Texture',
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.COPY_DST | 
             GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap, flipY: false },
      { texture },
      { width, height }
    );

    return texture;
  }

  /**
   * Render image with adjustments to canvas
   */
  async render(
    imageSource: HTMLImageElement | ImageBitmap,
    params: AdjustmentParams,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    if (!this.initialized || !this.device || !this.queue || !this.pipeline || !this.uniformBuffer) {
      throw new Error('WebGPU engine not initialized');
    }

    // Get or create ImageBitmap
    let imageBitmap: ImageBitmap;
    if (imageSource instanceof ImageBitmap) {
      imageBitmap = imageSource;
    } else {
      imageBitmap = await createImageBitmap(imageSource);
    }

    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // Resize canvas if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Recreate textures if size changed
    if (this.currentWidth !== width || this.currentHeight !== height) {
      this.inputTexture?.destroy();
      this.outputTexture?.destroy();

      this.inputTexture = await this.createTextureFromImage(imageBitmap, width, height);
      
      this.outputTexture = this.device.createTexture({
        label: 'Output Texture',
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
      });

      this.currentWidth = width;
      this.currentHeight = height;
    } else if (this.inputTexture) {
      // Update input texture with new image data
      this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap, flipY: false },
        { texture: this.inputTexture },
        { width, height }
      );
    }

    if (!this.inputTexture || !this.outputTexture) {
      throw new Error('Failed to create textures');
    }

    // Update uniform buffer with adjustment parameters
    const uniformData = new Float32Array([
      params.exposure,
      params.contrast,
      params.highlights,
      params.shadows,
      params.whites,
      params.blacks,
      params.brightness,
      0.0  // padding
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'Adjustments Bind Group',
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: this.inputTexture.createView() },
        { binding: 1, resource: this.outputTexture.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } }
      ]
    });

    // Dispatch compute shader
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Render Command Encoder'
    });

    const computePass = commandEncoder.beginComputePass({
      label: 'Adjustment Compute Pass'
    });

    computePass.setPipeline(this.pipeline);
    computePass.setBindGroup(0, bindGroup);
    
    // Dispatch with workgroup size 8x8
    const workgroupsX = Math.ceil(width / 8);
    const workgroupsY = Math.ceil(height / 8);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    
    computePass.end();

    // Copy output texture to canvas
    const canvasContext = canvas.getContext('webgpu');
    if (!canvasContext) {
      throw new Error('Failed to get WebGPU canvas context');
    }

    // Configure canvas context
    canvasContext.configure({
      device: this.device,
      format: 'rgba8unorm',
      alphaMode: 'opaque'
    });

    const canvasTexture = canvasContext.getCurrentTexture();
    
    commandEncoder.copyTextureToTexture(
      { texture: this.outputTexture },
      { texture: canvasTexture },
      { width, height }
    );

    this.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    this.inputTexture?.destroy();
    this.outputTexture?.destroy();
    this.uniformBuffer?.destroy();
    this.device?.destroy();
    
    this.inputTexture = null;
    this.outputTexture = null;
    this.uniformBuffer = null;
    this.device = null;
    this.queue = null;
    this.pipeline = null;
    this.bindGroupLayout = null;
    this.initialized = false;
  }
}
