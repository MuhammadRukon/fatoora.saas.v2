import { describe, expect, it } from 'vitest';

import {
  compareScored,
  isFuzzyTokenMatch,
  scoreProduct,
  type SearchCandidate,
} from '../search-score';

function candidate(overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    name: 'iPhone 15',
    brandName: 'Apple',
    skus: ['IP15-BLK'],
    description: 'A great phone.',
    isPopular: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('scoreProduct', () => {
  it('scores an exact name match higher than a prefix match', () => {
    const exact = scoreProduct('iphone 15', candidate({ name: 'iPhone 15' }));
    const prefix = scoreProduct('iphone 15', candidate({ name: 'iPhone 15 Pro' }));
    expect(exact).toBeGreaterThan(prefix);
  });

  it('scores a name match higher than a description-only match', () => {
    const nameMatch = scoreProduct(
      'iphone',
      candidate({ name: 'iPhone 15', description: 'a phone' }),
    );
    const descMatch = scoreProduct(
      'iphone',
      candidate({ name: 'USB Cable', description: 'works great with iPhone' }),
    );
    expect(nameMatch).toBeGreaterThan(descMatch);
  });

  it('scores an SKU prefix match', () => {
    const score = scoreProduct('IP15', candidate({ name: 'Something Else', skus: ['IP15-BLK'] }));
    expect(score).toBeGreaterThan(0);
  });

  it('scores a brand match', () => {
    const score = scoreProduct('apple', candidate({ name: 'Something Else', brandName: 'Apple' }));
    expect(score).toBeGreaterThan(0);
  });

  it('gives fuzzy credit for a single-character typo on a >=4-char token', () => {
    const score = scoreProduct('iphonr', candidate({ name: 'iPhone 15', brandName: 'Nokia' }));
    expect(score).toBeGreaterThan(0);
  });

  it('requires an exact match for short tokens (no fuzzy credit)', () => {
    const score = scoreProduct('ipd', candidate({ name: 'iPad Air', brandName: 'Nokia' }));
    expect(score).toBe(0);
  });

  it('scores fuller multi-token coverage higher', () => {
    const fullCoverage = scoreProduct('iphone pro', candidate({ name: 'iPhone 15 Pro' }));
    const partialCoverage = scoreProduct('iphone pro', candidate({ name: 'iPhone 15' }));
    expect(fullCoverage).toBeGreaterThan(partialCoverage);
  });

  it('returns 0 when nothing matches', () => {
    const score = scoreProduct(
      'samsung',
      candidate({
        name: 'iPhone 15',
        brandName: 'Apple',
        skus: ['IP15-BLK'],
        description: 'a phone',
      }),
    );
    expect(score).toBe(0);
  });

  it('returns 0 for an empty query', () => {
    expect(scoreProduct('', candidate())).toBe(0);
  });

  it('is case- and whitespace-insensitive', () => {
    const a = scoreProduct('  IPHONE  ', candidate({ name: 'iPhone 15' }));
    const b = scoreProduct('iphone', candidate({ name: 'iPhone 15' }));
    expect(a).toBe(b);
  });

  it('does not throw on non-Latin input', () => {
    expect(() => scoreProduct('ফোন', candidate())).not.toThrow();
    expect(scoreProduct('ফোন', candidate())).toBeGreaterThanOrEqual(0);
  });
});

describe('compareScored', () => {
  it('ranks higher score first', () => {
    const a = { score: 10, isPopular: false, createdAt: new Date('2026-01-01') };
    const b = { score: 20, isPopular: false, createdAt: new Date('2026-01-01') };
    expect(compareScored(a, b)).toBeGreaterThan(0);
  });

  it('breaks a score tie in favor of isPopular', () => {
    const a = { score: 10, isPopular: true, createdAt: new Date('2026-01-01') };
    const b = { score: 10, isPopular: false, createdAt: new Date('2026-01-01') };
    expect(compareScored(a, b)).toBeLessThan(0);
  });

  it('breaks a score+popularity tie in favor of newest', () => {
    const a = { score: 10, isPopular: false, createdAt: new Date('2026-02-01') };
    const b = { score: 10, isPopular: false, createdAt: new Date('2026-01-01') };
    expect(compareScored(a, b)).toBeLessThan(0);
  });
});

describe('isFuzzyTokenMatch', () => {
  it('requires an exact match for tokens shorter than 4 chars', () => {
    expect(isFuzzyTokenMatch('ipd', 'ipad')).toBe(false);
    expect(isFuzzyTokenMatch('cab', 'cab')).toBe(true);
  });

  it('allows a single substitution for tokens of 4+ chars', () => {
    expect(isFuzzyTokenMatch('iphonr', 'iphone')).toBe(true);
  });

  it('allows a single insertion/deletion for tokens of 4+ chars', () => {
    expect(isFuzzyTokenMatch('phon', 'phone')).toBe(true);
  });

  it('rejects tokens more than one edit apart', () => {
    expect(isFuzzyTokenMatch('phone', 'laptop')).toBe(false);
  });
});
