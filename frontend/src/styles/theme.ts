/*
 * Light/dark theme helpers. The theme is a `.dark` class on <html>; src/styles/tokens.css
 * swaps every colour token under that class. The user's choice is stored in localStorage.
 * Dark is the default: without a stored choice the app is dark. `system` (stored explicitly)
 * follows prefers-color-scheme.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'marksync-theme';
/** Fired on window after the preference changes in this tab (other tabs get a `storage` event). */
export const THEME_CHANGE_EVENT = 'marksync-theme-change';

const DARK_QUERY = '(prefers-color-scheme: dark)';
/** What the app shows before the user has chosen. */
export const DEFAULT_THEME: ThemePreference = 'dark';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Stores the preference, applies it and notifies subscribers. */
export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): still apply for this page.
  }
  applyTheme(resolveTheme(preference));
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Switches between light and dark, starting from what is currently shown. */
export function toggleTheme() {
  setThemePreference(resolveTheme(getThemePreference()) === 'dark' ? 'light' : 'dark');
}

/**
 * Inline <head> script that applies the theme before the first paint (no flash of the wrong
 * theme). Without a stored choice it applies the default (dark); with `system` it keeps
 * following the system preference.
 * It must stay self-contained: it runs before any bundle is loaded.
 */
export const themeInitScript = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},m=window.matchMedia(${JSON.stringify(DARK_QUERY)});function p(){try{return localStorage.getItem(k)}catch(e){return null}}function a(){var s=p();document.documentElement.classList.toggle("dark",s==="system"?m.matches:s!=="light")}a();m.addEventListener("change",a)})()`;
