import type { Order } from '@prisma/client';

export type ShipAddressFields = Pick<
  Order,
  'shipLine1' | 'shipLine2' | 'shipCity' | 'shipDistrict' | 'shipPostal' | 'shipCountry'
>;

/** One-line delivery address snapshot of an order; empty parts are skipped. */
export function formatShipAddress(o: ShipAddressFields): string {
  return [o.shipLine1, o.shipLine2, o.shipCity, o.shipDistrict, o.shipPostal, o.shipCountry]
    .filter(Boolean)
    .join(', ');
}
