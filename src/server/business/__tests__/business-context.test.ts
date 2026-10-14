import { afterEach, describe, expect, it } from 'vitest';

import { BusinessRequiredError } from '@/server/common/errors';

import { resolveBusinessId } from '../business-context';
import { businessService } from '../business.service';
import { businessData, testUsers } from './fixtures';

const users = testUsers('ctx');
afterEach(() => users.cleanup());

describe('resolveBusinessId', () => {
  it('throws BusinessRequiredError when the user owns no business', async () => {
    const user = await users.create();
    await expect(resolveBusinessId(user.id)).rejects.toBeInstanceOf(BusinessRequiredError);
  });

  it("returns the id of the user's only business", async () => {
    const user = await users.create();
    const business = await businessService.upsertMine(user.id, businessData());
    expect(await resolveBusinessId(user.id)).toBe(business.id);
  });
});
