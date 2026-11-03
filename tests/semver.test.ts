import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain JavaScript module shared with the release scripts.
import { compare, isVersion, latest } from '../scripts/semver.mjs';

describe('compare', () => {
  it.each([
    ['1.0.0', '0.9.9'],
    ['0.10.0', '0.9.0'],
    ['1.0.0', '1.0.0-rc.1'],
    ['1.0.0-rc.2', '1.0.0-rc.1'],
    ['1.0.0-rc.10', '1.0.0-rc.9'],
    ['1.0.0-beta', '1.0.0-alpha'],
    ['1.0.0-alpha.1', '1.0.0-alpha'],
    ['1.0.0-alpha.beta', '1.0.0-alpha.1'],
  ])('%s is newer than %s', (newer, older) => {
    expect(compare(newer, older)).toBeGreaterThan(0);
    expect(compare(older, newer)).toBeLessThan(0);
  });

  it('treats equal versions as equal', () => {
    expect(compare('1.2.3', '1.2.3')).toBe(0);
    expect(compare('1.2.3-rc.1', '1.2.3-rc.1')).toBe(0);
  });

  it('refuses things that are not versions', () => {
    expect(() => compare('1.2', '1.2.0')).toThrow();
    expect(isVersion('v1.2.0')).toBe(false);
    expect(isVersion('1.2.0')).toBe(true);
  });
});

describe('latest', () => {
  it('picks the highest version tag and ignores others', () => {
    expect(latest(['v0.9.0', 'v0.10.0', 'v1.0.0-rc.1', 'nightly', ''])).toBe('1.0.0-rc.1');
    expect(latest(['v1.0.0-rc.1', 'v1.0.0'])).toBe('1.0.0');
  });

  it('returns null before the first release', () => {
    expect(latest([''])).toBeNull();
  });
});
