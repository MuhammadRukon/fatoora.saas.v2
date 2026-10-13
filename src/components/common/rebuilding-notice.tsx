import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RebuildingNoticeProps {
  title: string;
  description: string;
}

/**
 * Lightweight placeholder for admin pages that are scheduled to be
 * implemented in a later refactor phase. Keeps the UI navigable while
 * the data layer/contract is being put in place.
 */
export function RebuildingNotice({ title, description }: RebuildingNoticeProps) {
  return (
    <div className="flex h-full items-center justify-center py-16">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
