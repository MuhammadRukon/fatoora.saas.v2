/**
 * Route-level checks for /api/app/business and /api/app/customers (plan AC3.1-AC3.5).
 * Only the session is mocked; services hit the real local DB.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { GET as getBusiness, PUT as putBusiness } from '@/app/api/app/business/route';
import { GET as listCustomers, POST as createCustomer } from '@/app/api/app/customers/route';
import {
  DELETE as deleteCustomer,
  GET as getCustomer,
  PATCH as patchCustomer,
} from '@/app/api/app/customers/[id]/route';
import { prisma } from '@/lib/prisma';
import { testUsers, validBusiness } from '@/server/business/__tests__/fixtures';

const users = testUsers('bizroute');
afterEach(async () => {
  m.auth.mockReset();
  await users.cleanup();
});

/** A USER with a current ACTIVE subscription, signed in. */
async function login({ subscribed = true } = {}) {
  const user = await users.create();
  if (subscribed) {
    const day = 86_400_000;
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: 'MONTH_1',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - day),
        endsAt: new Date(Date.now() + 30 * day),
      },
    });
  }
  const session = { user: { id: user.id, email: user.email, name: user.name, role: 'USER' } };
  m.auth.mockResolvedValue(session);
  return { userId: user.id, session };
}

const json = (method: string, body: unknown, url = 'http://t') =>
  new Request(url, { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const issuePaths = async (res: Response) =>
  ((await res.json()).meta.issues as { path: string[] }[]).map((i) => i.path.join('.'));

describe('/api/app/business', () => {
  it('AC3.1: PUT creates (200), a second PUT updates the same row, one business per user', async () => {
    const { userId } = await login();
    expect(await (await getBusiness()).json()).toBeNull();

    const res = await putBusiness(json('PUT', validBusiness()));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created).toMatchObject({ vatNumber: '300000000000003', zatcaEnvironment: 'SIMULATION' });

    const again = await putBusiness(json('PUT', validBusiness({ nameEn: 'Updated Co' })));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: created.id, nameEn: 'Updated Co' });
    expect(await prisma.business.count({ where: { owner: { id: userId } } })).toBe(1);
    expect(await (await getBusiness()).json()).toMatchObject({ id: created.id });
  });

  it('AC3.2: rejects a bad VAT number, building number or Arabic name with field errors', async () => {
    await login();
    for (const [field, value] of [
      ['vatNumber', '300000000000004'],
      ['buildingNumber', '123'],
      ['nameAr', 'Company'],
    ] as const) {
      const res = await putBusiness(json('PUT', validBusiness({ [field]: value })));
      expect(res.status).toBe(422); // repo convention for validation errors (plan says 400)
      expect(await issuePaths(res)).toEqual([field]);
    }
  });

  it('is 402 without an active subscription and 401 without a session', async () => {
    await login({ subscribed: false });
    expect((await putBusiness(json('PUT', validBusiness()))).status).toBe(402);
    m.auth.mockResolvedValue(null);
    expect((await getBusiness()).status).toBe(401);
  });
});

describe('/api/app/customers', () => {
  it('AC3.3: 409 BUSINESS_REQUIRED before the business exists', async () => {
    await login();
    const res = await listCustomers(new Request('http://t/api/app/customers'));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BUSINESS_REQUIRED');
    expect((await createCustomer(json('POST', { name: 'X' }))).status).toBe(409);
  });

  it("AC3.4: another business's customer is a 404 on GET, PATCH and DELETE, and not listed", async () => {
    const a = await login();
    await putBusiness(json('PUT', validBusiness()));
    const created = await createCustomer(json('POST', { name: 'Customer of A' }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    await login(); // user B with their own business
    await putBusiness(json('PUT', validBusiness({ nameEn: 'B Co' })));
    expect((await getCustomer(new Request('http://t'), ctx(id))).status).toBe(404);
    expect((await patchCustomer(json('PATCH', { name: 'Hijack' }), ctx(id))).status).toBe(404);
    expect((await deleteCustomer(new Request('http://t', { method: 'DELETE' }), ctx(id))).status).toBe(404);
    const list = await (await listCustomers(new Request('http://t/api/app/customers'))).json();
    expect(list.items).toEqual([]);

    // A still owns it, untouched; and A can update then delete it.
    m.auth.mockResolvedValue(a.session);
    expect(await (await getCustomer(new Request('http://t'), ctx(id))).json()).toMatchObject({
      name: 'Customer of A',
    });
    expect((await patchCustomer(json('PATCH', { name: 'Renamed' }), ctx(id))).status).toBe(200);
    expect((await deleteCustomer(new Request('http://t', { method: 'DELETE' }), ctx(id))).status).toBe(204);
  });

  it('AC3.5: VAT number and buyer ID together → 422; a buyer ID alone → 201', async () => {
    await login();
    await putBusiness(json('PUT', validBusiness()));

    const both = await createCustomer(
      json('POST', { name: 'Both', vatNumber: '310000000000003', buyerIdScheme: 'CRN' }),
    );
    expect(both.status).toBe(422);
    expect(await issuePaths(both)).toContain('buyerIdScheme');

    const idOnly = await createCustomer(
      json('POST', { name: 'Citizen', buyerIdScheme: 'NAT', buyerIdValue: '1234567890' }),
    );
    expect(idOnly.status).toBe(201);
    expect(await idOnly.json()).toMatchObject({ buyerIdScheme: 'NAT', buyerIdValue: '1234567890' });
  });

  it('lists with search and a limit', async () => {
    await login();
    await putBusiness(json('PUT', validBusiness()));
    await createCustomer(json('POST', { name: 'Alpha' }));
    await createCustomer(json('POST', { name: 'Beta' }));

    const res = await listCustomers(new Request('http://t/api/app/customers?q=alp&limit=10'));
    expect(res.status).toBe(200);
    expect((await res.json()).items.map((c: { name: string }) => c.name)).toEqual(['Alpha']);
    expect((await listCustomers(new Request('http://t/api/app/customers?limit=0'))).status).toBe(422);
  });
});
