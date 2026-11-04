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

export interface PlaylistEntry {
  url: string;
  title: string;
  durationSec: number | null;
  /** Absent from older helpers. */
  thumbnail?: string | null;
}

/** How playlist files are numbered at the front of their names: 1 → N, N → 1, or not at all. */
export type Numbering = 'asc' | 'desc' | 'none';

export interface PlaylistInfo {
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  /** How many videos the playlist has, when the site says. Can be more than `entries` holds. */
  total: number | null;
  entries: PlaylistEntry[];
}

/** The helper reads a link as one video or as a playlist. */
export type Inspected = { media: MediaInfo; playlist?: undefined } | { playlist: PlaylistInfo; media?: undefined };

export type FolderKind = 'video' | 'audio';

/** What the helper says about itself. Fields after `audioDir` are absent from older helpers. */
export interface HelperInfo {
  version: string;
  ytDlp: string | null;
  ffmpeg: boolean;
  videoDir: string;
  audioDir: string;
  jsRuntime?: string | null;
  defaultVideoDir?: string;
  defaultAudioDir?: string;
  /** Where the helper program is. */
  path?: string | null;
  os?: string;
  arch?: string;
  /** What it can do: "playlists", "folders", "pickFolder", "update". */
  features?: string[];
  /** How the last one-click update ended; `at` is in seconds since 1970. */
  lastUpdate?: { ok: boolean; message: string; at: number | null } | null;
  /** The installer's output from the last one-click update. */
  updateLog?: string;
  /** The extension folder the installer keeps next to the helper, when there is one. */
  extensionDir?: string | null;
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
  /** The playlist this download came from; its title names the folder. Absent for single videos. */
  playlist?: { id: string; title: string } | null;
  /** The file name the person chose, without extension. Absent: the video's own title. */
  fileName?: string | null;
  /** Put in front of the file name, like a playlist number ("07 - "). */
  prefix?: string | null;
}

/** What the popup asks the background to do. */
export type Command =
  | { type: 'status' }
  | { type: 'inspect'; url: string; playlist?: boolean }
  /** `name` is the file name the person typed; empty or absent keeps the video's title. */
  | { type: 'download'; media: Pick<MediaInfo, 'url' | 'title' | 'thumbnail'>; option: FormatOption; name?: string | null }
  /**
   * `folder` names the playlist's folder. Each entry carries its playlist position, which `numbering`
   * turns into the number in front of its file name, counted against `total`.
   */
  | {
      type: 'downloadPlaylist';
      folder: string;
      entries: (PlaylistEntry & { index: number })[];
      option: PlaylistOption;
      numbering: Numbering;
      total: number;
    }
  | { type: 'cancel'; id: string }
  | { type: 'cancelAll' }
  | { type: 'retry'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'reveal'; path: string }
  /** No `path` goes back to the default folder. */
  | { type: 'setFolder'; kind: FolderKind; path: string | null }
  | { type: 'pickFolder'; kind: FolderKind }
  /** Asks GitHub now with `force`; otherwise only when automatic checks are on and one is due. */
  | { type: 'checkUpdates'; force: boolean }
  /** Runs the installer: the whole of ClipSave, or only yt-dlp. */
  | { type: 'update'; what: 'all' | 'ytdlp' }
  /** After an update replaced the extension's files, restarts it on them and reopens Settings. */
  | { type: 'reloadIfUpdated' };

/** A playlist's videos aren't read one by one, so its choices are fixed rather than measured. */
export interface PlaylistOption {
  key: string;
  label: string;
  quality: Quality;
}

export const PLAYLIST_OPTIONS: PlaylistOption[] = [
  { key: 'best', label: 'Best quality', quality: { kind: 'best' } },
  { key: '1080', label: '1080p', quality: { kind: 'video', height: 1080 } },
  { key: '720', label: '720p', quality: { kind: 'video', height: 720 } },
  { key: '480', label: '480p', quality: { kind: 'video', height: 480 } },
  { key: '360', label: '360p', quality: { kind: 'video', height: 360 } },
  { key: 'mp3', label: 'MP3 audio', quality: { kind: 'audio', format: 'mp3' } },
  { key: 'm4a', label: 'M4A audio', quality: { kind: 'audio', format: 'm4a' } },
];

export type Failure = { ok: false; code: 'helper_missing' | 'failed'; message: string };
export type Result<T> = ({ ok: true } & T) | Failure;
