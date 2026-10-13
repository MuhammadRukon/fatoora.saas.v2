'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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
import { resetPasswordSchema, type ResetPasswordInput } from '@/contracts/auth';
import { resetPasswordAction } from '@/modules/auth/actions';
import { AuthCard } from '@/modules/auth/components/auth-card';
import { Loader } from '@/app/common/loader/loader';

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '' },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setIsSubmitting(true);
    const res = await resetPasswordAction(values);
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error(res.message ?? 'Could not reset password');
      return;
    }
    toast.success(res.message ?? 'Password updated');
    router.push('/login');
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="Enter a new password for your account."
      footer={
        <p className="text-sm text-muted-foreground text-center">
          Back to{' '}
          <Link href="/login" className="underline">
            Login
          </Link>
        </p>
      }
    >
      {!token ? (
        <p className="text-sm text-destructive">
          Missing or invalid reset token. Please request a new password reset link.
        </p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <input type="hidden" {...form.register('token')} />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader /> : 'Update password'}
            </Button>
          </form>
        </Form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
