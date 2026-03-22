<script lang="ts">
  import { shortcuts } from '$lib/actions/shortcut';
  import { thumbhash } from '$lib/actions/thumbhash';
  import { zoomImageAction } from '$lib/actions/zoom-image';
  import AdaptiveImage from '$lib/components/AdaptiveImage.svelte';
  import FaceEditor from '$lib/components/asset-viewer/face-editor/face-editor.svelte';
  import OcrBoundingBox from '$lib/components/asset-viewer/ocr-bounding-box.svelte';
  import AssetViewerEvents from '$lib/components/AssetViewerEvents.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { castManager } from '$lib/managers/cast-manager.svelte';
  import { editManager, EditToolType } from '$lib/managers/edit/edit-manager.svelte';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { isFaceEditMode } from '$lib/stores/face-edit.svelte';
  import { ocrManager } from '$lib/stores/ocr.svelte';
  import { boundingBoxesArray, type Faces } from '$lib/stores/people.store';
  import { SlideshowLook, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import { handlePromiseError } from '$lib/utils';
  import { canCopyImageToClipboard, copyImageToClipboard } from '$lib/utils/asset-utils';
  import { getNaturalSize, scaleToFit, type ContentMetrics } from '$lib/utils/container-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getOcrBoundingBoxes } from '$lib/utils/ocr-utils';
  import { getBoundingBox } from '$lib/utils/people-utils';
  import { type SharedLinkResponseDto } from '@immich/sdk';
  import { toastManager } from '@immich/ui';
  import { onDestroy, untrack } from 'svelte';
  import { useSwipe, type SwipeCustomEvent } from 'svelte-gestures';
  import { t } from 'svelte-i18n';
  import type { AssetCursor } from './asset-viewer.svelte';

  interface Props {
    cursor: AssetCursor;
    element?: HTMLDivElement;
    sharedLink?: SharedLinkResponseDto;
    onReady?: () => void;
    onError?: () => void;
    onSwipe?: (event: SwipeCustomEvent) => void;
  }

  let { cursor, element = $bindable(), sharedLink, onReady, onError, onSwipe }: Props = $props();

  const { slideshowState, slideshowLook } = slideshowStore;
  const asset = $derived(cursor.current);

  let visibleImageReady: boolean = $state(false);

  let previousAssetId: string | undefined;
  $effect.pre(() => {
    const id = asset.id;
    if (id === previousAssetId) {
      return;
    }
    previousAssetId = id;
    untrack(() => {
      assetViewerManager.resetZoomState();
      visibleImageReady = false;
      $boundingBoxesArray = [];
    });
  });

  onDestroy(() => {
    $boundingBoxesArray = [];
  });

  let containerWidth = $state(0);
  let containerHeight = $state(0);

  const container = $derived({
    width: containerWidth,
    height: containerHeight,
  });

  const overlayMetrics = $derived.by((): ContentMetrics => {
    if (!assetViewerManager.imgRef || !visibleImageReady) {
      return { contentWidth: 0, contentHeight: 0, offsetX: 0, offsetY: 0 };
    }

    const natural = getNaturalSize(assetViewerManager.imgRef);
    const scaled = scaleToFit(natural, container);
    return {
      contentWidth: scaled.width,
      contentHeight: scaled.height,
      offsetX: 0,
      offsetY: 0,
    };
  });

  const ocrBoxes = $derived(ocrManager.showOverlay ? getOcrBoundingBoxes(ocrManager.data, overlayMetrics) : []);

  const onCopy = async () => {
    if (!canCopyImageToClipboard() || !assetViewerManager.imgRef) {
      return;
    }

    try {
      await copyImageToClipboard(assetViewerManager.imgRef);
      toastManager.info($t('copied_image_to_clipboard'));
    } catch (error) {
      handleError(error, $t('copy_error'));
    }
  };

  const onZoom = () => {
    const targetZoom = assetViewerManager.zoom > 1 ? 1 : 2;
    assetViewerManager.animatedZoom(targetZoom);
  };

  const onPlaySlideshow = () => ($slideshowState = SlideshowState.PlaySlideshow);

  $effect(() => {
    if (isFaceEditMode.value && assetViewerManager.zoom > 1) {
      onZoom();
    }
  });

  // TODO move to action + command palette
  const onCopyShortcut = (event: KeyboardEvent) => {
    if (globalThis.getSelection()?.type === 'Range') {
      return;
    }
    event.preventDefault();

    handlePromiseError(onCopy());
  };

  let currentPreviewUrl = $state<string>();

  const onUrlChange = (url: string) => {
    currentPreviewUrl = url;
  };

  $effect(() => {
    if (currentPreviewUrl) {
      void cast(currentPreviewUrl);
    }
  });

  const cast = async (url: string) => {
    if (!url || !castManager.isCasting) {
      return;
    }
    const fullUrl = new URL(url, globalThis.location.href);

    try {
      await castManager.loadMedia(fullUrl.href);
    } catch (error) {
      handleError(error, 'Unable to cast');
      return;
    }
  };

  const isInDevelopMode = $derived(editManager.selectedTool?.type === EditToolType.Develop);

  // CSS filter preview: maps develop sliders to CSS filters for instant visual feedback
  const cssFilterStyle = $derived.by(() => {
    if (!isInDevelopMode) return '';
    const p = developManager.params;
    
    // exposure: -5..+5 → brightness multiplier using exponential curve (photographic stops)
    const exposureBrightness = Math.pow(2, p.exposure * 0.5);
    
    // brightness: -1..+1 → additional linear brightness adjustment
    const brightnessMult = 1 + p.brightness * 0.5;
    
    // highlights: -1..+1 → boost bright areas (approximated)
    const highlightBoost = 1 + Math.max(0, p.highlights) * 0.2;
    
    // shadows: -1..+1 → lift dark areas (approximated)
    const shadowBoost = 1 + Math.max(0, p.shadows) * 0.15;
    
    // whites: -1..+1 → extreme highlights (approximated)
    const whitesBoost = 1 + Math.max(0, p.whites) * 0.15;
    
    // blacks: -1..+1 → extreme shadows (approximated)
    const blacksBoost = 1 + Math.max(0, p.blacks) * 0.1;
    
    // fade: 0..1 → reduce contrast and increase brightness (faded film look)
    const fadeBrightness = 1 + p.fade * 0.15;
    const fadeContrast = 1 - p.fade * 0.3;
    
    // Combine all brightness adjustments
    const totalBrightness = exposureBrightness * brightnessMult * highlightBoost * shadowBoost * whitesBoost * blacksBoost * fadeBrightness;
    
    // contrast: -1..+1 → contrast 0.0..2.0 (0 = 1.0)
    // clarity: -1..+1 → additional contrast boost (approximated micro-contrast)
    // dehaze: -1..+1 → boost contrast for clarity
    const contrast = (1 + p.contrast) * (1 + p.clarity * 0.3) * (1 + p.dehaze * 0.4) * fadeContrast;
    
    // saturation: -1..+1 → saturate() 0.0..2.0 (0 = 1.0)
    // vibrance: -1..+1 → like saturation but less aggressive (smart saturation)
    // dehaze: adds saturation boost
    const saturation = (1 + p.saturation) * (1 + p.vibrance * 0.5) * (1 + Math.max(0, p.dehaze) * 0.2);
    
    // noiseReduction: 0..1 → subtle blur (0 = no blur, 1 = 0.5px max)
    const blurAmount = p.noiseReduction * 0.5;
    
    // temperature: -1..+1 → sepia for warm, hue-rotate for cool
    // Warm (positive): use sepia filter
    // Cool (negative): use hue-rotate towards blue
    const tempFilters = [];
    if (p.temperature > 0) {
      // Warm: add sepia effect (0-40% sepia)
      tempFilters.push(`sepia(${(p.temperature * 0.4).toFixed(3)})`);
      // Slightly increase saturation for warmth
      tempFilters.push(`saturate(${(1 + p.temperature * 0.2).toFixed(3)})`);
    } else if (p.temperature < 0) {
      // Cool: rotate hue towards blue (-180deg = cooler)
      const hueShift = p.temperature * 20; // -1 = -20deg towards blue
      tempFilters.push(`hue-rotate(${hueShift.toFixed(0)}deg)`);
    }
    
    // tint: -1..+1 → hue-rotate on green↔magenta axis
    // Map to -30deg (green) to +30deg (magenta)
    if (p.tint !== 0) {
      const tintHueShift = p.tint * 30;
      tempFilters.push(`hue-rotate(${tintHueShift.toFixed(0)}deg)`);
    }
    
    // Build the complete filter string
    const filters = [
      `brightness(${totalBrightness.toFixed(3)})`,
      `contrast(${contrast.toFixed(3)})`,
      `saturate(${saturation.toFixed(3)})`,
      ...tempFilters
    ];
    
    // Add blur for noise reduction if > 0
    if (blurAmount > 0) {
      filters.push(`blur(${blurAmount.toFixed(2)}px)`);
    }
    
    return `filter: ${filters.join(' ')};`;
  });

  const blurredSlideshow = $derived(
    $slideshowState !== SlideshowState.None && $slideshowLook === SlideshowLook.BlurredBackground && !!asset.thumbhash,
  );

  // Dynamic canvas preview for develop mode (curves/HSL support)
  let PreviewCanvas: any = $state(undefined);
  let canvasLoaded = $state(false);

  $effect(() => {
    if (isInDevelopMode && developManager.hasChanges && !canvasLoaded) {
      // Dynamically import canvas preview component
      import('./editor/preview-canvas.svelte')
        .then(module => {
          PreviewCanvas = module.default;
          canvasLoaded = true;
        })
        .catch(err => {
          console.error('Failed to load preview canvas:', err);
        });
    }
  });

  const faceToNameMap = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<Faces, string>();
    for (const person of asset.people ?? []) {
      for (const face of person.faces ?? []) {
        map.set(face, person.name);
      }
    }
    return map;
  });

  const faces = $derived(Array.from(faceToNameMap.keys()));

  const handleImageMouseMove = (event: MouseEvent) => {
    $boundingBoxesArray = [];
    if (!assetViewerManager.imgRef || !element || isFaceEditMode.value || ocrManager.showOverlay) {
      return;
    }

    const natural = getNaturalSize(assetViewerManager.imgRef);
    const scaled = scaleToFit(natural, container);
    const { currentZoom, currentPositionX, currentPositionY } = assetViewerManager.zoomState;

    const contentOffsetX = (container.width - scaled.width) / 2;
    const contentOffsetY = (container.height - scaled.height) / 2;

    const containerRect = element.getBoundingClientRect();
    const mouseX = (event.clientX - containerRect.left - contentOffsetX * currentZoom - currentPositionX) / currentZoom;
    const mouseY = (event.clientY - containerRect.top - contentOffsetY * currentZoom - currentPositionY) / currentZoom;

    const faceBoxes = getBoundingBox(faces, overlayMetrics);

    for (const [index, box] of faceBoxes.entries()) {
      if (mouseX >= box.left && mouseX <= box.left + box.width && mouseY >= box.top && mouseY <= box.top + box.height) {
        $boundingBoxesArray.push(faces[index]);
      }
    }
  };

  const handleImageMouseLeave = () => {
    $boundingBoxesArray = [];
  };
</script>

<AssetViewerEvents {onCopy} {onZoom} />

<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'z' }, onShortcut: onZoom, preventDefault: true },
    { shortcut: { key: 's' }, onShortcut: onPlaySlideshow, preventDefault: true },
    { shortcut: { key: 'c', ctrl: true }, onShortcut: onCopyShortcut, preventDefault: false },
    { shortcut: { key: 'c', meta: true }, onShortcut: onCopyShortcut, preventDefault: false },
  ]}
/>

<div
  bind:this={element}
  class="relative h-full w-full select-none"
  style={cssFilterStyle}
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
  role="presentation"
  ondblclick={onZoom}
  onmousemove={handleImageMouseMove}
  onmouseleave={handleImageMouseLeave}
  use:zoomImageAction={{ disabled: isFaceEditMode.value || ocrManager.showOverlay }}
  {...useSwipe((event) => onSwipe?.(event))}
>
    <AdaptiveImage
    {asset}
    {sharedLink}
    {container}
    objectFit={$slideshowState !== SlideshowState.None && $slideshowLook === SlideshowLook.Cover ? 'cover' : 'contain'}
    {onUrlChange}
    onImageReady={() => {
      visibleImageReady = true;
      onReady?.();
    }}
    onError={() => {
      onError?.();
      onReady?.();
    }}
    bind:imgRef={assetViewerManager.imgRef}
  >
    {#snippet backdrop()}
      {#if blurredSlideshow}
        <canvas
          use:thumbhash={{ base64ThumbHash: asset.thumbhash! }}
          class="absolute top-0 left-0 inset-s-0 h-dvh w-dvw"
        ></canvas>
      {/if}
    {/snippet}
    {#snippet overlays()}
      {#each getBoundingBox($boundingBoxesArray, overlayMetrics) as boundingbox, index (boundingbox.id)}
        <div
          class="absolute border-solid border-white border-3 rounded-lg"
          style="top: {boundingbox.top}px; left: {boundingbox.left}px; height: {boundingbox.height}px; width: {boundingbox.width}px;"
        ></div>
        {#if faceToNameMap.get($boundingBoxesArray[index])}
          <div
            class="absolute bg-white/90 text-black px-2 py-1 rounded text-sm font-medium whitespace-nowrap pointer-events-none shadow-lg"
            style="top: {boundingbox.top + boundingbox.height + 4}px; left: {boundingbox.left +
              boundingbox.width}px; transform: translateX(-100%);"
          >
            {faceToNameMap.get($boundingBoxesArray[index])}
          </div>
        {/if}
      {/each}

      {#each ocrBoxes as ocrBox (ocrBox.id)}
        <OcrBoundingBox {ocrBox} />
      {/each}
    {/snippet}
  </AdaptiveImage>

  {#if isFaceEditMode.value && assetViewerManager.imgRef}
    <FaceEditor htmlElement={assetViewerManager.imgRef} {containerWidth} {containerHeight} assetId={asset.id} />
  {/if}

  {#if canvasLoaded && PreviewCanvas && currentPreviewUrl}
    <svelte:component
      this={PreviewCanvas}
      imageUrl={currentPreviewUrl}
      width={containerWidth}
      height={containerHeight}
    />
  {/if}
</div>
