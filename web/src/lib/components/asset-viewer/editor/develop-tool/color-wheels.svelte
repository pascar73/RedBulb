<script lang="ts">
  import { developManager } from '$lib/managers/edit/develop-manager.svelte';

  type WheelKey = 'shadows' | 'midtones' | 'highlights';

  const wheels: { key: WheelKey; label: string }[] = [
    { key: 'shadows', label: 'Shadows' },
    { key: 'midtones', label: 'Midtones' },
    { key: 'highlights', label: 'Highlights' },
  ];

  const WHEEL_SIZE = 80;
  const WHEEL_RADIUS = WHEEL_SIZE / 2;
  const POINT_RADIUS = 5;
  const MAX_OFFSET = WHEEL_RADIUS - POINT_RADIUS - 2;

  let dragging = $state<WheelKey | null>(null);

  function getPointPosition(key: WheelKey): { x: number; y: number } {
    const w = developManager.colorWheels[key];
    const angle = (w.hue * Math.PI) / 180;
    const dist = w.sat * MAX_OFFSET;
    return {
      x: WHEEL_RADIUS + Math.cos(angle) * dist,
      y: WHEEL_RADIUS - Math.sin(angle) * dist,
    };
  }

  function updateFromPosition(key: WheelKey, clientX: number, clientY: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left - WHEEL_RADIUS;
    const y = -(clientY - rect.top - WHEEL_RADIUS);

    const dist = Math.sqrt(x * x + y * y);
    const clampedDist = Math.min(dist, MAX_OFFSET);
    const sat = clampedDist / MAX_OFFSET;

    let hue = (Math.atan2(y, x) * 180) / Math.PI;
    if (hue < 0) hue += 360;

    developManager.colorWheels[key].hue = Math.round(hue * 10) / 10;
    developManager.colorWheels[key].sat = Math.round(sat * 100) / 100;
  }

  function handleMouseDown(key: WheelKey, event: MouseEvent) {
    event.preventDefault();
    dragging = key;
    const svg = (event.currentTarget as Element).closest('svg') as SVGSVGElement;
    updateFromPosition(key, event.clientX, event.clientY, svg);

    const handleMove = (e: MouseEvent) => {
      if (dragging === key) {
        updateFromPosition(key, e.clientX, e.clientY, svg);
      }
    };
    const handleUp = () => {
      dragging = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function handleTouchStart(key: WheelKey, event: TouchEvent) {
    event.preventDefault();
    dragging = key;
    const svg = (event.currentTarget as Element).closest('svg') as SVGSVGElement;
    const touch = event.touches[0];
    updateFromPosition(key, touch.clientX, touch.clientY, svg);

    const handleMove = (e: TouchEvent) => {
      if (dragging === key && e.touches.length > 0) {
        updateFromPosition(key, e.touches[0].clientX, e.touches[0].clientY, svg);
      }
    };
    const handleEnd = () => {
      dragging = null;
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  }

  function resetWheel(key: WheelKey) {
    developManager.colorWheels[key] = { hue: 0, sat: 0, lum: 0 };
  }

  function wheelHasChanges(key: WheelKey): boolean {
    const w = developManager.colorWheels[key];
    return w.hue !== 0 || w.sat !== 0 || w.lum !== 0;
  }

  function generateConicGradient(): string {
    // Build SVG conic gradient approximation using radial slices
    const stops: string[] = [];
    for (let i = 0; i <= 360; i += 10) {
      const hue = i;
      stops.push(`hsl(${hue}, 70%, 50%)`);
    }
    return stops.join(', ');
  }
</script>

<div class="color-wheels-container">
  {#each wheels as wheel}
    {@const pos = getPointPosition(wheel.key)}
    {@const hasChanges = wheelHasChanges(wheel.key)}
    <div class="wheel-column">
      <span class="wheel-label" class:modified={hasChanges}>{wheel.label}</span>

      <svg
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        viewBox="0 0 {WHEEL_SIZE} {WHEEL_SIZE}"
        class="wheel-svg"
        role="slider"
        tabindex="0"
        aria-label="{wheel.label} color wheel"
        onmousedown={(e) => handleMouseDown(wheel.key, e)}
        ontouchstart={(e) => handleTouchStart(wheel.key, e)}
        ondblclick={() => resetWheel(wheel.key)}
      >
        <!-- Wheel background - conic color gradient approximation -->
        <defs>
          <radialGradient id="fade-{wheel.key}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgb(128,128,128)" stop-opacity="1" />
            <stop offset="100%" stop-color="rgb(128,128,128)" stop-opacity="0" />
          </radialGradient>
          <clipPath id="clip-{wheel.key}">
            <circle cx={WHEEL_RADIUS} cy={WHEEL_RADIUS} r={WHEEL_RADIUS - 1} />
          </clipPath>
        </defs>

        <!-- Color ring using path segments -->
        {#each Array(36) as _, i}
          {@const angle1 = (i * 10 * Math.PI) / 180}
          {@const angle2 = ((i + 1) * 10 * Math.PI) / 180}
          {@const r = WHEEL_RADIUS - 1}
          <path
            d="M {WHEEL_RADIUS} {WHEEL_RADIUS}
               L {WHEEL_RADIUS + Math.cos(angle1) * r} {WHEEL_RADIUS - Math.sin(angle1) * r}
               A {r} {r} 0 0 0 {WHEEL_RADIUS + Math.cos(angle2) * r} {WHEEL_RADIUS - Math.sin(angle2) * r}
               Z"
            fill="hsl({i * 10}, 60%, 45%)"
            opacity="0.6"
          />
        {/each}

        <!-- Center fade to gray -->
        <circle cx={WHEEL_RADIUS} cy={WHEEL_RADIUS} r={WHEEL_RADIUS - 1} fill="url(#fade-{wheel.key})" />

        <!-- Outer ring border -->
        <circle cx={WHEEL_RADIUS} cy={WHEEL_RADIUS} r={WHEEL_RADIUS - 1} fill="none" stroke="#555" stroke-width="1" />

        <!-- Crosshair lines -->
        <line x1={WHEEL_RADIUS} y1="2" x2={WHEEL_RADIUS} y2={WHEEL_SIZE - 2} stroke="#444" stroke-width="0.5" />
        <line x1="2" y1={WHEEL_RADIUS} x2={WHEEL_SIZE - 2} y2={WHEEL_RADIUS} stroke="#444" stroke-width="0.5" />

        <!-- Control point -->
        <circle
          cx={pos.x}
          cy={pos.y}
          r={POINT_RADIUS}
          fill={hasChanges ? `hsl(${developManager.colorWheels[wheel.key].hue}, 80%, 60%)` : '#aaa'}
          stroke="#fff"
          stroke-width="1.5"
          class="control-point"
          class:active={dragging === wheel.key}
        />
      </svg>

      <!-- Luminance slider -->
      <div class="lum-slider-row">
        <span class="lum-icon">☀</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          bind:value={developManager.colorWheels[wheel.key].lum}
          class="lum-slider"
          ondblclick={() => { developManager.colorWheels[wheel.key].lum = 0; }}
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .color-wheels-container {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    padding: 4px 0;
  }

  .wheel-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .wheel-label {
    font-size: 10px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.15s;
  }

  .wheel-label.modified {
    color: #ddd;
  }

  .wheel-svg {
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .wheel-svg:focus {
    outline: 1px solid #666;
    outline-offset: 2px;
    border-radius: 50%;
  }

  .control-point {
    cursor: grab;
    transition: r 0.1s;
  }

  .control-point.active {
    cursor: grabbing;
    r: 6;
  }

  .lum-slider-row {
    display: flex;
    align-items: center;
    gap: 3px;
    width: 100%;
    margin-top: 4px;
  }

  .lum-icon {
    font-size: 9px;
    color: #666;
    flex-shrink: 0;
  }

  .lum-slider {
    width: 100%;
    height: 3px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right, #222, #888, #ddd);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .lum-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ccc;
    border: 1px solid #888;
    cursor: pointer;
  }

  .lum-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ccc;
    border: 1px solid #888;
    cursor: pointer;
  }
</style>
