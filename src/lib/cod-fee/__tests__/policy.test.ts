import { CodFeeStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { dueOnDeliveryCents } from '../compute';
import { FEE_ACTIONS, FEE_CREDITED, canFee, feeFrom, type FeeAction } from '../policy';

const ALL_STATUSES = Object.values(CodFeeStatus);
const ALL_ACTIONS = Object.keys(FEE_ACTIONS) as FeeAction[];

// Expected matrix, written out independently of the table under test.
const EXPECTED: Record<FeeAction, Record<CodFeeStatus, boolean>> = {
  verify: { NONE: false, PENDING: true, REJECTED: true, VERIFIED: false, WAIVED: false },
  reject: { NONE: false, PENDING: true, REJECTED: false, VERIFIED: false, WAIVED: false },
  waive: { NONE: false, PENDING: true, REJECTED: true, VERIFIED: false, WAIVED: false },
};

describe('canFee', () => {
  for (const action of ALL_ACTIONS) {
    for (const status of ALL_STATUSES) {
      it(`${action} from ${status} is ${EXPECTED[action][status]}`, () => {
        expect(canFee(action, status)).toBe(EXPECTED[action][status]);
      });
    }
  }

  it('covers every action and status', () => {
    expect(ALL_ACTIONS.sort()).toEqual(['reject', 'verify', 'waive']);
    expect(ALL_STATUSES).toHaveLength(5);
  });
});

describe('FEE_ACTIONS targets', () => {
  it('maps each action to its terminal status', () => {
    expect(FEE_ACTIONS.verify.to).toBe(CodFeeStatus.VERIFIED);
    expect(FEE_ACTIONS.reject.to).toBe(CodFeeStatus.REJECTED);
    expect(FEE_ACTIONS.waive.to).toBe(CodFeeStatus.WAIVED);
  });
});

describe('feeFrom', () => {
  it('returns a mutable copy of the from-list', () => {
    const from = feeFrom('verify');
    expect(from).toEqual([CodFeeStatus.PENDING, CodFeeStatus.REJECTED]);
    from.push(CodFeeStatus.NONE);
    expect(feeFrom('verify')).toEqual([CodFeeStatus.PENDING, CodFeeStatus.REJECTED]);
  });
});

describe('FEE_CREDITED', () => {
  it('is PENDING and VERIFIED only', () => {
    expect([...FEE_CREDITED].sort()).toEqual([CodFeeStatus.PENDING, CodFeeStatus.VERIFIED].sort());
  });

  it('drives dueOnDeliveryCents for every status', () => {
    for (const feeStatus of ALL_STATUSES) {
      const due = dueOnDeliveryCents({ totalCents: 10_000, feeCents: 2_000, feeStatus });
      expect(due).toBe(FEE_CREDITED.includes(feeStatus) ? 8_000 : 10_000);
    }
  });
});
