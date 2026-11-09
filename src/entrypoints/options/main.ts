import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@/styles/theme.css';
import './style.css';
import { browser } from 'wxt/browser';
import { el, icon, type IconName } from '@/lib/dom';
import { HELP_PAGE, installStep, SITE } from '@/lib/install';
import { applyTheme, onThemeChanged, readTheme, saveTheme, THEME_LABELS, THEMES, type Theme } from '@/lib/theme';
import type { Command, FolderKind, HelperInfo, Result } from '@/lib/types';
import { onUpdateStateChanged, readPreferences, readUpdateState, savePreferences } from '@/lib/prefs';
import { available, extensionAsset, NO_UPDATE_STATE, type UpdateState } from '@/lib/updates';

const FIREFOX = import.meta.env.FIREFOX;
const EXTENSION_VERSION = browser.runtime.getManifest().version;

const sections = {
  updates: document.querySelector<HTMLElement>('#updates')!,
  folders: document.querySelector<HTMLElement>('#folders')!,
  appearance: document.querySelector<HTMLElement>('#appearance')!,
  about: document.querySelector<HTMLElement>('#about')!,
  help: document.querySelector<HTMLElement>('#help')!,
};

/** What the page knows. `helper` is null when it isn't installed; `undefined` while asking. */
const state: {
  helper: HelperInfo | null | undefined;
  helperError: string | null;
  /** The platform code from `runtime.getPlatformInfo()` (`mac`, `win`…), which picks the install command. */
  platform: string;
  os: string;
  arch: string;
  browserName: string;
  updates: UpdateState;
  autoCheck: boolean;
  /** Chrome, Edge and Brave: loaded from the folder the installer keeps, so one-click updates reach it. */
  managed: boolean;
  checking: boolean;
  /** A one-click update in progress, and when it started. */
  updating: { what: 'all' | 'ytdlp'; since: number } | null;
  updateNote: { tone: 'ok' | 'error'; text: string } | null;
} = {
  helper: undefined,
  helperError: null,
  platform: '',
  os: '',
  arch: '',
  browserName: '',
  updates: NO_UPDATE_STATE,
  autoCheck: false,
  managed: false,
  checking: false,
  updating: null,
  updateNote: null,
};

function send<T>(command: Command): Promise<Result<T>> {
  return browser.runtime.sendMessage(command) as Promise<Result<T>>;
}

function heading(id: string, title: string, iconName: IconName, lead?: string): HTMLElement {
  return el(
    'header',
    { className: 'section-head' },
    el('span', { className: 'section-icon' }, icon(iconName)),
    el('div', {}, el('h2', { id }, title), lead ? el('p', { className: 'meta' }, lead) : null),
  );
}

/** One row of a settings panel: what it is on the left, its value or control on the right. */
function row(title: string, detail: Node | string | null, ...end: (Node | null)[]): HTMLElement {
  return el(
    'div',
    { className: 'row' },
    el('div', { className: 'row-text' }, el('p', { className: 'row-title' }, title), detail ? el('div', { className: 'meta' }, detail) : null),
    end.some(Boolean) ? el('div', { className: 'row-end' }, ...end) : null,
  );
}

function badge(text: string, tone: 'ok' | 'new' | 'muted' | 'warn'): HTMLElement {
  return el('span', { className: `badge ${tone}` }, tone === 'ok' ? icon('check') : null, text);
}

function copyButton(label: string, text: () => string): HTMLButtonElement {
  const button = el('button', { className: 'secondary', type: 'button' }, icon('copy'), label);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text());
      button.replaceChildren(icon('check'), 'Copied');
      setTimeout(() => button.replaceChildren(icon('copy'), label), 1800);
    } catch {
      button.replaceChildren(icon('alert'), "Couldn't copy");
    }
  });
  return button;
}

function commandBox(command: string): HTMLElement {
  return el('div', { className: 'command-row' }, el('code', { className: 'command' }, command), copyButton('Copy', () => command));
}

function hasFeature(feature: string) {
  return state.helper?.features?.includes(feature) ?? false;
}

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : new Date(at).toLocaleString();
}

// Updates

function steps(...items: (string | Node)[]): HTMLElement {
  return el('ol', {}, ...items.map((item) => el('li', {}, item)));
}

function pathBox(path: string): HTMLElement {
  return el('div', { className: 'command-row' }, el('code', { className: 'command' }, path), copyButton('Copy', () => path));
}

function renderUpdates() {
  const { helper, updates } = state;
  const step = installStep(state.platform);
  const checked = updates.checkedAt !== null;
  // A check that failed before any succeeded knows no newest version, so it can't say "Up to date".
  const known = updates.release !== null;
  const found = available(updates, { extension: EXTENSION_VERSION, helper: helper?.version, ytDlp: helper?.ytDlp });
  const canUpdate = hasFeature('update');
  // A full update replaces the extension too, where it's loaded from the installer's folder.
  const reachesExtension = !FIREFOX && state.managed;

  // Extension
  const extensionStatus = !checked
    ? badge('Not checked', 'muted')
    : !known
      ? badge('Couldn’t check', 'muted')
      : found.extension
        ? badge(`${found.version} available`, 'new')
        : badge('Up to date', 'ok');
  let extensionMore: HTMLElement | null = null;
  if (found.extension && FIREFOX) {
    extensionMore = el(
      'div',
      { className: 'update-steps' },
      el('p', {}, 'Firefox Add-ons updates ClipSave by itself, usually within a day. To get it now: open about:addons, click the gear and choose Check for Updates.'),
    );
  } else if (found.extension && !state.managed) {
    const asset = updates.release ? extensionAsset(updates.release, false) : null;
    extensionMore = el(
      'div',
      { className: 'update-steps' },
      helper?.extensionDir
        ? el('p', {}, 'One-click updates reach ClipSave once it is loaded from the helper’s folder. Until then, update it by hand:')
        : null,
      steps(
        'Download the new version and unzip it over your ClipSave folder.',
        'On the extensions page, click the reload icon on ClipSave.',
      ),
      el(
        'div',
        { className: 'actions' },
        asset ? el('a', { className: 'primary', href: asset.url, rel: 'noreferrer' }, icon('download'), `Download ${found.version}`) : null,
        updates.release ? el('a', { className: 'secondary', href: `${SITE}/changelog`, target: '_blank', rel: 'noreferrer' }, "What's new", icon('external')) : null,
      ),
    );
  }

  // Helper
  let helperStatus: HTMLElement;
  let helperMore: HTMLElement | null = null;
  if (helper === undefined) helperStatus = badge('Checking…', 'muted');
  else if (helper === null) {
    helperStatus = badge('Not installed', 'warn');
    if (step) {
      helperMore = el(
        'div',
        { className: 'update-steps' },
        el('p', {}, `ClipSave needs its free helper to save files. Open ${step.app}, paste this and press Return:`),
        pathBox(step.command),
      );
    }
  } else if (!checked) helperStatus = badge('Not checked', 'muted');
  else if (found.helper) helperStatus = badge(`${found.version} available`, 'new');
  else if (found.ytDlp) helperStatus = badge(`yt-dlp ${updates.ytDlp} available`, 'new');
  else if (!known) helperStatus = badge('Couldn’t check', 'muted');
  else helperStatus = badge('Up to date', 'ok');

  // The one button: the whole of ClipSave when either part is behind (and the update can reach it),
  // otherwise only yt-dlp.
  const what: 'all' | 'ytdlp' | null =
    found.helper || (found.extension && reachesExtension) ? 'all' : found.ytDlp ? 'ytdlp' : null;
  let action: HTMLElement | null = null;
  if (helper && what && !canUpdate && step) {
    action = el(
      'div',
      { className: 'update-steps' },
      el('p', {}, `This helper is too old to update itself. Open ${step.app}, paste this and press Return; after that, updates take one click:`),
      pathBox(step.command),
    );
  } else if (helper && (what || state.updating)) {
    const kind = state.updating?.what ?? what!;
    const button = el(
      'button',
      { className: 'primary', type: 'button', disabled: state.updating !== null },
      icon(state.updating ? 'refresh' : 'download'),
      state.updating ? 'Updating…' : kind === 'all' ? `Update ClipSave to ${found.version}` : `Update yt-dlp to ${updates.ytDlp}`,
    );
    button.addEventListener('click', () => void runUpdate(kind));
    const explain =
      kind === 'all'
        ? `Downloads ${found.version}, checks it against its published checksums and replaces the helper, its tools${reachesExtension ? ' and this extension' : ''}. ${reachesExtension ? 'ClipSave restarts by itself and reopens Settings.' : ''}`
        : 'Downloads the newest yt-dlp, which keeps up with changes on sites, and checks it against its published checksum.';
    action = el(
      'div',
      { className: `update-steps${state.updating ? ' busy' : ''}` },
      el('p', {}, state.updating ? 'This takes a minute or two. Downloads can start again once it’s done.' : explain),
      el('div', { className: 'actions' }, button),
    );
  }
  const note = state.updateNote
    ? el('p', { className: `meta update-note ${state.updateNote.tone}`, role: 'status' }, state.updateNote.text)
    : null;

  // Moving to the folder the installer keeps, for one-click updates on Chrome, Edge and Brave.
  const move =
    !FIREFOX && !state.managed && helper?.extensionDir
      ? row(
          'Turn on one-click updates',
          el(
            'div',
            { className: 'stack' },
            el('span', {}, 'On the extensions page, choose Load unpacked and select this folder. ClipSave keeps its ID, downloads and settings.'),
            pathBox(helper.extensionDir),
          ),
        )
      : null;

  const auto = el('input', { type: 'checkbox', checked: state.autoCheck, ariaLabel: 'Check for updates automatically' });
  auto.addEventListener('change', async () => {
    state.autoCheck = auto.checked;
    await savePreferences({ autoCheck: auto.checked });
    if (auto.checked) await checkForUpdates(false);
  });

  const check = el('button', { className: 'secondary', type: 'button', disabled: state.checking }, icon('refresh'), state.checking ? 'Checking…' : 'Check now');
  check.addEventListener('click', () => void checkForUpdates(true));
  const lastChecked = updates.error
    ? el('p', { className: 'meta error', role: 'alert' }, updates.error)
    : el('p', { className: 'meta' }, checked ? `Checked ${relativeTime(updates.checkedAt!)}.` : 'Not checked yet.');

  sections.updates.replaceChildren(
    heading('updates-title', 'Updates', 'refresh', 'ClipSave and its helper share one version number.'),
    el(
      'div',
      { className: 'panel' },
      row('Extension', `Version ${EXTENSION_VERSION} for ${FIREFOX ? 'Firefox, from Firefox Add-ons' : state.managed ? 'Chrome, Edge and Brave, kept up to date by the helper' : 'Chrome, Edge and Brave'}`, extensionStatus),
      extensionMore,
      row(
        'Helper',
        helper ? `Version ${helper.version}${helper.ytDlp ? ` · yt-dlp ${helper.ytDlp}` : ''}` : helper === null ? 'The program that saves files' : 'Asking the helper…',
        helperStatus,
      ),
      helperMore,
      action,
      note ? el('div', { className: 'row' }, note) : null,
      move,
      row(
        'Check automatically',
        'Once a day, ask GitHub for the newest ClipSave and yt-dlp, and say when there’s an update. Nothing about you is sent.',
        el('label', { className: 'switch' }, auto, el('span', { className: 'switch-track' })),
      ),
      el('div', { className: 'row panel-foot' }, lastChecked, check),
    ),
  );
}

async function checkForUpdates(force: boolean) {
  state.checking = true;
  renderUpdates();
  const result = await send<{ updates: UpdateState }>({ type: 'checkUpdates', force });
  if (result.ok) state.updates = result.updates;
  state.checking = false;
  renderUpdates();
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Starts a one-click update and follows it. A full update replaces the helper, which leaves and is
 * started again by the next question, so this asks until the new one reports how the update ended.
 */
async function runUpdate(what: 'all' | 'ytdlp') {
  const since = Date.now();
  state.updating = { what, since };
  state.updateNote = null;
  renderUpdates();
  const started = await send<object>({ type: 'update', what });
  if (!started.ok) {
    state.updating = null;
    state.updateNote = { tone: 'error', text: started.message };
    return renderUpdates();
  }
  const deadline = since + 8 * 60_000;
  while (Date.now() < deadline) {
    await sleep(2500);
    const status = await send<{ helper: HelperInfo }>({ type: 'status' });
    if (!status.ok) continue;
    const last = status.helper.lastUpdate;
    if (!last?.at || last.at * 1000 < since - 2000) continue;
    state.helper = status.helper;
    state.updating = null;
    if (!last.ok) {
      state.updateNote = { tone: 'error', text: `The update didn't finish: ${last.message} Details: ${status.helper.updateLog ?? 'the update log'}.` };
      return renderAll();
    }
    state.updateNote = { tone: 'ok', text: `Updated: ${last.message}.` };
    renderAll();
    if (what === 'all') {
      const reloaded = await send<{ reloading: boolean }>({ type: 'reloadIfUpdated' });
      if (reloaded.ok && reloaded.reloading) {
        state.updateNote = { tone: 'ok', text: 'Updated. Restarting ClipSave…' };
        renderUpdates();
      }
    }
    return;
  }
  state.updating = null;
  state.updateNote = {
    tone: 'error',
    text: `The update is taking longer than it should. Details: ${state.helper?.updateLog ?? 'the update log'}.`,
  };
  renderUpdates();
}

/** Whether this copy was loaded from the installer's folder, which holds a file the installer writes. */
async function isManaged(): Promise<boolean> {
  if (FIREFOX) return false;
  try {
    return (await fetch(new URL('/managed.json', location.href), { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

// Folders

function folderRow(kind: FolderKind): HTMLElement {
  const helper = state.helper;
  const current = helper ? (kind === 'video' ? helper.videoDir : helper.audioDir) : '';
  const fallback = helper ? (kind === 'video' ? helper.defaultVideoDir : helper.defaultAudioDir) : undefined;
  const custom = fallback !== undefined && current !== fallback;
  const can = hasFeature('folders');

  const field = el('input', {
    className: 'path',
    type: 'text',
    value: current,
    spellcheck: false,
    disabled: !can,
    ariaLabel: kind === 'video' ? 'Video folder' : 'Audio folder',
  });
  const status = el('p', { className: 'meta field-status', role: 'status' });
  const say = (text: string, tone: '' | 'ok' | 'error' = '') => {
    status.className = `meta field-status ${tone}`;
    status.textContent = text;
  };

  async function save(path: string | null) {
    say('Saving…');
    const result = await send<{ path: string }>({ type: 'setFolder', kind, path });
    if (!result.ok) return say(result.message, 'error');
    if (state.helper) state.helper = { ...state.helper, [kind === 'video' ? 'videoDir' : 'audioDir']: result.path };
    renderFolders();
    renderAbout();
    flash(kind, path === null ? 'Back to the default folder.' : 'Saved. New downloads go here.');
  }

  const browse = el('button', { className: 'secondary', type: 'button', disabled: !can || !hasFeature('pickFolder') }, icon('folder'), 'Browse…');
  browse.addEventListener('click', async () => {
    say('Choose a folder in the window that opened.');
    const result = await send<{ path: string | null }>({ type: 'pickFolder', kind });
    if (!result.ok) return say(result.message, 'error');
    if (!result.path) return say('');
    field.value = result.path;
    await save(result.path);
  });
  const apply = el('button', { className: 'primary', type: 'button', hidden: true }, 'Save');
  apply.addEventListener('click', () => void save(field.value));
  field.addEventListener('input', () => {
    apply.hidden = field.value.trim() === current || field.value.trim() === '';
  });
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !apply.hidden) void save(field.value);
  });
  const show = el('button', { className: 'icon-button', type: 'button', title: 'Show in folder', ariaLabel: 'Show in folder', disabled: !current }, icon('external'));
  show.addEventListener('click', async () => {
    const result = await send<object>({ type: 'reveal', path: current });
    if (!result.ok) say("This folder doesn't exist yet. It's made with the first download.", 'error');
  });
  const reset = custom ? el('button', { className: 'text-button', type: 'button' }, 'Use default') : null;
  reset?.addEventListener('click', () => void save(null));

  const pending = flashes.get(kind);
  if (pending) say(pending, 'ok');

  return el(
    'div',
    { className: 'folder' },
    row(
      kind === 'video' ? 'Videos' : 'Audio',
      kind === 'video' ? 'MP4 files. Each playlist gets its own folder inside.' : 'MP3 and M4A files. Each playlist gets its own folder inside.',
      custom ? badge('Custom', 'new') : badge('Default', 'muted'),
    ),
    el('div', { className: 'folder-field' }, field, show, browse, apply),
    el('div', { className: 'folder-foot' }, status, reset),
  );
}

const flashes = new Map<FolderKind, string>();
function flash(kind: FolderKind, text: string) {
  flashes.set(kind, text);
  renderFolders();
  setTimeout(() => {
    flashes.delete(kind);
  }, 4000);
}

function renderFolders() {
  const helper = state.helper;
  let body: HTMLElement;
  if (helper === undefined) body = el('div', { className: 'panel' }, row('Asking the helper…', null));
  else if (helper === null) body = el('div', { className: 'panel' }, row('The helper is not installed', 'Install it from Updates above to choose where files go.'));
  else {
    body = el(
      'div',
      { className: 'panel' },
      hasFeature('folders')
        ? null
        : el('p', { className: 'panel-note' }, icon('info'), 'This helper is too old to change folders. Update it from Updates above.'),
      folderRow('video'),
      folderRow('audio'),
    );
  }
  sections.folders.replaceChildren(heading('folders-title', 'Save folders', 'folder', 'Where finished downloads go. Unfinished ones wait in a cache folder.'), body);
}

// Appearance

function renderAppearance() {
  const current = readTheme();
  const icons: Record<Theme, IconName> = { system: 'system', light: 'light', dark: 'dark' };
  const choices = THEMES.map((theme) => {
    const button = el('button', { type: 'button', role: 'radio', ariaChecked: String(theme === current) }, icon(icons[theme]), THEME_LABELS[theme]);
    button.addEventListener('click', () => {
      saveTheme(theme);
      applyTheme(theme);
      renderAppearance();
    });
    return button;
  });
  sections.appearance.replaceChildren(
    heading('appearance-title', 'Appearance', 'palette'),
    el(
      'div',
      { className: 'panel' },
      row('Theme', 'System follows your computer. Applies to the popup too.', el('div', { className: 'choices', role: 'radiogroup', ariaLabel: 'Theme' }, ...choices)),
    ),
  );
}

// About

function aboutRows(): [string, string][] {
  const helper = state.helper;
  const rows: [string, string][] = [
    ['Extension', `${EXTENSION_VERSION} (${FIREFOX ? 'Firefox' : 'Chromium'} build)`],
    ['Extension ID', browser.runtime.id],
    ['Browser', state.browserName],
    ['System', [state.os, state.arch].filter(Boolean).join(' · ')],
  ];
  if (helper === null) rows.push(['Helper', state.helperError ?? 'Not installed']);
  if (helper) {
    rows.push(
      ['Helper', helper.version],
      ['Helper location', helper.path ?? 'Unknown'],
      ['yt-dlp', helper.ytDlp ?? 'Not found'],
      ['ffmpeg', helper.ffmpeg ? 'Found' : 'Not found (needed for MP3 and merging)'],
      ['JavaScript runtime', helper.jsRuntime ? (helper.jsRuntime === 'quickjs' ? 'QuickJS' : 'Deno') : helper.jsRuntime === undefined ? 'Unknown' : "Not found (YouTube won't work)"],
      ['Video folder', helper.videoDir],
      ['Audio folder', helper.audioDir],
    );
  }
  return rows;
}

function detailsText(): string {
  return aboutRows()
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

function renderAbout() {
  const list = el('dl', { className: 'facts' });
  for (const [label, value] of aboutRows()) list.append(el('dt', {}, label), el('dd', { title: value }, value || '—'));
  sections.about.replaceChildren(
    heading('about-title', 'About', 'info', 'Handy when you report a problem.'),
    el('div', { className: 'panel' }, list, el('div', { className: 'row panel-foot' }, el('p', { className: 'meta' }, 'Copies everything above as text.'), copyButton('Copy details', detailsText))),
  );
}

// Help and feedback

/** The website's bug form, with the versions, browser and system filled in. */
function bugReportUrl(): string {
  const url = new URL(`${SITE}/report-bug`);
  url.searchParams.set('extensionVersion', `${EXTENSION_VERSION}, helper ${state.helper?.version ?? 'not installed'}`);
  if (state.browserName) url.searchParams.set('browser', state.browserName);
  const system = [state.os, state.arch].filter(Boolean).join(' · ');
  if (system) url.searchParams.set('system', system);
  return url.toString();
}

function renderHelp() {
  const links: [IconName, string, string, string][] = [
    ['book', 'Install and use', 'Setup, every browser, troubleshooting', `${SITE}/download`],
    ['bug', 'Report a bug', 'Opens the bug form with your versions filled in', bugReportUrl()],
    ['idea', 'Request a feature', 'Tell us what would make ClipSave better', `${SITE}/request-feature`],
    ['shield', 'Privacy policy', 'ClipSave collects no data', `${SITE}/privacy`],
    ['refresh', 'Release notes', 'What changed in each version', `${SITE}/changelog`],
    ['code', 'Open source', 'Free and open source, GPL-3.0', `${SITE}/open-source`],
  ];
  sections.help.replaceChildren(
    heading('help-title', 'Help and feedback', 'link'),
    el(
      'div',
      { className: 'links' },
      ...links.map(([name, title, detail, href]) =>
        el(
          'a',
          { className: 'link-card', href, target: '_blank', rel: 'noreferrer' },
          el('span', { className: 'link-icon' }, icon(name)),
          el('span', { className: 'link-text' }, el('span', { className: 'row-title' }, title), el('span', { className: 'meta' }, detail)),
          icon('external'),
        ),
      ),
    ),
    el('p', { className: 'meta colophon' }, `ClipSave ${EXTENSION_VERSION}. Save responsibly: only videos you have the right to keep.`),
  );
}

function renderAll() {
  renderUpdates();
  renderFolders();
  renderAppearance();
  renderAbout();
  renderHelp();
}

async function browserName(): Promise<string> {
  const firefox = (browser.runtime as { getBrowserInfo?: () => Promise<{ name: string; version: string }> }).getBrowserInfo;
  if (firefox) {
    const info = await firefox();
    return `${info.name} ${info.version}`;
  }
  const brands = (navigator as { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData?.brands ?? [];
  const named = brands.find((b) => !/chromium|not.?a.?brand/i.test(b.brand)) ?? brands.find((b) => /chromium/i.test(b.brand));
  return named ? `${named.brand} ${named.version}` : navigator.userAgent;
}

const OS_NAMES: Record<string, string> = { mac: 'macOS', win: 'Windows', linux: 'Linux', cros: 'ChromeOS', android: 'Android', openbsd: 'OpenBSD' };

async function start() {
  applyTheme(readTheme());
  onThemeChanged((theme) => {
    applyTheme(theme);
    renderAppearance();
  });
  const platform = await browser.runtime.getPlatformInfo();
  state.platform = platform.os;
  state.os = OS_NAMES[platform.os] ?? platform.os;
  state.arch = platform.arch;
  state.browserName = await browserName().catch(() => navigator.userAgent);
  [state.updates, state.managed, { autoCheck: state.autoCheck }] = await Promise.all([readUpdateState(), isManaged(), readPreferences()]);
  onUpdateStateChanged((updates) => {
    state.updates = updates;
    renderUpdates();
  });
  renderAll();

  const status = await send<{ helper: HelperInfo }>({ type: 'status' });
  if (status.ok) state.helper = status.helper;
  else {
    state.helper = null;
    if (status.code !== 'helper_missing') state.helperError = status.message;
  }
  renderAll();
}

void start();
