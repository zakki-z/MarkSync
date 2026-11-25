import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const password = 'presence-test-password';

/** Opens the "Here now" popover of the top bar and returns its list of online users. */
async function onlineUsers(page: Page) {
  const list = page.getByRole('list', { name: 'Online Users' });
  if (!(await list.isVisible()))
    await page.getByRole('button', { name: /online\. Show who is here/ }).click();
  return list;
}

async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Workspace chat' }).click();
  return page.getByRole('region', { name: 'Workspace messages' });
}

async function signup(page: Page, email: string, username: string) {
  await page.goto('/auth');
  await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByText('Signup successful! Please log in.')).toBeVisible();
}

async function login(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/w\/\d+$/);
}

test('two accounts see each other online, exchange messages, and a removed member is cut off', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const id = randomUUID().slice(0, 8);
  const ownerEmail = `owner-${id}@example.com`;
  const guestEmail = `guest-${id}@example.com`;
  const ownerName = `own${id}`;
  const guestName = `gst${id}`;
  const owner = await browser.newContext({ baseURL });
  const guest = await browser.newContext({ baseURL });
  try {
    const ownerPage = await owner.newPage();
    const guestPage = await guest.newPage();
    await signup(ownerPage, ownerEmail, ownerName);
    await signup(guestPage, guestEmail, guestName);
    await login(ownerPage, ownerEmail);
    await login(guestPage, guestEmail);
    const workspaceUrl = ownerPage.url();
    const workspaceId = Number(workspaceUrl.split('/').pop());

    const headers = { Origin: baseURL! };
    const invited = await owner.request.post(`/api/workspaces/${workspaceId}/invitations`, {
      headers,
      data: { identifier: guestEmail, role: 'VIEWER' },
    });
    expect(invited.status()).toBe(201);
    const invitation = await invited.json();
    expect(
      (await guest.request.post(`/api/invitations/${invitation.id}/accept`, { headers })).ok(),
    ).toBe(true);

    await ownerPage.goto(workspaceUrl);
    await guestPage.goto(workspaceUrl);
    for (const page of [ownerPage, guestPage]) {
      await expect(page.getByRole('status', { name: 'Workspace connection: Live' })).toBeVisible();
      const online = await onlineUsers(page);
      await expect(online.getByRole('listitem')).toHaveCount(2);
      await expect(online).toContainText(ownerName);
      await expect(online).toContainText(guestName);
      await expect(online).not.toContainText('@example.com');
      await page.keyboard.press('Escape');
    }

    const ownerLog = await openChat(ownerPage);
    const guestLog = await openChat(guestPage);
    await ownerPage.getByLabel('Message', { exact: true }).fill('hello guest');
    await ownerPage.getByRole('button', { name: 'Send' }).click();
    await expect(guestLog).toContainText(ownerName);
    await expect(guestLog).toContainText('hello guest');
    await guestPage.getByLabel('Message', { exact: true }).fill('hello owner');
    await guestPage.getByRole('button', { name: 'Send' }).click();
    await expect(ownerLog).toContainText(guestName);
    await expect(ownerLog).toContainText('hello owner');
    await ownerPage.keyboard.press('Escape');

    // Removing the member is noticed by the next access revalidation.
    const members = await (
      await owner.request.get(`/api/workspaces/${workspaceId}/members`)
    ).json();
    const guestMember = members.find(
      (member: { username: string }) => member.username === guestName,
    );
    expect(
      (
        await owner.request.delete(`/api/workspaces/${workspaceId}/members/${guestMember.userId}`, {
          headers,
        })
      ).status(),
    ).toBe(204);
    await expect(
      guestPage.getByRole('status', { name: 'Workspace connection: Access revoked' }),
    ).toBeVisible({ timeout: 40_000 });
    await expect(guestPage.getByText('Your access to this workspace was revoked.')).toBeVisible();
    const ownerOnline = await onlineUsers(ownerPage);
    await expect(ownerOnline.getByRole('listitem')).toHaveCount(1);
    await expect(ownerOnline).not.toContainText(guestName);
  } finally {
    await owner.close();
    await guest.close();
  }
});
