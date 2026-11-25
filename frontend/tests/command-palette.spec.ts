import { expect, test, type Page } from '@playwright/test';
import { paletteFilter } from '../src/components/CommandPalette';

const workspaces = [
  { id: 1, name: 'Design team', visibility: 'PRIVATE', ownerId: '7' },
  { id: 2, name: 'Personal', visibility: 'PRIVATE', ownerId: '7' },
];
const doc = (id: number, title: string) => ({
  id,
  workspaceId: 1,
  title,
  authorId: '7',
  markdown: '',
  visibility: 'PRIVATE',
  canEdit: true,
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
});

async function signIn(page: Page) {
  await page.context().addCookies([
    {
      name: 'marksync_session',
      value: 'local-test-jwt',
      url: 'http://localhost:3100',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 7, email: 'olivia@example.com', role: 'user' } }),
  );
  await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: workspaces }));
  await page.route('**/api/workspaces/*/membership', (route) =>
    route.fulfill({
      json: { role: 'OWNER', canEdit: true, canManageMembers: true, canManageWorkspace: true },
    }),
  );
  await page.route('**/api/workspaces/2/documents', (route) => route.fulfill({ json: [] }));
}

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

test.describe('command palette', () => {
  test('opens with the shortcut, filters documents and highlights the match', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/documents', (route) =>
      route.fulfill({ json: [doc(3, 'Product roadmap'), doc(4, 'Meeting notes')] }),
    );
    await page.goto('/w/1');
    await expect(page.getByText('All documents')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    const dialog = palette(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('group', { name: 'Documents' })).toBeVisible();
    await expect(dialog.getByRole('group', { name: 'Actions' })).toBeVisible();
    await expect(dialog.getByRole('group', { name: 'Workspaces' })).toBeVisible();

    await dialog.getByRole('combobox').fill('road');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option', { name: 'Product roadmap' })).toBeVisible();
    await expect(dialog.locator('mark')).toHaveText('road');

    await dialog.getByRole('combobox').fill('zzz');
    await expect(dialog.getByText('No results for “zzz”.')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('opens from the sidebar search field and jumps to a document', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/documents', (route) =>
      route.fulfill({ json: [doc(3, 'Product roadmap')] }),
    );
    await page.route('**/api/documents/3', (route) =>
      route.fulfill({ json: doc(3, 'Product roadmap') }),
    );
    await page.goto('/w/1');
    await page.getByRole('button', { name: /Search or jump to/ }).click();
    await palette(page).getByRole('combobox').fill('product');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/w/1/d/3');
    await expect(palette(page)).toBeHidden();
  });

  test('traps focus while open and gives it back to what opened it', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    const search = page.getByRole('button', { name: /Search or jump to/ });
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
  });

  test('Ctrl+K toggles the palette on every platform, even from inside it', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    await expect(page.getByText('No documents yet')).toBeVisible();
    // Control explicitly, not ControlOrMeta: this is what Windows and Linux users press.
    await page.keyboard.press('Control+k');
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
  });

  test('reopening while it is still closing leaves the results clickable', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/2/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    await expect(page.getByText('No documents yet')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    // Reopen after the backdrop has faded out (150 ms) but while the panel is still closing
    // (200 ms): Radix then mounts a new backdrop after the panel, which must stay underneath it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(175);
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill('personal');
    await page.getByRole('option', { name: 'Personal' }).click({ timeout: 5_000 });
    await expect(page).toHaveURL('/w/2');
  });

  test('runs actions: new document, workspaces and the invite dialog', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces/1/members', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/documents', async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({
          title: 'Untitled document',
          markdown: '',
        });
        await route.fulfill({ status: 201, json: doc(9, 'Untitled document') });
      } else await route.fulfill({ json: [] });
    });
    await page.route('**/api/documents/9', (route) =>
      route.fulfill({ json: doc(9, 'Untitled document') }),
    );
    await page.goto('/w/1');
    await expect(page.getByText('No documents yet')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).getByRole('combobox').fill('invite');
    await page.getByRole('option', { name: 'Invite people' }).click();
    await expect(page.getByRole('dialog', { name: 'Invite people to Design team' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('option', { name: 'New document' }).click();
    await expect(page).toHaveURL('/w/1/d/9');

    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).getByRole('combobox').fill('personal');
    await page.getByRole('option', { name: 'Personal' }).click();
    await expect(page).toHaveURL('/w/2');
  });
});

test('the palette filter matches labels and ranks prefixes first', () => {
  expect(paletteFilter('document-3', '', ['Product roadmap'])).toBe(1);
  expect(paletteFilter('document-3', 'prod', ['Product roadmap'])).toBe(1);
  expect(paletteFilter('document-3', 'ROAD', ['Product roadmap'])).toBe(0.5);
  expect(paletteFilter('document-3', 'zzz', ['Product roadmap'])).toBe(0);
  // The internal value is not searchable: typing an id does not match every document.
  expect(paletteFilter('document-3', '3', ['Product roadmap'])).toBe(0);
});
