'use client';

import Link from 'next/link';
import { useState } from 'react';
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
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/contracts/auth';
import { forgotPasswordAction } from '@/modules/auth/actions';
import { AuthCard } from '@/modules/auth/components/auth-card';
import { Loader } from '@/app/common/loader/loader';

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setIsSubmitting(true);
    setDevLink(null);
    const res = await forgotPasswordAction(values);
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error(res.message ?? 'Could not process request');
      return;
    }
    toast.success(res.message ?? 'Check your email');
    if (res.devResetUrl) setDevLink(res.devResetUrl);
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      footer={
        <p className="text-sm text-muted-foreground text-center">
          Remembered it?{' '}
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
                  <Input type="email" autoComplete="email" placeholder="m@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader /> : 'Send reset link'}
          </Button>
        </form>
      </Form>
      {devLink ? (
        <div className="mt-4 rounded-md border p-3 text-sm">
          <p className="text-muted-foreground mb-1">
            Dev mode: open the link below to reset your password without email delivery.
          </p>
          <Link className="underline break-all" href={devLink}>
            {devLink}
          </Link>
        </div>
      ) : null}
    </AuthCard>
  );
}
