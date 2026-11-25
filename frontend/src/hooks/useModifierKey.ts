import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** The symbol of the shortcut modifier on this platform: ⌘ on Apple devices, Ctrl elsewhere. */
export function useModifierKey(): string {
  return useSyncExternalStore(
    noSubscription,
    () => (isApple() ? '⌘' : 'Ctrl '),
    () => '⌘',
  );
}
