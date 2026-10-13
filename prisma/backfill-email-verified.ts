/**
 * One-off backfill: grandfather accounts created before email
 * verification existed. Without this, every pre-existing user
 * (including the admin) is locked out by the new login gate.
 *
 * Run: npx tsx prisma/backfill-email-verified.ts
 * Idempotent — only touches rows where emailVerified is still null.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerified: null },
    data: { emailVerified: new Date() },
  });
  console.log(`Backfilled emailVerified for ${result.count} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
