import type { Numbering, Quality } from './types';

export function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  const mb = bytes / 1_048_576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

/**
 * Typical bits per second for a quality, for estimating a size before any video is read. Same numbers
 * as the Android app: YouTube's H.264 + AAC streams, which the helper prefers.
 */
export function bitrate(quality: Quality): number {
  if (quality.kind === 'audio') return quality.format === 'mp3' ? 245_000 : 130_000;
  if (quality.kind === 'best') return 4_000_000;
  const h = quality.height;
  if (h > 1080) return 6_000_000;
  if (h > 720) return 3_000_000;
  if (h > 480) return 1_700_000;
  if (h > 360) return 900_000;
  return 600_000;
}

/** Approximate bytes for videos of these lengths at `quality`. Unknown lengths count as zero. */
export function estimateBytes(quality: Quality, durations: (number | null | undefined)[]): number {
  const seconds = durations.reduce<number>((sum, d) => sum + (d && d > 0 ? d : 0), 0);
  return Math.round((seconds * bitrate(quality)) / 8);
}

/**
 * The number in front of a playlist file: "07 - " for the 7th of 10–99, counting down with `desc`.
 * `index` is the 0-based playlist position. Zero-padded to the width of `total`, like the app, so a file
 * manager sorting by name keeps playlist order.
 */
export function numberPrefix(index: number, total: number, numbering: Numbering): string {
  if (numbering === 'none') return '';
  const n = numbering === 'asc' ? index + 1 : total - index;
  return `${String(n).padStart(String(total).length, '0')} - `;
}

export function formatDuration(sec: number | null): string | null {
  if (sec === null || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
