import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@/styles/theme.css';
import './style.css';
import { browser } from 'wxt/browser';
import { isActive, onDownloadsChanged, readDownloads } from '@/lib/downloads';
import { estimateBytes, formatDuration, formatSize, numberPrefix } from '@/lib/format';
import { HELP_PAGE, installStep } from '@/lib/install';
import {
  PLAYLIST_OPTIONS,
  type Command,
  type DownloadItem,
  type Failure,
  type HelperInfo,
  type Inspected,
  type Numbering,
  type MediaInfo,
  type PlaylistInfo,
  type Quality,
  type Result,
} from '@/lib/types';
import { isVideoInPlaylist, isWebUrl } from '@/lib/url';
import { el, icon, type IconName } from '@/lib/dom';
import { readUpdateState } from '@/lib/prefs';
import { available } from '@/lib/updates';
import { applyTheme, onThemeChanged, readTheme, saveTheme, THEME_LABELS, THEMES } from '@/lib/theme';

/** How often the popup looks for a helper the user is installing. */
const HELPER_CHECK_MS = 2000;

type SaveState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'media'; media: MediaInfo }
  /** `from` is the video the playlist was opened from, for the way back. */
  | { kind: 'playlist'; playlist: PlaylistInfo; from: MediaInfo | null }
  | { kind: 'failed'; failure: Failure };

const saveBody = document.querySelector<HTMLElement>('#save-body')!;
const panelSave = document.querySelector<HTMLElement>('#panel-save')!;
const panelDownloads = document.querySelector<HTMLElement>('#panel-downloads')!;
const tabSave = document.querySelector<HTMLElement>('#tab-save')!;
const tabDownloads = document.querySelector<HTMLElement>('#tab-downloads')!;
const count = document.querySelector<HTMLElement>('#count')!;
const form = document.querySelector<HTMLFormElement>('#link-form')!;
const input = document.querySelector<HTMLInputElement>('#link')!;
const themeButton = document.querySelector<HTMLButtonElement>('#theme')!;
const settingsButton = document.querySelector<HTMLButtonElement>('#settings')!;

let theme = readTheme();

/** The theme button steps through System, Light and Dark. */
function showTheme() {
  applyTheme(theme);
  const label = `Theme: ${THEME_LABELS[theme]}`;
  themeButton.title = label;
  themeButton.ariaLabel = label;
  themeButton.replaceChildren(icon(theme));
}

function nextTheme() {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  saveTheme(theme);
  showTheme();
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
      return saveBody.replaceChildren(
        el(
          'div',
          { className: 'empty' },
          el('span', { className: 'empty-icon' }, icon('link')),
          el('p', { className: 'empty-title' }, 'Nothing to save here'),
          el('p', { className: 'meta' }, 'Open a page with a video, or paste a link above.'),
        ),
      );
    case 'loading':
      return saveBody.replaceChildren(
        el(
          'div',
          { className: 'loading', ariaBusy: 'true', ariaLabel: 'Reading this page' },
          el(
            'div',
            { className: 'media' },
            el('div', { className: 'thumb skeleton' }),
            el('div', { className: 'media-text' }, el('div', { className: 'line skeleton' }), el('div', { className: 'line short skeleton' })),
          ),
          el('div', { className: 'segmented skeleton' }),
          el('div', { className: 'options' }, ...[0, 1, 2].map(() => el('div', { className: 'option skeleton' }))),
          el('p', { className: 'meta center' }, 'Finding qualities. It usually takes a few seconds.'),
        ),
      );
    case 'media':
      return saveBody.replaceChildren(...renderMedia(state.media));
    case 'playlist':
      return saveBody.replaceChildren(...renderPlaylist(state.playlist, state.from));
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

/** A quality row: what it saves, how big it is, and whether it's the one picked. */
interface Choice {
  key: string;
  label: string;
  quality: Quality;
  sizeBytes: number | null;
}

const isAudio = (choice: Choice) => choice.quality.kind === 'audio';

/** Same tags as the app: 4K from 2160p, HD from 1080p. */
function tagFor(quality: Quality): string | null {
  if (quality.kind !== 'video') return null;
  if (quality.height >= 2160) return '4K';
  if (quality.height >= 1080) return 'HD';
  return null;
}

/** "1.2 GB" when the size is known, "≈ 1.2 GB" when it's estimated, nothing when neither. */
type SizeOf = (choice: Choice) => string | null;

/** A known size, else an estimate from the video's length. */
function sizeLabel(choice: Choice, durationSec: number | null): string | null {
  const known = formatSize(choice.sizeBytes);
  if (known) return known;
  const guess = formatSize(estimateBytes(choice.quality, [durationSec]));
  return guess ? `≈ ${guess}` : null;
}

/**
 * The app's picker: a Video | Audio switch over selectable quality rows, best first and picked by
 * default. Each side remembers its own pick. `onChange` hears the current pick, starting now.
 * `setSizes` rewrites the size beside every resolution, for estimates that change with a selection.
 */
function qualityPicker(
  choices: Choice[],
  sizeOf: SizeOf,
  onChange: (choice: Choice) => void,
): { element: HTMLElement; setSizes: (sizeOf: SizeOf) => void } {
  const sides = { video: choices.filter((c) => !isAudio(c)), audio: choices.filter(isAudio) };
  const picked = { video: sides.video[0], audio: sides.audio[0] };
  let side: 'video' | 'audio' = sides.video.length > 0 ? 'video' : 'audio';

  const rows = new Map<Choice, HTMLElement>();
  const sizes = new Map<Choice, HTMLElement>();
  for (const choice of choices) {
    const tag = tagFor(choice.quality);
    const size = el('span', { className: 'option-size' });
    const row = el(
      'button',
      { className: 'option', type: 'button', role: 'radio', onclick: () => pick(choice) },
      el('span', { className: 'option-label' }, choice.label.replace(/ audio$/i, '')),
      tag ? el('span', { className: `tag tag-${tag.toLowerCase()}` }, tag) : null,
      size,
      el('span', { className: 'tick' }, icon('check')),
    );
    rows.set(choice, row);
    sizes.set(choice, size);
  }
  function setSizes(next: SizeOf) {
    for (const [choice, size] of sizes) size.textContent = next(choice) ?? '';
  }
  setSizes(sizeOf);
  const list = el('div', { className: 'options', role: 'radiogroup', ariaLabel: 'Quality' }, ...rows.values());

  const segment = (name: 'video' | 'audio', label: string) =>
    el('button', { type: 'button', role: 'radio', onclick: () => show(name) }, icon(name), label);
  const segments = { video: segment('video', 'Video'), audio: segment('audio', 'Audio') };
  const switcher = el('div', { className: 'segmented', role: 'radiogroup', ariaLabel: 'Save as' }, segments.video, segments.audio);

  function update() {
    for (const name of ['video', 'audio'] as const) {
      segments[name].ariaChecked = String(name === side);
      segments[name].disabled = sides[name].length === 0;
    }
    for (const [choice, row] of rows) {
      row.hidden = isAudio(choice) !== (side === 'audio');
      row.ariaChecked = String(choice === picked[side]);
    }
    switcher.style.setProperty('--index', side === 'video' ? '0' : '1');
    const current = picked[side];
    if (current) onChange(current);
  }
  function show(name: 'video' | 'audio') {
    side = name;
    update();
  }
  function pick(choice: Choice) {
    picked[isAudio(choice) ? 'audio' : 'video'] = choice;
    update();
  }
  update();
  return { element: el('div', { className: 'picker' }, switcher, list), setSizes };
}

function mediaHeader(thumbnail: string | null, title: string, meta: string, fallback: IconName): HTMLElement {
  return el(
    'div',
    { className: 'media' },
    thumbnail
      ? el('img', { className: 'thumb', src: thumbnail, alt: '', referrerPolicy: 'no-referrer' })
      : el('div', { className: 'thumb thumb-icon' }, icon(fallback)),
    el('div', { className: 'media-text' }, el('p', { className: 'title', title }, title), el('p', { className: 'meta' }, meta)),
  );
}

/** A labelled text field with a pencil, like the app's name field. Starts as `value`. */
function nameField(label: string, value: string, placeholder: string): { element: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'text', value: value.slice(0, 100), placeholder, maxLength: 100, spellcheck: false });
  return {
    input,
    element: el(
      'label',
      { className: 'field' },
      el('span', { className: 'field-label' }, label),
      el('span', { className: 'name-field' }, input, icon('edit')),
    ),
  };
}

/** A row of choices with a sliding thumb, like the Video | Audio switch. */
function segmented<T extends string>(label: string, options: [T, string][], selected: T, onChange: (value: T) => void): HTMLElement {
  const group = el('div', { className: 'segmented', role: 'radiogroup', ariaLabel: label });
  group.style.setProperty('--count', String(options.length));
  const buttons = options.map(([value, text]) => el('button', { type: 'button', role: 'radio' }, text));
  const select = (value: T) => {
    const index = options.findIndex(([v]) => v === value);
    group.style.setProperty('--index', String(index));
    buttons.forEach((button, i) => (button.ariaChecked = String(i === index)));
  };
  buttons.forEach((button, i) =>
    button.addEventListener('click', () => {
      const value = options[i]![0];
      select(value);
      onChange(value);
    }),
  );
  group.append(...buttons);
  select(selected);
  return group;
}

/** The sticky bar at the bottom of the Save tab. */
function actionBar(...children: HTMLElement[]): HTMLElement {
  return el('div', { className: 'save-bar' }, ...children);
}

function renderMedia(media: MediaInfo): Node[] {
  const meta = [media.uploader, formatDuration(media.durationSec)].filter(Boolean).join(' · ');
  const offer = isVideoInPlaylist(media.url)
    ? el(
        'button',
        { className: 'playlist-offer', type: 'button', onclick: () => void openPlaylist(media) },
        icon('playlist'),
        el('span', {}, 'Save the whole playlist'),
        icon('next'),
      )
    : null;

  const name = nameField('File name', media.title, 'Name');
  let choice: Choice | undefined;
  const picker = qualityPicker(
    media.options,
    (option) => sizeLabel(option, media.durationSec),
    (picked) => (choice = picked),
  ).element;
  const download = el('button', { id: 'download', className: 'primary wide', type: 'button' }, icon('download'), 'Download');
  download.addEventListener('click', async () => {
    if (!choice) return;
    download.disabled = true;
    const result = await send<object>({ type: 'download', media, option: { ...choice }, name: name.input.value.trim() || null });
    download.disabled = false;
    if (result.ok) showTab('downloads');
    else renderSave({ kind: 'failed', failure: result });
  });
  return [mediaHeader(media.thumbnail, media.title, meta, 'video'), ...(offer ? [offer] : []), name.element, picker, actionBar(download)];
}

async function openPlaylist(from: MediaInfo) {
  renderSave({ kind: 'loading' });
  const result = await send<Inspected>({ type: 'inspect', url: from.url, playlist: true });
  if (input.value.trim() !== from.url) return;
  if (!result.ok) return renderSave({ kind: 'failed', failure: result });
  if (result.playlist) return renderSave({ kind: 'playlist', playlist: result.playlist, from });
  // The site had no playlist after all.
  renderSave({ kind: 'media', media: result.media });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function renderPlaylist(playlist: PlaylistInfo, from: MediaInfo | null): Node[] {
  const { entries } = playlist;
  const back = from
    ? el(
        'button',
        { className: 'back', type: 'button', onclick: () => renderSave({ kind: 'media', media: from }) },
        icon('back'),
        'This video only',
      )
    : null;
  const count =
    playlist.total && playlist.total > entries.length
      ? `first ${entries.length} of ${playlist.total} videos`
      : plural(entries.length, 'video');
  const header = mediaHeader(playlist.thumbnail, playlist.title, [playlist.uploader, count].filter(Boolean).join(' · '), 'playlist');
  const lead = back ? [back, header] : [header];
  if (entries.length === 0) return [...lead, el('p', { className: 'hint' }, 'This playlist has no videos to save.')];

  const folder = nameField('Folder name', playlist.title, 'Folder name');
  // Numbers count against the whole playlist, so a video keeps its number whichever ones are ticked.
  const total = playlist.total && playlist.total > entries.length ? playlist.total : entries.length;
  let numbering: Numbering = 'asc';
  const preview = el('p', { className: 'meta preview' });
  const numberSwitch = segmented<Numbering>(
    'Number files',
    [
      ['asc', `1 → ${total}`],
      ['desc', `${total} → 1`],
      ['none', 'None'],
    ],
    numbering,
    (value) => {
      numbering = value;
      refresh();
    },
  );

  // A playlist's videos aren't read one by one, so its sizes are estimates from their lengths.
  const boxes = entries.map((entry) => el('input', { type: 'checkbox', className: 'check', checked: true, ariaLabel: entry.title }));
  const chosen = () => entries.filter((_, i) => boxes[i]!.checked);
  const estimate = (option: Choice) => {
    const size = formatSize(estimateBytes(option.quality, chosen().map((entry) => entry.durationSec)));
    return size ? `≈ ${size}` : null;
  };
  let choice: Choice | undefined;
  let refresh = () => {};
  const picker = qualityPicker(PLAYLIST_OPTIONS.map((option) => ({ ...option, sizeBytes: null })), estimate, (picked) => {
    choice = picked;
    refresh();
  });

  const rows = entries.map((entry, i) =>
    el(
      'label',
      { className: 'entry' },
      el('span', { className: 'entry-index' }, String(i + 1)),
      entry.thumbnail
        ? el('img', { className: 'entry-thumb', src: entry.thumbnail, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })
        : el('span', { className: 'entry-thumb' }),
      el(
        'span',
        { className: 'entry-text' },
        el('span', { className: 'entry-title', title: entry.title }, entry.title),
        el('span', { className: 'entry-time' }, formatDuration(entry.durationSec) ?? ''),
      ),
      boxes[i]!,
    ),
  );

  const summary = el('p', { className: 'meta' });
  const toggle = el('button', { className: 'small-button', type: 'button' });
  const save = el('button', { id: 'download', className: 'primary wide', type: 'button' });
  refresh = () => {
    const n = chosen().length;
    const size = choice ? estimate(choice) : null;
    summary.textContent = [`${n} of ${entries.length} selected`, size].filter(Boolean).join(' · ');
    picker.setSizes(estimate);
    save.replaceChildren(
      icon('download'),
      n === 0 ? 'Pick videos to download' : [`Download ${plural(n, 'video')}`, size].filter(Boolean).join(' · '),
    );
    save.disabled = n === 0;
    toggle.textContent = n > 0 ? 'Clear' : 'Select all';
    const first = chosen()[0] ?? entries[0]!;
    const firstName = `${numberPrefix(entries.indexOf(first), total, numbering)}${first.title}`;
    preview.textContent = `First file: ${firstName}`;
    preview.title = firstName;
  };
  for (const box of boxes) box.addEventListener('change', refresh);
  toggle.addEventListener('click', () => {
    const all = chosen().length === 0;
    for (const box of boxes) box.checked = all;
    refresh();
  });
  save.addEventListener('click', async () => {
    if (!choice) return;
    save.disabled = true;
    const option = { key: choice.key, label: choice.label, quality: choice.quality };
    const result = await send<object>({
      type: 'downloadPlaylist',
      folder: folder.input.value.trim() || playlist.title,
      entries: entries.map((entry, index) => ({ ...entry, index })).filter((_, i) => boxes[i]!.checked),
      option,
      numbering,
      total,
    });
    if (result.ok) showTab('downloads');
    else renderSave({ kind: 'failed', failure: result });
  });
  refresh();

  return [
    ...lead,
    folder.element,
    el('div', { className: 'field' }, el('span', { className: 'field-label' }, 'Number files'), numberSwitch, preview),
    picker.element,
    el(
      'div',
      { className: 'section-row' },
      el('div', {}, el('h2', { className: 'section-title' }, 'Videos'), summary),
      toggle,
    ),
    el('div', { className: 'entries' }, ...rows),
    actionBar(save),
  ];
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

function iconButton(name: IconName, label: string, onclick: () => void): HTMLElement {
  return el('button', { className: 'icon-button', title: label, ariaLabel: label, onclick }, icon(name));
}

function itemTile(item: DownloadItem): HTMLElement {
  if (item.thumbnail) return el('img', { className: 'item-tile', src: item.thumbnail, alt: '', referrerPolicy: 'no-referrer' });
  const name: IconName =
    item.status === 'done' ? 'check' : item.status === 'failed' ? 'alert' : item.quality.kind === 'audio' ? 'audio' : 'video';
  return el('span', { className: 'item-tile' }, icon(name));
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
    itemTile(item),
    el(
      'div',
      { className: 'item-text' },
      el('p', { className: 'item-title', title: item.title }, item.title),
      el('p', { className: 'meta' }, item.playlist && item.status === 'queued' ? `Waiting · ${item.playlist.title}` : statusLine(item)),
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
    return panelDownloads.replaceChildren(
      el(
        'div',
        { className: 'empty' },
        el('span', { className: 'empty-icon' }, icon('download')),
        el('p', { className: 'empty-title' }, 'No downloads yet'),
        el('p', { className: 'meta' }, 'Videos you save will show up here.'),
      ),
    );
  }
  const finished = items.length > active;
  const actions = [
    active > 1 ? el('button', { className: 'text-button', onclick: () => void send({ type: 'cancelAll' }) }, 'Cancel all') : null,
    finished ? el('button', { className: 'text-button', onclick: () => void send({ type: 'clear' }) }, 'Clear finished') : null,
  ].filter((button) => button !== null);
  panelDownloads.replaceChildren(
    el('div', { className: 'items' }, ...items.map(renderItem)),
    ...(actions.length > 0 ? [el('div', { className: 'list-actions' }, ...actions)] : []),
  );
}

async function find() {
  const url = input.value.trim();
  if (!url) return renderSave({ kind: 'empty' });
  renderSave({ kind: 'loading' });
  const result = await send<Inspected>({ type: 'inspect', url });
  // A newer search may have started while this one ran.
  if (input.value.trim() !== url) return;
  if (!result.ok) renderSave({ kind: 'failed', failure: result });
  else if (result.playlist) renderSave({ kind: 'playlist', playlist: result.playlist, from: null });
  else renderSave({ kind: 'media', media: result.media });
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

settingsButton.replaceChildren(icon('settings'));
showTheme();
onThemeChanged((changed) => {
  theme = changed;
  showTheme();
});
themeButton.addEventListener('click', nextTheme);
settingsButton.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
  close();
});
tabSave.addEventListener('click', () => showTab('save'));
tabDownloads.addEventListener('click', () => showTab('downloads'));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  showTab('save');
  void find();
});

/** A line under the header when the last check found something newer. Opens Settings, where it's one click. */
async function showUpdateNotice(helper: HelperInfo) {
  const found = available(await readUpdateState(), {
    extension: browser.runtime.getManifest().version,
    helper: helper.version,
    ytDlp: helper.ytDlp,
  });
  if (!found.version && !found.ytDlp) return;
  const text = found.version ? `ClipSave ${found.version} is available` : 'A newer yt-dlp is available';
  const notice = el(
    'button',
    {
      className: 'update-notice',
      type: 'button',
      onclick: () => {
        void browser.runtime.openOptionsPage();
        close();
      },
    },
    icon('refresh'),
    el('span', {}, text),
    el('span', { className: 'update-notice-action' }, 'Update'),
  );
  document.querySelector('.top')!.after(notice);
}

async function start() {
  onDownloadsChanged(renderDownloads);
  renderDownloads(await readDownloads());

  platform = (await browser.runtime.getPlatformInfo()).os;

  const status = await send<{ helper: HelperInfo }>({ type: 'status' });
  if (status.ok) void showUpdateNotice(status.helper);
  if (!status.ok) {
    renderSave({ kind: 'failed', failure: status });
    if (status.code === 'helper_missing') void waitForHelper();
    return;
  }
  await readCurrentTab();
}

void start();
