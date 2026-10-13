/**
 * Dev seed for Cryptech ecommerce.
 *
 * - Creates an admin and a regular customer (passwords from env or fallback).
 * - Creates a small set of categories + brands + published products with
 *   one default variant each.
 * - Idempotent: re-running upserts existing rows by their natural keys.
 *
 * Run: `npm run db:seed`
 */
import { PrismaClient, PublishStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD)
) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before seeding production');
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@tecnologia.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
const CUSTOMER_EMAIL = process.env.SEED_CUSTOMER_EMAIL ?? 'customer@tecnologia.test';
const CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD ?? 'customer12345';

async function upsertUser(email: string, name: string, password: string, role: UserRole) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });
}

async function seedCatalog() {
  const phones = await prisma.category.upsert({
    where: { slug: 'phones' },
    update: {},
    create: { slug: 'phones', name: 'Phones', status: PublishStatus.PUBLISHED, isPopular: true },
  });
  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: { slug: 'laptops', name: 'Laptops', status: PublishStatus.PUBLISHED, isPopular: true },
  });
  const accessories = await prisma.category.upsert({
    where: { slug: 'accessories' },
    update: {},
    create: { slug: 'accessories', name: 'Accessories', status: PublishStatus.PUBLISHED },
  });

  const apple = await prisma.brand.upsert({
    where: { slug: 'apple' },
    update: {},
    create: { slug: 'apple', name: 'Apple', status: PublishStatus.PUBLISHED, isPopular: true },
  });
  const samsung = await prisma.brand.upsert({
    where: { slug: 'samsung' },
    update: {},
    create: { slug: 'samsung', name: 'Samsung', status: PublishStatus.PUBLISHED, isPopular: true },
  });
  const dell = await prisma.brand.upsert({
    where: { slug: 'dell' },
    update: {},
    create: { slug: 'dell', name: 'Dell', status: PublishStatus.PUBLISHED },
  });

  const products: Array<{
    slug: string;
    name: string;
    description: string;
    brandId: string;
    categoryIds: string[];
    sku: string;
    sellingPriceCents: number;
    buyingPriceCents: number;
    stock: number;
  }> = [
    {
      slug: 'iphone-15-pro',
      name: 'iPhone 15 Pro',
      description: 'Apple iPhone 15 Pro - 256GB, Titanium',
      brandId: apple.id,
      categoryIds: [phones.id],
      sku: 'APL-IP15P-256',
      sellingPriceCents: 16500000,
      buyingPriceCents: 14000000,
      stock: 25,
    },
    {
      slug: 'galaxy-s24-ultra',
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Samsung Galaxy S24 Ultra - 512GB',
      brandId: samsung.id,
      categoryIds: [phones.id],
      sku: 'SMS-GS24U-512',
      sellingPriceCents: 17800000,
      buyingPriceCents: 14800000,
      stock: 18,
    },
    {
      slug: 'macbook-air-m3',
      name: 'MacBook Air M3',
      description: 'Apple MacBook Air M3 13-inch 16GB/512GB',
      brandId: apple.id,
      categoryIds: [laptops.id],
      sku: 'APL-MBA-M3-512',
      sellingPriceCents: 18500000,
      buyingPriceCents: 16000000,
      stock: 12,
    },
    {
      slug: 'dell-xps-15',
      name: 'Dell XPS 15',
      description: 'Dell XPS 15 with Intel Core Ultra 7, 32GB RAM',
      brandId: dell.id,
      categoryIds: [laptops.id, accessories.id],
      sku: 'DEL-XPS15-32',
      sellingPriceCents: 22000000,
      buyingPriceCents: 19000000,
      stock: 8,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { status: PublishStatus.PUBLISHED },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        brandId: p.brandId,
        status: PublishStatus.PUBLISHED,
        warrantyMonths: 12,
        categories: {
          create: p.categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
    });

    await prisma.productVariant.upsert({
      where: { sku: p.sku },
      update: {
        sellingPriceCents: p.sellingPriceCents,
        buyingPriceCents: p.buyingPriceCents,
        stock: p.stock,
      },
      create: {
        productId: product.id,
        sku: p.sku,
        sellingPriceCents: p.sellingPriceCents,
        buyingPriceCents: p.buyingPriceCents,
        stock: p.stock,
      },
    });
  }
}

async function main() {
  await upsertUser(ADMIN_EMAIL, 'Admin', ADMIN_PASSWORD, UserRole.ADMIN);
  await upsertUser(CUSTOMER_EMAIL, 'Test Customer', CUSTOMER_PASSWORD, UserRole.CUSTOMER);
  await seedCatalog();
  console.log('Seed complete.');
  console.log(`  Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Customer: ${CUSTOMER_EMAIL} / ${CUSTOMER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
