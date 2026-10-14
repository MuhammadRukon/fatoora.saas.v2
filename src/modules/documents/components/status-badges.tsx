import type { DocumentStatus, SubmissionStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { DOCUMENT_STATUS_LABELS, SUBMISSION_STATUS_LABELS } from '@/contracts/documents';

const submissionVariant = (s: SubmissionStatus) =>
  s === 'REJECTED' ? 'destructive' : s === 'REPORTED' || s === 'CLEARED' ? 'default' : 'outline';

/** Draft/issued, the ZATCA outcome once issued, and a Test marker for Simulation documents. */
export function StatusBadges({
  status,
  submissionStatus,
  isTest,
}: {
  status: DocumentStatus;
  submissionStatus: SubmissionStatus;
  isTest: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={status === 'DRAFT' ? 'secondary' : 'outline'}>{DOCUMENT_STATUS_LABELS[status]}</Badge>
      {status === 'ISSUED' ? (
        <Badge variant={submissionVariant(submissionStatus)}>{SUBMISSION_STATUS_LABELS[submissionStatus]}</Badge>
      ) : null}
      {isTest ? <Badge variant="outline">Test</Badge> : null}
    </div>
  );
}
