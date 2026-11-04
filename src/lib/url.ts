const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isYouTube(url: string): boolean {
  const host = hostOf(url);
  return host !== null && YOUTUBE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * A YouTube video opened from a playlist (`watch?v=…&list=…`). The link reads as the one video,
 * and the popup offers the whole playlist next to it. A link to the playlist itself reads as the
 * playlist straight away, so it doesn't count here.
 */
export function isVideoInPlaylist(url: string): boolean {
  if (!isYouTube(url)) return false;
  try {
    const { pathname, searchParams } = new URL(url);
    return Boolean(searchParams.get('list')) && pathname !== '/playlist';
  } catch {
    return false;
  }
}
