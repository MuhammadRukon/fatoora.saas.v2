import { CouponType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applyPercentDiscount } from '@/server/common/money';
import { ConflictError, NotFoundError, ValidationError } from '@/server/common/errors';
import type { CouponInput } from '@/contracts/coupons';

/** Either the global client or an in-flight `prisma.$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

export interface ValidateCouponInput {
  code: string;
  userId: string;
  subtotalCents: number;
}

export interface ValidatedCoupon {
  id: string;
  code: string;
  discountCents: number;
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

export const couponsService = {
  list() {
    return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async create(input: CouponInput) {
    try {
      return await prisma.coupon.create({
        data: {
          code: normaliseCode(input.code),
          type: input.type,
          value: input.value,
          minSubtotalCents: input.minSubtotalCents ?? 0,
          maxDiscountCents: input.maxDiscountCents ?? null,
          startsAt: input.startsAt ?? null,
          expiresAt: input.expiresAt ?? null,
          usageLimit: input.usageLimit ?? null,
          perUserLimit: input.perUserLimit ?? null,
          isActive: input.isActive ?? true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('A coupon with this code already exists');
      }
      throw err;
    }
  },

  async update(id: string, input: CouponInput) {
    try {
      return await prisma.coupon.update({
        where: { id },
        data: {
          code: normaliseCode(input.code),
          type: input.type,
          value: input.value,
          minSubtotalCents: input.minSubtotalCents ?? 0,
          maxDiscountCents: input.maxDiscountCents ?? null,
          startsAt: input.startsAt ?? null,
          expiresAt: input.expiresAt ?? null,
          usageLimit: input.usageLimit ?? null,
          perUserLimit: input.perUserLimit ?? null,
          isActive: input.isActive ?? true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictError('A coupon with this code already exists');
        }
        if (err.code === 'P2025') throw new NotFoundError('Coupon');
      }
      throw err;
    }
  },

  async remove(id: string) {
    try {
      await prisma.coupon.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundError('Coupon');
        if (err.code === 'P2003') {
          throw new ConflictError(
            'This coupon has been used by orders. Deactivate it instead of deleting.',
          );
        }
      }
      throw err;
    }
  },

  /**
   * Look up a coupon by code and validate it against the current cart
   * subtotal and the user's per-user usage cap. Returns the applicable
   * discount in cents, or throws a ValidationError with a user-facing
   * message that the checkout UI can surface.
   */
  async validate(input: ValidateCouponInput, db: Db = prisma): Promise<ValidatedCoupon> {
    const code = input.code.trim().toUpperCase();
    const coupon = await db.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      throw new ValidationError('Coupon code is invalid');
    }
    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new ValidationError('This coupon is not active yet');
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new ValidationError('This coupon has expired');
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new ValidationError('This coupon has reached its usage limit');
    }
    if (input.subtotalCents < coupon.minSubtotalCents) {
      throw new ValidationError('Cart subtotal does not meet the minimum for this coupon');
    }
    if (coupon.perUserLimit !== null) {
      const used = await db.order.count({
        where: { userId: input.userId, couponId: coupon.id },
      });
      if (used >= coupon.perUserLimit) {
        throw new ValidationError('You have already used this coupon');
      }
    }

    const raw =
      coupon.type === CouponType.PERCENT
        ? applyPercentDiscount(input.subtotalCents, coupon.value)
        : Math.min(coupon.value, input.subtotalCents);
    const discount = coupon.maxDiscountCents ? Math.min(raw, coupon.maxDiscountCents) : raw;

    return { id: coupon.id, code: coupon.code, discountCents: discount };
  },
};
