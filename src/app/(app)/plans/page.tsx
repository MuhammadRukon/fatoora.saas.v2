'use client';

import Link from 'next/link';
import { SubscriptionPlan } from '@prisma/client';
import { IconCircleCheck, IconClockHour4, IconAlertCircle } from '@tabler/icons-react';

import { Loader } from '@/components/common/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PLAN_MONTHS, planLabel } from '@/contracts/subscriptions';
import { formatDate } from '@/lib/utils';
import { useRequestPlan, useSubscriptionState } from '@/modules/subscriptions/hooks';

const PLANS = Object.values(SubscriptionPlan);

export default function PlansPage() {
  const { data, isLoading, isError } = useSubscriptionState();
  const request = useRequestPlan();
  const pending = data?.pending ?? null;
  // One open request per user: cards stay locked until the admin activates it.
  const locked = isLoading || isError || !!pending || request.isPending;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Choose a plan</h1>
        <p className="max-w-prose text-muted-foreground">
          Pick how long you need access. There is no payment in the app: an admin reviews your
          request and activates it.
        </p>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Couldn&apos;t load your subscription</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      ) : null}

      {data?.state === 'ACTIVE' && data.activeUntil ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <IconCircleCheck />
          <AlertTitle>Active until {formatDate(data.activeUntil)}</AlertTitle>
          <AlertDescription className="text-emerald-800 dark:text-emerald-300">
            <p>
              A new plan starts when this one ends.{' '}
              <Link href="/app" className="font-medium underline underline-offset-4">
                Go to the app
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {data?.state === 'EXPIRED' && !pending ? (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Your subscription has ended</AlertTitle>
          <AlertDescription>Request a plan to continue using Fatoora.</AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <IconClockHour4 />
          <AlertTitle>
            Your {PLAN_MONTHS[pending.plan]}-month request is awaiting admin activation
          </AlertTitle>
          <AlertDescription className="text-amber-900 dark:text-amber-300">
            Requested on {formatDate(pending.createdAt)}. You can request another plan once this
            one is active.
          </AlertDescription>
        </Alert>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Plans">
        {PLANS.map((plan) => {
          const months = PLAN_MONTHS[plan];
          const isRequested = pending?.plan === plan;
          const isSending = request.isPending && request.variables?.plan === plan;
          return (
            <li
              key={plan}
              aria-disabled={locked || undefined}
              className={
                'flex flex-col gap-6 rounded-xl border bg-card p-6 transition-colors ' +
                (isRequested
                  ? 'border-amber-300 dark:border-amber-800'
                  : locked
                    ? 'opacity-60'
                    : 'hover:border-foreground/30')
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">{months}</span>
                <span className="text-muted-foreground">{months === 1 ? 'month' : 'months'}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Full access for {planLabel(plan)} from the day it&apos;s activated.
              </p>
              <Button
                className="mt-auto w-full"
                variant={isRequested ? 'secondary' : 'default'}
                disabled={locked}
                onClick={() => request.mutate({ plan })}
              >
                {isSending ? <Loader /> : isRequested ? 'Requested' : `Request ${planLabel(plan)}`}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
