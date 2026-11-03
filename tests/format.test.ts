import { describe, expect, it } from 'vitest';
import { formatDuration, formatSize } from '@/lib/format';

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
