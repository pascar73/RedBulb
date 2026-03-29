<script lang="ts">
  import type { AssetResponseDto } from '@immich/sdk';

  interface Props {
    asset: AssetResponseDto;
  }

  let { asset }: Props = $props();

  const exif = $derived(asset.exifInfo);

  function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('en-GB', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return d; }
  }

  function getMegapixels(w: number | null | undefined, h: number | null | undefined): string {
    if (!w || !h) return '—';
    return `${(w * h / 1_000_000).toFixed(1)} MP`;
  }

  function formatGPS(lat: number | null | undefined, lng: number | null | undefined): string {
    if (lat == null || lng == null) return '—';
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
  }

  function formatExposure(t: string | null | undefined): string {
    if (!t) return '—';
    return `${t}s`;
  }

  function formatAperture(f: number | null | undefined): string {
    if (!f) return '—';
    return `ƒ/${f}`;
  }

  function formatFocal(f: number | null | undefined): string {
    if (!f) return '—';
    return `${f}mm`;
  }

  // Calculate print sizes at common DPIs
  const printSizes = $derived.by(() => {
    const w = exif?.exifImageWidth;
    const h = exif?.exifImageHeight;
    if (!w || !h) return null;
    return [72, 150, 300].map(dpi => ({
      dpi,
      widthIn: (w / dpi).toFixed(1),
      heightIn: (h / dpi).toFixed(1),
      widthCm: (w / dpi * 2.54).toFixed(1),
      heightCm: (h / dpi * 2.54).toFixed(1),
    }));
  });

  // File extension
  const fileExt = $derived(asset.originalFileName?.split('.').pop()?.toUpperCase() ?? '—');

  interface InfoRow { label: string; value: string | number | null | undefined }

  const cameraRows = $derived<InfoRow[]>([
    { label: 'Camera', value: [exif?.make, exif?.model].filter(Boolean).join(' ') || null },
    { label: 'Lens', value: exif?.lensModel },
    { label: 'Focal Length', value: exif?.focalLength ? `${exif.focalLength}mm` : null },
    { label: 'Aperture', value: exif?.fNumber ? `ƒ/${exif.fNumber}` : null },
    { label: 'Shutter Speed', value: exif?.exposureTime ? `${exif.exposureTime}s` : null },
    { label: 'ISO', value: exif?.iso },
  ]);

  const fileRows = $derived<InfoRow[]>([
    { label: 'Filename', value: asset.originalFileName },
    { label: 'Format', value: fileExt },
    { label: 'File Size', value: formatFileSize(exif?.fileSizeInByte) },
    { label: 'Dimensions', value: exif?.exifImageWidth && exif?.exifImageHeight ? `${exif.exifImageWidth} × ${exif.exifImageHeight}` : null },
    { label: 'Megapixels', value: getMegapixels(exif?.exifImageWidth, exif?.exifImageHeight) },
    { label: 'Orientation', value: exif?.orientation },
  ]);

  const dateRows = $derived<InfoRow[]>([
    { label: 'Date Taken', value: formatDate(exif?.dateTimeOriginal) },
    { label: 'Date Modified', value: formatDate(exif?.modifyDate) },
    { label: 'Time Zone', value: exif?.timeZone },
  ]);

  const locationRows = $derived<InfoRow[]>([
    { label: 'GPS', value: formatGPS(exif?.latitude, exif?.longitude) },
    { label: 'City', value: exif?.city },
    { label: 'State', value: exif?.state },
    { label: 'Country', value: exif?.country },
  ]);

  const otherRows = $derived<InfoRow[]>([
    { label: 'Description', value: exif?.description },
    { label: 'Rating', value: exif?.rating != null ? '★'.repeat(exif.rating) + '☆'.repeat(5 - exif.rating) : null },
    { label: 'Asset ID', value: asset.id?.substring(0, 8) + '...' },
  ]);
</script>

<div class="info-panel">
  <!-- Camera & Lens -->
  <div class="info-section">
    <h3 class="section-title">📷 Camera & Lens</h3>
    {#each cameraRows as row}
      {#if row.value}
        <div class="info-row">
          <span class="info-label">{row.label}</span>
          <span class="info-value">{row.value}</span>
        </div>
      {/if}
    {/each}
    {#if !cameraRows.some(r => r.value)}
      <p class="no-data">No camera data available</p>
    {/if}
  </div>

  <!-- Exposure Triangle (visual) -->
  {#if exif?.exposureTime || exif?.fNumber || exif?.iso}
    <div class="info-section">
      <h3 class="section-title">🔆 Exposure</h3>
      <div class="exposure-triangle">
        {#if exif?.exposureTime}
          <div class="exposure-item">
            <span class="exposure-value">{exif.exposureTime}s</span>
            <span class="exposure-label">Shutter</span>
          </div>
        {/if}
        {#if exif?.fNumber}
          <div class="exposure-item">
            <span class="exposure-value">ƒ/{exif.fNumber}</span>
            <span class="exposure-label">Aperture</span>
          </div>
        {/if}
        {#if exif?.iso}
          <div class="exposure-item">
            <span class="exposure-value">{exif.iso}</span>
            <span class="exposure-label">ISO</span>
          </div>
        {/if}
        {#if exif?.focalLength}
          <div class="exposure-item">
            <span class="exposure-value">{exif.focalLength}mm</span>
            <span class="exposure-label">Focal</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- File Details -->
  <div class="info-section">
    <h3 class="section-title">📄 File</h3>
    {#each fileRows as row}
      {#if row.value}
        <div class="info-row">
          <span class="info-label">{row.label}</span>
          <span class="info-value">{row.value}</span>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Print Sizes -->
  {#if printSizes}
    <div class="info-section">
      <h3 class="section-title">🖨️ Print Sizes</h3>
      <div class="print-table">
        <div class="print-header">
          <span>DPI</span>
          <span>Inches</span>
          <span>cm</span>
        </div>
        {#each printSizes as ps}
          <div class="print-row">
            <span class="print-dpi">{ps.dpi}</span>
            <span>{ps.widthIn}" × {ps.heightIn}"</span>
            <span>{ps.widthCm} × {ps.heightCm}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Date & Time -->
  <div class="info-section">
    <h3 class="section-title">📅 Date & Time</h3>
    {#each dateRows as row}
      {#if row.value && row.value !== '—'}
        <div class="info-row">
          <span class="info-label">{row.label}</span>
          <span class="info-value">{row.value}</span>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Location -->
  {#if locationRows.some(r => r.value && r.value !== '—')}
    <div class="info-section">
      <h3 class="section-title">📍 Location</h3>
      {#each locationRows as row}
        {#if row.value && row.value !== '—'}
          <div class="info-row">
            <span class="info-label">{row.label}</span>
            <span class="info-value">{row.value}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Other -->
  <div class="info-section">
    <h3 class="section-title">ℹ️ Other</h3>
    {#each otherRows as row}
      {#if row.value && row.value !== '—'}
        <div class="info-row">
          <span class="info-label">{row.label}</span>
          <span class="info-value">{row.value}</span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .info-panel {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .info-section {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #999;
    margin-bottom: 10px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 3px 0;
    gap: 12px;
  }

  .info-label {
    font-size: 12px;
    color: #888;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .info-value {
    font-size: 12px;
    color: #e0e0e0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    word-break: break-all;
  }

  .no-data {
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  /* Exposure triangle visual */
  .exposure-triangle {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
    gap: 8px;
  }

  .exposure-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .exposure-value {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .exposure-label {
    font-size: 10px;
    color: #888;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Print sizes table */
  .print-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .print-header {
    display: grid;
    grid-template-columns: 40px 1fr 1fr;
    gap: 8px;
    font-size: 10px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .print-row {
    display: grid;
    grid-template-columns: 40px 1fr 1fr;
    gap: 8px;
    font-size: 12px;
    color: #ccc;
    padding: 3px 0;
    font-variant-numeric: tabular-nums;
  }

  .print-dpi {
    color: #999;
    font-weight: 500;
  }
</style>
