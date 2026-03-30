<script lang="ts">
  import { Button, HStack } from '@immich/ui';
  import { exportDevelopedImage } from './export-pipeline';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { Tungsten, printSize, type BitDepth, type ColorSpace, type Compression as TiffCompression } from './tungsten-tiff';
  import type { AssetResponseDto } from '@immich/sdk';
  import { getAssetUrls } from '$lib/utils';

  let {
    asset,
    onClose,
  }: {
    asset: AssetResponseDto;
    onClose: () => void;
  } = $props();

  let format = $state<'jpeg' | 'png' | 'tiff'>('jpeg');
  let quality = $state(92);
  let resizeMode = $state<'original' | 'longEdge' | 'megapixels' | 'custom'>('original');

  // TIFF options
  let tiffBitDepth = $state<BitDepth>(16);
  let tiffColorSpace = $state<ColorSpace>('srgb');
  let tiffCompression = $state<TiffCompression>('lzw');
  let tiffDpi = $state(300);
  let tiffEmbedICC = $state(true);
  let longEdge = $state(2048);
  let megapixels = $state(2);
  // Aspect ratio from original image
  const origW = asset.exifInfo?.exifImageWidth ?? 1920;
  const origH = asset.exifInfo?.exifImageHeight ?? 1080;
  const aspectRatio = origW / origH;

  let customWidth = $state(origW);
  let customHeight = $state(origH);

  function onWidthChange(e: Event) {
    const w = parseInt((e.target as HTMLInputElement).value) || 100;
    customWidth = w;
    customHeight = Math.round(w / aspectRatio);
  }
  function onHeightChange(e: Event) {
    const h = parseInt((e.target as HTMLInputElement).value) || 100;
    customHeight = h;
    customWidth = Math.round(h * aspectRatio);
  }
  let isExporting = $state(false);
  let progress = $state('');

  const LONG_EDGE_PRESETS = [1024, 1920, 2048, 3840, 4096];
  const MP_PRESETS = [1, 2, 4, 8, 12, 16];
  const DPI_PRESETS = [72, 150, 300, 600];

  // Live print size calculator
  const exportWidth = $derived.by(() => {
    if (resizeMode === 'longEdge') return Math.max(origW, origH) === origW ? longEdge : Math.round(longEdge * aspectRatio);
    if (resizeMode === 'megapixels') {
      const targetPx = megapixels * 1_000_000;
      const scale = Math.sqrt(targetPx / (origW * origH));
      return Math.round(origW * scale);
    }
    if (resizeMode === 'custom') return customWidth;
    return origW;
  });
  const exportHeight = $derived.by(() => {
    if (resizeMode === 'longEdge') return Math.max(origW, origH) === origH ? longEdge : Math.round(longEdge / aspectRatio);
    if (resizeMode === 'megapixels') {
      const targetPx = megapixels * 1_000_000;
      const scale = Math.sqrt(targetPx / (origW * origH));
      return Math.round(origH * scale);
    }
    if (resizeMode === 'custom') return customHeight;
    return origH;
  });
  const printInfo = $derived(format === 'tiff' ? printSize(exportWidth, exportHeight, tiffDpi) : null);

  async function doExport() {
    if (isExporting) return;
    isExporting = true;
    progress = 'Loading image...';

    try {
      const urls = getAssetUrls(asset);
      console.log('[Export] Starting export:', { format, resizeMode, urls });

      // For TIFF, we need raw RGBA pixels from the pipeline, then encode with Tungsten
      const isTiff = format === 'tiff';

      const blob = await exportDevelopedImage({
        originalUrl: urls.original,
        params: developManager.params,
        curves: developManager.curves,
        curveEndpoints: developManager.curveEndpoints,
        hsl: developManager.hsl,
        colorWheels: developManager.colorWheels,
        format: isTiff ? 'png' : format,
        quality: quality / 100,
        resizeMode: resizeMode === 'custom' ? 'longEdge' : resizeMode,
        longEdge: resizeMode === 'longEdge' ? longEdge : resizeMode === 'custom' ? Math.max(customWidth, customHeight) : undefined,
        megapixels: resizeMode === 'megapixels' ? megapixels : undefined,
        returnPixels: isTiff,
        onProgress: (stage: string) => {
          progress = stage;
        },
      });

      console.log('[Export] Pipeline returned:', { 
        isTiff, 
        hasPixels: !!(blob as any).__tungstenPixels,
        blobSize: blob.size 
      });

      let finalBlob: Blob;

      if (isTiff && (blob as any).__tungstenPixels) {
        progress = 'Encoding TIFF...';
        const { pixels, width, height } = (blob as any).__tungstenPixels;
        const result = Tungsten.encode({
          width,
          height,
          pixels,
          bitDepth: tiffBitDepth,
          colorSpace: tiffColorSpace,
          compression: tiffCompression,
          dpi: tiffDpi,
          embedICC: tiffEmbedICC,
          software: 'RedBulb / Tungsten Engine',
        });
        finalBlob = result.blob;
        progress = `TIFF: ${(result.fileSize / 1024 / 1024).toFixed(1)} MB — ${result.meta.printWidth} × ${result.meta.printHeight} @ ${tiffDpi} DPI`;
        await new Promise(r => setTimeout(r, 1200)); // let user see the info
      } else {
        finalBlob = blob as Blob;
      }

      // Download the file
      const ext = format === 'jpeg' ? 'jpg' : format === 'tiff' ? 'tif' : format;
      const baseName = (asset.originalFileName || 'export').replace(/\.[^.]+$/, '');
      const fileName = `${baseName}_export.${ext}`;

      // Sanity check: empty blob means something failed upstream
      if (finalBlob.size === 0) {
        throw new Error('Export produced empty file (0 bytes)');
      }

      console.log(`[Export] Downloading ${fileName} (${(finalBlob.size / 1024 / 1024).toFixed(2)} MB)`);

      // Safe download helper (handles Safari/WebKit immediate revoke bug)
      const objectUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);

      // Click in next frame (more reliable across browsers)
      requestAnimationFrame(() => {
        try {
          a.click();
        } catch (clickError) {
          // Fallback: open in new tab (some browsers block anchor downloads from async contexts)
          console.warn('[Export] Anchor download blocked, trying window.open:', clickError);
          window.open(objectUrl, '_blank');
        } finally {
          a.remove();
          // IMPORTANT: Delayed revoke (4s) — immediate revoke cancels download in Safari/WebKit
          setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
        }
      });

      progress = 'Done!';
      setTimeout(() => onClose(), 800);
    } catch (error) {
      console.error('Export failed:', error);
      progress = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
    } finally {
      isExporting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onclick={onClose}>
  <div
    class="bg-immich-dark-gray rounded-2xl shadow-2xl w-[380px] max-h-[90vh] overflow-y-auto text-white"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="px-5 py-4 border-b border-white/10">
      <h2 class="text-lg font-semibold">Export Image</h2>
      <p class="text-xs text-gray-400 mt-1">Apply edits and download a copy</p>
    </div>

    <!-- Body -->
    <div class="px-5 py-4 space-y-5">
      <!-- Format -->
      <div>
        <label class="text-xs font-medium text-gray-300 uppercase tracking-wide">Format</label>
        <div class="flex gap-2 mt-2">
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
              {format === 'jpeg' ? 'bg-immich-primary text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
            onclick={() => (format = 'jpeg')}
          >JPEG</button>
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
              {format === 'png' ? 'bg-immich-primary text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
            onclick={() => (format = 'png')}
          >PNG</button>
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors
              {format === 'tiff' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
            onclick={() => (format = 'tiff')}
          >TIFF</button>
        </div>
      </div>

      <!-- TIFF Settings -->
      {#if format === 'tiff'}
        <div class="space-y-3 p-3 rounded-lg bg-white/5 border border-amber-600/30">
          <div class="flex items-center gap-1.5">
            <span class="text-amber-500 text-xs font-semibold">⚡ Tungsten Engine</span>
            <span class="text-[10px] text-gray-500">Professional TIFF Export</span>
          </div>

          <!-- Bit Depth -->
          <div>
            <label class="text-xs text-gray-400">Bit Depth</label>
            <div class="flex gap-2 mt-1">
              <button
                class="flex-1 py-1.5 rounded text-xs font-medium transition-colors
                  {tiffBitDepth === 8 ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffBitDepth = 8)}
              >8-bit</button>
              <button
                class="flex-1 py-1.5 rounded text-xs font-medium transition-colors
                  {tiffBitDepth === 16 ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffBitDepth = 16)}
              >16-bit</button>
            </div>
          </div>

          <!-- Color Space -->
          <div>
            <label class="text-xs text-gray-400">Color Space</label>
            <div class="flex gap-2 mt-1">
              <button
                class="flex-1 py-1.5 rounded text-[11px] font-medium transition-colors
                  {tiffColorSpace === 'srgb' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffColorSpace = 'srgb')}
              >sRGB</button>
              <button
                class="flex-1 py-1.5 rounded text-[11px] font-medium transition-colors
                  {tiffColorSpace === 'adobe-rgb' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffColorSpace = 'adobe-rgb')}
              >Adobe RGB</button>
              <button
                class="flex-1 py-1.5 rounded text-[11px] font-medium transition-colors
                  {tiffColorSpace === 'prophoto-rgb' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffColorSpace = 'prophoto-rgb')}
              >ProPhoto</button>
            </div>
          </div>

          <!-- Compression -->
          <div>
            <label class="text-xs text-gray-400">Compression</label>
            <div class="flex gap-2 mt-1">
              <button
                class="flex-1 py-1.5 rounded text-xs font-medium transition-colors
                  {tiffCompression === 'none' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffCompression = 'none')}
              >None</button>
              <button
                class="flex-1 py-1.5 rounded text-xs font-medium transition-colors
                  {tiffCompression === 'lzw' ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                onclick={() => (tiffCompression = 'lzw')}
              >LZW</button>
            </div>
          </div>

          <!-- DPI -->
          <div>
            <label class="text-xs text-gray-400">Resolution (DPI)</label>
            <div class="flex gap-1.5 mt-1">
              {#each DPI_PRESETS as d}
                <button
                  class="flex-1 py-1.5 rounded text-xs font-medium transition-colors
                    {tiffDpi === d ? 'bg-amber-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                  onclick={() => (tiffDpi = d)}
                >{d}</button>
              {/each}
            </div>
          </div>

          <!-- ICC Profile toggle -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={tiffEmbedICC} class="accent-amber-500" />
            <span class="text-xs text-gray-300">Embed ICC Profile</span>
          </label>

          <!-- Print size calculator -->
          {#if printInfo}
            <div class="mt-2 p-2 rounded bg-black/30 border border-white/10">
              <div class="text-[10px] text-gray-500 uppercase tracking-wide">Print Size @ {tiffDpi} DPI</div>
              <div class="text-sm text-white mt-0.5 font-medium">📐 {printInfo.label}</div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Quality (JPEG only) -->
      {#if format === 'jpeg'}
        <div>
          <div class="flex justify-between items-center">
            <label class="text-xs font-medium text-gray-300 uppercase tracking-wide">Quality</label>
            <span class="text-xs text-gray-400">{quality}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="100"
            step="1"
            bind:value={quality}
            class="w-full mt-2 accent-immich-primary"
          />
          <div class="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>Smaller file</span>
            <span>Best quality</span>
          </div>
        </div>
      {/if}

      <!-- Resize -->
      <div>
        <label class="text-xs font-medium text-gray-300 uppercase tracking-wide">Resize</label>
        <div class="space-y-2 mt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={resizeMode} value="original" class="accent-immich-primary" />
            <span class="text-sm">Original size</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={resizeMode} value="longEdge" class="accent-immich-primary" />
            <span class="text-sm">Long edge</span>
          </label>
          {#if resizeMode === 'longEdge'}
            <div class="ml-6 flex flex-wrap gap-1.5">
              {#each LONG_EDGE_PRESETS as px}
                <button
                  class="px-2.5 py-1 rounded text-xs transition-colors
                    {longEdge === px ? 'bg-immich-primary text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                  onclick={() => (longEdge = px)}
                >{px}px</button>
              {/each}
            </div>
          {/if}
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={resizeMode} value="megapixels" class="accent-immich-primary" />
            <span class="text-sm">Megapixels</span>
          </label>
          {#if resizeMode === 'megapixels'}
            <div class="ml-6 flex flex-wrap gap-1.5">
              {#each MP_PRESETS as mp}
                <button
                  class="px-2.5 py-1 rounded text-xs transition-colors
                    {megapixels === mp ? 'bg-immich-primary text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}"
                  onclick={() => (megapixels = mp)}
                >{mp}MP</button>
              {/each}
            </div>
          {/if}
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={resizeMode} value="custom" class="accent-immich-primary" />
            <span class="text-sm">Custom</span>
          </label>
          {#if resizeMode === 'custom'}
            <div class="ml-6 flex items-center gap-2">
              <input
                type="number"
                value={customWidth}
                onchange={onWidthChange}
                min="100"
                max="20000"
                class="w-20 px-2 py-1 rounded bg-white/10 text-sm text-white border border-white/20 focus:border-immich-primary focus:outline-none"
              />
              <span class="text-xs text-gray-400">×</span>
              <input
                type="number"
                value={customHeight}
                onchange={onHeightChange}
                min="100"
                max="20000"
                class="w-20 px-2 py-1 rounded bg-white/10 text-sm text-white border border-white/20 focus:border-immich-primary focus:outline-none"
              />
              <span class="text-xs text-gray-400">px</span>
              <span class="text-xs text-gray-500">🔒 {origW}×{origH}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-white/10 flex justify-between items-center">
      {#if isExporting}
        <span class="text-xs text-gray-400">{progress}</span>
      {:else}
        <span></span>
      {/if}
      <HStack gap={2}>
        <Button shape="round" size="small" variant="outline" onclick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button shape="round" size="small" onclick={doExport} loading={isExporting}>
          Export
        </Button>
      </HStack>
    </div>
  </div>
</div>
