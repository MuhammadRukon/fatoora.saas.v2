import type { NextAuthConfig } from 'next-auth';
import { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import type { UserRole } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { credentialsSchema } from '@/contracts/auth';
import {
  RateLimitedError,
  clearRateLimit,
  clientIp,
  enforceRateLimit,
} from '@/server/common/rate-limit';
import { verifyPassword } from './password';

/**
 * Thrown from `authorize` when the account exists and the password is
 * correct but the email was never verified. The `code` lands in the
 * client-side `signIn(..., { redirect: false })` result so the login
 * page can point the user at /verify-email instead of a generic error.
 */
class UnverifiedEmailError extends CredentialsSignin {
  code = 'unverified';
}

/**
 * Thrown when too many login attempts have been made for an email.
 * Subclasses CredentialsSignin so the `code` survives to the client —
 * a plain Error thrown from `authorize` collapses into a generic
 * CredentialsSignin with no distinguishable code.
 */
class ThrottledLoginError extends CredentialsSignin {
  code = 'throttled';
}

/**
 * Auth.js v5 config.
 *
 * - JWT session strategy. Required when using the Credentials provider
 *   and lets middleware read the user role without a DB hit.
 * - PrismaAdapter is intentionally NOT attached here; Auth.js v5 with
 *   the `jwt` strategy stores no session in the DB. We still issue
 *   `Account` rows manually for OAuth via the `signIn` callback if/when
 *   we need richer linking. For now JWT-only is enough for Phase 2.
 * - The role and id are encoded into the token at sign-in and exposed
 *   via the session callback to the client + server consumers.
 *
 * Public-side providers like Google are only registered if the env
 * vars are set, so a fresh clone works out of the box with credentials.
 */
const useGoogle = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthConfig = {
  session: { strategy: 'jwt' },
  trustHost: process.env.AUTH_TRUST_HOST === 'true' || process.env.NODE_ENV !== 'production',
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // Throttle password guessing (credential stuffing / brute force);
        // bcrypt alone is not an anti-brute-force control. Key by IP +
        // email, NOT email alone: an email-only bucket lets a remote
        // attacker lock a victim out globally, because the throttle
        // throws before the password check so the victim's correct
        // password can never clear it. Scoping to the source IP means a
        // victim signing in from a different IP is unaffected. The bucket
        // is cleared on success so a run of typos doesn't accumulate.
        const ip = request instanceof Request ? clientIp(request) : 'unknown';
        const rlKey = `login:${ip}:${parsed.data.email}`;
        try {
          await enforceRateLimit(rlKey, { max: 10, windowMs: 15 * 60 * 1000 });
        } catch (err) {
          if (err instanceof RateLimitedError) throw new ThrottledLoginError();
          throw err;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            passwordHash: true,
            image: true,
            emailVerified: true,
          },
        });
        if (!user || !user.passwordHash) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        // Correct password: reset the failure counter for this key.
        await clearRateLimit(rlKey);

        // Correct credentials but unverified email: block with a
        // distinguishable code (only after the password check, so this
        // can't be used to probe which emails are registered).
        if (!user.emailVerified) throw new UnverifiedEmailError();

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
        };
      },
    }),
    ...(useGoogle
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For Google sign-ins, ensure a User row exists so the rest of the
      // app (orders, cart, reviews) has a stable FK target. We do not
      // store Google's account row separately in JWT mode - the link is
      // by email.
      //
      // No PrismaAdapter is attached (see file header), so NextAuth's
      // `allowDangerousEmailAccountLinking` flag has no effect here -
      // this callback IS the account-linking logic. Auto-linking to an
      // existing user that already has a password set would let anyone
      // who pre-registers a victim's email via credentials sign-up
      // silently take over the account the victim later reaches via
      // Google. Refuse to link in that case instead.
      if (account?.provider === 'google' && user?.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          const created = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email.split('@')[0],
              image: user.image ?? null,
              emailVerified: new Date(),
            },
            select: { id: true, role: true },
          });
          (user as { id?: string; role?: UserRole }).id = created.id;
          (user as { id?: string; role?: UserRole }).role = created.role;
        } else if (existing.passwordHash) {
          return false;
        } else {
          if (!existing.emailVerified) {
            // Google vouches for the mailbox, so a Google sign-in
            // verifies a previously-unverified account.
            await prisma.user.update({
              where: { id: existing.id },
              data: { emailVerified: new Date() },
            });
          }
          (user as { id?: string; role?: UserRole }).id = existing.id;
          (user as { id?: string; role?: UserRole }).role = existing.role;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; role?: UserRole };
        if (u.id) token.sub = u.id;
        if (u.role) token.role = u.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as UserRole;
      return session;
    },
  },
};
