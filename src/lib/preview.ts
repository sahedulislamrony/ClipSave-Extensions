/**
 * What the popup shows while the helper reads a link, which takes seconds: a YouTube video's picture straight
 * from the ID in the link, the tab's own title, then the title and channel from the site's oEmbed endpoint
 * (a few hundred milliseconds). Same as the Android app's link preview. Any field may be missing.
 */
export interface LinkPreview {
  title: string | null;
  uploader: string | null;
  thumbnail: string | null;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/** The video ID in a YouTube link: watch?v=, youtu.be/, /shorts/, /embed/, /live/. */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);
  let id: string | null | undefined = null;
  if (host === 'youtu.be') id = parts[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') id = parsed.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1];
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Site names and kinds of page that say nothing about the video. */
const GENERIC = new Set(['youtube', 'facebook', 'instagram', 'tiktok', 'vimeo', 'x', 'watch', 'reels', 'video', 'dailymotion']);

/** "(3) How to bake bread - YouTube" → "How to bake bread". Null when only the site's name is left. */
export function pageTitle(title: string | null | undefined): string | null {
  const cleaned = (title ?? '')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s+[-–|·•]\s+(YouTube|Facebook|Instagram|TikTok|Vimeo|X|Dailymotion)$/i, '')
    .trim();
  return cleaned && !GENERIC.has(cleaned.toLowerCase()) ? cleaned : null;
}

/** What's known from the link, and from the tab when the link is the tab's own page, before any request. */
export function instantPreview(url: string, tab?: { url?: string; title?: string } | null): LinkPreview | null {
  const id = youtubeVideoId(url);
  const title = tab?.url === url ? pageTitle(tab.title) : null;
  const thumbnail = id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
  return title || thumbnail ? { title, uploader: null, thumbnail } : null;
}

/**
 * oEmbed endpoints that let an extension read them without host permissions (they answer with CORS headers).
 * Dailymotion's doesn't, and Instagram and Facebook have none, so those wait for the helper.
 */
const OEMBED: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, 'https://www.youtube.com/oembed?format=json&url='],
  [/(^|\.)vimeo\.com$/, 'https://vimeo.com/api/oembed.json?url='],
  [/(^|\.)tiktok\.com$/, 'https://www.tiktok.com/oembed?url='],
];

export function oEmbedEndpoint(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const endpoint = OEMBED.find(([pattern]) => pattern.test(host))?.[1];
  return endpoint ? endpoint + encodeURIComponent(url) : null;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Title, channel and picture from the site's oEmbed endpoint. Null when it has none, or doesn't answer in time. */
export async function fetchPreview(url: string, timeoutMs = 4000): Promise<LinkPreview | null> {
  const endpoint = oEmbedEndpoint(url);
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    const thumbnail = text(json.thumbnail_url);
    const preview: LinkPreview = {
      title: text(json.title),
      uploader: text(json.author_name),
      thumbnail: thumbnail?.startsWith('https://') ? thumbnail : null,
    };
    return preview.title || preview.thumbnail ? preview : null;
  } catch {
    return null;
  }
}
