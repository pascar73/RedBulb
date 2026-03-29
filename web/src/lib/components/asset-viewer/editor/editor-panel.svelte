<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import { editManager, EditToolType } from '$lib/managers/edit/edit-manager.svelte';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import ZoomControl from './develop-tool/zoom-control.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getAssetEdits, type AssetResponseDto } from '@immich/sdk';
  import { Button, HStack, IconButton, toastManager } from '@immich/ui';
  import { mdiClose, mdiExport } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  onMount(() => {
    return websocketEvents.on('on_asset_update', (assetUpdate) => {
      if (assetUpdate.id === asset.id) {
        asset = assetUpdate;
      }
    });
  });

  interface Props {
    asset: AssetResponseDto;
    onClose: () => void;
  }

  onMount(async () => {
    const edits = await getAssetEdits({ id: asset.id });
    await editManager.activateTool(EditToolType.Transform, asset, edits);
  });

  onDestroy(() => {
    editManager.cleanup();
  });

  let isSaving = $state(false);

  // Sidecar API base URL (same host as Immich, different port)
  const SIDECAR_API = `${window.location.protocol}//${window.location.hostname}:3380`;

  async function applyEdits() {
    // If develop changes exist, save XMP sidecar (non-destructive, like Lightroom)
    if (developManager.hasChanges) {
      await saveDevelopXMP();
      return;
    }

    // Otherwise, use standard Immich server-side edit (crop/rotate/mirror)
    const success = await editManager.applyEdits();

    if (success) {
      onClose();
    }
  }

  /**
   * Save develop edits as XMP sidecar next to the original file.
   * Non-destructive — the original is never modified.
   * XMP is written at {originalPath}.xmp via the sidecar API.
   */
  async function saveDevelopXMP() {
    if (isSaving) return;
    isSaving = true;

    try {
      // Generate XMP content (reuse the function from develop-tool)
      const xmp = generateXMPFromManager();

      // Save XMP via sidecar API
      const response = await fetch(`${SIDECAR_API}/api/assets/${asset.id}/xmp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xmp }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('XMP saved:', result.path);

      // Also save to version history
      try {
        await fetch(`${SIDECAR_API}/api/assets/${asset.id}/develop-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: developManager.serialize(),
            label: 'Saved',
            isAutoCheckpoint: false,
          }),
        });
      } catch {
        // Non-fatal — XMP is the primary save
      }

      toastManager.success('Edits saved (XMP sidecar)');
    } catch (error) {
      console.error('XMP save failed:', error);
      toastManager.danger(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      isSaving = false;
    }
  }

  /**
   * Generate XMP content from current develop manager state.
   * Mirrors the generateXMP() function in develop-tool.svelte.
   */
  function generateXMPFromManager(): string {
    const state = developManager.serialize() as any;
    const b = state.basic || {};
    const c = state.color || {};
    const d = state.details || {};
    const e = state.effects || {};
    const g = state.geometry || {};

    return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      xmlns:rb="http://redbulb.app/ns/1.0/"
      crs:Version="16.0"
      crs:ProcessVersion="15.4"
      crs:Exposure2012="${(b.exposure ?? 0).toFixed(2)}"
      crs:Contrast2012="${Math.round((b.contrast ?? 0) * 100)}"
      crs:Highlights2012="${Math.round((b.highlights ?? 0) * 100)}"
      crs:Shadows2012="${Math.round((b.shadows ?? 0) * 100)}"
      crs:Whites2012="${Math.round((b.whites ?? 0) * 100)}"
      crs:Blacks2012="${Math.round((b.blacks ?? 0) * 100)}"
      crs:Brightness="${Math.round((b.brightness ?? 0) * 100)}"
      crs:Temperature="${Math.round((c.temperature ?? 0) * 100)}"
      crs:Tint="${Math.round((c.tint ?? 0) * 100)}"
      crs:Vibrance="${Math.round((c.vibrance ?? 0) * 100)}"
      crs:Saturation="${Math.round((c.saturation ?? 0) * 100)}"
      crs:Clarity2012="${Math.round((d.clarity ?? 0) * 100)}"
      crs:Dehaze="${Math.round((d.dehaze ?? 0) * 100)}"
      crs:Sharpness="${Math.round((d.sharpness ?? 0) * 100)}"
      crs:LuminanceSmoothing="${Math.round((d.noiseReduction ?? 0) * 100)}"
      crs:PostCropVignetteAmount="${Math.round((e.vignette ?? 0) * 100)}"
      crs:PostCropVignetteMidpoint="${e.vignetteMidpoint ?? 50}"
      crs:PostCropVignetteFeather="${e.vignetteFeather ?? 50}"
      crs:PostCropVignetteRoundness="${e.vignetteRoundness ?? 0}"
      crs:PostCropVignetteHighlightRecovery="${e.vignetteHighlights ?? 0}"
      crs:GrainAmount="${Math.round((e.grain ?? 0) * 100)}"
      crs:GrainSize="${e.grainSize ?? 25}"
      crs:GrainFrequency="${e.grainRoughness ?? 50}"
      rb:ToneMapper="${state.toneMapper ?? 'none'}"
      rb:Texture="${Math.round((e.texture ?? 0) * 100)}"
      rb:Fade="${Math.round((e.fade ?? 0) * 100)}"
      rb:ChromaticAberration="${Math.round((d.caCorrection ?? 0) * 100)}"
      rb:GeoRotation="${(g.rotation ?? 0).toFixed(1)}"
      rb:GeoDistortion="${g.distortion ?? 0}"
      rb:GeoVertical="${g.vertical ?? 0}"
      rb:GeoHorizontal="${g.horizontal ?? 0}"
      rb:GeoScale="${g.scale ?? 100}"
      rb:DevelopState="${encodeURIComponent(JSON.stringify(state))}"
    >
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  async function closeEditor() {
    if (await editManager.closeConfirm()) {
      onClose();
    }
  }

  let { asset = $bindable(), onClose }: Props = $props();
</script>

<svelte:document use:shortcut={{ shortcut: { key: 'Escape' }, onShortcut: onClose }} />

<section class="relative flex flex-col h-full p-2 bg-immich-dark-bg text-immich-dark-fg dark pt-3 overflow-x-hidden overflow-y-auto">
  <HStack class="justify-between me-4">
    <HStack>
      <IconButton
        shape="round"
        variant="ghost"
        color="secondary"
        icon={mdiClose}
        aria-label={$t('close')}
        onclick={closeEditor}
      />
      <p class="text-lg text-immich-fg dark:text-immich-dark-fg capitalize">{$t('editor')}</p>
    </HStack>
    <HStack gap={2}>
      {#if editManager.selectedTool?.type === EditToolType.Develop}
        <ZoomControl />
      {/if}
      <Button shape="round" size="small" onclick={applyEdits} loading={editManager.isApplyingEdits || isSaving}>
        {isSaving ? 'Saving...' : $t('save')}
      </Button>
    </HStack>
  </HStack>

  <!-- Tool Tabs -->
  <HStack class="px-4 mt-4 gap-2">
    {#each editManager.tools as tool}
      <IconButton
        shape="round"
        variant={editManager.selectedTool?.type === tool.type ? 'filled' : 'outline'}
        color={editManager.selectedTool?.type === tool.type ? 'primary' : 'secondary'}
        icon={tool.icon}
        onclick={() => editManager.activateTool(tool.type, asset, { edits: [] })}
      />
    {/each}
  </HStack>

  <section>
    {#if editManager.selectedTool}
      <editManager.selectedTool.component />
    {/if}
  </section>
  <div class="flex-1"></div>
  <section class="p-4">
    <Button
      variant="outline"
      onclick={() => editManager.resetAllChanges()}
      disabled={!editManager.canReset}
      class="self-start"
      shape="round"
      size="small"
    >
      {$t('editor_reset_all_changes')}
    </Button>
  </section>
</section>
