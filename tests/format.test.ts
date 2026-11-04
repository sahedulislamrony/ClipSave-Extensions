import { describe, expect, it } from 'vitest';
import { estimateBytes, formatDuration, formatSize, numberPrefix } from '@/lib/format';

describe('formatSize', () => {
  it('shows megabytes and gigabytes with one decimal', () => {
    expect(formatSize(1_048_576)).toBe('1.0 MB');
    expect(formatSize(214_000_000)).toBe('204.1 MB');
    expect(formatSize(1024 * 1_048_576 * 1.5)).toBe('1.5 GB');
  });

  it('shows nothing for unknown or empty sizes', () => {
    expect(formatSize(null)).toBeNull();
    expect(formatSize(0)).toBeNull();
    expect(formatSize(-5)).toBeNull();
  });
});

describe('estimateBytes', () => {
  it('uses the same bitrates as the app', () => {
    // 10 minutes of 1080p at 3 Mbit/s.
    expect(estimateBytes({ kind: 'video', height: 1080 }, [600])).toBe(225_000_000);
    expect(estimateBytes({ kind: 'audio', format: 'mp3' }, [60, 60])).toBe(3_675_000);
    expect(estimateBytes({ kind: 'video', height: 2160 }, [8])).toBe(6_000_000);
  });

  it('counts unknown lengths as nothing', () => {
    expect(estimateBytes({ kind: 'best' }, [null, undefined, 0])).toBe(0);
  });
});

describe('numberPrefix', () => {
  it('numbers like the app, padded to the playlist length', () => {
    expect(numberPrefix(6, 12, 'asc')).toBe('07 - ');
    expect(numberPrefix(0, 12, 'desc')).toBe('12 - ');
    expect(numberPrefix(11, 12, 'desc')).toBe('01 - ');
    expect(numberPrefix(0, 9, 'asc')).toBe('1 - ');
    expect(numberPrefix(4, 182, 'asc')).toBe('005 - ');
    expect(numberPrefix(3, 12, 'none')).toBe('');
  });
});

describe('formatDuration', () => {
  it('pads minutes and seconds', () => {
    expect(formatDuration(19)).toBe('0:19');
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('shows nothing for unknown durations', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});
