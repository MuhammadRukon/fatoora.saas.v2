import { afterEach, describe, expect, it } from 'vitest';

import { customerInputSchema, type CustomerInput } from '@/contracts/customers';
import { NotFoundError } from '@/server/common/errors';
import { businessService } from '@/server/business/business.service';
import { businessData, testUsers } from '@/server/business/__tests__/fixtures';

import { customersService } from '../customers.service';

const users = testUsers('cust');
afterEach(() => users.cleanup());

async function freshBusiness() {
  const user = await users.create();
  return (await businessService.upsertMine(user.id, businessData())).id;
}
const data = (input: CustomerInput) => customerInputSchema.parse(input);

describe('customersService', () => {
  it('creates, reads, updates and deletes within a business', async () => {
    const businessId = await freshBusiness();
    const created = await customersService.create(businessId, data({ name: 'Acme', vatNumber: '310000000000003' }));
    expect(created).toMatchObject({ businessId, name: 'Acme', vatNumber: '310000000000003', countryCode: 'SA' });

    expect(await customersService.get(businessId, created.id)).toMatchObject({ id: created.id });

    const updated = await customersService.update(businessId, created.id, data({ name: 'Acme Ltd', city: 'Jeddah' }));
    expect(updated).toMatchObject({ id: created.id, name: 'Acme Ltd', city: 'Jeddah', vatNumber: null });

    await customersService.remove(businessId, created.id);
    await expect(customersService.get(businessId, created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats another business's customer as not found", async () => {
    const a = await freshBusiness();
    const b = await freshBusiness();
    const { id } = await customersService.create(a, data({ name: 'Only A' }));

    await expect(customersService.get(b, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(customersService.update(b, id, data({ name: 'Hijack' }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(customersService.remove(b, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await customersService.list(b, {})).items).toEqual([]);
    expect(await customersService.get(a, id)).toMatchObject({ name: 'Only A' });
  });

  it('searches by name, Arabic name or VAT number', async () => {
    const businessId = await freshBusiness();
    await customersService.create(businessId, data({ name: 'Alpha Trading', nameAr: 'ألفا' }));
    await customersService.create(businessId, data({ name: 'Beta', vatNumber: '399999999999993' }));

    const names = async (q: string) =>
      (await customersService.list(businessId, { q })).items.map((c) => c.name);
    expect(await names('alpha')).toEqual(['Alpha Trading']);
    expect(await names('ألفا')).toEqual(['Alpha Trading']);
    expect(await names('3999')).toEqual(['Beta']);
    expect(await names('')).toHaveLength(2);
  });

  it('pages with a cursor, newest first', async () => {
    const businessId = await freshBusiness();
    for (const name of ['C1', 'C2', 'C3']) await customersService.create(businessId, data({ name }));

    const first = await customersService.list(businessId, { limit: 2 });
    expect(first.items.map((c) => c.name)).toEqual(['C3', 'C2']);
    expect(first.nextCursor).toBe(first.items[1].id);

    const second = await customersService.list(businessId, { limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((c) => c.name)).toEqual(['C1']);
    expect(second.nextCursor).toBeNull();
  });
});
