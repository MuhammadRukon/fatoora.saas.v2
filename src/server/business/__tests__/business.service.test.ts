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

  const activeEgs = (businessId: string, environment: 'SIMULATION' | 'PRODUCTION') =>
    prisma.egsUnit.create({
      data: {
        businessId,
        environment,
        serialNumber: `1-Fatoora|2-v2|3-${crypto.randomUUID()}`,
        commonName: 'test-egs',
        status: 'ACTIVE',
      },
    });

  it('locks the VAT number once any EGS unit is ACTIVE, but allows switching to an environment with none', async () => {
    const user = await users.create();
    const business = await upsert(user.id);
    await activeEgs(business.id, 'SIMULATION');

    const err = await upsert(user.id, { vatNumber: '310000000000003' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('BUSINESS_LOCKED_FIELDS');
    expect(await upsert(user.id, { zatcaEnvironment: 'PRODUCTION' })).toMatchObject({ zatcaEnvironment: 'PRODUCTION' });
    // Other fields stay editable.
    expect(await upsert(user.id, { nameEn: 'Still Editable' })).toMatchObject({ nameEn: 'Still Editable' });
  });

  it('locks the environment switch when the target environment already has an ACTIVE EGS', async () => {
    const user = await users.create();
    const business = await upsert(user.id);
    await activeEgs(business.id, 'SIMULATION');
    await activeEgs(business.id, 'PRODUCTION');
    const err = await upsert(user.id, { zatcaEnvironment: 'PRODUCTION' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('BUSINESS_LOCKED_FIELDS');
  });

  it('allows changing VAT number and environment before any EGS unit is ACTIVE', async () => {
    const user = await users.create();
    await upsert(user.id);
    const updated = await upsert(user.id, { vatNumber: '310000000000003', zatcaEnvironment: 'PRODUCTION' });
    expect(updated).toMatchObject({ vatNumber: '310000000000003', zatcaEnvironment: 'PRODUCTION' });
  });
});
