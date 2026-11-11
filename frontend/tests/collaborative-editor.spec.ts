import { expect, test, type Page } from '@playwright/test';
import { mockCollaboration } from './support/collabServer';

const workspace = { id: 1, name: 'Personal', visibility: 'PRIVATE', ownerId: '7' };
const document = (overrides: Record<string, unknown> = {}) => ({
  id: 2,
  workspaceId: 1,
  title: 'Shared notes',
  markdown: 'stale seed copy',
  authorId: '7',
  visibility: 'PRIVATE',
  canEdit: true,
  createdAt: '2026-10-27T19:00:00Z',
  updatedAt: '2026-10-27T19:00:00Z',
  ...overrides,
});

async function openDocument(page: Page, overrides: Record<string, unknown> = {}) {
  await page.context().addCookies([
    {
      name: 'marksync_session',
      value: 'local-test-jwt',
      url: 'http://localhost:3100',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } }),
  );
  await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
  await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/documents/2', (route) => route.fulfill({ json: document(overrides) }));
  await page.goto('/w/1/d/2');
}

const editor = (page: Page) => page.getByLabel('Markdown content');

test.describe('collaborative editor', () => {
  test('shows the shared text, the connection state and sends typing to the service', async ({
    page,
  }) => {
    const collaboration = await mockCollaboration(page, { markdown: '# Shared' });
    await openDocument(page);

    await expect(editor(page)).toHaveText('# Shared');
    await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible();
    await expect(page.getByText('All changes synced')).toBeVisible();

    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' typed here');
    await expect.poll(() => collaboration.text()).toBe('# Shared typed here');
  });

  test('shows other people’s edits and cursors as they happen', async ({ page }) => {
    const collaboration = await mockCollaboration(page, { markdown: 'Hello world' });
    await openDocument(page);
    await expect(editor(page)).toHaveText('Hello world');

    collaboration.edit((text) => text.insert(5, ','));
    await expect(editor(page)).toHaveText('Hello, world');

    collaboration.showCursor('bob', '#1971c2', 3);
    await expect(page.locator('.cm-ySelectionInfo')).toHaveText('bob');
  });

  test('the live preview follows the shared text', async ({ page }) => {
    const collaboration = await mockCollaboration(page, { markdown: '# First' });
    await openDocument(page);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('First');

    collaboration.edit((text) => {
      text.delete(0, text.length);
      text.insert(0, '# Changed by someone else');
    });
    await expect(page.locator('.markdown-content h1')).toHaveText('Changed by someone else');
  });

  test('stays editable through a lost connection and merges what was typed offline', async ({
    page,
  }) => {
    const collaboration = await mockCollaboration(page, { markdown: 'online ' });
    await openDocument(page);
    await expect(page.getByText('All changes synced')).toBeVisible();

    collaboration.dropConnections();
    await expect(page.getByRole('status').filter({ hasText: 'Reconnecting' })).toBeVisible();
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('offline');
    await expect(editor(page)).toHaveText('online offline');

    await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(() => collaboration.text()).toBe('online offline');
    expect(collaboration.joins).toBe(2);
  });

  test('joins once and leaves when the page is left', async ({ page }) => {
    const collaboration = await mockCollaboration(page, { markdown: 'text' });
    await openDocument(page);
    await expect(page.getByText('All changes synced')).toBeVisible();
    expect(collaboration.joins).toBe(1);

    await page
      .getByRole('link', { name: /invitations/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/invitations$/);
    await expect.poll(() => collaboration.leaves).toBe(1);
    await expect.poll(() => collaboration.closes).toBeGreaterThan(0);
  });
});

test.describe('read-only behaviour', () => {
  test('the editor becomes read-only when the server withdraws edit permission', async ({
    page,
  }) => {
    const collaboration = await mockCollaboration(page, { markdown: 'original' });
    await openDocument(page);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');

    collaboration.setCanEdit(false);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.alert.error')).toContainText('no longer have permission');

    await editor(page).click();
    await page.keyboard.type('blocked');
    await expect(editor(page)).toHaveText('original');
    expect(collaboration.text()).toBe('original');
  });

  test('is read-only until the service has sent its state', async ({ page }) => {
    // No collaboration service answers the connection, so the text is never confirmed.
    await page.routeWebSocket(/\/ws$/, () => {});
    await openDocument(page);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Connecting' })).toBeVisible();
  });

  test('a viewer sees the live text without an editor, and the server also refuses writes', async ({
    page,
  }) => {
    const collaboration = await mockCollaboration(page, {
      markdown: '# Live copy',
      canEdit: false,
    });
    await openDocument(page, { canEdit: false });

    await expect(page.locator('.markdown-content h1')).toHaveText('Live copy');
    await expect(editor(page)).toHaveCount(0);
    collaboration.edit((text) => text.insert(text.length, '\n\nmore'));
    await expect(page.locator('.markdown-content')).toContainText('more');
  });
});
