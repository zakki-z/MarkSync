import { useState } from 'react';

export const MAX_PINS = 3;

function load(key: string): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => Number.isInteger(id)).slice(0, MAX_PINS)
      : [];
  } catch {
    return [];
  }
}

/**
 * Up to MAX_PINS pinned ids, remembered in this browser under `key`. Only call it from components
 * that render after the first client render (they all mount behind a loading screen).
 */
export function usePins(key: string) {
  const [pinned, setPinned] = useState(() => load(key));

  const toggle = (id: number): boolean => {
    const next = pinned.includes(id) ? pinned.filter((pin) => pin !== id) : [...pinned, id];
    if (next.length > MAX_PINS) return false;
    setPinned(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Pins still work for this page view when storage is unavailable.
    }
    return true;
  };

  return { pinned, isPinned: (id: number) => pinned.includes(id), toggle };
}
