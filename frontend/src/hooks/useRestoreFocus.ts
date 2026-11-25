import { useRef } from 'react';

/**
 * Remembers what had focus when an overlay opened and puts focus back there when it closes.
 * Radix does this by itself only for overlays opened through their own Trigger; the shell opens
 * its dialogs from many places (shortcuts, the palette, cards), so they use this instead. Spread
 * the returned handlers on the Radix content.
 */
export function useRestoreFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const previous = useRef<HTMLElement | null>(null);
  return {
    // Runs just before the overlay moves focus inside itself.
    onOpenAutoFocus: (event: Event) => {
      previous.current = document.activeElement as HTMLElement | null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = previous.current;
      previous.current = null;
      if (event.defaultPrevented || !target?.isConnected || target === document.body) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
    },
  };
}
