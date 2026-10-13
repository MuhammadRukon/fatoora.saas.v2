import { describe, expect, it } from 'vitest';

import { liveRobots, parseListingQuery } from '../listing-query';

describe('parseListingQuery', () => {
  it('parses valid params', () => {
    expect(parseListingQuery({ q: 'phone', page: '2' })).toEqual({ q: 'phone', page: 2 });
  });

  it.each([
    ['101-char q', { q: 'a'.repeat(101) }],
    ['page=abc', { page: 'abc' }],
    ['repeated params', { q: ['a', 'b'] }],
  ])('falls back to the default query for %s without throwing', (_, sp) => {
    expect(parseListingQuery(sp)).toEqual({});
  });
});

describe('liveRobots', () => {
  const noindex = { robots: { index: false } };

  it('noindexes search', () => {
    expect(liveRobots({ q: 'phone', page: '2' })).toEqual(noindex);
    expect(liveRobots({ q: ['a', 'b'] })).toEqual(noindex);
  });

  it('noindexes direct /live access with no filter key', () => {
    expect(liveRobots({})).toEqual(noindex);
    expect(liveRobots({ utm: 'x' })).toEqual(noindex);
  });

  it('leaves filtered views indexable', () => {
    expect(liveRobots({ sort: 'price_asc' })).toEqual({});
    expect(liveRobots({ q: '', page: '2' })).toEqual({});
  });
});
