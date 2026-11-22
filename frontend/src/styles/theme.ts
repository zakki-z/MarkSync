/*
 * Light/dark theme helpers. The theme is a `.dark` class on <html>; src/styles/tokens.css
 * swaps every colour token under that class. The user's choice is stored in localStorage;
 * without one, the system preference (prefers-color-scheme) decides.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'marksync-theme';
/** Fired on window after the preference changes in this tab (other tabs get a `storage` event). */
export const THEME_CHANGE_EVENT = 'marksync-theme-change';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
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

/** Stores the preference (`system` clears it), applies it and notifies subscribers. */
export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
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
 * theme), and keeps following the system preference while no explicit choice is stored.
 * It must stay self-contained: it runs before any bundle is loaded.
 */
export const themeInitScript = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},m=window.matchMedia(${JSON.stringify(DARK_QUERY)});function p(){try{return localStorage.getItem(k)}catch(e){return null}}function a(){var s=p();document.documentElement.classList.toggle("dark",s==="dark"||(s!=="light"&&m.matches))}a();m.addEventListener("change",a)})()`;
