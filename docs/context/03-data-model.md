# Data Model

Source of truth: [`prisma/schema.prisma`](../../prisma/schema.prisma). PostgreSQL. All money fields are **integer cents** (`*Cents`).

## Entities

### Identity & auth
- **User** — email (unique), optional `emailVerified` (credentials login is refused while null), optional `passwordHash` (null for OAuth-only), `role` (`CUSTOMER` | `ADMIN`), phone, image.
- **Account / Session** — standard Auth.js adapter tables (JWT strategy is used, so `Session` is mostly unused).
- **VerificationToken** — email verification: per signup/resend two rows keyed by `identifier = email`, a SHA-256 of the 6-digit code and of the link token, 30 min TTL, all rows for the email deleted on success (`src/server/auth/verification.ts`).
- **PasswordResetToken** — `tokenHash` (SHA-256, unique), `expiresAt`, `usedAt` (single-use).
- **Address** — per-user shipping addresses; `isDefault` flag; `country` defaults `"BD"`.

### Catalog
- **Category** — slug/name unique, optional `iconUrl`, `isPopular`, `status` (`DRAFT`/`PUBLISHED`/`ARCHIVED`), self-referential tree via `parentId`.
- **Brand** — slug/name unique, `logoUrl`, `isPopular`, `status`.
- **Product** — slug unique, description, `brandId` (1:N brand→products), `status`, `isPopular`, `warrantyMonths`, SEO `metaTitle`/`metaDescription`.
- **ProductCategory** — M:N join product↔category.
- **ProductImage** — Cloudinary `url` + `publicId`, `alt`, `sortOrder`.
- **ProductVariant** — the sellable unit: unique `sku`, free-form JSON `attributes`, `buyingPriceCents`, `sellingPriceCents`, `discountCents`, `stock`, `lowStockThreshold`, `isActive`. Cart and order items reference variants, never products directly.

### Commerce
- **Cart** — one per user (`userId` unique). **CartItem** — unique per (cartId, variantId), quantity.
- **Order** — `orderNumber` unique, `status` (`PENDING/CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED`), denormalized shipping address snapshot (`ship*` fields), `subtotal/discount/shipping/totalCents`, optional coupon ref + code snapshot, `cancelledAt`/`cancelReason`.
- **OrderItem** — snapshot of product at purchase time: `productName`, `variantName`, `sku`, `imageUrl`, `buyingPriceCents`, `unitPriceCents`, quantity. `variantId`/`productId` are nullable so catalog deletions don't break history.
- **OrderEvent** — audit trail: status, note, optional `actorId`, timestamp.
- **Payment** — method (`COD/SSLCOMMERZ/BKASH/BANK_TRANSFER`), status (`PENDING/SUCCEEDED/FAILED/REFUNDED/CANCELLED`), `amountCents`, `providerRef` (unique), `bankRef` (matched case-insensitively via functional index `Payment_bankRef_lower_idx`, migration-only), `rawPayload` JSON, `verifiedById`/`verifiedAt` for manual verification; **COD fee fields**: `feeCents`, `feeType` (`FLAT`/`PERCENT`), `feeValue` (cents or integer %), `feeStatus` (`NONE/PENDING/VERIFIED/REJECTED/WAIVED`), `customerTxnId` (unique, add-only), `txnSubmittedAt`, `feeVerifiedById`/`feeVerifiedAt`. Note: `REFUNDED` is defined but never set anywhere in code.
- **PaymentSettings** — singleton (`id='singleton'`), admin-configured: `enabledMethods: PaymentMethod[]` (default: [COD]; canonicalized: deduped, enum order), COD fee rule: `codFeeEnabled`, `codFeeType` (FLAT/PERCENT), `codFeeValue` (cents for FLAT, 1–100 for PERCENT), plus `qrImageUrl`, `qrImagePublicId` (Cloudinary), `contactNumber`, `paymentNote`, `updatedAt`, `updatedById`.

### Post-purchase
- **Review** — one per `orderItemId` (unique), rating + title + body, tied to user & product.
- **WarrantyRequest** — per order+user, reason, status (`OPEN/APPROVED/REJECTED/RESOLVED`), resolution note.

### Infrastructure
- **RateLimitBucket** — fixed-window counters (`key` PK, `count`, `resetAt`, index on `resetAt`) behind `src/server/common/rate-limit.ts`; the default fallback when Redis is absent or down.

### Marketing
- **Coupon** — code unique, `PERCENT`|`FIXED`, `value`, `minSubtotalCents`, `maxDiscountCents`, start/expiry window, `usageLimit`/`usedCount`, `perUserLimit`, `isActive`.

## Key relations

```
User 1—N Order, Address, Review, WarrantyRequest ; 1—1 Cart
Brand 1—N Product ; Product N—M Category ; Product 1—N Variant, Image
Cart 1—N CartItem N—1 ProductVariant
Order 1—N OrderItem, OrderEvent, Payment ; N—1 Address, Coupon(optional)
OrderItem 1—0..1 Review
```

## Design notes

- **Snapshots everywhere history matters**: order items copy name/sku/price; orders copy the shipping address; orders copy `couponCode`. Catalog edits/deletes never corrupt past orders.
- **Archival over deletion**: products referenced by order items are archived, not deleted; variants deactivated.
- **Money**: integer cents only; helpers in `src/server/common/money.ts` (rounding, percent discounts).
- **Indexes** exist on the hot paths (status+createdAt on orders, productId+sortOrder on images, etc.). `Product.slug` is covered by its unique index; the redundant `Product_slug_idx` was dropped by migration `20261013100000_drop_redundant_product_slug_index`.
- **Gaps to be aware of**: no `AuditLog` beyond OrderEvent; no shipment/tracking entity; no stock-movement ledger; coupon `usedCount` is a plain counter (incremented with a conditional guard at checkout, not released on most cancel paths); category tree has no cycle guard. Open items: [../KNOWN-ISSUES.md](../KNOWN-ISSUES.md).
