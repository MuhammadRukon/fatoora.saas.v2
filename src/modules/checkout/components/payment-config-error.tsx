import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Destructive alert with a Retry button for a payment-config query that failed. */
export function PaymentConfigError({
  message,
  query,
}: {
  message: string;
  query: { refetch: () => unknown; isFetching: boolean };
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="items-start gap-2 text-destructive">
        <p>{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
