import { expect, test } from '@playwright/test';

for (const mode of ['login', 'signup'] as const) {
  test(`${mode} blocks duplicate submissions and never displays a token`, async ({
    page,
    context,
  }) => {
    let requests = 0;
    let release!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const accessToken = 'private-test-token-must-not-be-rendered';
    await page.route(`**/api/auth/${mode}`, async (route) => {
      requests += 1;
      expect(route.request().postDataJSON()).toEqual({
        email: 'student@sussex.ac.uk',
        password: 'securepassword123',
      });
      await responseReady;
      await route.fulfill({
        status: mode === 'login' ? 200 : 201,
        json:
          mode === 'login'
            ? { access_token: accessToken, token_type: 'bearer' }
            : { id: 1, email: 'student@sussex.ac.uk', role: 'user' },
      });
    });

    await context.addCookies([
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
    await page.route('**/api/documents', (route) => route.fulfill({ json: [] }));
    await page.goto('/auth');
    if (mode === 'signup') {
      await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
    }
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await page.getByLabel('Email').fill('student@sussex.ac.uk');
    await page.getByLabel('Password').fill('securepassword123');
    // Two synchronous submissions exercise the guard before React can re-render.
    await page.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /account\?/ })).toBeDisabled();
    release();
    if (mode === 'login') await expect(page).toHaveURL('/documents');
    else {
      await expect(page.getByText('Signup successful! Please log in.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
    }
    expect(requests).toBe(1);
    await expect(page.locator('body')).not.toContainText(accessToken);
    await expect(page.locator('body')).not.toContainText('JWT Token');
  });
}

test('shows API errors and allows retry after failure', async ({ page, context }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 401,
      json: { detail: 'Incorrect email or password' },
    }),
  );
  await page.goto('/auth');
  await page.getByLabel('Email').fill('student@sussex.ac.uk');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
  await context.addCookies([
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
  await page.route('**/api/documents', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: { access_token: 'retry-private-token', token_type: 'bearer' },
    }),
  );
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/documents');
  await expect(page.getByText('Incorrect email or password')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('retry-private-token');
});

test('server redirects missing and invalid sessions and clears invalid cookies', async ({
  request,
  context,
  page,
}) => {
  const response = await request.get('/documents', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain('/auth');
  await context.addCookies([
    { name: 'marksync_session', value: 'invalid', url: 'http://localhost:3100', httpOnly: true },
  ]);
  await page.goto('/documents');
  await expect(page).toHaveURL('/auth');
  expect((await context.cookies()).some((cookie) => cookie.name === 'marksync_session')).toBe(
    false,
  );
});
