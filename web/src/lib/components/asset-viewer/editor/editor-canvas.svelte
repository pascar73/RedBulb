<script lang="ts">
  import { WebGPUEngine, type AdjustmentParams } from '$lib/gpu/webgpu-engine';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import type { AssetResponseDto } from '@immich/sdk';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    asset: AssetResponseDto;
    previewUrl: string;
  }

  let { asset, previewUrl }: Props = $props();

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let engine: WebGPUEngine | null = null;
  let imageBitmap: ImageBitmap | null = null;
  
  let webgpuSupported = $state(true);
  let engineInitialized = $state(false);
  let imageLoaded = $state(false);
  let error = $state<string | null>(null);

  // Watch for parameter changes and trigger re-render
  $effect(() => {
    const params = developManager.params;
    
    if (engineInitialized && imageLoaded && imageBitmap && canvas) {
      renderImage(params);
    }
  });

  onMount(async () => {
    try {
      // Check WebGPU support
      if (!navigator.gpu) {
        webgpuSupported = false;
        error = 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, or another WebGPU-enabled browser.';
        return;
      }

      // Initialize WebGPU engine
      engine = new WebGPUEngine();
      await engine.initialize();
      engineInitialized = true;

      // Load image
      await loadImage();

      // Initial render with defaults
      if (imageBitmap && canvas) {
        await renderImage(developManager.params);
      }
    } catch (err) {
      console.error('Failed to initialize WebGPU editor:', err);
      error = err instanceof Error ? err.message : 'Failed to initialize WebGPU';
      webgpuSupported = false;
    }
  });

  onDestroy(() => {
    engine?.destroy();
    imageBitmap?.close();
  });

  async function loadImage() {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        try {
          imageBitmap = await createImageBitmap(img);
          imageLoaded = true;
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = previewUrl;
    });
  }

  async function renderImage(params: AdjustmentParams) {
    if (!engine || !imageBitmap || !canvas) {
      return;
    }

    try {
      await engine.render(imageBitmap, params, canvas);
    } catch (err) {
      console.error('Render error:', err);
      error = err instanceof Error ? err.message : 'Render failed';
    }
  }
</script>

{#if !webgpuSupported}
  <div class="flex items-center justify-center h-full p-8">
    <div class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-6 py-4 rounded-lg max-w-2xl">
      <p class="font-bold mb-2">WebGPU Not Supported</p>
      <p class="text-sm">{error}</p>
      <p class="text-sm mt-2">
        The Develop tool requires WebGPU for real-time image processing. 
        Please update your browser or use a WebGPU-compatible browser.
      </p>
    </div>
  </div>
{:else if !engineInitialized || !imageLoaded}
  <div class="flex items-center justify-center h-full">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-immich-primary dark:border-immich-dark-primary"></div>
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Initializing WebGPU renderer...</p>
    </div>
  </div>
{:else if error}
  <div class="flex items-center justify-center h-full p-8">
    <div class="bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-700 text-yellow-700 dark:text-yellow-200 px-6 py-4 rounded-lg max-w-2xl">
      <p class="font-bold mb-2">Rendering Error</p>
      <p class="text-sm">{error}</p>
    </div>
  </div>
{:else}
  <div class="flex items-center justify-center h-full w-full overflow-hidden">
    <canvas
      bind:this={canvas}
      class="max-w-full max-h-full object-contain"
    ></canvas>
  </div>
{/if}

<style>
  canvas {
    display: block;
    image-rendering: auto;
  }
</style>
