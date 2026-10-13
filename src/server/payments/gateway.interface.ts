import type {
  OrderStatus,
  PaymentMethod,
  PaymentSettings,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import type { ResolvedCodFee } from '@/lib/cod-fee/compute';

/**
 * Strategy interface for payment providers. Adding a new gateway
 * (e.g. Nagad) is one new file in `providers/` plus a registry entry.
 *
 * Boundary contract: gateways NEVER touch the DB directly. They only
 * translate between the gadget-website domain and the provider's API.
 * `payments.service.ts` owns persistence and idempotency.
 */

export interface PaymentInitInput {
  orderId: string;
  paymentId: string;
  /** Order number used for human-readable references in gateway logs. */
  orderNumber: string;
  amountCents: number;
  customer: { name: string; email: string; phone: string };
  /** Absolute URLs the gateway should redirect the user to. */
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  /** Server-to-server callback URL (IPN). Optional for providers that don't use one. */
  ipnUrl?: string;
}

export interface PaymentInitResult {
  /** URL the customer must be redirected to. */
  redirectUrl: string;
  /**
   * Reference assigned by the gateway during init (e.g. SSLCommerz
   * sessionkey, bKash paymentID). Stored on `Payment.providerRef` so
   * we can correlate callbacks idempotently.
   */
  providerRef?: string;
  /** Optional raw response captured for audit/debug. */
  rawPayload?: unknown;
}

/**
 * Outcome of validating a callback / IPN. The service decides whether
 * to apply the change to the DB; the provider just normalizes data.
 */
export interface CallbackOutcome {
  paymentId: string;
  status: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING'>;
  providerRef: string;
  rawPayload: unknown;
  /**
   * Amount the gateway itself reports for this transaction, converted to
   * cents. Only populated on the live (non-sandbox) validation path —
   * sandbox harness callbacks have no independent amount to check.
   */
  verifiedAmountCents?: number;
}

/** What `placeOrder` tells a provider about the order being placed. */
export interface PlacementContext {
  settings: Pick<PaymentSettings, 'codFeeEnabled' | 'codFeeType' | 'codFeeValue'>;
  totalCents: number;
  /** Raw customer-supplied transaction id; a provider keeps it only if it takes a fee. */
  customerTxnId?: string | null;
}

/** An audit entry written with the order, attributed to the customer. */
export interface PlacementEvent {
  status: OrderStatus;
  note: string;
}

/** `Payment` columns a provider fills in at placement (beyond method/status/amount). */
export type PlacementPaymentFields = Pick<
  Prisma.PaymentUncheckedCreateWithoutOrderInput,
  'feeCents' | 'feeType' | 'feeValue' | 'feeStatus' | 'customerTxnId' | 'txnSubmittedAt'
>;

/**
 * How an order is created for a payment method. Pure data computed from
 * the settings and the total; `placeOrder` persists it in one nested create.
 */
export interface PlacementPlan {
  paymentFields: PlacementPaymentFields;
  /** Order status at creation. */
  initialStatus: OrderStatus;
  /** Audit trail in chronological order. */
  events: PlacementEvent[];
  /** A confirmation fee applies, so the customer must still pay it. */
  feeRequired: boolean;
  /** The fee that applies (also snapshotted in `paymentFields`), or null. */
  fee: ResolvedCodFee | null;
}

export interface PaymentGateway {
  readonly method: PaymentMethod;
  /**
   * Pure, DB-free: how an order paid with this method is created. Optional;
   * methods without one use `defaultPlacementPlan`.
   */
  planPlacement?(ctx: PlacementContext): PlacementPlan;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  /**
   * Resolve a callback/IPN payload into a normalised outcome.
   * MUST throw on signature verification failure - callers handle the
   * error and respond with 400 to the gateway.
   */
  parseCallback(payload: unknown): Promise<CallbackOutcome>;
}
