<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import { editManager, EditToolType } from '$lib/managers/edit/edit-manager.svelte';
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getAssetEdits, type AssetResponseDto } from '@immich/sdk';
  import { Button, HStack, IconButton, toastManager } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
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

  async function applyEdits() {
    // Prevent server save when only Develop changes exist (no server-side support yet)
    if (developManager.hasChanges) {
      toastManager.info('Develop adjustments are preview-only. Client-side export coming in Sprint 5.');
      return;
    }

    const success = await editManager.applyEdits();

    if (success) {
      onClose();
    }
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
    <Button shape="round" size="small" onclick={applyEdits} loading={editManager.isApplyingEdits}>{$t('save')}</Button>
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
