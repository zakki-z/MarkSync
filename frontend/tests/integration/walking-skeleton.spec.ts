import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const password = 'walking-skeleton-password';
async function login(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/w\/\d+$/);
}
async function signup(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByText('Signup successful! Please log in.')).toBeVisible();
}
/** Joins a room or document the page may not enter and returns the error code it gets back. */
async function rejectJoin(page: Page, join: { type: string } & Record<string, number | string>) {
  return page.evaluate(
    (message) =>
      new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`ws://${location.host}/ws`);
        socket.binaryType = 'arraybuffer';
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('No authorization response'));
        }, 5000);
        socket.onopen = () => socket.send(JSON.stringify(message));
        socket.onmessage = (event) => {
          // Nothing but an error may come back: no presence, no document access, no Yjs state.
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : { type: 'binary' };
          clearTimeout(timeout);
          socket.close();
          if (data.type === 'error') resolve(data.code);
          else reject(new Error(`Unauthorized join disclosed ${data.type}`));
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket upgrade failed'));
        };
      }),
    join,
  );
}
const rejectRoom = (page: Page, workspaceId: number) =>
  rejectJoin(page, { type: 'join', workspaceId });
const rejectDocument = (page: Page, documentId: number) =>
  rejectJoin(page, { type: 'document-join', documentId });

test('walking skeleton through Nginx: auth, private CRUD, Markdown, presence, logout', async ({
  page,
  browser,
  baseURL,
}) => {
  const email = `owner-${randomUUID()}@example.com`;
  await page.goto('/documents');
  await expect(page).toHaveURL('/auth');
  await signup(page, email);
  await login(page, email);
  const cookie = (await page.context().cookies()).find((item) => item.name === 'marksync_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('marksync_session');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  await page.getByRole('button', { name: '+ New document' }).click();
  await expect(page).toHaveURL(/\/w\/\d+\/d\/\d+$/);
  const documentUrl = page.url();
  const documentId = Number(documentUrl.split('/').pop());
  await page.getByLabel('Document title').fill('Walking skeleton');
  const editor = page.getByLabel('Markdown content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  const lines = [
    '# Hello MarkSync',
    '',
    '**Saved** and *formatted*.',
    '',
    '<script>alert("unsafe")</script>',
    '',
    '[unsafe](javascript:alert)',
  ];
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter');
    if (line) await page.keyboard.type(line);
  }
  await expect(page.getByText('All changes synced')).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Document saved successfully.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Document title')).toHaveValue('Walking skeleton');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Hello MarkSync');
  await expect(page.locator('.markdown-content strong')).toHaveText('Saved');
  await expect(page.locator('.markdown-content script, .markdown-content a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Markdown' }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('# Updated');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Persisted content');
  await expect(page.getByText('All changes synced')).toBeVisible();
  // The text is live content, stored by the collaboration service: no save button is needed.
  await page.reload();
  await expect(editor).toContainText('Persisted content');

  const second = await browser.newContext({ baseURL });
  let outsider: BrowserContext | undefined;
  try {
    const secondPage = await second.newPage();
    await login(secondPage, email);
    const presence = page.getByRole('region', { name: 'Online Users' });
    await expect(presence.getByRole('listitem')).toHaveCount(1);
    await expect(presence).toContainText('you');
    await secondPage.getByRole('link', { name: /Walking skeleton/ }).click();
    await expect(secondPage.getByRole('region', { name: 'Online Users' })).toContainText('you');
    // Two tabs of one user are one person online.
    await expect(presence.getByRole('listitem')).toHaveCount(1);
    await second.close();
    await expect(presence.getByRole('listitem')).toHaveCount(1);

    outsider = await browser.newContext({ baseURL });
    const outsiderPage = await outsider.newPage();
    const outsiderEmail = `outsider-${randomUUID()}@example.com`;
    await signup(outsiderPage, outsiderEmail);
    await login(outsiderPage, outsiderEmail);
    const headers = { Origin: baseURL! };
    expect((await outsider.request.get(`/api/documents/${documentId}`)).status()).toBe(403);
    expect(
      (
        await outsider.request.put(`/api/documents/${documentId}`, {
          headers,
          data: { title: 'Stolen', markdown: 'Bad' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await outsider.request.delete(`/api/documents/${documentId}`, { headers })).status(),
    ).toBe(403);
    expect(await rejectRoom(outsiderPage, Number(workspaceId))).toBe('FORBIDDEN');
    expect(await rejectDocument(outsiderPage, documentId)).toBe('FORBIDDEN');
    expect(await rejectRoom(page, 999999999)).toBe('FORBIDDEN');
    expect(
      (
        await page.request.post(`/api/workspaces/${workspaceId}/documents`, {
          headers: { Origin: 'https://evil.example' },
          data: { title: 'CSRF', markdown: '' },
        })
      ).status(),
    ).toBe(403);

    // Public documents are readable anonymously but never writable.
    await page.getByLabel('Visibility').selectOption('PUBLIC');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Document saved successfully.')).toBeVisible();
    const anonymous = await browser.newContext({ baseURL });
    try {
      const publicRead = await anonymous.request.get(`/api/documents/${documentId}`);
      expect(publicRead.status()).toBe(200);
      // The REST read returns the live text, not the stored seed copy.
      expect(await publicRead.json()).toMatchObject({
        visibility: 'PUBLIC',
        canEdit: false,
        markdown: '# Updated\n\nPersisted content',
      });
      expect(
        (
          await anonymous.request.put(`/api/documents/${documentId}`, {
            headers,
            data: { title: 'Defaced', markdown: 'Bad' },
          })
        ).status(),
      ).toBe(401);
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(documentUrl);
      await expect(anonymousPage.getByText('Read-only')).toBeVisible();
      await expect(anonymousPage.getByLabel('Markdown content')).toHaveCount(0);
    } finally {
      await anonymous.close();
    }

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(`/w/${workspaceId}`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/auth');
    await page.goto('/documents');
    await expect(page).toHaveURL('/auth');
    expect((await page.request.get(`/api/workspaces/${workspaceId}/documents`)).status()).toBe(401);
  } finally {
    await second.close();
    await outsider?.close();
  }
});

test('authentication errors, invalid cookies, and mobile controls', async ({
  page,
  context,
  baseURL,
}) => {
  const email = `validation-${randomUUID()}@example.com`;
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page, email);
  await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Email already registered');
  await page.getByRole('button', { name: 'Already have an account? Login' }).click();
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Incorrect email or password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.addCookies([
    { name: 'marksync_session', value: 'invalid', url: baseURL!, httpOnly: true },
  ]);
  await page.goto('/documents');
  await expect(page).toHaveURL('/auth');
  expect((await context.cookies()).some((cookie) => cookie.name === 'marksync_session')).toBe(
    false,
  );
});
