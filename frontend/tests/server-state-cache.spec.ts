import { expect, test, type Page } from '@playwright/test';

const workspace = { id: 1, name: 'Personal', visibility: 'PRIVATE', ownerId: '7' };
const document = (id: number, title: string) => ({
  id,
  workspaceId: 1,
  title,
  authorId: '7',
  markdown: '',
  visibility: 'PRIVATE',
  canEdit: true,
  createdAt: '2026-10-27T19:00:00Z',
  updatedAt: '2026-10-27T19:00:00Z',
});

/** Signs in and counts the GET requests that should be answered from the cache when revisited. */
async function signIn(page: Page) {
  const requests = { me: 0, workspaces: 0, invitations: 0, documents: 0 };
  await page
    .context()
    .addCookies([
      { name: 'marksync_session', value: 'local-test-jwt', url: 'http://localhost:3100' },
    ]);
  await page.route('**/api/auth/me', (route) => {
    requests.me++;
    return route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } });
  });
  await page.route('**/api/workspaces', (route) => {
    requests.workspaces++;
    return route.fulfill({ json: [workspace] });
  });
  await page.route('**/api/invitations', (route) => {
    requests.invitations++;
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/workspaces/1/documents', (route) => {
    requests.documents++;
    return route.fulfill({ json: [document(2, 'Original')] });
  });
  await page.route('**/api/workspaces/1/membership', (route) =>
    route.fulfill({
      json: { role: 'OWNER', canEdit: true, canManageMembers: true, canManageWorkspace: true },
    }),
  );
  await page.route('**/api/workspaces/1/members', (route) => route.fulfill({ json: [] }));
  return requests;
}

test.describe('server-state cache', () => {
  test('moving between sections reuses what is already loaded', async ({ page }) => {
    const requests = await signIn(page);
    await page.goto('/w/1');
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();
    expect(requests).toEqual({ me: 1, workspaces: 1, invitations: 1, documents: 1 });

    await page.getByRole('link', { name: 'Members' }).click();
    await expect(page.getByText('Loading members…')).toBeHidden();
    await expect(page).toHaveURL('/w/1/members');
    await page.getByRole('link', { name: 'Documents' }).click();
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();

    // The user, the sidebar and the document list came from the cache the second time.
    expect(requests).toEqual({ me: 1, workspaces: 1, invitations: 1, documents: 1 });
  });

  test('signing out and in again starts from an empty cache', async ({ page }) => {
    const requests = await signIn(page);
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } }),
    );
    await page.goto('/w/1');
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/auth');
    await page.getByLabel('Email').fill('student@sussex.ac.uk');
    await page.getByLabel('Password').fill('securepassword123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();

    // The first user's data was dropped, so the second session loaded everything again.
    expect(requests.me).toBe(2);
    expect(requests.workspaces).toBe(2);
    expect(requests.documents).toBe(2);
  });
});

test.describe('prefetching', () => {
  test('hovering a document loads it before the click and opening it reuses that', async ({
    page,
  }) => {
    await signIn(page);
    let documentRequests = 0;
    await page.route('**/api/documents/2', (route) => {
      documentRequests++;
      return route.fulfill({ json: document(2, 'Original') });
    });
    await page.goto('/w/1');
    const link = page.getByRole('link', { name: /Original/ });
    await expect(link).toBeVisible();
    expect(documentRequests).toBe(0);

    await link.hover();
    await expect.poll(() => documentRequests).toBe(1);

    await link.click();
    await expect(page).toHaveURL('/w/1/d/2');
    await expect(page.getByLabel('Document title')).toHaveValue('Original');
    expect(documentRequests).toBe(1);
  });

  test('focusing a workspace in the sidebar loads its documents', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/workspaces', (route) =>
      route.fulfill({
        json: [workspace, { id: 2, name: 'Team', visibility: 'PRIVATE', ownerId: '7' }],
      }),
    );
    let teamDocuments = 0;
    await page.route('**/api/workspaces/2/documents', (route) => {
      teamDocuments++;
      return route.fulfill({ json: [] });
    });
    await page.goto('/w/1');
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
    expect(teamDocuments).toBe(0);

    await page.getByRole('link', { name: 'Team' }).focus();
    await expect.poll(() => teamDocuments).toBe(1);
  });
});

test.describe('entering a page directly', () => {
  test('asks for the document while the session is still being checked', async ({ page }) => {
    await signIn(page);
    const started: string[] = [];
    await page.route('**/api/auth/me', async (route) => {
      started.push('me');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } });
    });
    await page.route('**/api/documents/2', (route) => {
      started.push('document');
      return route.fulfill({ json: document(2, 'Original') });
    });
    await page.goto('/w/1/d/2');
    await expect(page.getByLabel('Document title')).toHaveValue('Original');
    // Both requests were in flight together: the document did not wait for the identity check.
    expect(started.slice(0, 2).sort()).toEqual(['document', 'me']);
  });

  test('asks for the workspace documents while the session is still being checked', async ({
    page,
  }) => {
    const requests = await signIn(page);
    let documentsBeforeSession = 0;
    let sessionKnown = false;
    await page.route('**/api/auth/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      sessionKnown = true;
      await route.fulfill({ json: { id: 7, email: 'student@sussex.ac.uk', role: 'user' } });
    });
    await page.route('**/api/workspaces/1/documents', (route) => {
      if (!sessionKnown) documentsBeforeSession++;
      requests.documents++;
      return route.fulfill({ json: [document(2, 'Original')] });
    });
    await page.goto('/w/1');
    await expect(page.getByRole('link', { name: /Original/ })).toBeVisible();
    expect(documentsBeforeSession).toBe(1);
    expect(requests.documents).toBe(1);
  });
});
