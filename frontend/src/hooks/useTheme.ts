'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  toggleTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/src/styles/theme';

function subscribe(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    // Another tab changed the preference: apply it here too.
    applyTheme(resolveTheme(getThemePreference()));
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    media.removeEventListener('change', onChange);
  };
}

// Snapshots are strings so useSyncExternalStore can compare them by value.
const getSnapshot = () => `${getThemePreference()}:${resolveTheme(getThemePreference())}`;
const getServerSnapshot = () => 'dark:dark';

/** Current theme preference and the theme actually shown, plus setters. No UI included. */
export function useTheme(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
} {
  const [preference, resolvedTheme] = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  ).split(':') as [ThemePreference, ResolvedTheme];
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference, resolvedTheme, setPreference, toggle: toggleTheme };
}
