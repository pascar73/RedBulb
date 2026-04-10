/**
 * WebGPU type declarations
 * Provides type support for WebGPU API when @webgpu/types is not available
 */

interface Navigator {
  readonly gpu?: GPU;
}

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}

interface GPUAdapter {
  readonly features: GPUSupportedFeatures;
  readonly limits: GPUSupportedLimits;
  readonly isFallbackAdapter: boolean;
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: Iterable<GPUFeatureName>;
  requiredLimits?: Record<string, number>;
}

interface GPUDevice {
  readonly features: GPUSupportedFeatures;
  readonly limits: GPUSupportedLimits;
  readonly queue: GPUQueue;
  destroy(): void;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
}

interface GPUQueue {
  submit(commandBuffers: Iterable<GPUCommandBuffer>): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource, dataOffset?: number, size?: number): void;
  copyExternalImageToTexture(
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTexture,
    copySize: GPUExtent3D
  ): void;
}

type GPUCommandQueue = GPUQueue;

interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
}

interface GPUShaderModule {}

interface GPUBindGroupLayoutDescriptor {
  label?: string;
  entries: Iterable<GPUBindGroupLayoutEntry>;
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: GPUShaderStageFlags;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
}

interface GPUBufferBindingLayout {
  type?: 'uniform' | 'storage' | 'read-only-storage';
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

interface GPUSamplerBindingLayout {
  type?: 'filtering' | 'non-filtering' | 'comparison';
}

interface GPUTextureBindingLayout {
  sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

interface GPUStorageTextureBindingLayout {
  access: 'write-only' | 'read-only' | 'read-write';
  format: GPUTextureFormat;
  viewDimension?: GPUTextureViewDimension;
}

interface GPUBindGroupLayout {}

interface GPUPipelineLayoutDescriptor {
  label?: string;
  bindGroupLayouts: Iterable<GPUBindGroupLayout>;
}

interface GPUPipelineLayout {}

interface GPUComputePipelineDescriptor {
  label?: string;
  layout: GPUPipelineLayout | 'auto';
  compute: GPUProgrammableStage;
}

interface GPUProgrammableStage {
  module: GPUShaderModule;
  entryPoint: string;
  constants?: Record<string, number>;
}

interface GPUComputePipeline {}

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: GPUBufferUsageFlags;
  mappedAtCreation?: boolean;
}

interface GPUBuffer {
  destroy(): void;
}

interface GPUTextureDescriptor {
  label?: string;
  size: GPUExtent3D;
  mipLevelCount?: number;
  sampleCount?: number;
  dimension?: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  viewFormats?: Iterable<GPUTextureFormat>;
}

interface GPUTexture {
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUTextureViewDescriptor {
  label?: string;
  format?: GPUTextureFormat;
  dimension?: GPUTextureViewDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
}

interface GPUTextureView {}

interface GPUBindGroupDescriptor {
  label?: string;
  layout: GPUBindGroupLayout;
  entries: Iterable<GPUBindGroupEntry>;
}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBindingResource;
}

type GPUBindingResource =
  | GPUSampler
  | GPUTextureView
  | GPUBufferBinding
  | GPUExternalTexture;

interface GPUBufferBinding {
  buffer: GPUBuffer;
  offset?: number;
  size?: number;
}

interface GPUBindGroup {}

interface GPUCommandEncoderDescriptor {
  label?: string;
}

interface GPUCommandEncoder {
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
  copyTextureToTexture(source: GPUImageCopyTexture, destination: GPUImageCopyTexture, copySize: GPUExtent3D): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
}

interface GPUComputePassDescriptor {
  label?: string;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: Iterable<number>): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  end(): void;
}

interface GPUCommandBufferDescriptor {
  label?: string;
}

interface GPUCommandBuffer {}

interface GPUImageCopyTexture {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
}

interface GPUImageCopyExternalImage {
  source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  origin?: GPUOrigin2D;
  flipY?: boolean;
}

interface GPUExtent3D {
  width: number;
  height?: number;
  depthOrArrayLayers?: number;
}

type GPUOrigin3D =
  | Iterable<number>
  | { x?: number; y?: number; z?: number };

type GPUOrigin2D =
  | Iterable<number>
  | { x?: number; y?: number };

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  usage?: GPUTextureUsageFlags;
  viewFormats?: Iterable<GPUTextureFormat>;
  colorSpace?: 'srgb' | 'display-p3';
  alphaMode?: 'opaque' | 'premultiplied';
}

// Flags and enums
type GPUShaderStageFlags = number;
type GPUBufferUsageFlags = number;
type GPUTextureUsageFlags = number;

declare const GPUShaderStage: {
  readonly VERTEX: 0x1;
  readonly FRAGMENT: 0x2;
  readonly COMPUTE: 0x4;
};

declare const GPUBufferUsage: {
  readonly MAP_READ: 0x0001;
  readonly MAP_WRITE: 0x0002;
  readonly COPY_SRC: 0x0004;
  readonly COPY_DST: 0x0008;
  readonly INDEX: 0x0010;
  readonly VERTEX: 0x0020;
  readonly UNIFORM: 0x0040;
  readonly STORAGE: 0x0080;
  readonly INDIRECT: 0x0100;
  readonly QUERY_RESOLVE: 0x0200;
};

declare const GPUTextureUsage: {
  readonly COPY_SRC: 0x01;
  readonly COPY_DST: 0x02;
  readonly TEXTURE_BINDING: 0x04;
  readonly STORAGE_BINDING: 0x08;
  readonly RENDER_ATTACHMENT: 0x10;
};

type GPUTextureFormat = string;
type GPUTextureDimension = '1d' | '2d' | '3d';
type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';
type GPUFeatureName = string;

interface GPUSupportedFeatures extends ReadonlySet<GPUFeatureName> {}

interface GPUSupportedLimits {
  readonly maxTextureDimension1D: number;
  readonly maxTextureDimension2D: number;
  readonly maxTextureDimension3D: number;
  readonly maxTextureArrayLayers: number;
  readonly maxBindGroups: number;
  readonly maxDynamicUniformBuffersPerPipelineLayout: number;
  readonly maxDynamicStorageBuffersPerPipelineLayout: number;
  readonly maxSampledTexturesPerShaderStage: number;
  readonly maxSamplersPerShaderStage: number;
  readonly maxStorageBuffersPerShaderStage: number;
  readonly maxStorageTexturesPerShaderStage: number;
  readonly maxUniformBuffersPerShaderStage: number;
  readonly maxUniformBufferBindingSize: number;
  readonly maxStorageBufferBindingSize: number;
  readonly minUniformBufferOffsetAlignment: number;
  readonly minStorageBufferOffsetAlignment: number;
  readonly maxVertexBuffers: number;
  readonly maxVertexAttributes: number;
  readonly maxVertexBufferArrayStride: number;
  readonly maxInterStageShaderComponents: number;
  readonly maxComputeWorkgroupStorageSize: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxComputeWorkgroupSizeY: number;
  readonly maxComputeWorkgroupSizeZ: number;
  readonly maxComputeWorkgroupsPerDimension: number;
}

interface GPUSampler {}
interface GPUExternalTexture {}

// Canvas context extension
interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
  getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null;
  getContext(contextId: 'webgl', options?: WebGLContextAttributes): WebGLRenderingContext | null;
  getContext(contextId: 'webgl2', options?: WebGLContextAttributes): WebGL2RenderingContext | null;
  getContext(contextId: string, options?: any): RenderingContext | null;
}
