'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
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
import { setAuthHint } from '@/lib/auth-hint';
import { credentialsSchema, type CredentialsInput } from '@/contracts/auth';
import { AuthCard } from '@/modules/auth/components/auth-card';
import { GoogleButton } from '@/modules/auth/components/google-button';
import { Loader } from '@/app/common/loader/loader';

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/';
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (params.get('error') === 'AccessDenied') {
      toast.error('An account already exists with this email; sign in with your password instead.');
    }
  }, [params]);

  const form = useForm<CredentialsInput>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: CredentialsInput) {
    setIsSubmitting(true);
    const res = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    setIsSubmitting(false);

    if (!res || res.error) {
      // `code` is set by UnverifiedEmailError in the credentials
      // authorize() — correct password but email never verified.
      if (res?.code === 'unverified') {
        toast.error('Please verify your email before logging in.');
        router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
        return;
      }
      if (res?.code === 'throttled') {
        toast.error('Too many attempts. Try again in a few minutes.');
        return;
      }
      toast.error('Invalid email or password');
      return;
    }
    toast.success('Signed in');
    setAuthHint();
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthCard
      title="Login to your account"
      description="Enter your email below to sign in."
      footer={
        <p className="text-sm text-muted-foreground text-center">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="underline">
            Sign up
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link href="/forgot-password" className="text-sm underline">
                    Forgot?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader /> : 'Login'}
          </Button>
        </form>
      </Form>
      <GoogleButton callbackUrl={callbackUrl} disabled={isSubmitting} />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>}
    >
      <LoginContent />
    </Suspense>
  );
}
