import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import './style.css';
import { browser } from 'wxt/browser';
import { isActive, onDownloadsChanged, readDownloads } from '@/lib/downloads';
import { formatDuration, formatSize } from '@/lib/format';
import { HELP_PAGE, installStep } from '@/lib/install';
import type { Command, DownloadItem, Failure, FormatOption, HelperInfo, MediaInfo, Result } from '@/lib/types';
import { isWebUrl } from '@/lib/url';

/** How often the popup looks for a helper the user is installing. */
const HELPER_CHECK_MS = 2000;

type SaveState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'media'; media: MediaInfo }
  | { kind: 'failed'; failure: Failure };

const ICONS = {
  download: 'M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14',
  close: 'M6.5 6.5l11 11m0-11-11 11',
  retry: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4',
  folder: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2.5h7A1.5 1.5 0 0 1 20 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z',
};

const saveBody = document.querySelector<HTMLElement>('#save-body')!;
const panelSave = document.querySelector<HTMLElement>('#panel-save')!;
const panelDownloads = document.querySelector<HTMLElement>('#panel-downloads')!;
const tabSave = document.querySelector<HTMLElement>('#tab-save')!;
const tabDownloads = document.querySelector<HTMLElement>('#tab-downloads')!;
const count = document.querySelector<HTMLElement>('#count')!;
const form = document.querySelector<HTMLFormElement>('#link-form')!;
const input = document.querySelector<HTMLInputElement>('#link')!;

/** Only for text and attributes: titles and errors come from the web, so nothing here parses HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null));
  return node;
}

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function send<T>(command: Command): Promise<Result<T>> {
  return browser.runtime.sendMessage(command) as Promise<Result<T>>;
}

function showTab(tab: 'save' | 'downloads') {
  const save = tab === 'save';
  panelSave.hidden = !save;
  panelDownloads.hidden = save;
  tabSave.setAttribute('aria-selected', String(save));
  tabDownloads.setAttribute('aria-selected', String(!save));
}

function renderSave(state: SaveState) {
  switch (state.kind) {
    case 'empty':
      return saveBody.replaceChildren(el('p', { className: 'hint' }, 'Open a page with a video, or paste a link above.'));
    case 'loading':
      return saveBody.replaceChildren(
        el(
          'div',
          { className: 'media', ariaBusy: 'true' },
          el('div', { className: 'thumb skeleton' }),
          el('div', { className: 'media-text' }, el('div', { className: 'line skeleton' }), el('div', { className: 'line short skeleton' })),
        ),
        el('p', { className: 'hint' }, 'Reading this page. It usually takes a few seconds.'),
      );
    case 'media':
      return saveBody.replaceChildren(...renderMedia(state.media));
    case 'failed':
      return saveBody.replaceChildren(renderFailure(state.failure));
  }
}

let platform = '';

function renderInstall(): HTMLElement {
  const help = el('a', { href: HELP_PAGE, target: '_blank', rel: 'noreferrer' }, 'Help');
  const step = installStep(platform);
  if (!step) {
    return el(
      'div',
      { className: 'notice' },
      el('h2', {}, 'Not available here yet'),
      el('p', {}, 'The ClipSave helper runs on macOS, Windows and Linux.'),
      help,
    );
  }
  const copy = el('button', { className: 'primary', type: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(step.command);
      copy.textContent = 'Copied';
    } catch {
      // Without clipboard access the command is still easy to select by hand.
      getSelection()?.selectAllChildren(command);
    }
  });
  const command = el('code', { className: 'command' }, step.command);
  return el(
    'div',
    { className: 'notice' },
    el('h2', {}, 'One more step'),
    el('p', {}, `ClipSave needs its free helper to save files. Open ${step.app}, paste this and press Return:`),
    command,
    copy,
    el('p', { className: 'meta waiting' }, 'ClipSave carries on by itself once the helper is installed. ', help),
  );
}

function renderFailure(failure: Failure): HTMLElement {
  if (failure.code === 'helper_missing') return renderInstall();
  return el(
    'div',
    { className: 'notice' },
    el('p', {}, failure.message),
    failure.code === 'failed' ? el('button', { className: 'secondary', onclick: () => void find() }, 'Try again') : null,
  );
}

function renderMedia(media: MediaInfo): Node[] {
  const meta = [media.uploader, formatDuration(media.durationSec)].filter(Boolean).join(' · ');
  const header = el(
    'div',
    { className: 'media' },
    media.thumbnail
      ? el('img', { className: 'thumb', src: media.thumbnail, alt: '', referrerPolicy: 'no-referrer' })
      : el('div', { className: 'thumb' }),
    el('div', { className: 'media-text' }, el('p', { className: 'title', title: media.title }, media.title), el('p', { className: 'meta' }, meta)),
  );
  const rows = (options: FormatOption[]) => options.map((option) => renderOption(media, option));
  const video = media.options.filter((o) => o.quality.kind !== 'audio');
  const audio = media.options.filter((o) => o.quality.kind === 'audio');
  return [
    header,
    el('h2', { className: 'group' }, 'Video'),
    el('div', { className: 'options' }, ...rows(video)),
    el('h2', { className: 'group' }, 'Audio'),
    el('div', { className: 'options' }, ...rows(audio)),
  ];
}

function renderOption(media: MediaInfo, option: FormatOption): HTMLElement {
  return el(
    'button',
    {
      className: 'option',
      onclick: async () => {
        const result = await send<object>({ type: 'download', media, option });
        if (result.ok) showTab('downloads');
        else renderSave({ kind: 'failed', failure: result });
      },
    },
    el('span', { className: 'option-label' }, option.label),
    el('span', { className: 'option-size' }, formatSize(option.sizeBytes) ?? ''),
    icon('download'),
  );
}

function statusLine(item: DownloadItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting';
    case 'processing':
      return 'Finishing up';
    case 'done':
      return `${item.label} · Saved`;
    case 'failed':
      return item.error ?? "Couldn't save this video";
    case 'interrupted':
      return 'Stopped. Retry to continue.';
    case 'running': {
      const parts = [
        item.percent === null ? 'Starting' : `${Math.floor(item.percent)}%`,
        item.speedBytes ? `${formatSize(item.speedBytes)}/s` : null,
        item.etaSec ? `${formatDuration(item.etaSec)} left` : null,
      ];
      return parts.filter(Boolean).join(' · ');
    }
  }
}

function iconButton(name: keyof typeof ICONS, label: string, onclick: () => void): HTMLElement {
  return el('button', { className: 'icon-button', title: label, ariaLabel: label, onclick }, icon(name));
}

function renderItem(item: DownloadItem): HTMLElement {
  const active = isActive(item);
  const stopped = item.status === 'failed' || item.status === 'interrupted';
  let bar: HTMLElement | null = null;
  if (item.status === 'running' || item.status === 'processing') {
    const fill = el('span');
    fill.style.width = `${item.percent ?? 0}%`;
    bar = el('div', { className: item.status === 'processing' || item.percent === null ? 'bar indeterminate' : 'bar' }, fill);
  }
  return el(
    'article',
    { className: `item ${item.status}` },
    el(
      'div',
      { className: 'item-text' },
      el('p', { className: 'title', title: item.title }, item.title),
      el('p', { className: 'meta' }, statusLine(item)),
      bar,
    ),
    el(
      'div',
      { className: 'item-actions' },
      item.status === 'done' && item.path ? iconButton('folder', 'Show in folder', () => void send({ type: 'reveal', path: item.path! })) : null,
      stopped ? iconButton('retry', 'Retry', () => void send({ type: 'retry', id: item.id })) : null,
      iconButton('close', active ? 'Cancel' : 'Remove from list', () => void send({ type: 'remove', id: item.id })),
    ),
  );
}

function renderDownloads(items: DownloadItem[]) {
  const active = items.filter(isActive).length;
  count.hidden = active === 0;
  count.textContent = String(active);
  if (items.length === 0) {
    return panelDownloads.replaceChildren(el('p', { className: 'hint' }, 'Videos you save will show up here.'));
  }
  const finished = items.length > active;
  panelDownloads.replaceChildren(
    ...items.map(renderItem),
    ...(finished ? [el('button', { className: 'text-button', onclick: () => void send({ type: 'clear' }) }, 'Clear finished')] : []),
  );
}

async function find() {
  const url = input.value.trim();
  if (!url) return renderSave({ kind: 'empty' });
  renderSave({ kind: 'loading' });
  const result = await send<{ media: MediaInfo }>({ type: 'inspect', url });
  // A newer search may have started while this one ran.
  if (input.value.trim() !== url) return;
  renderSave(result.ok ? { kind: 'media', media: result.media } : { kind: 'failed', failure: result });
  if (!result.ok && result.code === 'helper_missing') void waitForHelper();
}

let waiting = false;

/** Checks for the helper while the install screen shows, and carries on as soon as it answers. */
async function waitForHelper() {
  if (waiting) return;
  waiting = true;
  for (;;) {
    await new Promise((done) => setTimeout(done, HELPER_CHECK_MS));
    const status = await send<{ helper: HelperInfo }>({ type: 'status' });
    if (status.ok) break;
  }
  waiting = false;
  await readCurrentTab();
}

/** Starts with the page the popup was opened on, when it's a web page. */
async function readCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && isWebUrl(tab.url)) {
    input.value = tab.url;
    await find();
  } else if (!input.value.trim()) {
    renderSave({ kind: 'empty' });
  } else {
    await find();
  }
}

tabSave.addEventListener('click', () => showTab('save'));
tabDownloads.addEventListener('click', () => showTab('downloads'));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  showTab('save');
  void find();
});

async function start() {
  onDownloadsChanged(renderDownloads);
  renderDownloads(await readDownloads());

  platform = (await browser.runtime.getPlatformInfo()).os;

  const status = await send<{ helper: HelperInfo }>({ type: 'status' });
  if (!status.ok) {
    renderSave({ kind: 'failed', failure: status });
    if (status.code === 'helper_missing') void waitForHelper();
    return;
  }
  await readCurrentTab();
}

void start();
