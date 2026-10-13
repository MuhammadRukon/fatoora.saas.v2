/**
 * Route-level checks for the subscription endpoints and the /api/app gate.
 * Only the session is mocked; services hit the real local DB.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { POST as requestPlan } from '@/app/api/subscriptions/route';
import { GET as myState } from '@/app/api/subscriptions/me/route';
import { POST as activate } from '@/app/api/admin/subscriptions/[id]/activate/route';
import { GET as ping } from '@/app/api/app/ping/route';
import { prisma } from '@/lib/prisma';

const userIds: string[] = [];
async function login(role: 'USER' | 'ADMIN') {
  const user = await prisma.user.create({
    data: { name: 'Route Test', email: `route-${Math.random()}@example.test`, role },
  });
  userIds.push(user.id);
  m.auth.mockResolvedValue({ user: { id: user.id, email: user.email, name: user.name, role } });
  return user.id;
}

afterEach(async () => {
  m.auth.mockReset();
  const ids = userIds.splice(0);
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

const post = (body: unknown) =>
  new Request('http://t/api/subscriptions', { method: 'POST', body: JSON.stringify(body) });
const activateReq = (id: string) =>
  activate(new Request('http://t', { method: 'POST' }), { params: Promise.resolve({ id }) });

describe('POST /api/subscriptions', () => {
  it('creates a PENDING request (201), then 409 while it is pending', async () => {
    const userId = await login('USER');
    const res = await requestPlan(post({ plan: 'MONTH_3' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      status: 'PENDING',
      plan: 'MONTH_3',
      startsAt: null,
      endsAt: null,
    });

    const again = await requestPlan(post({ plan: 'MONTH_1' }));
    expect(again.status).toBe(409);
    const body = await again.json();
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toContain('SUBSCRIPTION_PENDING');
    expect(await prisma.subscription.count({ where: { userId, status: 'PENDING' } })).toBe(1);
  });

  it('rejects an unknown plan with a validation error', async () => {
    await login('USER');
    const res = await requestPlan(post({ plan: 'MONTH_2' }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('is 401 without a session and 403 for an ADMIN', async () => {
    m.auth.mockResolvedValue(null);
    expect((await requestPlan(post({ plan: 'MONTH_1' }))).status).toBe(401);
    await login('ADMIN');
    expect((await requestPlan(post({ plan: 'MONTH_1' }))).status).toBe(403);
  });
});

describe('POST /api/admin/subscriptions/:id/activate', () => {
  it('activates once (200), then 409; 404 for an unknown id; 403 for a USER', async () => {
    await login('USER');
    const { id } = await (await requestPlan(post({ plan: 'MONTH_1' }))).json();
    expect((await activateReq(id)).status).toBe(403);

    await login('ADMIN');
    const res = await activateReq(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, status: 'ACTIVE' });

    const again = await activateReq(id);
    expect(again.status).toBe(409);
    expect((await again.json()).message).toContain('SUBSCRIPTION_NOT_PENDING');
    expect((await activateReq('does-not-exist')).status).toBe(404);
  });
});

describe('GET /api/app/ping (subscription gate)', () => {
  it('is 402 SUBSCRIPTION_REQUIRED until an admin activates, then 200', async () => {
    await login('USER');
    const userSession = await m.auth();
    const { id } = await (await requestPlan(post({ plan: 'MONTH_1' }))).json();

    const blocked = await ping();
    expect(blocked.status).toBe(402);
    expect((await blocked.json()).code).toBe('SUBSCRIPTION_REQUIRED');
    expect(await (await myState()).json()).toMatchObject({ state: 'PENDING' });

    await login('ADMIN');
    await activateReq(id);

    m.auth.mockResolvedValue(userSession);
    expect((await ping()).status).toBe(200);
    expect(await (await myState()).json()).toMatchObject({ state: 'ACTIVE', pending: null });
  });
});
