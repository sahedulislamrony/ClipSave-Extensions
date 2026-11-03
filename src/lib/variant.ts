import { isYouTube } from './url';

/**
 * The only behaviour that differs between builds. The Chrome Web Store rejects extensions that
 * download from YouTube, so the Chrome build refuses those links. This is fixed at build time and
 * can't be switched on later.
 */
export const youtubeBlocked: boolean = import.meta.env.CHROME;

export const YOUTUBE_BLOCKED_MESSAGE =
  "Chrome Web Store rules don't allow YouTube downloads, so this version can't save from YouTube.";

export function isBlocked(url: string): boolean {
  return youtubeBlocked && isYouTube(url);
}
