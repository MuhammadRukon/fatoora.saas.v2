import NextAuth from 'next-auth';
import { authOptions } from '@/server/auth/authOptions';

/**
 * Single Auth.js instance. Imported by the [...nextauth] route handler,
 * server actions, server components, and `middleware.ts`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
