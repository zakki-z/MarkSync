import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('marksync_access_token', 'local-test-jwt');
  });
  await page.route('**/auth/me', (route) => route.fulfill({
    json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' },
  }));
});

test('creates, displays and previews a Markdown document', async ({ page }) => {
  const documents: Array<Record<string, unknown>> = [];
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: documents });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({
      title: 'First document', markdown: '# Hello MarkSync\n\n**Saved**',
    });
    const saved = {
      id: 1, title: 'First document', markdown: '# Hello MarkSync\n\n**Saved**',
      authorId: '7', createdAt: '2026-10-27T19:00:00Z', updatedAt: '2026-10-27T19:00:00Z',
    };
    documents.push(saved);
    await route.fulfill({ status: 201, json: saved });
  });

  await page.goto('/documents');
  await expect(page.getByText('No documents yet. Create your first one.')).toBeVisible();
  await page.getByLabel('Document title').fill('First document');
  await page.getByLabel('Markdown content').fill('# Hello MarkSync\n\n**Saved**');
  await page.getByRole('button', { name: 'Create document' }).click();
  await expect(page.getByText('Document saved successfully.')).toBeVisible();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Hello MarkSync');
  await expect(page.locator('.markdown-content strong')).toHaveText('Saved');
});

test('edits and deletes a saved document', async ({ page }) => {
  let saved = {
    id: 2, title: 'Original', markdown: 'Original content', authorId: '7',
    createdAt: '2026-10-27T19:00:00Z', updatedAt: '2026-10-27T19:00:00Z',
  };
  await page.route('**/api/documents', (route) => route.fulfill({ json: [saved] }));
  await page.route('**/api/documents/2', async (route) => {
    if (route.request().method() === 'PUT') {
      saved = { ...saved, ...route.request().postDataJSON() };
      await route.fulfill({ json: saved });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.fulfill({ json: saved });
    }
  });
  await page.goto('/documents');
  await expect(page.getByLabel('Document title')).toHaveValue('Original');
  await page.getByLabel('Document title').fill('Edited');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Document saved successfully.')).toBeVisible();
  expect(saved.title).toBe('Edited');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Document deleted.')).toBeVisible();
});

for (const operation of ['save', 'delete'] as const) {
  test(`blocks switching and creating documents during ${operation}`, async ({ page }) => {
    const documents = [1, 2].map((id) => ({
      id, title: `Document ${id}`, markdown: 'Content', authorId: '7',
      createdAt: '2026-10-27T19:00:00Z', updatedAt: '2026-10-27T19:00:00Z',
    }));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/documents', (route) => route.fulfill({ json: documents }));
    await page.route('**/api/documents/1', async (route) => {
      await pending;
      await route.fulfill(operation === 'delete'
        ? { status: 204, body: '' }
        : { json: { ...documents[0], ...route.request().postDataJSON() } });
    });
    await page.goto('/documents');
    await expect(page.getByLabel('Document title')).toHaveValue('Document 1');
    if (operation === 'save') {
      await page.getByLabel('Document title').fill('Edited');
      await page.getByRole('button', { name: 'Save changes' }).click();
    } else {
      page.on('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
    }
    try {
      await expect(page.getByRole('button', { name: '+ New document', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: /Document 2/ })).toBeDisabled();
      await expect(page.getByLabel('Document title')).toHaveValue(operation === 'save' ? 'Edited' : 'Document 1');
    } finally {
      release();
    }
    await expect(page.getByText(operation === 'save' ? 'Document saved successfully.' : 'Document deleted.')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New document', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Document 2/ })).toBeEnabled();
  });
}
