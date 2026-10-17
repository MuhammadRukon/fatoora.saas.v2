/**
 * Dev seed for Fatoora.
 *
 * - Upserts the ADMIN from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (dev fallback below).
 * - Optionally upserts a demo USER when SEED_USER_EMAIL and SEED_USER_PASSWORD are set.
 * - Both are email-verified, since login refuses unverified accounts.
 * - Idempotent: re-running upserts by email.
 *
 * Run: `npm run db:seed`
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD)
) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before seeding production');
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@fatoora.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
const USER_EMAIL = process.env.SEED_USER_EMAIL;
const USER_PASSWORD = process.env.SEED_USER_PASSWORD;

async function upsertUser(email: string, name: string, password: string, role: UserRole) {
  const passwordHash = await bcrypt.hash(password, 10);
  const emailVerified = new Date();
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, emailVerified },
    create: { email, name, role, passwordHash, emailVerified },
  });
}

async function main() {
  await upsertUser(ADMIN_EMAIL, 'Admin', ADMIN_PASSWORD, UserRole.ADMIN);
  console.log('Seed complete.');
  console.log(`  Admin: ${ADMIN_EMAIL}`);
  if (USER_EMAIL && USER_PASSWORD) {
    await upsertUser(USER_EMAIL, 'Demo User', USER_PASSWORD, UserRole.USER);
    console.log(`  User:  ${USER_EMAIL}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
