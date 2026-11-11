import { expect, test, type Page } from '@playwright/test';

const workspace = { id: 1, name: 'Team', visibility: 'PRIVATE', ownerId: '7' };
const member = (userId: string, username: string, role: string) => ({
  userId,
  username,
  role,
  joinedAt: '2026-10-27T19:00:00Z',
});
const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  workspaceId: 1,
  workspaceName: 'Team',
  invitedUserId: '4',
  invitedUsername: 'dana',
  invitedEmail: null,
  role: 'EDITOR',
  status: 'PENDING',
  invitedBy: '7',
  invitedByUsername: 'olivia',
  createdAt: '2026-10-27T19:00:00Z',
  expiresAt: '2026-11-03T19:00:00Z',
  ...overrides,
});
const membership = (role: string) => ({
  role,
  canEdit: role !== 'VIEWER',
  canManageMembers: role === 'OWNER',
  canManageWorkspace: role === 'OWNER',
});

async function signIn(page: Page, userId = 7) {
  await page.context().addCookies([
    {
      name: 'marksync_session',
      value: 'local-test-jwt',
      url: 'http://localhost:3100',
      httpOnly: true,
    },
  ]);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: userId, email: 'user@sussex.ac.uk', role: 'user' } }),
  );
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: [workspace] }));
}

test.describe('members page', () => {
  test('an owner invites, revokes, changes roles and removes members', async ({ page }) => {
    await signIn(page);
    let pending = [invitation()];
    let members = [member('7', 'olivia', 'OWNER'), member('9', 'vera', 'VIEWER')];
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ json: membership('OWNER') }),
    );
    await page.route('**/api/workspaces/1/members', (route) => route.fulfill({ json: members }));
    await page.route('**/api/workspaces/1/members/9', async (route) => {
      if (route.request().method() === 'PATCH') {
        expect(route.request().postDataJSON()).toEqual({ role: 'EDITOR' });
        await route.fulfill({ json: member('9', 'vera', 'EDITOR') });
      } else {
        members = members.filter((m) => m.userId !== '9');
        await route.fulfill({ status: 204 });
      }
    });
    await page.route('**/api/workspaces/1/invitations', async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ identifier: 'omar', role: 'VIEWER' });
        const sent = invitation({ id: 4, invitedUsername: 'omar', role: 'VIEWER' });
        pending = [sent, ...pending];
        await route.fulfill({ status: 201, json: sent });
      } else {
        await route.fulfill({ json: pending });
      }
    });
    await page.route('**/api/workspaces/1/invitations/3', (route) =>
      route.fulfill({ status: 204 }),
    );

    await page.goto('/w/1/members');
    await expect(page.getByRole('heading', { name: 'Invite someone' })).toBeVisible();
    await expect(page.getByText('dana')).toBeVisible();
    await expect(page.getByText('olivia (you)')).toBeVisible();

    await page.getByLabel('Username or email').fill('omar');
    await page.locator('.invite-form select').selectOption('VIEWER');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('omar')).toBeVisible();
    await expect(page.getByLabel('Username or email')).toHaveValue('');

    await page.getByRole('button', { name: 'Revoke invitation for dana' }).click();
    await expect(page.getByText('dana')).toHaveCount(0);

    await page.getByLabel('Role of vera').selectOption('EDITOR');
    await expect(page.getByLabel('Role of vera')).toHaveValue('EDITOR');

    await page.getByRole('button', { name: 'Remove vera' }).click();
    await expect(page.getByText('vera')).toHaveCount(0);
  });

  test('shows the API error when the last owner is demoted', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ json: membership('OWNER') }),
    );
    await page.route('**/api/workspaces/1/members', (route) =>
      route.fulfill({ json: [member('7', 'olivia', 'OWNER')] }),
    );
    await page.route('**/api/workspaces/1/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/members/7', (route) =>
      route.fulfill({ status: 409, json: { detail: 'A workspace must keep at least one owner' } }),
    );

    await page.goto('/w/1/members');
    await expect(page.getByText('No pending invitations.')).toBeVisible();
    await page.getByLabel('Role of olivia').selectOption('VIEWER');
    await expect(page.locator('.alert.error')).toContainText('at least one owner');
    await expect(page.getByLabel('Role of olivia')).toHaveValue('OWNER');
  });

  test('shows the invitation error without clearing what was typed', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ json: membership('OWNER') }),
    );
    await page.route('**/api/workspaces/1/members', (route) =>
      route.fulfill({ json: [member('7', 'olivia', 'OWNER')] }),
    );
    await page.route('**/api/workspaces/1/invitations', async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({ status: 404, json: { detail: 'No user matches "ghost"' } });
      else await route.fulfill({ json: [] });
    });

    await page.goto('/w/1/members');
    await page.getByLabel('Username or email').fill('ghost');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.locator('.alert.error')).toContainText('No user matches');
    await expect(page.getByLabel('Username or email')).toHaveValue('ghost');
  });

  test('a viewer sees a read-only member list and can only leave', async ({ page }) => {
    await signIn(page, 9);
    let invitationRequests = 0;
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', async (route) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 204 });
      else await route.fulfill({ json: membership('VIEWER') });
    });
    await page.route('**/api/workspaces/1/members', (route) =>
      route.fulfill({ json: [member('7', 'olivia', 'OWNER'), member('9', 'vera', 'VIEWER')] }),
    );
    await page.route('**/api/workspaces/1/invitations', (route) => {
      invitationRequests++;
      return route.fulfill({
        status: 403,
        json: { detail: 'Only a workspace owner can manage members' },
      });
    });

    await page.goto('/w/1/members');
    await expect(page.getByText('olivia')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invite someone' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pending invitations' })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove|Revoke/ })).toHaveCount(0);
    expect(invitationRequests).toBe(0);

    await page.route('**/api/documents*', (route) => route.fulfill({ json: [] }));
    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/documents|\/w\//);
  });

  test('shows an error when the workspace is not visible', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ status: 404, json: { detail: 'Workspace not found: 1' } }),
    );
    await page.route('**/api/workspaces/1/members', (route) =>
      route.fulfill({ status: 404, json: { detail: 'Workspace not found: 1' } }),
    );

    await page.goto('/w/1/members');
    await expect(page.getByRole('heading', { name: 'Unable to open members' })).toBeVisible();
    await expect(page.getByText('Workspace not found: 1')).toBeVisible();
  });
});

test.describe('my invitations', () => {
  test('lists invitations, shows the count in the navigation and accepts one', async ({ page }) => {
    await signIn(page, 4);
    let pending = [invitation(), invitation({ id: 5, workspaceId: 2, workspaceName: 'Uni' })];
    await page.route('**/api/invitations', (route) => route.fulfill({ json: pending }));
    await page.route('**/api/invitations/3/accept', async (route) => {
      pending = pending.filter((i) => i.id !== 3);
      await route.fulfill({ json: invitation({ status: 'ACCEPTED' }) });
    });
    await page.route('**/api/workspaces/1/documents', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/workspaces/1/membership', (route) =>
      route.fulfill({ json: membership('EDITOR') }),
    );

    await page.goto('/invitations');
    await expect(page.getByLabel('2 pending')).toBeVisible();
    await expect(page.getByText('olivia invited you as Editor').first()).toBeVisible();

    await page.getByRole('button', { name: 'Accept invitation to Team' }).click();
    await expect(page).toHaveURL('/w/1');
    await expect(page.getByLabel('1 pending')).toBeVisible();
  });

  test('declines an invitation and then shows the empty state', async ({ page }) => {
    await signIn(page, 4);
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [invitation()] }));
    await page.route('**/api/invitations/3/decline', (route) =>
      route.fulfill({ json: invitation({ status: 'DECLINED' }) }),
    );

    await page.goto('/invitations');
    await page.getByRole('button', { name: 'Decline invitation to Team' }).click();
    await expect(page.getByText('You have no pending invitations.')).toBeVisible();
    await expect(page.getByLabel(/pending/)).toHaveCount(0);
  });

  test('shows the API error when an invitation has expired', async ({ page }) => {
    await signIn(page, 4);
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [invitation()] }));
    await page.route('**/api/invitations/3/accept', (route) =>
      route.fulfill({ status: 409, json: { detail: 'This invitation has expired' } }),
    );

    await page.goto('/invitations');
    await page.getByRole('button', { name: 'Accept invitation to Team' }).click();
    await expect(page.locator('.alert.error')).toContainText('expired');
    await expect(page.locator('strong', { hasText: 'Team' })).toBeVisible();
  });
});
