import { expect, test, type Page } from '@playwright/test';
import { mockCollaboration } from './support/collabServer';

const workspace = { id: 1, name: 'Personal', visibility: 'PRIVATE', ownerId: '7' };
const document = (overrides: Record<string, unknown> = {}) => ({
  id: 2,
  workspaceId: 1,
  title: 'Original',
  markdown: '# Original content',
  authorId: '7',
  visibility: 'PRIVATE',
  canEdit: true,
  createdAt: '2026-10-27T19:00:00Z',
  updatedAt: '2026-10-27T19:00:00Z',
  ...overrides,
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
    route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } }),
  );
  await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
}

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('opens the latest workspace from /documents', async ({ page }) => {
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/documents');
    await expect(page).toHaveURL('/w/1');
    await expect(page.getByText('No documents yet. Create your first one.')).toBeVisible();
  });

  test('creates a personal workspace when the user has none', async ({ page }) => {
    await page.route('**/api/workspaces', async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ name: 'Personal' });
        await route.fulfill({ status: 201, json: workspace });
      } else {
        await route.fulfill({ json: [] });
      }
    });
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/documents');
    await expect(page).toHaveURL('/w/1');
  });

  test('dashboard lists documents, filters them and creates a new one', async ({ page }) => {
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/workspaces/1/documents', async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({
          title: 'Untitled document',
          markdown: '',
        });
        await route.fulfill({ status: 201, json: document({ id: 9, title: 'Untitled document' }) });
      } else {
        await route.fulfill({
          json: [document(), document({ id: 3, title: 'Roadmap', visibility: 'PUBLIC' })],
        });
      }
    });
    await page.route('**/api/documents/9', (route) =>
      route.fulfill({ json: document({ id: 9, title: 'Untitled document' }) }),
    );
    await page.goto('/w/1');
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Roadmap.*Public/ })).toBeVisible();
    await page.getByPlaceholder('Search documents…').fill('road');
    await expect(page.getByRole('link', { name: /Original/ })).toHaveCount(0);
    await page.getByRole('button', { name: '+ New document' }).click();
    await expect(page).toHaveURL('/w/1/d/9');
    await expect(page.getByLabel('Document title')).toHaveValue('Untitled document');
  });

  test('lists workspaces in the sidebar, navigates, and keeps the profile in the corner', async ({
    page,
  }) => {
    await page.route('**/api/workspaces', (route) =>
      route.fulfill({ json: [workspace, { ...workspace, id: 4, name: 'Team' }] }),
    );
    await page.route('**/api/workspaces/*/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL('/w/4');
    const profile = await page.locator('.profile-bar').boundingBox();
    const viewport = page.viewportSize()!;
    expect(profile!.y + profile!.height).toBeGreaterThan(viewport.height - 40);
  });

  test('pins up to three workspaces and remembers them', async ({ page }) => {
    const names = ['Personal', 'Team', 'Uni', 'Side', 'Work'];
    await page.route('**/api/workspaces', (route) =>
      route.fulfill({ json: names.map((name, i) => ({ ...workspace, id: i + 1, name })) }),
    );
    await page.route('**/api/workspaces/*/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    for (const name of ['Work', 'Side', 'Uni'])
      await page.getByRole('button', { name: `Pin ${name}` }).click();
    await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible();
    await page.getByRole('button', { name: 'Pin Team' }).click();
    await expect(page.locator('.alert.error')).toContainText('up to 3 workspaces');
    await expect(page.getByRole('button', { name: 'Unpin Work' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Unpin Uni' })).toBeVisible();
    await page.getByRole('button', { name: 'Unpin Uni' }).click();
    await page.getByRole('button', { name: 'Pin Team' }).click();
    await expect(page.getByRole('button', { name: 'Unpin Team' })).toBeVisible();
  });

  test('pins up to three documents and lists them first', async ({ page }) => {
    const docs = [1, 2, 3, 4].map((id) => document({ id, title: `Doc ${id}` }));
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: docs }));
    await page.goto('/w/1');
    await page.getByRole('button', { name: 'Pin Doc 4' }).click();
    await expect(page.locator('.document-item').first()).toContainText('Doc 4');
    await page.getByRole('button', { name: 'Pin Doc 3' }).click();
    await page.getByRole('button', { name: 'Pin Doc 2' }).click();
    await page.getByRole('button', { name: 'Pin Doc 1' }).click();
    await expect(page.locator('.alert.error')).toContainText('up to 3 documents');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Unpin Doc 4' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pin Doc 1' })).toBeVisible();
  });

  test('shows the API error when creating a document is forbidden', async ({ page }) => {
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/workspaces/1/documents', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 403, json: { detail: 'Access denied' } });
      } else {
        await route.fulfill({ json: [] });
      }
    });
    await page.goto('/w/1');
    await page.getByRole('button', { name: '+ New document' }).click();
    await expect(page.locator('.alert.error')).toContainText('Access denied');
  });

  test('edits, previews and deletes a document the user can edit', async ({ page }) => {
    let saved = document();
    let body: Record<string, unknown> = {};
    const collaboration = await mockCollaboration(page, { markdown: '# Original content' });
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [saved] }));
    await page.route('**/api/documents/2', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        body = route.request().postDataJSON();
        saved = { ...saved, ...body };
        await route.fulfill({ json: saved });
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.fulfill({ json: saved });
      }
    });
    await page.goto('/w/1/d/2');
    await expect(page.getByLabel('Document title')).toHaveValue('Original');
    const editor = page.getByLabel('Markdown content');
    await expect(editor).toHaveText('# Original content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('# Hello MarkSync');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('**Saved**');
    await expect.poll(() => collaboration.text()).toBe('# Hello MarkSync\n\n**Saved**');

    await page.getByLabel('Document title').fill('Edited');
    await page.getByLabel('Visibility').selectOption('PUBLIC');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Document saved successfully.')).toBeVisible();
    // Saving sends the title and visibility only: the text is not saved through REST.
    expect(body).toEqual({ title: 'Edited', visibility: 'PUBLIC' });
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Hello MarkSync');
    await expect(page.locator('.markdown-content strong')).toHaveText('Saved');
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL('/w/1');
  });

  test('disables editing controls while a save is in flight', async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/documents/2', async (route) => {
      if (route.request().method() === 'PUT') {
        await pending;
        await route.fulfill({ json: document({ title: 'Edited' }) });
      } else {
        await route.fulfill({ json: document() });
      }
    });
    await page.goto('/w/1/d/2');
    await page.getByLabel('Document title').fill('Edited');
    await page.getByRole('button', { name: 'Save changes' }).click();
    try {
      await expect(page.getByLabel('Document title')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByText('Document saved successfully.')).toBeVisible();
  });

  test('is read-only when the API says the user cannot edit', async ({ page }) => {
    await mockCollaboration(page, { markdown: '# Live viewer copy', canEdit: false });
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/documents/2', (route) =>
      route.fulfill({ json: document({ canEdit: false, markdown: '# Viewer copy' }) }),
    );
    await page.goto('/w/1/d/2');
    await expect(page.getByText('Read-only')).toBeVisible();
    // The stored copy first, then the live text once the connection has synced.
    await expect(page.locator('.markdown-content h1')).toHaveText('Live viewer copy');
    await expect(page.getByLabel('Markdown content')).toHaveCount(0);
    await expect(page.getByLabel('Document title')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  });

  test('explains when the user has no access to a document', async ({ page }) => {
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/documents/2', (route) =>
      route.fulfill({ status: 403, json: { detail: 'Access denied' } }),
    );
    await page.goto('/w/1/d/2');
    await expect(page.getByText('You do not have access to this document.')).toBeVisible();
  });
});

test.describe('anonymous visitor', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, json: { detail: 'Not signed in' } }),
    );
  });

  test('reads a public document without edit controls', async ({ page }) => {
    await page.route('**/api/documents/2', (route) =>
      route.fulfill({
        json: document({ visibility: 'PUBLIC', canEdit: false, markdown: '# Shared **notes**' }),
      }),
    );
    await page.goto('/w/1/d/2');
    await expect(page).toHaveURL('/w/1/d/2');
    await expect(page.getByText('Read-only')).toBeVisible();
    await expect(page.locator('.markdown-content h1')).toContainText('Shared');
    await expect(page.getByLabel('Markdown content')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Online Users' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('asks to sign in for a private document', async ({ page }) => {
    await page.route('**/api/documents/2', (route) =>
      route.fulfill({ status: 401, json: { detail: 'Unauthorized' } }),
    );
    await page.goto('/w/1/d/2');
    await expect(page.getByText('This document is private. Sign in to view it.')).toBeVisible();
  });

  test('the workspace dashboard still requires a session', async ({ request }) => {
    const response = await request.get('/w/1', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain('/auth');
  });
});
