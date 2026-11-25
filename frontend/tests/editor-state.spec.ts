import { expect, test } from '@playwright/test';
import {
  countWords,
  createCursorStore,
  formatPosition,
  positionAt,
  saveStatus,
} from '../src/components/document/editorState';
import { relativeDate } from '../src/format';
import { PresenceHub } from '../src/presence/PresenceHub';
import type { PresenceSocket } from '../src/presence/WorkspacePresenceClient';

const NOW = Date.parse('2026-11-25T12:00:00Z');

test.describe('save status', () => {
  test('saving wins over everything else', () => {
    expect(saveStatus({ dirty: true, saving: true, now: NOW })).toEqual({
      label: 'Saving…',
      tone: 'saving',
    });
  });

  test('edits to the title or visibility are unsaved until saved', () => {
    expect(saveStatus({ dirty: true, saving: false, savedAt: NOW - 1000, now: NOW })).toEqual({
      label: 'Unsaved changes',
      tone: 'unsaved',
    });
  });

  test('a save in this page reads "just now" for a minute, then a relative time', () => {
    expect(saveStatus({ dirty: false, saving: false, savedAt: NOW - 30_000, now: NOW }).label).toBe(
      'Saved just now',
    );
    expect(
      saveStatus({ dirty: false, saving: false, savedAt: NOW - 5 * 60_000, now: NOW }).label,
    ).toBe('Saved 5m ago');
  });

  test('without a save in this page it only says saved', () => {
    expect(saveStatus({ dirty: false, saving: false, now: NOW })).toEqual({
      label: 'Saved',
      tone: 'saved',
    });
  });
});

test.describe('editor status bar', () => {
  test('counts words, not Markdown punctuation', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('# Product roadmap\n\n- Ship **real-time** comments')).toBe(5);
    expect(countWords('Café déjà vu, 2026!')).toBe(4);
    expect(countWords('---\n> \n* * *')).toBe(0);
  });

  test('finds the line and column of an offset', () => {
    const text = '# Title\n\nSecond paragraph';
    expect(positionAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt(text, 7)).toEqual({ line: 1, column: 8 });
    expect(positionAt(text, 8)).toEqual({ line: 2, column: 1 });
    expect(positionAt(text, text.length)).toEqual({ line: 3, column: 17 });
    expect(positionAt(text, 999)).toEqual({ line: 3, column: 17 });
  });

  test('formats the position with the selection when there is one', () => {
    expect(formatPosition({ line: 4, column: 12, selected: 0 })).toBe('Ln 4, Col 12');
    expect(formatPosition({ line: 1, column: 3, selected: 5 })).toBe('Ln 1, Col 3 (5 selected)');
  });

  test('the cursor store only notifies when the position changes', () => {
    const store = createCursorStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.set({ line: 1, column: 1, selected: 0 });
    expect(calls).toBe(0);
    store.set({ line: 2, column: 4, selected: 0 });
    expect(calls).toBe(1);
    expect(store.get()).toEqual({ line: 2, column: 4, selected: 0 });
    unsubscribe();
    store.set({ line: 3, column: 1, selected: 0 });
    expect(calls).toBe(1);
  });
});

test.describe('relative dates', () => {
  test('reads naturally and falls back to the date after a week', () => {
    const ago = (ms: number) => new Date(NOW - ms).toISOString();
    expect(relativeDate(ago(10_000), NOW)).toBe('Just now');
    expect(relativeDate(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(relativeDate(ago(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(relativeDate(ago(30 * 3_600_000), NOW)).toBe('Yesterday');
    expect(relativeDate(ago(4 * 86_400_000), NOW)).toBe('4d ago');
    expect(relativeDate(ago(20 * 86_400_000), NOW)).toMatch(/2026/);
    expect(relativeDate('', NOW)).toBe('Just now');
  });
});

class FakeSocket implements PresenceSocket {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

const noTimers = { after: () => () => undefined, every: () => () => undefined };

test.describe('presence hub', () => {
  test('exposes the connection of the open workspace as stable slices', () => {
    const hub = new PresenceHub();
    let notified = 0;
    hub.subscribe(() => notified++);
    expect(hub.getStatus()).toBeUndefined();

    const socket = new FakeSocket();
    const close = hub.connect({ workspaceId: 1, createSocket: () => socket, scheduler: noTimers });
    expect(hub.getStatus()).toBe('connecting');
    socket.open();
    socket.receive({ type: 'presence', workspaceId: 1, users: [{ id: 7, displayName: 'olivia' }] });
    expect(hub.getStatus()).toBe('connected');
    const users = hub.getUsers();
    expect(users).toEqual([{ id: 7, displayName: 'olivia' }]);

    // A message changes the messages slice only; the users array keeps its identity.
    socket.receive({
      type: 'message',
      workspaceId: 1,
      sender: { id: 7, displayName: 'olivia' },
      text: 'hello',
      sentAt: '2026-11-25T12:00:00Z',
    });
    expect(hub.getUsers()).toBe(users);
    expect(hub.getMessages()?.map((message) => message.text)).toEqual(['hello']);
    expect(hub.send('hi')).toBe(true);

    const before = notified;
    close();
    expect(socket.closed).toBe(true);
    expect(hub.getStatus()).toBeUndefined();
    expect(hub.send('after')).toBe(false);
    expect(notified).toBeGreaterThan(before);
  });
});
