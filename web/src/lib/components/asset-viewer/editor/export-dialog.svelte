<script lang="ts">
  import { Button, HStack } from '@immich/ui';
  import { exportDevelopedImage } from './export-pipeline';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import type { AssetResponseDto } from '@immich/sdk';
  import { getAssetUrls } from '$lib/utils';

  let {
    asset,
    onClose,
  }: {
    asset: AssetResponseDto;
    onClose: () => void;
  } = $props();

  let format = $state<'jpeg' | 'png'>('jpeg');
  let quality = $state(92);
  let resizeMode = $state<'original' | 'longEdge' | 'megapixels' | 'custom'>('original');
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

  async function doExport() {
    if (isExporting) return;
    isExporting = true;
    progress = 'Loading image...';

    try {
      const urls = getAssetUrls(asset);

      const blob = await exportDevelopedImage({
        originalUrl: urls.original,
        params: developManager.params,
        curves: developManager.curves,
        curveEndpoints: developManager.curveEndpoints,
        hsl: developManager.hsl,
        colorWheels: developManager.colorWheels,
        format,
        quality: quality / 100,
        resizeMode: resizeMode === 'custom' ? 'longEdge' : resizeMode,
        longEdge: resizeMode === 'longEdge' ? longEdge : resizeMode === 'custom' ? Math.max(customWidth, customHeight) : undefined,
        megapixels: resizeMode === 'megapixels' ? megapixels : undefined,
        onProgress: (stage: string) => {
          progress = stage;
        },
      });

      // Download the file
      const ext = format === 'jpeg' ? 'jpg' : format;
      const baseName = (asset.originalFileName || 'export').replace(/\.[^.]+$/, '');
      const fileName = `${baseName}_export.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
        </div>
      </div>

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
