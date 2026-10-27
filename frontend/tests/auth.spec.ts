import { expect, test } from '@playwright/test';

for (const mode of ['login', 'signup'] as const) {
  test(`${mode} blocks duplicate submissions and never displays a token`, async ({ page }) => {
    let requests = 0;
    let release!: () => void;
    const responseReady = new Promise<void>((resolve) => { release = resolve; });
    const accessToken = 'private-test-token-must-not-be-rendered';
    await page.route(`**/auth/${mode}`, async (route) => {
      requests += 1;
      expect(route.request().postDataJSON()).toEqual({
        email: 'student@sussex.ac.uk', password: 'securepassword123',
      });
      await responseReady;
      await route.fulfill({
        status: mode === 'login' ? 200 : 201,
        json: mode === 'login'
          ? { access_token: accessToken, token_type: 'bearer' }
          : { id: 1, email: 'student@sussex.ac.uk', role: 'user' },
      });
    });

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
    await expect(page.getByText(mode === 'login'
      ? 'Login successful!' : 'Signup successful! Please log in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
    expect(requests).toBe(1);
    await expect(page.locator('body')).not.toContainText(accessToken);
    await expect(page.locator('body')).not.toContainText('JWT Token');
  });
}

test('shows API errors and allows retry after failure', async ({ page }) => {
  await page.route('**/auth/login', (route) => route.fulfill({
    status: 401, json: { detail: 'Incorrect email or password' },
  }));
  await page.goto('/auth');
  await page.getByLabel('Email').fill('student@sussex.ac.uk');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Error: Incorrect email or password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
  await page.route('**/auth/login', (route) => route.fulfill({
    json: { access_token: 'retry-private-token', token_type: 'bearer' },
  }));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Login successful!')).toBeVisible();
  await expect(page.getByText('Error: Incorrect email or password')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('retry-private-token');
});
