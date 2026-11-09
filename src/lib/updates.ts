/** Finding out whether a newer ClipSave is out. Asked only when the person clicks Check for updates. */

export const REPO = 'sahedulislamrony/ClipSave-Extensions';
export const REPO_URL = `https://github.com/${REPO}`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface Release {
  version: string;
  url: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
}

const PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Negative when a < b, positive when a > b, zero when equal, by the Semantic Versioning rules. The same
 * rules as scripts/semver.mjs, which the release scripts use. Anything that isn't a version sorts lowest.
 */
export function compareVersions(a: string, b: string): number {
  const pa = PATTERN.exec(a.replace(/^v/, ''));
  const pb = PATTERN.exec(b.replace(/^v/, ''));
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff) return Math.sign(diff);
  }
  const [preA, preB] = [pa[4], pb[4]];
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const [x, y] = [idsA[i], idsB[i]];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny && Number(x) !== Number(y)) return Math.sign(Number(x) - Number(y));
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * GitHub answers 60 unsigned requests an hour per internet address, shared by everything on that address
 * (other apps, everyone on the same network). When a refusal is that limit, says so, with when it lifts.
 */
export function limitMessage(response: Response, now = Date.now()): string | null {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = Number(response.headers.get('retry-after'));
  if (response.status !== 429 && !(response.status === 403 && (remaining === '0' || retryAfter > 0))) return null;
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
  const wait = retryAfter > 0 ? retryAfter * 1000 : reset - now;
  const minutes = wait > 0 ? Math.ceil(wait / 60_000) : null;
  const when = minutes === null || minutes > 60 ? 'in an hour' : minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
  return `GitHub is limiting checks from your network right now. Try again ${when}.`;
}

export async function latestRelease(fetcher: typeof fetch = fetch): Promise<Release> {
  let response: Response;
  try {
    response = await fetcher(LATEST_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  } catch {
    throw new Error("Couldn't reach GitHub. Check your internet connection and try again.");
  }
  const limited = limitMessage(response);
  if (limited) throw new Error(limited);
  if (!response.ok) throw new Error(`GitHub answered ${response.status}. Try again later.`);
  const body = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string | null;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const version = (body.tag_name ?? '').replace(/^v/, '');
  if (!PATTERN.test(version)) throw new Error("GitHub's answer had no version in it.");
  // Settings links to these, so only links into this repository's own releases are kept.
  const ours = (url: string | undefined, prefix: string): url is string => !!url && url.startsWith(prefix);
  return {
    version,
    url: ours(body.html_url, `${REPO_URL}/releases/`) ? body.html_url : `${REPO_URL}/releases/latest`,
    publishedAt: body.published_at ?? null,
    assets: (body.assets ?? [])
      .filter((asset) => asset.name && ours(asset.browser_download_url, `${REPO_URL}/releases/download/`))
      .map((asset) => ({ name: asset.name!, url: asset.browser_download_url! })),
  };
}

/** The file to install this build from: the unpacked zip for Chromium, the signed add-on (else the zip) for Firefox. */
export function extensionAsset(release: Release, firefox: boolean): ReleaseAsset | null {
  const named = (suffix: string) => release.assets.find((asset) => asset.name.endsWith(suffix)) ?? null;
  return firefox ? (named('-firefox.xpi') ?? named('-firefox.zip')) : named('-chrome-unpacked.zip');
}

const YTDLP_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

/** yt-dlp's newest version, like 2026.11.02. */
export async function latestYtDlp(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(YTDLP_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for yt-dlp.`);
  const tag = String(((await response.json()) as { tag_name?: string }).tag_name ?? '');
  if (!/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(tag)) throw new Error("GitHub's answer had no yt-dlp version in it.");
  return tag;
}

/** yt-dlp versions are dates, sometimes with a fourth number for a same-day fix. */
export function compareYtDlp(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (Number.isNaN(diff)) return 0;
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** What the last check found. Kept in extension storage so the popup and Settings both see it. */
export interface UpdateState {
  checkedAt: number | null;
  release: Release | null;
  ytDlp: string | null;
  error: string | null;
}

export const NO_UPDATE_STATE: UpdateState = { checkedAt: null, release: null, ytDlp: null, error: null };

/** Automatic checks run at most this often. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export function isDue(state: UpdateState, now: number): boolean {
  return state.checkedAt === null || now - state.checkedAt >= CHECK_EVERY_MS;
}

export interface Installed {
  extension: string;
  /** Unknown until the helper has answered once; null when it isn't installed. */
  helper?: string | null;
  ytDlp?: string | null;
}

export interface Available {
  extension: boolean;
  helper: boolean;
  ytDlp: boolean;
  /** The newest ClipSave version, when either part is behind it. */
  version: string | null;
}

export function available(state: UpdateState, installed: Installed): Available {
  const newest = state.release?.version ?? null;
  const extension = !!newest && compareVersions(newest, installed.extension) > 0;
  const helper = !!newest && !!installed.helper && compareVersions(newest, installed.helper) > 0;
  // A full update brings the newest yt-dlp too, so it only counts on its own.
  const ytDlp = !helper && !!state.ytDlp && !!installed.ytDlp && compareYtDlp(state.ytDlp, installed.ytDlp) > 0;
  return { extension, helper, ytDlp, version: extension || helper ? newest : null };
}

/** Runs both checks. One failing doesn't hide what the other found. */
export async function checkNow(fetcher: typeof fetch = fetch, now = Date.now()): Promise<UpdateState> {
  const [release, ytDlp] = await Promise.allSettled([latestRelease(fetcher), latestYtDlp(fetcher)]);
  return {
    checkedAt: now,
    release: release.status === 'fulfilled' ? release.value : null,
    ytDlp: ytDlp.status === 'fulfilled' ? ytDlp.value : null,
    error: release.status === 'rejected' ? (release.reason as Error).message : null,
  };
}
