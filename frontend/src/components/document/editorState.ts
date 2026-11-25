import { relativeDate } from '@/src/format';

/*
 * Pure helpers behind the document page's status displays, kept apart from React and CodeMirror
 * so they are cheap to test.
 */

export type SaveTone = 'saved' | 'unsaved' | 'saving';

/**
 * What the save indicator says. Only the title and visibility are saved by hand; the Markdown is
 * synchronised live and reported separately by the editor status bar.
 */
export function saveStatus({
  dirty,
  saving,
  savedAt,
  now,
}: {
  dirty: boolean;
  saving: boolean;
  /** When this page last saved successfully (ms), if it did. */
  savedAt?: number;
  now: number;
}): { label: string; tone: SaveTone } {
  if (saving) return { label: 'Saving…', tone: 'saving' };
  if (dirty) return { label: 'Unsaved changes', tone: 'unsaved' };
  if (savedAt === undefined) return { label: 'Saved', tone: 'saved' };
  if (now - savedAt < 60_000) return { label: 'Saved just now', tone: 'saved' };
  return { label: `Saved ${relativeDate(new Date(savedAt).toISOString(), now)}`, tone: 'saved' };
}

/** Words of a Markdown text: runs of non-space characters that contain a letter or a digit. */
export function countWords(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) count++;
  return count;
}

export type CursorPosition = { line: number; column: number; selected: number };

export const START: CursorPosition = { line: 1, column: 1, selected: 0 };

/** Line and column (both from 1) of an offset in a text. The editor uses CodeMirror's own index. */
export function positionAt(text: string, offset: number): Omit<CursorPosition, 'selected'> {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lineStart = before.lastIndexOf('\n') + 1;
  return { line: before.split('\n').length, column: before.length - lineStart + 1 };
}

/** "Ln 4, Col 12", plus the selection length when there is one. */
export function formatPosition({ line, column, selected }: CursorPosition): string {
  return `Ln ${line}, Col ${column}${selected ? ` (${selected} selected)` : ''}`;
}

/**
 * The cursor position as an external store: the editor writes it, the status bar reads it with
 * useSyncExternalStore. It changes on every keystroke, so it never goes through page state.
 */
export function createCursorStore() {
  let position = START;
  const listeners = new Set<() => void>();
  return {
    get: () => position,
    set(next: CursorPosition) {
      if (
        next.line === position.line &&
        next.column === position.column &&
        next.selected === position.selected
      )
        return;
      position = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type CursorStore = ReturnType<typeof createCursorStore>;
