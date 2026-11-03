import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Downloads, readDownloads } from '@/lib/downloads';
import type { DownloadItem, DownloadStatus } from '@/lib/types';

function item(id: string, status: DownloadStatus = 'queued', addedAt = 0): DownloadItem {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    thumbnail: null,
    quality: { kind: 'best' },
    label: 'Best quality',
    status,
    percent: null,
    speedBytes: null,
    etaSec: null,
    path: null,
    error: null,
    addedAt,
  };
}

async function setup(stored: DownloadItem[] = []) {
  await fakeBrowser.storage.local.set({ downloads: stored });
  const start = vi.fn<(item: DownloadItem) => void>();
  const stop = vi.fn<(id: string) => void>();
  const finished = vi.fn<(item: DownloadItem) => void>();
  const downloads = new Downloads(start, stop, finished);
  await downloads.ready();
  return { downloads, start, stop, finished };
}

const statuses = async () => Object.fromEntries((await readDownloads()).map((d) => [d.id, d.status]));

beforeEach(() => {
  fakeBrowser.reset();
});

describe('Downloads', () => {
  it('runs at most three at once, oldest first, and starts the next when one ends', async () => {
    const { downloads, start } = await setup();
    for (const id of ['a', 'b', 'c', 'd']) await downloads.add(item(id));

    expect(start.mock.calls.map(([i]) => i.id)).toEqual(['a', 'b', 'c']);
    expect((await statuses()).d).toBe('queued');

    downloads.update('b', { status: 'done', path: '/x.mp4' });
    expect(start.mock.calls.map(([i]) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports a job once, when it finishes', async () => {
    const { downloads, finished } = await setup();
    await downloads.add(item('a'));
    downloads.update('a', { percent: 50 });
    downloads.update('a', { status: 'failed', error: 'Nope' });
    downloads.update('a', { error: 'Still nope' });

    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0]?.[0]).toMatchObject({ id: 'a', status: 'failed', error: 'Nope' });
  });

  it('marks jobs that were running when the browser closed as interrupted', async () => {
    await setup([item('a', 'running'), item('b', 'queued'), item('c', 'done')]);
    expect(await statuses()).toEqual({ a: 'interrupted', b: 'interrupted', c: 'done' });
  });

  it('stops every job when the helper goes away', async () => {
    const { downloads } = await setup();
    for (const id of ['a', 'b', 'c', 'd']) await downloads.add(item(id));
    downloads.interruptAll();
    expect(new Set(Object.values(await statuses()))).toEqual(new Set(['interrupted']));
    expect(downloads.busy).toBe(false);
  });

  it('retries a stopped job', async () => {
    const { downloads, start } = await setup([item('a', 'failed')]);
    await downloads.retry('a');
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect((await statuses()).a).toBe('running');
  });

  it('asks the helper to clean up when removing anything but a queued or finished job', async () => {
    const { downloads, stop } = await setup([
      item('done', 'done'),
      item('failed', 'failed'),
      item('stopped', 'interrupted'),
    ]);
    await downloads.add(item('running'));

    for (const id of ['done', 'failed', 'stopped', 'running']) await downloads.remove(id);
    expect(stop.mock.calls.map(([id]) => id)).toEqual(['failed', 'stopped', 'running']);
    expect(await readDownloads()).toEqual([]);
  });

  it('clears finished jobs but keeps active ones', async () => {
    const { downloads } = await setup([item('done', 'done'), item('failed', 'failed')]);
    await downloads.add(item('active'));
    await downloads.clearFinished();
    expect(Object.keys(await statuses())).toEqual(['active']);
  });

  it('keeps the newest 30 jobs', async () => {
    const old = Array.from({ length: 30 }, (_, i) => item(`old-${i}`, 'done'));
    const { downloads } = await setup(old);
    await downloads.add(item('new'));
    const kept = await readDownloads();
    expect(kept).toHaveLength(30);
    expect(kept[0]?.id).toBe('new');
    expect(kept.some((d) => d.id === 'old-29')).toBe(false);
  });

  it('shows the number of active jobs on the toolbar button', async () => {
    const { downloads } = await setup();
    await downloads.add(item('a'));
    await downloads.add(item('b'));
    // Badge updates aren't awaited by the queue.
    await vi.waitFor(async () => expect(await fakeBrowser.action.getBadgeText({})).toBe('2'));
    downloads.update('a', { status: 'done' });
    downloads.update('b', { status: 'done' });
    await vi.waitFor(async () => expect(await fakeBrowser.action.getBadgeText({})).toBe(''));
  });
});
