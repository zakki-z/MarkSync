import { expect, test } from '@playwright/test';
import { GET as getInvitations } from '../app/api/invitations/route';
import { POST as answer } from '../app/api/invitations/[id]/[action]/route';
import { DELETE as leave, GET as getMembership } from '../app/api/workspaces/[id]/membership/route';
import { GET as getMembers } from '../app/api/workspaces/[id]/members/route';
import {
  DELETE as removeMember,
  PATCH as changeRole,
} from '../app/api/workspaces/[id]/members/[userId]/route';
import { GET as listSent, POST as send } from '../app/api/workspaces/[id]/invitations/route';
import { DELETE as revoke } from '../app/api/workspaces/[id]/invitations/[invitationId]/route';

const request = (method: string, body?: unknown) =>
  new Request('http://localhost/api/x', {
    method,
    headers: { Cookie: 'marksync_session=test-token', Origin: 'http://localhost:3000' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const params = <T extends Record<string, string>>(values: T) => ({
  params: Promise.resolve(values),
});

test('forwards every membership and invitation call with the bearer token', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    const url = new URL(String(input));
    if (url.pathname === '/auth/me') return Response.json({ id: 7 });
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${init?.body ? ` ${init.body}` : ''}`);
    return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({});
  };
  try {
    const responses = [
      await getMembership(request('GET'), params({ id: '1' })),
      await leave(request('DELETE'), params({ id: '1' })),
      await getMembers(request('GET'), params({ id: '1' })),
      await changeRole(request('PATCH', { role: 'EDITOR' }), params({ id: '1', userId: '9' })),
      await removeMember(request('DELETE'), params({ id: '1', userId: '9' })),
      await listSent(request('GET'), params({ id: '1' })),
      await send(request('POST', { identifier: 'dana', role: 'VIEWER' }), params({ id: '1' })),
      await revoke(request('DELETE'), params({ id: '1', invitationId: '3' })),
      await getInvitations(request('GET')),
      await answer(request('POST'), params({ id: '3', action: 'accept' })),
      await answer(request('POST'), params({ id: '3', action: 'decline' })),
    ];
    for (const response of responses) expect(response.ok).toBe(true);
    expect(calls).toEqual([
      'GET /api/workspaces/1/membership',
      'DELETE /api/workspaces/1/membership',
      'GET /api/workspaces/1/members',
      'PATCH /api/workspaces/1/members/9 {"role":"EDITOR"}',
      'DELETE /api/workspaces/1/members/9',
      'GET /api/workspaces/1/invitations',
      'POST /api/workspaces/1/invitations {"identifier":"dana","role":"VIEWER"}',
      'DELETE /api/workspaces/1/invitations/3',
      'GET /api/invitations',
      'POST /api/invitations/3/accept',
      'POST /api/invitations/3/decline',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed ids and unknown invitation actions before any upstream call', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls++;
    return Response.json({});
  };
  try {
    const bad = [
      await getMembers(request('GET'), params({ id: 'abc' })),
      await changeRole(request('PATCH', {}), params({ id: '1', userId: '../9' })),
      await removeMember(request('DELETE'), params({ id: '1', userId: '0' })),
      await revoke(request('DELETE'), params({ id: '1', invitationId: 'x' })),
      await answer(request('POST'), params({ id: '1x', action: 'accept' })),
    ];
    for (const response of bad) expect(response.status).toBe(400);
    expect((await answer(request('POST'), params({ id: '3', action: 'delete' }))).status).toBe(404);
    expect(upstreamCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requires a session for membership and invitation calls', async () => {
  const anonymous = new Request('http://localhost/api/x', {
    headers: { Origin: 'http://localhost:3000' },
  });
  expect((await getInvitations(anonymous)).status).toBe(401);
  expect((await getMembers(anonymous, params({ id: '1' }))).status).toBe(401);
});
