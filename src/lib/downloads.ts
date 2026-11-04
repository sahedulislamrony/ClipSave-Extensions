import { browser } from 'wxt/browser';
import type { DownloadItem } from './types';

const KEY = 'downloads';
/** Finished downloads kept in the list. Unfinished ones always stay, however many a playlist adds. */
const MAX_KEPT = 30;
const MAX_ACTIVE = 3;

export type StartJob = (item: DownloadItem) => void;
export type StopJob = (id: string) => void;

/** The download list. It lives in extension storage, which is also how the popup follows it. */
export class Downloads {
  private items: DownloadItem[] = [];
  private loaded: Promise<void>;

  constructor(private start: StartJob, private stop: StopJob, private onFinished: (item: DownloadItem) => void) {
    this.loaded = browser.storage.local.get(KEY).then((stored) => {
      this.items = ((stored[KEY] as DownloadItem[] | undefined) ?? []).map((item) =>
        isActive(item) ? { ...item, status: 'interrupted', speedBytes: null, etaSec: null } : item,
      );
      this.commit();
    });
  }

  ready() {
    return this.loaded;
  }

  get busy() {
    return this.items.some(isActive);
  }

  find(id: string): DownloadItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  /** The downloads that came from one playlist, newest first. */
  inPlaylist(playlistId: string): DownloadItem[] {
    return this.items.filter((item) => item.playlist?.id === playlistId);
  }

  async add(item: DownloadItem) {
    return this.addMany([item]);
  }

  /** `items` in the order they should start. */
  async addMany(items: DownloadItem[]) {
    await this.loaded;
    this.items = [...[...items].reverse(), ...this.items];
    this.trim();
    this.pump();
  }

  update(id: string, change: Partial<DownloadItem>) {
    const before = this.items.find((item) => item.id === id);
    if (!before) return;
    const after = { ...before, ...change };
    this.items = this.items.map((item) => (item.id === id ? after : item));
    if (isActive(before) && !isActive(after)) {
      this.onFinished(after);
      this.pump();
    } else {
      this.commit();
    }
  }

  async retry(id: string) {
    await this.loaded;
    this.update(id, { status: 'queued', error: null, speedBytes: null, etaSec: null });
    this.pump();
  }

  async remove(id: string) {
    await this.loaded;
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    // Cancelling also makes the helper delete the partial files a stopped job left behind.
    if (item.status !== 'queued' && item.status !== 'done') this.stop(id);
    this.items = this.items.filter((i) => i.id !== id);
    this.pump();
  }

  /** Stops everything that hasn't finished and takes it off the list. */
  async cancelAll() {
    await this.loaded;
    for (const item of this.items) {
      if (item.status === 'running' || item.status === 'processing') this.stop(item.id);
    }
    this.items = this.items.filter((item) => !isActive(item));
    this.commit();
  }

  async clearFinished() {
    await this.loaded;
    this.items = this.items.filter(isActive);
    this.commit();
  }

  /** The helper went away, and it stops every job when it does. Queued jobs can't start either. */
  interruptAll() {
    this.items = this.items.map((item) =>
      isActive(item) ? { ...item, status: 'interrupted', speedBytes: null, etaSec: null } : item,
    );
    this.commit();
  }

  private trim() {
    let room = MAX_KEPT - this.items.filter(isActive).length;
    this.items = this.items.filter((item) => isActive(item) || room-- > 0);
  }

  private pump() {
    let running = this.items.filter((i) => i.status === 'running' || i.status === 'processing').length;
    // Oldest first: the list is newest first.
    for (const item of [...this.items].reverse()) {
      if (running >= MAX_ACTIVE) break;
      if (item.status !== 'queued') continue;
      this.items = this.items.map((i) => (i.id === item.id ? { ...i, status: 'running' } : i));
      running++;
      this.start(item);
    }
    this.commit();
  }

  private commit() {
    void browser.storage.local.set({ [KEY]: this.items });
    const active = this.items.filter(isActive).length;
    const action = browser.action ?? browser.browserAction;
    void action.setBadgeText({ text: active > 0 ? String(active) : '' });
    void action.setBadgeBackgroundColor({ color: '#5b3bf0' });
  }
}

export function isActive(item: DownloadItem) {
  return item.status === 'queued' || item.status === 'running' || item.status === 'processing';
}

export async function readDownloads(): Promise<DownloadItem[]> {
  const stored = await browser.storage.local.get(KEY);
  return (stored[KEY] as DownloadItem[] | undefined) ?? [];
}

export function onDownloadsChanged(listener: (items: DownloadItem[]) => void) {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[KEY]) listener((changes[KEY].newValue as DownloadItem[] | undefined) ?? []);
  });
}
