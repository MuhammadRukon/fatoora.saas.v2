import { afterEach, describe, expect, it } from 'vitest';

import type { BusinessUpsertInput } from '@/contracts/business';
import { prisma } from '@/lib/prisma';
import { ConflictError } from '@/server/common/errors';

import { businessService } from '../business.service';
import { businessData, testUsers } from './fixtures';

const users = testUsers('biz');
afterEach(() => users.cleanup());

const upsert = (userId: string, overrides: Partial<BusinessUpsertInput> = {}) =>
  businessService.upsertMine(userId, businessData(overrides));
const countOwned = (userId: string) => prisma.business.count({ where: { owner: { id: userId } } });

describe('businessService.getMine', () => {
  it('is null before the profile exists', async () => {
    const user = await users.create();
    expect(await businessService.getMine(user.id)).toBeNull();
  });
});

describe('businessService.upsertMine', () => {
  it('creates the business on first save, defaulting to SIMULATION and SA', async () => {
    const user = await users.create();
    const business = await upsert(user.id);
    expect(business).toMatchObject({
      nameAr: 'شركة',
      vatNumber: '300000000000003',
      zatcaEnvironment: 'SIMULATION',
      countryCode: 'SA',
      streetAr: null,
    });
    expect(await businessService.getMine(user.id)).toMatchObject({ id: business.id });
  });

  it('updates the same row on later saves (still exactly one business)', async () => {
    const user = await users.create();
    const first = await upsert(user.id);
    const second = await upsert(user.id, { nameEn: 'Renamed Co', streetAr: 'طريق الملك فهد' });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ nameEn: 'Renamed Co', streetAr: 'طريق الملك فهد' });
    expect(await countOwned(user.id)).toBe(1);
  });

  it('creates only one business under concurrent first saves', async () => {
    const user = await users.create();
    await Promise.all([upsert(user.id), upsert(user.id), upsert(user.id)]);
    expect(await countOwned(user.id)).toBe(1);
  });

  it('locks VAT number and environment once an EGS unit is ACTIVE', async () => {
    const user = await users.create();
    const business = await upsert(user.id);
    await prisma.egsUnit.create({
      data: {
        businessId: business.id,
        environment: 'SIMULATION',
        serialNumber: `1-Fatoora|2-v2|3-${crypto.randomUUID()}`,
        commonName: 'test-egs',
        status: 'ACTIVE',
      },
    });

    for (const change of [{ vatNumber: '310000000000003' }, { zatcaEnvironment: 'PRODUCTION' as const }]) {
      const err = await upsert(user.id, change).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toContain('BUSINESS_LOCKED_FIELDS');
    }
    // Other fields stay editable.
    expect(await upsert(user.id, { nameEn: 'Still Editable' })).toMatchObject({ nameEn: 'Still Editable' });
  });

  it('allows changing VAT number and environment before any EGS unit is ACTIVE', async () => {
    const user = await users.create();
    await upsert(user.id);
    const updated = await upsert(user.id, { vatNumber: '310000000000003', zatcaEnvironment: 'PRODUCTION' });
    expect(updated).toMatchObject({ vatNumber: '310000000000003', zatcaEnvironment: 'PRODUCTION' });
  });
});
