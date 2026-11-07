import { browser } from 'wxt/browser';
import { Downloads, isActive } from '@/lib/downloads';
import { Helper, HelperError, type HelperEvent } from '@/lib/helper';
import type {
  Command,
  DownloadItem,
  Failure,
  HelperInfo,
  Inspected,
  MediaInfo,
  Numbering,
  PlaylistEntry,
  PlaylistInfo,
  PlaylistOption,
  Quality,
  Result,
} from '@/lib/types';
import { numberPrefix } from '@/lib/format';
import { isWebUrl } from '@/lib/url';
import { readHelperSeen, readPreferences, readUpdateState, saveHelperSeen, saveUpdateState } from '@/lib/prefs';
import { available, checkNow, compareVersions, isDue, type UpdateState } from '@/lib/updates';

const UPDATE_NOTIFICATION = 'clipsave-update';

/** Reopening the popup on the same page shouldn't run yt-dlp again. */
const INSPECT_CACHE_MS = 5 * 60_000;

export default defineBackground({
  persistent: true,
  main() {
    const inspected = new Map<string, { result: Inspected; at: number }>();

    const downloads: Downloads = new Downloads(
      (item) => {
        try {
          helper.send({
            id: item.id,
            type: 'download',
            url: item.url,
            quality: item.quality,
            // Each playlist gets its own folder inside the ClipSave folder.
            ...(item.playlist ? { folder: item.playlist.title } : {}),
            ...(item.fileName ? { name: item.fileName } : {}),
            ...(item.prefix ? { prefix: item.prefix } : {}),
          });
        } catch {
          downloads.update(item.id, { status: 'failed', error: 'The ClipSave Helper is not installed.' });
        }
      },
      (id) => {
        try {
          helper.send({ id, type: 'cancel' });
        } catch {
          // Nothing to cancel without a helper.
        }
      },
      notifyFinished,
    );

    const helper = new Helper(
      (event) => applyEvent(downloads, event),
      (missing) => {
        if (missing && downloads.busy) notify("Couldn't save", 'The ClipSave Helper is not installed.');
        downloads.interruptAll();
      },
      () => downloads.busy,
    );

    function refused(url: string): Failure | null {
      if (!isWebUrl(url)) return { ok: false, code: 'failed', message: "This isn't a web link." };
      return null;
    }

    async function inspect(url: string, playlist: boolean, start: number): Promise<Result<Inspected>> {
      const denied = refused(url);
      if (denied) return denied;
      const key = `${playlist ? 'playlist' : 'video'} ${start} ${url}`;
      const cached = inspected.get(key);
      if (cached && Date.now() - cached.at < INSPECT_CACHE_MS) return { ok: true, ...cached.result };
      const reply = await helper.request({ type: 'inspect', url, playlist, ...(start > 1 ? { start } : {}) });
      const result: Inspected = reply.playlist
        ? { playlist: reply.playlist as PlaylistInfo }
        : { media: reply.media as MediaInfo };
      inspected.set(key, { result, at: Date.now() });
      return { ok: true, ...result };
    }

    function newItem(
      media: Pick<MediaInfo, 'url' | 'title' | 'thumbnail'>,
      quality: Quality,
      label: string,
      naming: Pick<DownloadItem, 'playlist' | 'fileName' | 'prefix'> = {},
    ): DownloadItem {
      const named = naming.fileName ? `${naming.prefix ?? ''}${naming.fileName}` : null;
      return {
        id: crypto.randomUUID(),
        url: media.url,
        title: named ?? media.title,
        thumbnail: media.thumbnail,
        quality,
        label,
        status: 'queued',
        percent: null,
        speedBytes: null,
        etaSec: null,
        path: null,
        error: null,
        addedAt: Date.now(),
        playlist: naming.playlist ?? null,
        fileName: naming.fileName ?? null,
        prefix: naming.prefix ?? null,
      };
    }

    async function enqueue(
      media: Pick<MediaInfo, 'url' | 'title' | 'thumbnail'>,
      quality: Quality,
      label: string,
      name: string | null = null,
    ): Promise<Result<object>> {
      const denied = refused(media.url);
      if (denied) return denied;
      await downloads.add(newItem(media, quality, label, { fileName: name?.trim() || null }));
      return { ok: true };
    }

    async function enqueuePlaylist(
      folder: string,
      entries: (PlaylistEntry & { index: number })[],
      option: PlaylistOption,
      numbering: Numbering,
      total: number,
    ): Promise<Result<object>> {
      const usable = entries.filter((entry) => !refused(entry.url));
      if (usable.length === 0) return { ok: false, code: 'failed', message: 'No videos to save in this playlist.' };
      const playlist = { id: crypto.randomUUID(), title: folder.trim() || 'Playlist' };
      await downloads.addMany(
        usable.map((entry) =>
          newItem({ url: entry.url, title: entry.title, thumbnail: entry.thumbnail ?? null }, option.quality, option.label, {
            playlist,
            // A video the listing gave no title for is named by yt-dlp, still with its number.
            fileName: entry.title && entry.title !== entry.url ? entry.title : null,
            prefix: numberPrefix(entry.index, total, numbering) || null,
          }),
        ),
      );
      return { ok: true };
    }

    async function handle(command: Command): Promise<unknown> {
      switch (command.type) {
        case 'status': {
          const reply = await helper.request({ type: 'hello' });
          const info = reply.helper as HelperInfo;
          await saveHelperSeen({ version: info.version, ytDlp: info.ytDlp });
          // Opening the popup or Settings is a good moment for the daily check, when it's on.
          void checkUpdates(false).catch(() => {});
          return { ok: true, helper: info };
        }
        case 'checkUpdates':
          return { ok: true, updates: await checkUpdates(command.force) };
        case 'update':
          if (downloads.busy) return { ok: false, code: 'failed', message: 'Finish or cancel your downloads first.' };
          await helper.request({ type: 'update', what: command.what });
          return { ok: true };
        case 'reloadIfUpdated':
          return { ok: true, reloading: await reloadIfUpdated() };
        case 'inspect':
          return inspect(command.url, command.playlist ?? false, command.start ?? 1);
        case 'download':
          return enqueue(command.media, command.option.quality, command.option.label, command.name ?? null);
        case 'downloadPlaylist':
          return enqueuePlaylist(command.folder, command.entries, command.option, command.numbering, command.total);
        case 'cancelAll':
          await downloads.cancelAll();
          return { ok: true };
        case 'cancel':
          await downloads.remove(command.id);
          return { ok: true };
        case 'retry':
          await downloads.retry(command.id);
          return { ok: true };
        case 'remove':
          await downloads.remove(command.id);
          return { ok: true };
        case 'clear':
          await downloads.clearFinished();
          return { ok: true };
        case 'reveal':
          await helper.request({ type: 'reveal', path: command.path });
          return { ok: true };
        case 'setFolder': {
          const reply = await helper.request({ type: 'setFolder', kind: command.kind, path: command.path });
          return { ok: true, path: String(reply.path) };
        }
        case 'pickFolder': {
          const reply = await helper.request({ type: 'pickFolder', kind: command.kind });
          return { ok: true, path: (reply.path as string | null) ?? null };
        }
      }
    }

    /**
     * Asks GitHub for the newest ClipSave and yt-dlp. Without `force`, only when the person turned automatic
     * checks on and the last one is a day old. A failed check keeps what the last good one found.
     */
    async function checkUpdates(force: boolean): Promise<UpdateState> {
      const before = await readUpdateState();
      if (!force) {
        const { autoCheck } = await readPreferences();
        if (!autoCheck || !isDue(before, Date.now())) return before;
      }
      const found = await checkNow();
      const state: UpdateState = { ...found, release: found.release ?? before.release, ytDlp: found.ytDlp ?? before.ytDlp };
      await saveUpdateState(state);
      if (!force) await notifyOnce(state);
      return state;
    }

    /** One notification per new ClipSave version, from automatic checks only. */
    async function notifyOnce(state: UpdateState) {
      const seen = await readHelperSeen();
      const found = available(state, { extension: browser.runtime.getManifest().version, helper: seen?.version, ytDlp: seen?.ytDlp });
      if (!found.version) return;
      const { notifiedVersion } = await browser.storage.local.get('notifiedVersion');
      if (notifiedVersion === found.version) return;
      await browser.storage.local.set({ notifiedVersion: found.version });
      void browser.notifications.create(UPDATE_NOTIFICATION, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: `ClipSave ${found.version} is available`,
        message: 'Click to open Settings and update.',
      });
    }

    browser.notifications.onClicked.addListener((id) => {
      if (id === UPDATE_NOTIFICATION) void browser.runtime.openOptionsPage();
    });

    /**
     * An update replaced this extension's files (Chrome, Edge and Brave load it from the folder the
     * installer keeps). The running copy is the old one until it restarts, which closes Settings, so it's
     * reopened once the new one starts.
     */
    async function reloadIfUpdated(): Promise<boolean> {
      if (import.meta.env.FIREFOX) return false;
      try {
        const onDisk = (await (await fetch(new URL('/manifest.json', location.href), { cache: 'no-store' })).json()) as { version?: string };
        if (!onDisk.version || compareVersions(onDisk.version, browser.runtime.getManifest().version) <= 0) return false;
      } catch {
        return false;
      }
      await browser.storage.local.set({ reopenSettings: true });
      setTimeout(() => browser.runtime.reload(), 300);
      return true;
    }

    void browser.storage.local.get('reopenSettings').then(({ reopenSettings }) => {
      if (!reopenSettings) return;
      void browser.storage.local.remove('reopenSettings');
      void browser.runtime.openOptionsPage();
    });

    // Daily checks, when they're on: now (the background starts with the browser and whenever Chrome wakes
    // it), and every few hours while it stays running, as Firefox's does.
    void checkUpdates(false).catch(() => {});
    setInterval(() => void checkUpdates(false).catch(() => {}), 6 * 60 * 60 * 1000);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return;
      handle(message as Command).then(sendResponse, (error: unknown) => sendResponse(toFailure(error)));
      return true;
    });

    async function createMenus() {
      await browser.contextMenus.removeAll();
      const contexts = ['page', 'link', 'video', 'audio'] as const;
      browser.contextMenus.create({ id: 'clipsave', title: 'ClipSave', contexts: [...contexts] });
      browser.contextMenus.create({ id: 'save-video', parentId: 'clipsave', title: 'Save video', contexts: [...contexts] });
      browser.contextMenus.create({ id: 'save-audio', parentId: 'clipsave', title: 'Save audio (MP3)', contexts: [...contexts] });
    }
    void createMenus();

    browser.contextMenus.onClicked.addListener(async (info) => {
      // Page players often use blob: sources, which only the page's own address can reach.
      const source = info.srcUrl && isWebUrl(info.srcUrl) ? info.srcUrl : undefined;
      const url = info.linkUrl ?? source ?? info.pageUrl;
      if (!url) return;
      const audio = info.menuItemId === 'save-audio';
      const quality: Quality = audio ? { kind: 'audio', format: 'mp3' } : { kind: 'best' };
      const result = await enqueue({ url, title: url, thumbnail: null }, quality, audio ? 'MP3 audio' : 'Best quality');
      if (!result.ok) notify('ClipSave', result.message);
    });

    function notifyFinished(item: DownloadItem) {
      if (item.playlist) return notifyPlaylist(item.playlist);
      if (item.status === 'done') notify('Saved', item.title);
      if (item.status === 'failed') notify("Couldn't save", item.error ?? item.title);
    }

    /** One notification for a whole playlist, once its last video ends, instead of one per video. */
    function notifyPlaylist(playlist: { id: string; title: string }) {
      const items = downloads.inPlaylist(playlist.id);
      if (items.some(isActive)) return;
      const saved = items.filter((item) => item.status === 'done').length;
      if (saved === items.length) notify('Saved playlist', `${playlist.title}: ${saved} ${saved === 1 ? 'video' : 'videos'}`);
      else notify('Playlist finished', `${playlist.title}: ${saved} of ${items.length} saved. Retry the rest in Downloads.`);
    }
  },
});

function applyEvent(downloads: Downloads, event: HelperEvent) {
  switch (event.type) {
    case 'title':
      // A name the person chose stays; otherwise the video's real title replaces the link it started as.
      if (downloads.find(event.id)?.fileName) return;
      return downloads.update(event.id, { title: String(event.title) });
    case 'progress':
      return downloads.update(event.id, {
        status: event.phase === 'processing' ? 'processing' : 'running',
        percent: event.percent as number | null,
        speedBytes: event.speedBytes as number | null,
        etaSec: event.etaSec as number | null,
      });
    case 'done':
      return downloads.update(event.id, {
        status: 'done',
        percent: 100,
        path: String(event.path),
        speedBytes: null,
        etaSec: null,
      });
    case 'failed':
      return downloads.update(event.id, { status: 'failed', error: String(event.message), speedBytes: null, etaSec: null });
  }
}

function notify(title: string, message: string) {
  void browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
  });
}

function toFailure(error: unknown): Failure {
  if (error instanceof HelperError && error.missing) {
    return { ok: false, code: 'helper_missing', message: 'The ClipSave Helper is not installed.' };
  }
  return { ok: false, code: 'failed', message: error instanceof Error ? error.message : String(error) };
}
