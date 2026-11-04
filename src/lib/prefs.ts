import { browser } from 'wxt/browser';
import { NO_UPDATE_STATE, type UpdateState } from './updates';

/** Choices made in Settings that the background needs too. Kept in extension storage. */
export interface Preferences {
  /** Check GitHub for a newer ClipSave and yt-dlp once a day. Off until the person turns it on. */
  autoCheck: boolean;
}

const PREFERENCES = 'preferences';
const UPDATES = 'updates';
const HELPER_SEEN = 'helperSeen';

export async function readPreferences(): Promise<Preferences> {
  const stored = (await browser.storage.local.get(PREFERENCES))[PREFERENCES] as Partial<Preferences> | undefined;
  return { autoCheck: stored?.autoCheck === true };
}

export async function savePreferences(change: Partial<Preferences>) {
  await browser.storage.local.set({ [PREFERENCES]: { ...(await readPreferences()), ...change } });
}

export async function readUpdateState(): Promise<UpdateState> {
  return ((await browser.storage.local.get(UPDATES))[UPDATES] as UpdateState | undefined) ?? NO_UPDATE_STATE;
}

export async function saveUpdateState(state: UpdateState) {
  await browser.storage.local.set({ [UPDATES]: state });
}

export function onUpdateStateChanged(listener: (state: UpdateState) => void) {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[UPDATES]) listener((changes[UPDATES].newValue as UpdateState | undefined) ?? NO_UPDATE_STATE);
  });
}

/** The helper's versions the last time it answered, so a check can tell when it's behind without asking it. */
export interface HelperSeen {
  version: string;
  ytDlp: string | null;
}

export async function readHelperSeen(): Promise<HelperSeen | null> {
  return ((await browser.storage.local.get(HELPER_SEEN))[HELPER_SEEN] as HelperSeen | undefined) ?? null;
}

export async function saveHelperSeen(seen: HelperSeen) {
  await browser.storage.local.set({ [HELPER_SEEN]: seen });
}
