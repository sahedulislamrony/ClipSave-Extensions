import { browser } from 'wxt/browser';
import { Downloads } from '@/lib/downloads';
import { Helper, HelperError, type HelperEvent } from '@/lib/helper';
import type { Command, DownloadItem, Failure, HelperInfo, MediaInfo, Quality, Result } from '@/lib/types';
import { isWebUrl } from '@/lib/url';
import { isBlocked, YOUTUBE_BLOCKED_MESSAGE } from '@/lib/variant';

/** Reopening the popup on the same page shouldn't run yt-dlp again. */
const INSPECT_CACHE_MS = 5 * 60_000;

export default defineBackground({
  persistent: true,
  main() {
    const inspected = new Map<string, { media: MediaInfo; at: number }>();

    const downloads: Downloads = new Downloads(
      (item) => {
        try {
          helper.send({ id: item.id, type: 'download', url: item.url, quality: item.quality });
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
      if (isBlocked(url)) return { ok: false, code: 'blocked', message: YOUTUBE_BLOCKED_MESSAGE };
      return null;
    }

    async function inspect(url: string): Promise<Result<{ media: MediaInfo }>> {
      const denied = refused(url);
      if (denied) return denied;
      const cached = inspected.get(url);
      if (cached && Date.now() - cached.at < INSPECT_CACHE_MS) return { ok: true, media: cached.media };
      const reply = await helper.request({ type: 'inspect', url });
      const media = reply.media as MediaInfo;
      inspected.set(url, { media, at: Date.now() });
      return { ok: true, media };
    }

    async function enqueue(
      media: Pick<MediaInfo, 'url' | 'title' | 'thumbnail'>,
      quality: Quality,
      label: string,
    ): Promise<Result<object>> {
      const denied = refused(media.url);
      if (denied) return denied;
      await downloads.add({
        id: crypto.randomUUID(),
        url: media.url,
        title: media.title,
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
      });
      return { ok: true };
    }

    async function handle(command: Command): Promise<unknown> {
      switch (command.type) {
        case 'status': {
          const reply = await helper.request({ type: 'hello' });
          return { ok: true, helper: reply.helper as HelperInfo };
        }
        case 'inspect':
          return inspect(command.url);
        case 'download':
          return enqueue(command.media, command.option.quality, command.option.label);
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
      }
    }

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
      if (item.status === 'done') notify('Saved', item.title);
      if (item.status === 'failed') notify("Couldn't save", item.error ?? item.title);
    }
  },
});

function applyEvent(downloads: Downloads, event: HelperEvent) {
  switch (event.type) {
    case 'title':
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
