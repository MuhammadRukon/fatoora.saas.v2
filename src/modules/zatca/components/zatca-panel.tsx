'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IconAlertTriangle, IconCircleCheck, IconExternalLink } from '@tabler/icons-react';

import { Loader } from '@/components/common/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/fetcher';
import { useOnboard, useZatcaStatus } from '@/modules/zatca/hooks';

// One portal serves both environments; the user picks Simulation or Production after signing in (unverified, see docs).
const PORTAL_URL = 'https://fatoora.zatca.gov.sa/';
const EXPIRY_WARNING_DAYS = 30;

const STEPS = [
  'Request a compliance certificate from ZATCA with your OTP',
  'Submit 6 sample documents (standard and simplified invoice, credit and debit note for each)',
  'Request the production certificate',
];

export function ZatcaPanel() {
  const status = useZatcaStatus();
  const onboard = useOnboard();
  const [otp, setOtp] = useState('');

  if (status.isLoading) return <Skeleton className="h-64 w-full" />;
  if (status.isError || !status.data) {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle />
        <AlertTitle>Could not load the ZATCA status</AlertTitle>
        <AlertDescription>Reload the page to try again.</AlertDescription>
      </Alert>
    );
  }

  const { environment, egs } = status.data;
  const active = egs?.status === 'ACTIVE';
  const daysLeft = egs?.certNotAfter ? Math.floor((new Date(egs.certNotAfter).getTime() - Date.now()) / 86_400_000) : null;
  const result = onboard.data;
  const requestError = onboard.error instanceof ApiClientError ? onboard.error.message : onboard.error ? 'Request failed' : null;
  const errors = [...(result?.errors ?? []), ...(egs?.status === 'FAILED' && !result ? [egs.lastError ?? ''] : [])]
    .join('\n')
    .split('\n')
    .filter(Boolean);
  const valid = /^\d{6}$/.test(otp);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={environment === 'SIMULATION' ? 'outline' : 'secondary'}>
          {environment === 'SIMULATION' ? 'Simulation' : 'Production'}
        </Badge>
        <Badge variant={active ? 'default' : 'outline'}>{egs ? STATUS_LABEL[egs.status] : 'Not onboarded'}</Badge>
        <span className="text-sm text-muted-foreground">
          Switch environment on <Link className="underline underline-offset-4" href="/app/business">the business page</Link>.
        </span>
      </div>

      {environment === 'SIMULATION' ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Test mode</AlertTitle>
          <AlertDescription>Test mode – documents are not legal tax invoices.</AlertDescription>
        </Alert>
      ) : null}

      {daysLeft !== null && daysLeft < EXPIRY_WARNING_DAYS ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>{daysLeft < 0 ? 'Certificate expired' : `Certificate expires in ${daysLeft} days`}</AlertTitle>
          <AlertDescription>Renew your ZATCA certificate before it expires. Renewal is not available in the app yet.</AlertDescription>
        </Alert>
      ) : null}

      {active ? (
        <Alert>
          <IconCircleCheck />
          <AlertTitle>Active</AlertTitle>
          <AlertDescription>
            <p>
              Unit <span className="font-mono text-xs">{egs.serialNumber}</span> is onboarded
              {egs.certNotAfter ? ` until ${new Date(egs.certNotAfter).toLocaleDateString('en-GB')}` : ''}.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !onboard.isPending) onboard.mutate(otp);
          }}
        >
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>
              Sign in to the{' '}
              <a className="inline-flex items-center gap-1 underline underline-offset-4" href={PORTAL_URL} target="_blank" rel="noreferrer">
                Fatoora portal <IconExternalLink className="size-3.5" />
              </a>{' '}
              ({environment === 'SIMULATION' ? 'Simulation' : 'Production'} environment) and open Onboard new solution unit.
            </li>
            <li>Generate an OTP. It is 6 digits and valid for one hour.</li>
            <li>Enter it below. Onboarding takes about a minute.</li>
          </ol>

          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="otp">OTP</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="tabular-nums"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              disabled={onboard.isPending}
              aria-describedby="otp-hint"
            />
            <p id="otp-hint" className="text-xs text-muted-foreground">
              Each attempt uses up an OTP. Limit: 5 attempts per hour.
            </p>
          </div>

          <div>
            <Button type="submit" disabled={!valid || onboard.isPending}>
              {onboard.isPending ? <Loader /> : egs?.status === 'COMPLIANCE_ISSUED' ? 'Resume onboarding' : 'Onboard'}
            </Button>
          </div>

          <ol className="flex flex-col gap-1.5 text-sm text-muted-foreground" aria-live="polite">
            {STEPS.map((s, i) => (
              <li key={s}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </form>
      )}

      {requestError || errors.length ? (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>Onboarding failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {requestError ? <li>{requestError}</li> : null}
              {errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <p className="mt-2">Generate a new OTP in the portal before trying again.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {result?.results.length ? (
        <table className="w-full text-sm">
          <caption className="pb-2 text-left font-medium">Compliance documents</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-4 font-normal">Document</th>
              <th className="py-1 pr-4 font-normal">HTTP</th>
              <th className="py-1 pr-4 font-normal">Result</th>
              <th className="py-1 font-normal">Errors / warnings</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className="py-1.5 pr-4 tabular-nums">{r.httpStatus}</td>
                <td className="py-1.5 pr-4">{r.outcome}</td>
                <td className="py-1.5 tabular-nums">
                  {r.errors} / {r.warnings}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const STATUS_LABEL = {
  NEW: 'Not onboarded',
  COMPLIANCE_ISSUED: 'Onboarding incomplete',
  ACTIVE: 'Active',
  FAILED: 'Failed',
  REVOKED: 'Revoked',
} as const;
