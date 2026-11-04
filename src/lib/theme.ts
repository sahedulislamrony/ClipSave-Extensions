/**
 * Light, dark or the system's choice, shared by the popup and the Settings page. Kept in localStorage,
 * which is synchronous, so a page opens in the right colours, and which both pages share.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const KEY = 'theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.find((t) => t === saved) ?? 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Without storage the choice still holds until the page closes.
  }
}

export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Calls `listener` when the other page changes the theme. */
export function onThemeChanged(listener: (theme: Theme) => void) {
  addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) listener(readTheme());
  });
}
