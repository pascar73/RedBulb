<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import { editManager, EditToolType } from '$lib/managers/edit/edit-manager.svelte';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import ZoomControl from './develop-tool/zoom-control.svelte';
  import InfoPanel from './info-panel.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getAssetEdits, type AssetResponseDto } from '@immich/sdk';
  import { Button, HStack, IconButton, toastManager } from '@immich/ui';
  import { mdiClose, mdiExport, mdiInformationOutline } from '@mdi/js';
  import ExportDialog from './export-dialog.svelte';
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

  let showExportDialog = $state(false);
  let showInfoTab = $state(false);

  async function applyEdits() {
    // For non-develop tools (Transform), use standard Immich server-side edit
    if (!developManager.hasChanges) {
      const success = await editManager.applyEdits();
      if (success) onClose();
    }
    // Develop edits are auto-saved — just close
    onClose();
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
      {#if editManager.selectedTool?.type === EditToolType.Develop}
        {#if developManager.hasChanges}
          <IconButton
            shape="round"
            size="small"
            icon={mdiExport}
            title="Export edited copy"
            onclick={() => (showExportDialog = true)}
          />
        {/if}
      {:else}
        <Button shape="round" size="small" onclick={applyEdits} loading={editManager.isApplyingEdits}>
          {$t('save')}
        </Button>
      {/if}
    </HStack>
  </HStack>

  <!-- Tool Tabs -->
  <HStack class="px-4 mt-4 gap-2">
    {#each editManager.tools as tool}
      <IconButton
        shape="round"
        variant={!showInfoTab && editManager.selectedTool?.type === tool.type ? 'filled' : 'outline'}
        color={!showInfoTab && editManager.selectedTool?.type === tool.type ? 'primary' : 'secondary'}
        icon={tool.icon}
        onclick={() => { showInfoTab = false; editManager.activateTool(tool.type, asset, { edits: [] }); }}
      />
    {/each}
    <div class="ml-auto">
      <IconButton
        shape="round"
        variant={showInfoTab ? 'filled' : 'outline'}
        color={showInfoTab ? 'primary' : 'secondary'}
        icon={mdiInformationOutline}
        onclick={() => (showInfoTab = !showInfoTab)}
        title="File & EXIF Info"
      />
    </div>
  </HStack>

  <section>
    {#if showInfoTab}
      <InfoPanel {asset} />
    {:else if editManager.selectedTool}
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

{#if showExportDialog}
  <ExportDialog {asset} onClose={() => (showExportDialog = false)} />
{/if}
