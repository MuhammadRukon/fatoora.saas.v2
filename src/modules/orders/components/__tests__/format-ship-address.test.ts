import { describe, expect, it } from 'vitest';

import { formatShipAddress } from '../format-ship-address';

describe('formatShipAddress', () => {
  it('joins every part in display order', () => {
    expect(
      formatShipAddress({
        shipLine1: 'House 1, Road 2',
        shipLine2: 'Block C',
        shipCity: 'Dhaka',
        shipDistrict: 'Dhaka',
        shipPostal: '1212',
        shipCountry: 'BD',
      }),
    ).toBe('House 1, Road 2, Block C, Dhaka, Dhaka, 1212, BD');
  });

  it('skips null and empty parts', () => {
    expect(
      formatShipAddress({
        shipLine1: 'House 1',
        shipLine2: null,
        shipCity: 'Dhaka',
        shipDistrict: '',
        shipPostal: null,
        shipCountry: 'BD',
      }),
    ).toBe('House 1, Dhaka, BD');
  });

  it('returns an empty string when nothing is set', () => {
    expect(
      formatShipAddress({
        shipLine1: '',
        shipLine2: null,
        shipCity: '',
        shipDistrict: null,
        shipPostal: null,
        shipCountry: '',
      }),
    ).toBe('');
  });
});
