import Link from 'next/link';

import { Button } from '@/components/ui/button';

// Placeholder: user and subscription counts land with subscriptions (plan Phase 2).
export default function Dashboard() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-sm text-muted-foreground">
        User and subscription counts will appear here.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard/users">Manage users</Link>
        </Button>
      </div>
    </div>
  );
}
