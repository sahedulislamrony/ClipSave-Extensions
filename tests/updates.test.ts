import { describe, expect, it, vi } from 'vitest';
import {
  available,
  CHECK_EVERY_MS,
  checkNow,
  compareVersions,
  compareYtDlp,
  extensionAsset,
  isDue,
  latestRelease,
  limitMessage,
  NO_UPDATE_STATE,
  REPO_URL,
  type Release,
  type UpdateState,
} from '@/lib/updates';

describe('compareVersions', () => {
  it('orders versions the semver way', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.10')).toBe(-1);
  });

  it('puts anything that is not a version last', () => {
    expect(compareVersions('nonsense', '0.0.1')).toBe(-1);
  });
});

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
}

describe('latestRelease', () => {
  it('reads the version and the files of the newest release', async () => {
    const zip = `${REPO_URL}/releases/download/v1.2.0/ClipSave-1.2.0-chrome-unpacked.zip`;
    const release = await latestRelease(
      reply(200, {
        tag_name: 'v1.2.0',
        html_url: `${REPO_URL}/releases/tag/v1.2.0`,
        published_at: '2026-11-10T00:00:00Z',
        assets: [{ name: 'ClipSave-1.2.0-chrome-unpacked.zip', browser_download_url: zip }, { name: 'broken' }],
      }),
    );
    expect(release.version).toBe('1.2.0');
    expect(release.url).toBe(`${REPO_URL}/releases/tag/v1.2.0`);
    expect(release.assets).toEqual([{ name: 'ClipSave-1.2.0-chrome-unpacked.zip', url: zip }]);
  });

  it('keeps only links into this repository', async () => {
    const release = await latestRelease(
      reply(200, {
        tag_name: 'v1.2.0',
        html_url: 'https://evil.example/releases/tag/v1.2.0',
        assets: [
          { name: 'ClipSave-1.2.0-chrome-unpacked.zip', browser_download_url: 'https://evil.example/c.zip' },
          { name: 'ClipSave-1.2.0-firefox.zip', browser_download_url: `javascript:alert(1)//${REPO_URL}/releases/download/` },
        ],
      }),
    );
    expect(release.url).toBe(`${REPO_URL}/releases/latest`);
    expect(release.assets).toEqual([]);
  });

  it('explains failures in plain words', async () => {
    await expect(latestRelease(reply(403, {}, { 'x-ratelimit-remaining': '0' }))).rejects.toThrow(/limiting/);
    await expect(latestRelease(reply(403, {}))).rejects.toThrow('GitHub answered 403');
    await expect(latestRelease(reply(200, { tag_name: 'nightly' }))).rejects.toThrow(/no version/);
    await expect(latestRelease(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))).rejects.toThrow(/reach GitHub/);
  });
});

describe('limitMessage', () => {
  const now = Date.UTC(2026, 10, 9, 10, 0, 0);
  const limited = (headers: Record<string, string>, status = 403) => new Response(null, { status, headers });

  it('says when GitHub lifts the limit', () => {
    const reset = String(now / 1000 + 16 * 60 - 10);
    expect(limitMessage(limited({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }), now)).toBe(
      'GitHub is limiting checks from your network right now. Try again in 16 minutes.',
    );
    expect(limitMessage(limited({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 20) }), now)).toMatch(
      /in a minute\.$/,
    );
  });

  it('follows Retry-After, and falls back to an hour without a time', () => {
    expect(limitMessage(limited({ 'retry-after': '120' }), now)).toMatch(/in 2 minutes\.$/);
    expect(limitMessage(limited({}, 429), now)).toMatch(/in an hour\.$/);
    expect(limitMessage(limited({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }), now)).toMatch(/in an hour\.$/);
  });

  it('leaves other refusals alone', () => {
    expect(limitMessage(limited({}), now)).toBeNull();
    expect(limitMessage(limited({ 'x-ratelimit-remaining': '12' }), now)).toBeNull();
    expect(limitMessage(new Response('{}', { status: 200 }), now)).toBeNull();
  });
});

describe('extensionAsset', () => {
  const release: Release = {
    version: '1.2.0',
    url: '',
    publishedAt: null,
    assets: [
      { name: 'ClipSave-1.2.0-chrome.zip', url: 'store' },
      { name: 'ClipSave-1.2.0-chrome-unpacked.zip', url: 'unpacked' },
      { name: 'ClipSave-1.2.0-firefox.zip', url: 'ff-zip' },
    ],
  };

  it('picks the unpacked zip for Chromium browsers', () => {
    expect(extensionAsset(release, false)?.url).toBe('unpacked');
  });

  it('prefers the signed add-on for Firefox', () => {
    expect(extensionAsset(release, true)?.url).toBe('ff-zip');
    const signed = { ...release, assets: [...release.assets, { name: 'ClipSave-1.2.0-firefox.xpi', url: 'xpi' }] };
    expect(extensionAsset(signed, true)?.url).toBe('xpi');
  });
});

describe('yt-dlp versions', () => {
  it('compares dates and same-day fixes', () => {
    expect(compareYtDlp('2026.11.02', '2026.10.26')).toBe(1);
    expect(compareYtDlp('2026.10.26.1', '2026.10.26')).toBe(1);
    expect(compareYtDlp('2026.10.26', '2026.10.26')).toBe(0);
  });
});

describe('available', () => {
  const state = (version: string | null, ytDlp: string | null): UpdateState => ({
    checkedAt: 1,
    release: version ? { version, url: '', publishedAt: null, assets: [] } : null,
    ytDlp,
    error: null,
  });

  it('finds a newer ClipSave for either part', () => {
    expect(available(state('1.2.0', null), { extension: '1.1.0', helper: '1.2.0' })).toMatchObject({ extension: true, helper: false, version: '1.2.0' });
    expect(available(state('1.2.0', null), { extension: '1.2.0', helper: '1.1.0' })).toMatchObject({ extension: false, helper: true, version: '1.2.0' });
    expect(available(state('1.2.0', null), { extension: '1.2.0', helper: '1.2.0' }).version).toBeNull();
  });

  it('offers yt-dlp alone only when the helper itself is current', () => {
    expect(available(state('1.1.0', '2026.11.02'), { extension: '1.1.0', helper: '1.1.0', ytDlp: '2026.10.26' }).ytDlp).toBe(true);
    expect(available(state('1.2.0', '2026.11.02'), { extension: '1.1.0', helper: '1.1.0', ytDlp: '2026.10.26' }).ytDlp).toBe(false);
  });

  it('knows nothing about a helper that never answered', () => {
    expect(available(state('1.2.0', null), { extension: '1.2.0', helper: null }).helper).toBe(false);
  });
});

describe('automatic checks', () => {
  it('are due once a day', () => {
    expect(isDue(NO_UPDATE_STATE, 5)).toBe(true);
    expect(isDue({ ...NO_UPDATE_STATE, checkedAt: 0 }, CHECK_EVERY_MS - 1)).toBe(false);
    expect(isDue({ ...NO_UPDATE_STATE, checkedAt: 0 }, CHECK_EVERY_MS)).toBe(true);
  });

  it('keep what one check found when the other fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('yt-dlp')
        ? new Response(JSON.stringify({ tag_name: '2026.11.02' }))
        : new Response('{}', { status: 500 }),
    );
    const result = await checkNow(fetcher, 42);
    expect(result).toMatchObject({ checkedAt: 42, release: null, ytDlp: '2026.11.02' });
    expect(result.error).toMatch(/500/);
  });
});
