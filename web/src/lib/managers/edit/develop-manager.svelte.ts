import { type EditActions, type EditToolManager } from '$lib/managers/edit/edit-manager.svelte';
import type { AssetResponseDto } from '@immich/sdk';
import {
  type NodeGraphV2, type CorrectorNode, type DevelopState,
  createEmptyDevelopState, createDefaultGeometry, createNode,
  resetNodeCounter, migrateV1toV2, mergeNodes, hasActiveChanges,
  buildSerialConnections, insertNodeAfter, appendNode, removeNodeConnections,
  hasCycle,
  MAX_NODES, NODE_W, NODE_GAP, TOP_PAD, SIDE_PAD,
} from '$lib/components/asset-viewer/editor/node-types';
import { autoMigrateDevelopState, isDevelopStateV1 } from '$lib/migration/migrate-develop-state';
import { evaluateNodeGraph } from '$lib/components/asset-viewer/editor/node-graph-evaluate';
import type { EvalOptions } from '$lib/components/asset-viewer/editor/node-graph-types';
import { redBulbFetch } from '$lib/utils/redbulb-api';
import { toastManager } from '@immich/ui';
import { getCurrentVersion } from '$lib/managers/edit/develop-history-api';

class DevelopManager implements EditToolManager {
  // Current asset ID for auto-save
  private _currentAssetId = $state('');
  private _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _isLoading = false; // suppress auto-save during load

  // ── Node Graph State ──
  private _nodeGraph = $state<NodeGraphV2 | null>(null);
  selectedNodeId = $state('');

  // Basic adjustment parameters
  exposure = $state(0);
  contrast = $state(0);
  highlights = $state(0);
  shadows = $state(0);
  whites = $state(0);
  blacks = $state(0);

  // Color adjustment parameters
  saturation = $state(0);
  temperature = $state(0);

  // Curve endpoints (black point / white point per channel)
  curveEndpoints = $state({
    master: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    red: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    green: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
    blue: { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } },
  });

  // Eyedropper mode — when true, clicking the photo samples WB
  eyedropperActive = $state(false);

  // Details parameters
  sharpness = $state(0);
  noiseReduction = $state(0);
  clarity = $state(0);
  dehaze = $state(0);

  // Lens corrections

  // Tone mapper: 'none' = standard, 'filmic' = AgX film-like
  toneMapper = $state<'none' | 'filmic'>('none');

  // Tone parameters
  vibrance = $state(0);
  hue = $state(0);
  tint = $state(0);

  // Effects parameters
  texture = $state(0);
  vignette = $state(0);
  vignetteMidpoint = $state(50);
  vignetteRoundness = $state(0);
  vignetteFeather = $state(50);
  vignetteHighlights = $state(0);
  grain = $state(0);
  grainSize = $state(25);
  grainRoughness = $state(50);
  fade = $state(0);

  // Geometry — perspective/distortion transforms (RapidRAW-style)
  geoRotation = $state(0);       // Fine rotation in degrees (-45 to +45)
  geoDistortion = $state(0);     // Barrel/pincushion (-100 to +100)
  geoVertical = $state(0);       // Vertical perspective / keystone (-100 to +100)
  geoHorizontal = $state(0);     // Horizontal perspective (-100 to +100)
  geoScale = $state(100);        // Scale after transform (50 to 200, default 100)

  // Tone curves - array of control points per channel
  curves = $state({
    master: [] as Array<{x: number, y: number}>,
    red: [] as Array<{x: number, y: number}>,
    green: [] as Array<{x: number, y: number}>,
    blue: [] as Array<{x: number, y: number}>,
  });

  // Color Wheels — 3-way color grading (shadows/midtones/highlights)
  colorWheels = $state({
    shadows: { hue: 0, sat: 0, lum: 0 },
    midtones: { hue: 0, sat: 0, lum: 0 },
    highlights: { hue: 0, sat: 0, lum: 0 },
  });

  // HSL adjustments per color channel
  hsl = $state({
    red: { h: 0, s: 0, l: 0 },
    orange: { h: 0, s: 0, l: 0 },
    yellow: { h: 0, s: 0, l: 0 },
    green: { h: 0, s: 0, l: 0 },
    aqua: { h: 0, s: 0, l: 0 },
    blue: { h: 0, s: 0, l: 0 },
    purple: { h: 0, s: 0, l: 0 },
    magenta: { h: 0, s: 0, l: 0 },
  });

  /** Auto-save means no "unsaved" changes — everything is saved immediately */
  hasUnsavedChanges = false;

  hasChanges = $derived.by(() => {
    // Check basic parameters
    const hasParamChanges = (
      this.exposure !== 0 ||
      this.contrast !== 0 ||
      this.highlights !== 0 ||
      this.shadows !== 0 ||
      this.whites !== 0 ||
      this.blacks !== 0 ||
      this.saturation !== 0 ||
      this.temperature !== 0 ||
      this.sharpness !== 0 ||
      this.noiseReduction !== 0 ||
      this.clarity !== 0 ||
      this.dehaze !== 0 ||
      this.toneMapper !== 'none' ||
      this.vibrance !== 0 ||
      this.tint !== 0 ||
      this.hue !== 0 ||
      this.texture !== 0 ||
      this.vignette !== 0 ||
      this.vignetteMidpoint !== 50 ||
      this.vignetteRoundness !== 0 ||
      this.vignetteFeather !== 50 ||
      this.vignetteHighlights !== 0 ||
      this.grain !== 0 ||
      this.grainSize !== 25 ||
      this.grainRoughness !== 50 ||
      this.fade !== 0
    );

    // Check geometry
    const hasGeoChanges = (
      this.geoRotation !== 0 ||
      this.geoDistortion !== 0 ||
      this.geoVertical !== 0 ||
      this.geoHorizontal !== 0 ||
      this.geoScale !== 100
    );

    // Check curves (any channel has control points)
    const hasCurveChanges = (
      this.curves.master.length > 0 ||
      this.curves.red.length > 0 ||
      this.curves.green.length > 0 ||
      this.curves.blue.length > 0
    );

    // Check color wheels
    const hasColorWheelChanges = Object.values(this.colorWheels).some(
      w => w.hue !== 0 || w.sat !== 0 || w.lum !== 0
    );

    // Check curve endpoints
    const hasEndpointChanges = Object.values(this.curveEndpoints).some(
      ep => ep.black.x !== 0 || ep.black.y !== 0 || ep.white.x !== 1 || ep.white.y !== 1
    );

    // Check HSL (any channel has non-zero values)
    const hasHslChanges = Object.values(this.hsl).some(
      channel => channel.h !== 0 || channel.s !== 0 || channel.l !== 0
    );

    // FIX: Also check if any node in the chain has changes (not just current panel)
    // This ensures preview stays visible even when selecting an empty node
    const hasNodeChainChanges = this._nodeGraph?.nodes.some(node => {
      if (node.bypass) return false;
      return hasActiveChanges(node.state);
    }) ?? false;

    return hasParamChanges || hasCurveChanges || hasColorWheelChanges || hasHslChanges || hasEndpointChanges || hasGeoChanges || hasNodeChainChanges;
  });

  canReset = $derived(this.hasChanges);

  edits = $derived.by(() => this.getEdits());

  // Reactive object for WebGPU rendering
  // Auto-save trigger: watches all reactive state via serialize()
  // Uses $effect.pre in a constructor won't work in class — we use a derived + side effect approach
  private _lastSerializedJson = $derived.by(() => {
    // Access all reactive properties to establish dependencies
    const json = JSON.stringify(this.serialize());
    // Schedule auto-save as a side effect (only if not loading)
    if (!this._isLoading && this._currentAssetId) {
      this.scheduleAutoSave();
    }
    return json;
  });

  params = $derived.by(() => ({
    exposure: this.exposure,
    contrast: this.contrast,
    highlights: this.highlights,
    shadows: this.shadows,
    whites: this.whites,
    blacks: this.blacks,
    saturation: this.saturation,
    temperature: this.temperature,
    sharpness: this.sharpness,
    noiseReduction: this.noiseReduction,
    clarity: this.clarity,
    dehaze: this.dehaze,
    toneMapper: this.toneMapper,
    vibrance: this.vibrance,
    tint: this.tint,
    hue: this.hue,
    texture: this.texture,
    vignette: this.vignette,
    vignetteMidpoint: this.vignetteMidpoint,
    vignetteRoundness: this.vignetteRoundness,
    vignetteFeather: this.vignetteFeather,
    vignetteHighlights: this.vignetteHighlights,
    grain: this.grain,
    grainSize: this.grainSize,
    grainRoughness: this.grainRoughness,
    fade: this.fade,
    geoRotation: this.geoRotation,
    geoDistortion: this.geoDistortion,
    geoVertical: this.geoVertical,
    geoHorizontal: this.geoHorizontal,
    geoScale: this.geoScale,
    curves: this.curves,
    curveEndpoints: this.curveEndpoints,
    hsl: this.hsl,
    colorWheels: this.colorWheels
  }));

  /**
   * Fresh foundation: Get evaluated state from node graph.
   * This is the integration seam for preview/export.
   * 
   * @param opts - Evaluation options (stopAtNodeId for selected-node preview)
   * @returns Flattened DevelopState from evaluating active nodes
   */
  getEvaluatedState(opts?: EvalOptions): DevelopState {
    // FIX: Commit current panel edits to selected node before evaluation
    // This ensures preview/export always sees latest edits
    this._saveCurrentToNode();
    
    const graph = this.nodeGraph;
    
    if (!graph || graph.nodes.length === 0) {
      // Fallback: no node graph, return current panel state as DevelopState
      return this.serialize() as DevelopState;
    }
    
    const result = evaluateNodeGraph(graph, opts);
    
    if (result.warnings.length > 0) {
      console.warn('[NodeGraph] Evaluation warnings:', result.warnings);
    }
    
    return result.flattenedState;
  }

  async onActivate(asset: AssetResponseDto, edits: EditActions): Promise<void> {
    this._isLoading = true;
    this._currentAssetId = asset.id;
    // Try server first (authoritative saved state), fall back to localStorage (unsaved drafts)
    const serverLoaded = await this.loadFromServer(asset.id);
    if (!serverLoaded) {
      this.loadFromStorage(asset.id);
    }
    // Initialize node graph from loaded state
    this._ensureNodeGraph();

    // Small delay to let Svelte finish updating derived state before enabling auto-save
    setTimeout(() => { this._isLoading = false; }, 100);
  }

  onDeactivate(): void {
    // Flush any pending auto-save
    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    if (this._currentAssetId && this.hasChanges) {
      this._performSave(this._currentAssetId);
    }
  }

  /** Debounced auto-save — called on every parameter change */
  scheduleAutoSave(): void {
    if (this._isLoading || !this._currentAssetId) return;
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      this._autoSaveTimer = null;
      this._performSave(this._currentAssetId);
    }, 800); // 800ms debounce — fast enough to feel instant, slow enough to batch slider drags
  }

  /** Cache the current preview canvas for instant restore */
  cachePreview(assetId: string, canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    try {
      const preview = canvas.toDataURL('image/jpeg', 0.85); // 85% quality, good balance
      localStorage.setItem(`redbulb_preview_${assetId}`, preview);
    } catch {
      // Silent fail — caching is optional
    }
  }

  /** Get cached preview for instant display on reopen */
  getCachedPreview(assetId: string): string | null {
    try {
      return localStorage.getItem(`redbulb_preview_${assetId}`);
    } catch {
      return null;
    }
  }

  /** Save to localStorage + server (XMP + history) */
  private async _performSave(assetId: string): Promise<void> {
    if (!assetId) return;

    // Always save to localStorage first (instant restore, canonical while editing)
    this.saveToStorage(assetId);

    // Save to server (XMP sidecar + version history) — authoritative persistence
    try {
      // Save XMP sidecar
      const xmp = this._generateXMP();
      await redBulbFetch(`/assets/${assetId}/xmp`, {
        method: 'PUT',
        body: JSON.stringify({ xmp }),
      });

      // Save to version history (auto-checkpoint)
      // Use v2 (node graph) if available, otherwise v1 (panel state)
      const stateToSave = this.serializeV2() ?? this.serialize();
      await redBulbFetch(`/assets/${assetId}/develop-history`, {
        method: 'POST',
        body: JSON.stringify({
          state: stateToSave,
          label: '',
          isAutoCheckpoint: true,
        }),
      });
    } catch (error) {
      // Non-blocking error toast — localStorage has the data, server save is best-effort
      console.error('[RedBulb] Server save failed:', error);
      toastManager.warning('Changes saved locally. Server sync will retry.');
    }
  }

  /** Generate XMP content from current state */
  private _generateXMP(): string {
    const state = this.serialize() as any;
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
      crs:Temperature="${Math.round((c.temperature ?? 0) * 100)}"
      crs:Tint="${Math.round((c.tint ?? 0) * 100)}"
      crs:Vibrance="${Math.round((c.vibrance ?? 0) * 100)}"
      crs:Saturation="${Math.round((c.saturation ?? 0) * 100)}"
      crs:Clarity2012="${Math.round((d.clarity ?? 0) * 100)}"
      crs:Dehaze="${Math.round((d.dehaze ?? 0) * 100)}"
      crs:Sharpness="${Math.round((d.sharpness ?? 0) * 100)}"
      crs:LuminanceSmoothing="${Math.round((d.noiseReduction ?? 0) * 100)}"
      crs:GrainAmount="${Math.round((e.grain ?? 0) * 100)}"
      rb:ToneMapper="${state.toneMapper ?? 'none'}"
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

  // ══════════════════════════════════════════════════════════════
  // NODE GRAPH MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  /** Get the current node graph (creates one if needed) */
  get nodeGraph(): NodeGraphV2 {
    // If not yet initialized (shouldn't happen, but safety fallback)
    if (!this._nodeGraph) {
      // Return a safe default — _ensureNodeGraph() should have been called in onActivate
      return { version: 2, selectedNodeId: '', nodes: [], geometry: createDefaultGeometry() };
    }
    return this._nodeGraph;
  }

  /** Get the list of nodes */
  get nodes(): CorrectorNode[] {
    return this._nodeGraph?.nodes ?? [];
  }

  /** Get the currently selected node */
  get selectedNode(): CorrectorNode | undefined {
    return this._nodeGraph?.nodes.find(n => n.id === this.selectedNodeId);
  }

  /** Initialize node graph from current state if not yet created */
  private _ensureNodeGraph(): void {
    if (this._nodeGraph) {
      // Migrate existing v2 graphs without connections (idempotent)
      if (!this._nodeGraph.connections || this._nodeGraph.connections.length === 0) {
        const nodeIds = this._nodeGraph.nodes.map(n => n.id);
        this._nodeGraph.connections = buildSerialConnections(
          nodeIds,
          this._nodeGraph.connections,
        );
        console.log(`[NodeGraph] Migrated ${nodeIds.length} nodes to serial connections`);
      }
      
      // Validate connections on load
      if (hasCycle(this._nodeGraph.connections)) {
        console.error('[NodeGraph] Cycle detected in connections! Graph may not process correctly.');
      }
      
      return;
    }

    // Wrap current develop state into a v2 node graph
    const currentState = this.serialize();
    this._nodeGraph = migrateV1toV2(currentState);
    this.selectedNodeId = this._nodeGraph.selectedNodeId;
  }

  /** Save current panel state to the selected node */
  private _saveCurrentToNode(): void {
    if (!this._nodeGraph || !this.selectedNodeId) return;
    const node = this._nodeGraph.nodes.find(n => n.id === this.selectedNodeId);
    if (!node) return;

    // Serialize current panel state (without geometry — that's global)
    const state = this.serialize() as any;
    delete state.geometry;
    state.version = 1;
    node.state = state as DevelopState;

    // Keep geometry global
    this._nodeGraph.geometry = {
      rotation: this.geoRotation,
      distortion: this.geoDistortion,
      vertical: this.geoVertical,
      horizontal: this.geoHorizontal,
      scale: this.geoScale,
    };
  }

  /** Load a node's state into the develop panel */
  private _loadNodeToPanel(nodeId: string): void {
    const node = this._nodeGraph?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    this._isLoading = true;
    this.deserialize({ ...node.state, geometry: this._nodeGraph!.geometry });
    setTimeout(() => { this._isLoading = false; }, 100);
  }

  /** Select a node — saves current panel to old node, loads new node's state */
  selectNode(nodeId: string): void {
    if (nodeId === this.selectedNodeId) return;

    // Save current panel state to the previously selected node
    this._saveCurrentToNode();

    // Switch selection
    this.selectedNodeId = nodeId;
    if (this._nodeGraph) this._nodeGraph.selectedNodeId = nodeId;

    // Load the new node's state into the panel
    this._loadNodeToPanel(nodeId);
  }

  /** Add a new empty node after the selected node */
  /** Add a new node, optionally after a specific node. Returns new node ID. */
  addNode(afterNodeId?: string): string | null {
    if (!this._nodeGraph || this._nodeGraph.nodes.length >= MAX_NODES) return null;

    // Save current panel to the currently selected node first
    this._saveCurrentToNode();

    // Create new node
    resetNodeCounter(this._nodeGraph.nodes.length);
    const newNode = createNode();

    // Determine position (to the right of afterNode, or last node)
    const afterNode = afterNodeId
      ? this._nodeGraph.nodes.find(n => n.id === afterNodeId)
      : this._nodeGraph.nodes[this._nodeGraph.nodes.length - 1];

    if (afterNode) {
      newNode.position = {
        x: afterNode.position.x + NODE_W + NODE_GAP,
        y: afterNode.position.y,
      };
    } else {
      // First node (use padding constants)
      newNode.position = { x: SIDE_PAD * 3, y: TOP_PAD + 20 };
    }

    // Add to nodes array
    this._nodeGraph.nodes.push(newNode);

    // Update connections (insert in chain)
    if (afterNodeId) {
      insertNodeAfter(this._nodeGraph.connections, newNode.id, afterNodeId);
    } else {
      appendNode(this._nodeGraph.connections, newNode.id);
    }

    // Select the new node (loads empty state into panel)
    this.selectNode(newNode.id);
    return newNode.id;
  }

  /** Delete a node by ID and update connections */
  deleteNode(nodeId: string): boolean {
    if (!this._nodeGraph || this._nodeGraph.nodes.length <= 1) return false;

    const idx = this._nodeGraph.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return false;

    // Remove from nodes array
    this._nodeGraph.nodes.splice(idx, 1);

    // Update connections (reconnect neighbors)
    removeNodeConnections(this._nodeGraph.connections, nodeId);

    // If we deleted the selected node, select the nearest one
    if (this.selectedNodeId === nodeId) {
      const newIdx = Math.min(idx, this._nodeGraph.nodes.length - 1);
      this.selectNode(this._nodeGraph.nodes[newIdx].id);
    }

    return true;
  }

  /** Toggle bypass on a node */
  toggleBypass(nodeId: string): void {
    const node = this._nodeGraph?.nodes.find(n => n.id === nodeId);
    if (node) {
      node.bypass = !node.bypass;
      this._updateMergedPreview();
    }
  }

  /** Recalculate node positions for clean layout */
  private _recalcPositions(): void {
    if (!this._nodeGraph) return;
    const gap = 160 + 24; // NODE_W + NODE_GAP
    for (let i = 0; i < this._nodeGraph.nodes.length; i++) {
      this._nodeGraph.nodes[i].position = { x: i * gap, y: 0 };
    }
  }

  /**
   * Update the preview by merging all nodes.
   * Called after bypass toggle or node reorder.
   * Loads the merged state for non-selected node params but keeps
   * the selected node's state in the panel.
   */
  private _updateMergedPreview(): void {
    // Trigger auto-save which will pick up the changes
    this.scheduleAutoSave();
  }

  /** Check if a specific node has active changes (for red dot) */
  nodeHasChanges(nodeId: string): boolean {
    const node = this._nodeGraph?.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    return hasActiveChanges(node.state);
  }

  async resetAllChanges(): Promise<void> {
    this.exposure = 0;
    this.contrast = 0;
    this.highlights = 0;
    this.shadows = 0;
    this.whites = 0;
    this.blacks = 0;
    this.saturation = 0;
    this.temperature = 0;
    this.sharpness = 0;
    this.noiseReduction = 0;
    this.clarity = 0;
    this.dehaze = 0;
    this.toneMapper = 'none';
    this.vibrance = 0;
    this.tint = 0;
    this.hue = 0;
    this.texture = 0;
    this.vignette = 0;
    this.vignetteMidpoint = 50;
    this.vignetteRoundness = 0;
    this.vignetteFeather = 50;
    this.vignetteHighlights = 0;
    this.grain = 0;
    this.grainSize = 25;
    this.grainRoughness = 50;
    this.fade = 0;

    // Reset geometry
    this.geoRotation = 0;
    this.geoDistortion = 0;
    this.geoVertical = 0;
    this.geoHorizontal = 0;
    this.geoScale = 100;

    // Reset curves
    this.curves.master = [];
    this.curves.red = [];
    this.curves.green = [];
    this.curves.blue = [];

    // Reset curve endpoints
    this.curveEndpoints.master = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.red = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.green = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
    this.curveEndpoints.blue = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };

    this.eyedropperActive = false;

    // Reset color wheels
    this.colorWheels.shadows = { hue: 0, sat: 0, lum: 0 };
    this.colorWheels.midtones = { hue: 0, sat: 0, lum: 0 };
    this.colorWheels.highlights = { hue: 0, sat: 0, lum: 0 };

    // Reset HSL
    Object.keys(this.hsl).forEach((channel) => {
      this.hsl[channel as keyof typeof this.hsl] = { h: 0, s: 0, l: 0 };
    });

    // Reset node graph to single empty node
    resetNodeCounter(0);
    const node = createNode('01');
    this._nodeGraph = {
      version: 2,
      selectedNodeId: node.id,
      nodes: [node],
      geometry: createDefaultGeometry(),
    };
    this.selectedNodeId = node.id;
  }

  /** Save current edits to localStorage for the given asset */
  saveToStorage(assetId: string): void {
    if (!assetId) return;
    const key = `redbulb-edits-${assetId}`;
    if (!this.hasChanges && (!this._nodeGraph || this._nodeGraph.nodes.length <= 1)) {
      localStorage.removeItem(key);
      return;
    }
    // Save v2 if node graph exists, otherwise v1
    const data = this.serializeV2() ?? this.serialize();
    localStorage.setItem(key, JSON.stringify(data));
  }

  /** Load saved edits from localStorage for the given asset. Returns true if found. */
  loadFromStorage(assetId: string): boolean {
    if (!assetId) return false;
    const key = `redbulb-edits-${assetId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.deserialize(data);
      return true;
    } catch {
      return false;
    }
  }

  /** Load saved edits from server (history API — authoritative source). */
  async loadFromServer(assetId: string): Promise<boolean> {
    if (!assetId) return false;
    try {
      const version = await getCurrentVersion(assetId);
      if (version?.state && typeof version.state === 'object') {
        this.deserialize(version.state);
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[RedBulb] Failed to load from server:', error);
      // Will fall back to localStorage in onActivate
      return false;
    }
  }

  /** Check if an asset has saved edits */
  hasSavedEdits(assetId: string): boolean {
    if (!assetId) return false;
    return localStorage.getItem(`redbulb-edits-${assetId}`) !== null;
  }

  /** Delete saved edits for an asset */
  deleteSavedEdits(assetId: string): void {
    if (!assetId) return;
    localStorage.removeItem(`redbulb-edits-${assetId}`);
  }

  getEdits(): EditActions {
    return [];
  }

  /** Serialize all edit state. Returns v2 (node graph) if nodes exist, v1 otherwise. */
  serializeV2(): NodeGraphV2 | null {
    if (!this._nodeGraph) return null;
    // Save current panel state to the selected node before serializing
    this._saveCurrentToNode();
    return JSON.parse(JSON.stringify(this._nodeGraph));
  }

  /** Serialize current PANEL state as v1 (used internally and by workers) */
  /** Serialize current PANEL state as flat canonical format */
  serialize(): Record<string, unknown> {
    return {
      // 13 top-level scalars
      exposure: this.exposure,
      contrast: this.contrast,
      highlights: this.highlights,
      shadows: this.shadows,
      whites: this.whites,
      blacks: this.blacks,
      temperature: this.temperature,
      tint: this.tint,
    hue: this.hue,
      saturation: this.saturation,
      vibrance: this.vibrance,
      hue: this.hue,
      clarity: this.clarity,
      dehaze: this.dehaze,

      // Optional details (texture moved here from effects)
      details: {
        texture: this.texture,
        sharpness: this.sharpness,
        noiseReduction: this.noiseReduction,
        clarity: this.clarity,
      },

      // Optional effects (no texture)
      effects: {
        vignette: this.vignette,
        vignetteMidpoint: this.vignetteMidpoint,
        vignetteRoundness: this.vignetteRoundness,
        vignetteFeather: this.vignetteFeather,
        vignetteHighlights: this.vignetteHighlights,
        grain: this.grain,
        grainSize: this.grainSize,
        grainRoughness: this.grainRoughness,
        fade: this.fade,
      },

      toneMapper: this.toneMapper,
      geometry: {
        rotation: this.geoRotation,
        distortion: this.geoDistortion,
        vertical: this.geoVertical,
        horizontal: this.geoHorizontal,
        scale: this.geoScale,
      },
      curves: JSON.parse(JSON.stringify(this.curves)),
      curveEndpoints: JSON.parse(JSON.stringify(this.curveEndpoints)),
      colorWheels: JSON.parse(JSON.stringify(this.colorWheels)),
      hsl: JSON.parse(JSON.stringify(this.hsl)),
    };
  }

  /** Restore all edit state from a serialized JSON object (v1 or v2) */
  deserialize(data: Record<string, unknown>): void {
    if (!data || typeof data !== 'object') return;
    const d = data as any;

    // Handle v2 node graph
    if (d.version === 2 && Array.isArray(d.nodes)) {
      this._nodeGraph = JSON.parse(JSON.stringify(d)) as NodeGraphV2;
      this.selectedNodeId = d.selectedNodeId || d.nodes[0]?.id || '';
      // Load geometry (global)
      if (d.geometry) {
        this.geoRotation = d.geometry.rotation ?? 0;
        this.geoDistortion = d.geometry.distortion ?? 0;
        this.geoVertical = d.geometry.vertical ?? 0;
        this.geoHorizontal = d.geometry.horizontal ?? 0;
        this.geoScale = d.geometry.scale ?? 100;
      }
      // Load selected node's state into panel
      const selectedNode = this._nodeGraph!.nodes.find(n => n.id === this.selectedNodeId);
      if (selectedNode) {
        this._deserializeV1(selectedNode.state as any);
      }
      return;
    }

    // Handle v1 (single state)
    this._deserializeV1(d);
  }

  /** Internal: deserialize v1 panel state */
  /** Internal: deserialize panel state (auto-migrates V1 nested → flat) */
  private _deserializeV1(d: any): void {
    // Auto-detect V1 nested format and migrate to flat
    const flat: any = isDevelopStateV1(d) ? autoMigrateDevelopState(d) : d;

    // 13 top-level scalars
    this.exposure = flat.exposure ?? 0;
    this.contrast = flat.contrast ?? 0;
    this.highlights = flat.highlights ?? 0;
    this.shadows = flat.shadows ?? 0;
    this.whites = flat.whites ?? 0;
    this.blacks = flat.blacks ?? 0;
    this.temperature = flat.temperature ?? 0;
    this.tint = flat.tint ?? 0;
    this.saturation = flat.saturation ?? 0;
    this.vibrance = flat.vibrance ?? 0;
    this.hue = flat.hue ?? 0;
    this.clarity = flat.clarity ?? 0;
    this.dehaze = flat.dehaze ?? 0;

    // Tone mapper
    this.toneMapper = flat.toneMapper ?? 'none';

    // Optional details group
    if (flat.details) {
      this.texture = flat.details.texture ?? 0;
      this.sharpness = flat.details.sharpness ?? 0;
      this.noiseReduction = flat.details.noiseReduction ?? 0;
    }

    // Optional effects group
    if (flat.effects) {
      this.vignette = flat.effects.vignette ?? 0;
      this.vignetteMidpoint = flat.effects.vignetteMidpoint ?? 50;
      this.vignetteRoundness = flat.effects.vignetteRoundness ?? 0;
      this.vignetteFeather = flat.effects.vignetteFeather ?? 50;
      this.vignetteHighlights = flat.effects.vignetteHighlights ?? 0;
      this.grain = flat.effects.grain ?? 0;
      this.grainSize = flat.effects.grainSize ?? 25;
      this.grainRoughness = flat.effects.grainRoughness ?? 50;
      this.fade = flat.effects.fade ?? 0;
    }

    // Geometry
    if (flat.geometry) {
      this.geoRotation = flat.geometry.rotation ?? 0;
      this.geoDistortion = flat.geometry.distortion ?? 0;
      this.geoVertical = flat.geometry.vertical ?? 0;
      this.geoHorizontal = flat.geometry.horizontal ?? 0;
      this.geoScale = flat.geometry.scale ?? 100;
    }

    // Curves
    if (flat.curves) {
      this.curves.master = flat.curves.master ?? [];
      this.curves.red = flat.curves.red ?? [];
      this.curves.green = flat.curves.green ?? [];
      this.curves.blue = flat.curves.blue ?? [];
    }

    // Curve endpoints
    if (flat.curveEndpoints) {
      const defEp = { black: { x: 0, y: 0 }, white: { x: 1, y: 1 } };
      this.curveEndpoints.master = flat.curveEndpoints.master ?? defEp;
      this.curveEndpoints.red = flat.curveEndpoints.red ?? defEp;
      this.curveEndpoints.green = flat.curveEndpoints.green ?? defEp;
      this.curveEndpoints.blue = flat.curveEndpoints.blue ?? defEp;
    }

    // Color wheels
    if (flat.colorWheels) {
      this.colorWheels.shadows = flat.colorWheels.shadows ?? { hue: 0, sat: 0, lum: 0 };
      this.colorWheels.midtones = flat.colorWheels.midtones ?? { hue: 0, sat: 0, lum: 0 };
      this.colorWheels.highlights = flat.colorWheels.highlights ?? { hue: 0, sat: 0, lum: 0 };
    }

    // HSL
    if (flat.hsl) {
      for (const channel of Object.keys(this.hsl)) {
        if (flat.hsl[channel]) {
          this.hsl[channel] = flat.hsl[channel];
        }
      }
    }
  }
}

export const developManager = new DevelopManager();
