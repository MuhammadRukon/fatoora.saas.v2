/**
 * An order has exactly one `Payment`: `placeOrder` creates it in the checkout
 * transaction and nothing adds a second one later. The `payments` relation is
 * still an array, so this is the single place that encodes "the order's
 * payment is the first row". Pure and client-safe.
 */
export function primaryPayment<T>(order: { payments: readonly T[] }): T | undefined {
  return order.payments[0];
}
