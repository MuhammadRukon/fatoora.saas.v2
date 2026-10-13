import { OrderStatus, WarrantyStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/server/common/errors';

export const warrantyService = {
  /**
   * Customer files a warranty request against a delivered order.
   * Each order can only have one open request at a time; further
   * issues create a new request after the previous one is resolved.
   */
  async submit(userId: string, orderId: string, reason: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundError('Order');
    if (order.userId !== userId) throw new ForbiddenError('Not your order');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ConflictError('Warranty can only be requested for delivered orders');
    }
    const open = await prisma.warrantyRequest.findFirst({
      where: {
        orderId,
        status: { in: [WarrantyStatus.OPEN, WarrantyStatus.APPROVED] },
      },
    });
    if (open) {
      throw new ConflictError('A warranty request is already in progress for this order');
    }
    return prisma.warrantyRequest.create({
      data: { orderId, userId, reason: reason.trim() },
    });
  },

  listMy(userId: string) {
    return prisma.warrantyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, orderNumber: true, totalCents: true } },
      },
    });
  },

  listAll(filter: { status?: WarrantyStatus } = {}) {
    return prisma.warrantyRequest.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true, totalCents: true } },
      },
    });
  },

  async transition(adminId: string, id: string, status: WarrantyStatus, resolution?: string) {
    const existing = await prisma.warrantyRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Warranty request');
    if (existing.status === WarrantyStatus.RESOLVED) {
      throw new ConflictError('Warranty request is already resolved');
    }
    const updated = await prisma.warrantyRequest.update({
      where: { id },
      data: { status, resolution: resolution ?? existing.resolution },
    });
    void adminId;
    return updated;
  },
};
