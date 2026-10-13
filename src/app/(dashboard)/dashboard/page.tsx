import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

export default async function Dashboard() {
  const counts = await subscriptionsService.counts();
  const stats = [
    { label: 'Users', value: counts.users },
    { label: 'Pending requests', value: counts.pending },
    { label: 'Active subscriptions', value: counts.active },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <dl className="grid max-w-3xl grid-cols-1 divide-y rounded-xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 p-5">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-3xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard/users">
            {counts.pending > 0 ? `Review ${counts.pending} pending` : 'Manage users'}
          </Link>
        </Button>
      </div>
    </div>
  );
}
