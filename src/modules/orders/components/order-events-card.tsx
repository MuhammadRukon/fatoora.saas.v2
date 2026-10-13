import type { OrderEvent } from '@prisma/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/modules/orders/components/order-status-badge';

type OrderEventRow = Pick<OrderEvent, 'id' | 'status' | 'note' | 'createdAt'>;

interface OrderEventsCardProps {
  /** "Tracking" on the customer page, "Audit trail" on the admin page. */
  title: string;
  events: OrderEventRow[];
}

/** The order's `OrderEvent` timeline. */
export function OrderEventsCard({ title, events }: OrderEventsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              <OrderStatusBadge status={e.status} />
              <div>
                <p>{e.note ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
