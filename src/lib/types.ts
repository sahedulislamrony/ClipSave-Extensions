/** Mirrors `helper/src/protocol.rs`. Keep the two in sync. */
export type Quality =
  | { kind: 'best' }
  | { kind: 'video'; height: number }
  | { kind: 'audio'; format: 'mp3' | 'm4a' };

export interface FormatOption {
  key: string;
  label: string;
  sizeBytes: number | null;
  quality: Quality;
}

export interface MediaInfo {
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  durationSec: number | null;
  options: FormatOption[];
}

export interface HelperInfo {
  version: string;
  ytDlp: string | null;
  ffmpeg: boolean;
  videoDir: string;
  audioDir: string;
}

export type DownloadStatus = 'queued' | 'running' | 'processing' | 'done' | 'failed' | 'interrupted';

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  quality: Quality;
  label: string;
  status: DownloadStatus;
  percent: number | null;
  speedBytes: number | null;
  etaSec: number | null;
  path: string | null;
  error: string | null;
  addedAt: number;
}

/** What the popup asks the background to do. */
export type Command =
  | { type: 'status' }
  | { type: 'inspect'; url: string }
  | { type: 'download'; media: Pick<MediaInfo, 'url' | 'title' | 'thumbnail'>; option: FormatOption }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'reveal'; path: string };

export type Failure = { ok: false; code: 'helper_missing' | 'blocked' | 'failed'; message: string };
export type Result<T> = ({ ok: true } & T) | Failure;
