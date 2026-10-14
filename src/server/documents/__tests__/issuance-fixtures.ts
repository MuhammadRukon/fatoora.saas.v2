import { vi } from 'vitest';

import { documentDraftSchema, type DocumentDraftInput } from '@/contracts/documents';
import { prisma } from '@/lib/prisma';
import { businessData, testUsers } from '@/server/business/__tests__/fixtures';
import { encrypt, generateKeyPair } from '@/server/zatca';
import { selfSignedCertificate } from '@/server/zatca/__tests__/test-cert';

import { documentsService } from '../documents.service';

export const KEY = Buffer.alloc(32, 7).toString('base64');
export const NOW = new Date('2026-10-14T09:30:00Z');

/** A business with an ACTIVE EGS holding a real (self-signed secp256k1) key and certificate. */
export async function setupIssuing(users: ReturnType<typeof testUsers>, o: { egs?: boolean } = {}) {
  const user = await users.create();
  const business = await prisma.business.create({ data: { ...businessData(), ownerId: user.id } });
  let egs = null;
  if (o.egs !== false) {
    const keys = generateKeyPair();
    egs = await prisma.egsUnit.create({
      data: {
        businessId: business.id,
        environment: 'SIMULATION',
        serialNumber: `1-Fatoora|2-v2|3-${Math.random()}`,
        commonName: 'Test-EGS',
        status: 'ACTIVE',
        privateKeyEnc: encrypt(keys.privateKeyPem, KEY),
        certificatePem: selfSignedCertificate(keys).pem,
        productionCsidEnc: encrypt('token', KEY),
        productionSecretEnc: encrypt('secret', KEY),
      },
    });
  }
  return { user, business, egs };
}

const line = { description: 'Widget', quantity: '3', unitPriceHalalas: 3333, taxCategory: 'S' };
export const draftBody = (o: Partial<DocumentDraftInput> = {}): DocumentDraftInput => ({
  kind: 'INVOICE',
  subtype: 'SIMPLIFIED',
  lines: [line],
  ...o,
});
export const createDraft = (businessId: string, o: Partial<DocumentDraftInput> = {}) =>
  documentsService.createDraft(businessId, documentDraftSchema.parse(draftBody(o)));

export const completeCustomer = (businessId: string, o: Record<string, unknown> = {}) =>
  prisma.customer.create({
    data: {
      businessId,
      name: 'Acme',
      vatNumber: '310000000000003',
      street: 'Tahlia',
      buildingNumber: '4321',
      district: 'Rawdah',
      city: 'Jeddah',
      postalCode: '23435',
      countryCode: 'SA',
      ...o,
    },
  });

type Reply = { status: number; body?: unknown };
/** Mock gateway: a reply (or function) per endpoint; defaults to PASS. Records the calls. */
export function mockGateway(replies: { report?: Reply | (() => Reply); clear?: Reply | (() => Reply) } = {}) {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const pass = { status: 200, body: { validationResults: { status: 'PASS', infoMessages: [], warningMessages: [], errorMessages: [] } } };
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/simulation/, '');
    calls.push({ path, body: JSON.parse(init!.body as string) });
    const which = path.includes('clearance') ? 'clear' : 'report';
    const r = replies[which] ?? pass;
    const reply = typeof r === 'function' ? r() : r;
    if (reply.status === -1) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? pass.body), { status: reply.status });
  });
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

export const deps = (fetchImpl: typeof fetch, now = NOW) => ({ fetchImpl, encryptionKey: KEY, now });
