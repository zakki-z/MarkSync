import { expect, test, type Page, type Route } from '@playwright/test';

const workspace = { id: 1, name: 'Team', visibility: 'PRIVATE', ownerId: '7' };
const user = { id: 7, email: 'user@sussex.ac.uk', role: 'user' };
const membership = {
  role: 'OWNER',
  canEdit: true,
  canManageMembers: true,
  canManageWorkspace: true,
};
const plan = {
  id: 9,
  title: 'Plan',
  authorId: '7',
  workspaceId: 1,
  visibility: 'PRIVATE',
  markdown: '# Plan',
  canEdit: true,
  createdAt: '2026-10-27T19:00:00Z',
  updatedAt: '2026-10-27T19:00:00Z',
};

const SLOW_MS = 800;
const slow = (json: unknown) => async (route: Route) => {
  await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
  await route.fulfill({ json });
};

/** Records every heading or alert that is ever on screen, from the first paint onwards. */
async function recordAlerts(page: Page) {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { alertsSeen: Set<string> }).alertsSeen = seen;
    const record = () =>
      document
        .querySelectorAll('[role=alert]')
        .forEach((node) => seen.add(node.textContent?.trim() ?? ''));
    new MutationObserver(record).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', record);
  });
}
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' });
const alertsSeen = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { alertsSeen: Set<string> }).alertsSeen]);

async function withSessionCookie(page: Page) {
  await page.context().addCookies([
    {
      name: 'marksync_session',
      value: 'local-test-jwt',
      url: 'http://localhost:3100',
      httpOnly: true,
    },
  ]);
}

async function slowSignedInApi(page: Page) {
  await page.route('**/api/auth/me', slow(user));
  await page.route('**/api/workspaces', slow([workspace]));
  await page.route('**/api/invitations', slow([]));
  await page.route('**/api/workspaces/1/documents', slow([]));
  await page.route('**/api/workspaces/1/membership', slow(membership));
  await page.route('**/api/workspaces/1/members', slow([]));
  await page.route('**/api/workspaces/1/invitations', slow([]));
  await page.route('**/api/documents/9', slow(plan));
}

test.describe('signed-in bootstrap', () => {
  for (const [path, ready] of [
    ['/w/1', 'No documents yet'],
    ['/w/1/members', 'This workspace has no members.'],
    ['/w/1/invitations', 'No pending invitations.'],
    ['/w/1/d/9', 'Plan'],
    ['/invitations', 'My invitations'],
  ] as const) {
    test(`${path} shows a skeleton, never an error, while a slow session and data load`, async ({
      page,
    }) => {
      await withSessionCookie(page);
      await slowSignedInApi(page);
      await recordAlerts(page);
      await page.goto(path);
      await expect(sidebar(page)).toBeVisible();
      await expect(page.locator('[aria-busy=true]').first()).toBeVisible();
      // Document pages show the sidebar as an icon rail, with the account as an avatar.
      await expect(
        path.includes('/d/')
          ? sidebar(page).getByRole('img', { name: user.email })
          : page.getByTestId('account-card'),
      ).toContainText(path.includes('/d/') ? 'U' : user.email);
      await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
      await expect(page.locator('[aria-busy=true]')).toHaveCount(0);
      expect(await alertsSeen(page)).toEqual([]);
      await expect(page).toHaveURL(path);
    });
  }

  test('switching sections keeps the same sidebar and never shows an error', async ({ page }) => {
    await withSessionCookie(page);
    await slowSignedInApi(page);
    await recordAlerts(page);
    await page.goto('/w/1');
    await expect(page.getByText('No documents yet')).toBeVisible();
    const aside = await sidebar(page).elementHandle();
    await page.getByRole('link', { name: 'Members' }).click();
    await expect(page.getByText('This workspace has no members.')).toBeVisible();
    await page.getByRole('link', { name: 'Invitations', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Invitations', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await aside!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await alertsSeen(page)).toEqual([]);
  });
});

test.describe('route guard', () => {
  test('a signed-out visitor is sent to sign-in and returns to the same URL after login', async ({
    page,
  }) => {
    await page.goto('/w/1/members');
    await expect(page).toHaveURL('/auth?next=%2Fw%2F1%2Fmembers');

    await page.route('**/api/auth/login', async (route) => {
      await page
        .context()
        .addCookies([
          { name: 'marksync_session', value: 'local-test-jwt', url: 'http://localhost:3100' },
        ]);
      await route.fulfill({ json: { message: 'Signed in.' } });
    });
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ json: membership }),
    );
    await page.route('**/api/workspaces/1/members', (route) => route.fulfill({ json: [] }));
    await page.getByLabel('Email').fill('user@sussex.ac.uk');
    await page.getByLabel('Password', { exact: true }).fill('local-test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/w/1/members');
  });

  test('a session that ends mid-use redirects once, keeping the URL', async ({ page }) => {
    await withSessionCookie(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    const expired = (route: Route) =>
      route.fulfill({
        status: 401,
        json: { detail: 'Your session expired. Please log in again.' },
      });
    // Every data request fails at once; the app must still navigate to sign-in only once.
    await page.route('**/api/workspaces', expired);
    await page.route('**/api/invitations', expired);
    await page.route('**/api/workspaces/1/documents', expired);
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
    });
    await page.goto('/w/1');
    await expect(page).toHaveURL('/auth?next=%2Fw%2F1');
    expect(navigations.filter((path) => path === '/auth')).toHaveLength(1);
  });

  test('anonymous readers stay on a document page and see a sign-in prompt for private ones', async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/documents/9', (route) => route.fulfill({ status: 401, json: {} }));
    await page.goto('/w/1/d/9');
    await expect(page.getByRole('heading', { name: 'This document is private' })).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
      'href',
      '/auth?next=%2Fw%2F1%2Fd%2F9',
    );
    await expect(page).toHaveURL('/w/1/d/9');
  });
});

test.describe('errors inside the content area', () => {
  test('a server error keeps the sidebar and offers Retry', async ({ page }) => {
    await withSessionCookie(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    let calls = 0;
    await page.route('**/api/workspaces/1/documents', (route) => {
      calls += 1;
      return calls <= 2
        ? route.fulfill({ status: 502, json: { detail: 'Document Service is unavailable.' } })
        : route.fulfill({ json: [] });
    });
    await page.goto('/w/1');
    await expect(
      page.getByRole('heading', { name: 'Unable to load this workspace' }),
    ).toBeVisible();
    // The read was retried once automatically before the error appeared.
    expect(calls).toBe(2);
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByText('Please sign in to continue')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('All documents')).toBeVisible();
  });

  test('a workspace the user cannot access says so instead of asking them to sign in', async ({
    page,
  }) => {
    await withSessionCookie(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/2/membership', (route) =>
      route.fulfill({ status: 403, json: { detail: 'Forbidden' } }),
    );
    await page.route('**/api/workspaces/2/members', (route) =>
      route.fulfill({ status: 403, json: { detail: 'Forbidden' } }),
    );
    await page.goto('/w/2/members');
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your workspaces' })).toBeVisible();
  });

  test('the session check failing is not treated as signed out', async ({ page }) => {
    await withSessionCookie(page);
    let checks = 0;
    await page.route('**/api/auth/me', (route) => {
      checks += 1;
      return checks <= 2
        ? route.fulfill({ status: 502, json: { detail: 'Auth Service is unavailable.' } })
        : route.fulfill({ json: user });
    });
    await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/w/1');
    await expect(page.getByRole('heading', { name: 'Unable to reach MarkSync' })).toBeVisible();
    await expect(page).toHaveURL('/w/1');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('All documents')).toBeVisible();
  });
});
