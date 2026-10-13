'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { verifyEmailSchema, type VerifyEmailInput } from '@/contracts/auth';
import { resendVerificationAction, verifyEmailAction } from '@/modules/auth/actions';
import { AuthCard } from '@/modules/auth/components/auth-card';
import { Loader } from '@/app/common/loader/loader';

const RESEND_COOLDOWN_S = 60;

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const emailParam = params.get('email') ?? '';
  const devCodeParam = params.get('devCode');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(devCodeParam);
  // Deeplink auto-verify state: 'idle' when no token in the URL.
  const [linkStatus, setLinkStatus] = useState<'idle' | 'verifying' | 'failed'>(
    token ? 'verifying' : 'idle',
  );
  const linkAttempted = useRef(false);

  const form = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: emailParam, code: '' },
  });

  // Deeplink path: ?token= verifies without any typing.
  useEffect(() => {
    if (!token || linkAttempted.current) return;
    linkAttempted.current = true;
    void (async () => {
      const res = await verifyEmailAction({ token });
      if (res.ok) {
        toast.success(res.message ?? 'Email verified');
        router.push('/login');
      } else {
        setLinkStatus('failed');
        toast.error(res.message ?? 'Verification failed');
      }
    })();
  }, [token, router]);

  // Rehydrate the resend cooldown from localStorage so a hard refresh
  // doesn't hand the user a fresh "Resend" button (the real abuse guard
  // is the server rate limit on `resend-verify:${email}`; this is UX).
  const watchedEmail = form.watch('email');
  useEffect(() => {
    if (!watchedEmail) return;
    const until = Number(localStorage.getItem(`resend-at:${watchedEmail}`) ?? 0);
    const remaining = Math.ceil((until - Date.now()) / 1000);
    setResendCooldown(remaining > 0 ? remaining : 0);
  }, [watchedEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      if (watchedEmail) localStorage.removeItem(`resend-at:${watchedEmail}`);
      return;
    }
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown, watchedEmail]);

  async function onSubmit(values: VerifyEmailInput) {
    setIsSubmitting(true);
    const res = await verifyEmailAction({ email: values.email, code: values.code });
    setIsSubmitting(false);

    if (!res.ok) {
      if (res.fieldErrors) {
        for (const [key, message] of Object.entries(res.fieldErrors)) {
          form.setError(key as keyof VerifyEmailInput, { message });
        }
      }
      toast.error(res.message ?? 'Verification failed');
      return;
    }
    toast.success(res.message ?? 'Email verified');
    router.push('/login');
  }

  async function onResend() {
    const email = form.getValues('email');
    if (!email) {
      form.setError('email', { message: 'Enter your email first' });
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
    localStorage.setItem(`resend-at:${email}`, String(Date.now() + RESEND_COOLDOWN_S * 1000));
    const res = await resendVerificationAction({ email });
    if (!res.ok) {
      toast.error(res.message ?? 'Could not resend code');
      return;
    }
    toast.success(res.message ?? 'Code sent');
    if (res.devCode) setDevCode(res.devCode);
  }

  if (linkStatus === 'verifying') {
    return (
      <AuthCard title="Verifying your email" description="One moment...">
        <div className="flex justify-center py-8">
          <Loader />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verify your email"
      description={
        linkStatus === 'failed'
          ? 'That link is invalid or expired. Enter the code from your email, or resend a new one.'
          : 'We sent a 6-digit code to your email. Enter it below to activate your account.'
      }
      footer={
        <p className="text-sm text-muted-foreground text-center">
          Already verified?{' '}
          <Link href="/login" className="underline">
            Login
          </Link>
        </p>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification code</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="tracking-[6px]"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader /> : 'Verify email'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={resendCooldown > 0}
            onClick={onResend}
          >
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
          </Button>
        </form>
      </Form>
      {devCode ? (
        <div className="mt-4 rounded-md border p-3 text-sm">
          <p className="text-muted-foreground mb-1">
            Dev mode: no mailer configured, use this code.
          </p>
          <p className="font-mono text-lg tracking-[6px]">{devCode}</p>
        </div>
      ) : null}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>}
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
