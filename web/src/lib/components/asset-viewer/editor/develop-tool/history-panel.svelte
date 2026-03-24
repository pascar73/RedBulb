<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';
  import { editManager } from '$lib/managers/edit/edit-manager.svelte';
  import {
    type DevelopHistoryVersion,
    listVersions,
    getCurrentVersion,
    getVersion,
    saveVersion,
    restoreVersion,
    updateLabel,
    deleteVersion,
  } from '$lib/managers/edit/develop-history-api';

  let versions = $state<DevelopHistoryVersion[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let savingSnapshot = $state(false);
  let snapshotLabel = $state('');
  let showLabelInput = $state(false);
  let editingLabelVersion = $state<number | null>(null);
  let editingLabelText = $state('');
  let confirmDeleteVersion = $state<number | null>(null);
  let previewingVersion = $state<number | null>(null);

  function getAssetId(): string | null {
    return editManager.currentAsset?.id ?? null;
  }

  async function loadHistory() {
    const assetId = getAssetId();
    if (!assetId) return;

    loading = true;
    error = null;
    try {
      const result = await listVersions(assetId);
      versions = result.versions;
      total = result.total;
    } catch (e: any) {
      error = e.message ?? 'Failed to load history';
      versions = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  // Load history when component mounts and when asset changes
  $effect(() => {
    const _assetId = getAssetId();
    if (_assetId) {
      loadHistory();
    }
  });

  async function handleSaveSnapshot() {
    const assetId = getAssetId();
    if (!assetId) return;

    savingSnapshot = true;
    error = null;
    try {
      const state = developManager.serialize();
      await saveVersion(assetId, state, {
        label: snapshotLabel || generateAutoLabel(),
        isAutoCheckpoint: false,
      });
      snapshotLabel = '';
      showLabelInput = false;
      await loadHistory();
    } catch (e: any) {
      error = e.message ?? 'Failed to save snapshot';
    } finally {
      savingSnapshot = false;
    }
  }

  function generateAutoLabel(): string {
    // Generate a label based on what's changed
    const state = developManager.serialize() as any;
    const parts: string[] = [];

    if (state.basic) {
      const changed = Object.entries(state.basic).filter(([, v]) => v !== 0);
      if (changed.length > 0) {
        parts.push(changed.map(([k]) => capitalize(k)).slice(0, 2).join(', '));
      }
    }
    if (state.curves) {
      const hasPoints = Object.values(state.curves as Record<string, any[]>).some((ch) => ch.length > 0);
      if (hasPoints) parts.push('Curves');
    }
    if (state.colorWheels) {
      const hasGrading = Object.values(state.colorWheels as Record<string, any>).some(
        (w: any) => w.hue !== 0 || w.sat !== 0 || w.lum !== 0,
      );
      if (hasGrading) parts.push('Color Grading');
    }
    if (state.effects) {
      const changed = Object.entries(state.effects).filter(([, v]) => v !== 0);
      if (changed.length > 0) parts.push('Effects');
    }
    if (state.hsl) {
      const hasHsl = Object.values(state.hsl as Record<string, any>).some(
        (ch: any) => ch.h !== 0 || ch.s !== 0 || ch.l !== 0,
      );
      if (hasHsl) parts.push('HSL');
    }

    return parts.length > 0 ? parts.join(' + ') : 'Edit';
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function handleRestore(version: number) {
    const assetId = getAssetId();
    if (!assetId) return;

    loading = true;
    error = null;
    try {
      // Get the full state from the version
      const fullVersion = await getVersion(assetId, version);
      // Restore creates a new version
      await restoreVersion(assetId, version, `Restored from v${version}`);
      // Apply the state to the UI
      developManager.deserialize(fullVersion.state);
      previewingVersion = null;
      await loadHistory();
    } catch (e: any) {
      error = e.message ?? 'Failed to restore version';
    } finally {
      loading = false;
    }
  }

  async function handlePreview(version: number) {
    const assetId = getAssetId();
    if (!assetId) return;

    try {
      const fullVersion = await getVersion(assetId, version);
      developManager.deserialize(fullVersion.state);
      previewingVersion = version;
    } catch (e: any) {
      error = e.message ?? 'Failed to preview version';
    }
  }

  async function handleExitPreview() {
    const assetId = getAssetId();
    if (!assetId) return;

    // Reload the current version
    try {
      const current = await getCurrentVersion(assetId);
      if (current) {
        developManager.deserialize(current.state);
      }
    } catch {
      // Fall back to localStorage
      developManager.loadFromStorage(assetId);
    }
    previewingVersion = null;
  }

  async function handleDelete(version: number) {
    const assetId = getAssetId();
    if (!assetId) return;

    try {
      await deleteVersion(assetId, version);
      confirmDeleteVersion = null;
      await loadHistory();
    } catch (e: any) {
      error = e.message ?? 'Failed to delete version';
    }
  }

  async function handleSaveLabel(version: number) {
    const assetId = getAssetId();
    if (!assetId) return;

    try {
      await updateLabel(assetId, version, editingLabelText);
      editingLabelVersion = null;
      await loadHistory();
    } catch (e: any) {
      error = e.message ?? 'Failed to update label';
    }
  }

  function startEditLabel(version: number, currentLabel: string) {
    editingLabelVersion = version;
    editingLabelText = currentLabel;
  }

  function formatTime(iso: string): string {
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }
</script>

<div class="history-panel">
  <!-- Save Snapshot Button -->
  <div class="save-section">
    {#if showLabelInput}
      <div class="label-input-row">
        <input
          type="text"
          class="label-input"
          placeholder="Snapshot name (optional)"
          bind:value={snapshotLabel}
          onkeydown={(e) => { if (e.key === 'Enter') handleSaveSnapshot(); if (e.key === 'Escape') showLabelInput = false; }}
        />
        <button class="save-confirm-btn" onclick={handleSaveSnapshot} disabled={savingSnapshot}>
          {savingSnapshot ? '...' : '✓'}
        </button>
        <button class="save-cancel-btn" onclick={() => showLabelInput = false}>✕</button>
      </div>
    {:else}
      <button class="snapshot-btn" onclick={() => showLabelInput = true} disabled={savingSnapshot}>
        📸 Create Snapshot
      </button>
    {/if}
  </div>

  <!-- Preview Banner -->
  {#if previewingVersion !== null}
    <div class="preview-banner">
      <span>Previewing v{previewingVersion}</span>
      <div class="preview-actions">
        <button class="preview-restore-btn" onclick={() => handleRestore(previewingVersion!)}>
          Restore
        </button>
        <button class="preview-exit-btn" onclick={handleExitPreview}>
          Exit
        </button>
      </div>
    </div>
  {/if}

  <!-- Error Message -->
  {#if error}
    <div class="error-msg">
      ⚠ {error}
      <button class="error-dismiss" onclick={() => error = null}>✕</button>
    </div>
  {/if}

  <!-- Version List -->
  <div class="version-list">
    {#if loading && versions.length === 0}
      <div class="loading-msg">Loading history...</div>
    {:else if versions.length === 0}
      <div class="empty-msg">No saved versions yet</div>
    {:else}
      {#each versions as v (v.id)}
        <div
          class="version-item"
          class:current={v.isCurrent}
          class:previewing={previewingVersion === v.version}
          class:auto-checkpoint={v.isAutoCheckpoint}
        >
          <div class="version-main">
            <div class="version-header">
              <span class="version-number">v{v.version}</span>
              {#if v.isCurrent}
                <span class="current-badge">Current</span>
              {/if}
              {#if v.isAutoCheckpoint}
                <span class="auto-badge">Auto</span>
              {/if}
              <span class="version-time">{formatTime(v.createdAt)}</span>
            </div>

            <!-- Label (editable) -->
            {#if editingLabelVersion === v.version}
              <div class="label-edit-row">
                <input
                  type="text"
                  class="label-edit-input"
                  bind:value={editingLabelText}
                  onkeydown={(e) => { if (e.key === 'Enter') handleSaveLabel(v.version); if (e.key === 'Escape') editingLabelVersion = null; }}
                />
                <button class="label-save-btn" onclick={() => handleSaveLabel(v.version)}>✓</button>
                <button class="label-cancel-btn" onclick={() => editingLabelVersion = null}>✕</button>
              </div>
            {:else}
              <button
                class="version-label"
                class:has-label={!!v.label}
                onclick={() => startEditLabel(v.version, v.label)}
                title="Click to rename"
              >
                {v.label || 'Untitled'}
              </button>
            {/if}
          </div>

          <!-- Actions -->
          <div class="version-actions">
            {#if !v.isCurrent && previewingVersion !== v.version}
              <button class="action-btn preview" onclick={() => handlePreview(v.version)} title="Preview this version">
                👁
              </button>
            {/if}
            {#if !v.isCurrent}
              <button class="action-btn restore" onclick={() => handleRestore(v.version)} title="Restore this version">
                ↩
              </button>
            {/if}
            {#if !v.isCurrent}
              {#if confirmDeleteVersion === v.version}
                <button class="action-btn delete confirm" onclick={() => handleDelete(v.version)}>
                  Confirm?
                </button>
              {:else}
                <button class="action-btn delete" onclick={() => confirmDeleteVersion = v.version} title="Delete">
                  🗑
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Total Count -->
  {#if total > 0}
    <div class="total-count">{total}/30 versions</div>
  {/if}
</div>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Save Section */
  .save-section {
    margin-bottom: 4px;
  }

  .snapshot-btn {
    width: 100%;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #e5e7eb;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .snapshot-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
  }

  .snapshot-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .label-input-row {
    display: flex;
    gap: 4px;
  }

  .label-input {
    flex: 1;
    padding: 6px 8px;
    font-size: 12px;
    color: #e5e7eb;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    outline: none;
  }

  .label-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .save-confirm-btn,
  .save-cancel-btn {
    padding: 4px 8px;
    font-size: 12px;
    color: #e5e7eb;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    cursor: pointer;
  }

  .save-confirm-btn:hover {
    background: rgba(34, 197, 94, 0.2);
  }

  .save-cancel-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  /* Preview Banner */
  .preview-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 6px;
  }

  .preview-actions {
    display: flex;
    gap: 6px;
  }

  .preview-restore-btn {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #4ade80;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 4px;
    cursor: pointer;
  }

  .preview-restore-btn:hover {
    background: rgba(34, 197, 94, 0.3);
  }

  .preview-exit-btn {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #9ca3af;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    cursor: pointer;
  }

  .preview-exit-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Error */
  .error-msg {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 11px;
    color: #f87171;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
  }

  .error-dismiss {
    padding: 0 4px;
    font-size: 12px;
    color: #9ca3af;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  /* Version List */
  .version-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  }

  .version-list::-webkit-scrollbar {
    width: 4px;
  }

  .version-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .version-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .loading-msg,
  .empty-msg {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: #6b7280;
  }

  /* Version Item */
  .version-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    transition: all 0.15s;
  }

  .version-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .version-item.current {
    border-color: rgba(99, 102, 241, 0.3);
    background: rgba(99, 102, 241, 0.06);
  }

  .version-item.previewing {
    border-color: rgba(251, 191, 36, 0.3);
    background: rgba(251, 191, 36, 0.06);
  }

  .version-main {
    flex: 1;
    min-width: 0;
  }

  .version-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .version-number {
    font-size: 11px;
    font-weight: 700;
    color: #a5b4fc;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .current-badge {
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 700;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.15);
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .auto-badge {
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 600;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .version-time {
    font-size: 10px;
    color: #6b7280;
    margin-left: auto;
  }

  .version-label {
    display: block;
    font-size: 12px;
    color: #9ca3af;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    transition: color 0.1s;
  }

  .version-label.has-label {
    color: #d1d5db;
  }

  .version-label:hover {
    color: #fff;
  }

  /* Label Edit */
  .label-edit-row {
    display: flex;
    gap: 3px;
    margin-top: 2px;
  }

  .label-edit-input {
    flex: 1;
    padding: 2px 6px;
    font-size: 11px;
    color: #e5e7eb;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    outline: none;
  }

  .label-save-btn,
  .label-cancel-btn {
    padding: 1px 5px;
    font-size: 11px;
    color: #9ca3af;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    cursor: pointer;
  }

  .label-save-btn:hover {
    color: #4ade80;
  }

  .label-cancel-btn:hover {
    color: #f87171;
  }

  /* Version Actions */
  .version-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 2px 6px;
    font-size: 11px;
    color: #9ca3af;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .action-btn.preview:hover {
    color: #fbbf24;
  }

  .action-btn.restore:hover {
    color: #4ade80;
  }

  .action-btn.delete:hover {
    color: #f87171;
  }

  .action-btn.delete.confirm {
    font-size: 9px;
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.1);
  }

  /* Total Count */
  .total-count {
    text-align: center;
    font-size: 10px;
    color: #4b5563;
    padding-top: 4px;
  }
</style>
