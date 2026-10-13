import Image from 'next/image';
import { TriangleAlertIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CodFeeNoticeProps {
  /** Output of `buildCodFeeWarning` (built from the Payment snapshot or the live quote). */
  warning: string;
  qrImageUrl: string | null;
  contactNumber: string | null;
  paymentNote: string | null;
}

/**
 * Confirmation-fee warning with the admin's QR, contact and note. All text is
 * rendered as plain text (the note is admin-authored free text).
 */
export function CodFeeNotice({ warning, qrImageUrl, contactNumber, paymentNote }: CodFeeNoticeProps) {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle className="line-clamp-none">Confirmation fee required</AlertTitle>
      <AlertDescription className="text-foreground">
        <p>{warning}</p>
        {qrImageUrl ? (
          <Image
            src={qrImageUrl}
            alt="Payment QR code"
            width={192}
            height={192}
            className="mt-2 h-auto w-48 max-w-full rounded border bg-white"
          />
        ) : null}
        {contactNumber ? (
          <p className="mt-2">
            Admin contact: <span className="font-medium">{contactNumber}</span>
          </p>
        ) : null}
        {paymentNote ? (
          <p className="mt-2 whitespace-pre-line break-words text-muted-foreground">
            {paymentNote}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
