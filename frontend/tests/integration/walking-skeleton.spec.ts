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
async function rejectRoom(page: Page, documentId: number) {
  return page.evaluate(
    (id) =>
      new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`ws://${location.host}/ws`);
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('No authorization response'));
        }, 5000);
        socket.onopen = () => socket.send(JSON.stringify({ type: 'join', documentId: id }));
        socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'presence') {
            clearTimeout(timeout);
            socket.close();
            reject(new Error('Unauthorized presence disclosed'));
          }
          if (data.type === 'error') {
            clearTimeout(timeout);
            socket.close();
            resolve(data.code);
          }
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket upgrade failed'));
        };
      }),
    documentId,
  );
}

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
  await page
    .getByLabel('Markdown content')
    .fill(
      '# Hello MarkSync\n\n**Saved** and *formatted*.\n\n<script>alert("unsafe")</script>\n\n[unsafe](javascript:alert)',
    );
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Document saved successfully.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Document title')).toHaveValue('Walking skeleton');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Hello MarkSync');
  await expect(page.locator('.markdown-content strong')).toHaveText('Saved');
  await expect(page.locator('.markdown-content script, .markdown-content a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Markdown' }).click();
  await page.getByLabel('Markdown content').fill('# Updated\n\nPersisted content');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Document saved successfully.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Markdown content')).toHaveValue('# Updated\n\nPersisted content');

  const second = await browser.newContext({ baseURL });
  let outsider: BrowserContext | undefined;
  try {
    const secondPage = await second.newPage();
    await login(secondPage, email);
    const presence = page.getByRole('region', { name: 'Online Users' });
    await expect(presence).toContainText('1 active session');
    await secondPage.getByRole('link', { name: /Walking skeleton/ }).click();
    await expect(presence).toContainText('2 active sessions');
    await expect(secondPage.getByRole('region', { name: 'Online Users' })).toContainText(
      '2 active sessions',
    );
    await expect(presence.getByRole('listitem')).toHaveCount(1);
    await second.close();
    await expect(presence).toContainText('1 active session');

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
    expect(await rejectRoom(outsiderPage, documentId)).toBe('DOCUMENT_UNAVAILABLE');
    expect(await rejectRoom(page, 999999999)).toBe('DOCUMENT_UNAVAILABLE');
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
      expect(await publicRead.json()).toMatchObject({ visibility: 'PUBLIC', canEdit: false });
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
