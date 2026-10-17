/**
 * ZATCA Simulation gate (plan AC6.4): onboards a throwaway EGS against the real Simulation gateway and sends the
 * 6 compliance documents. PASS means every document came back PASS with 0 errors and 0 warnings.
 *
 * Usage (from the repo root; needs .env.dev and the local Postgres):
 *   npm run zatca:sim-check -- --otp 123456                      # first business in the local DB
 *   npm run zatca:sim-check -- --otp 123456 --business-id <id>   # a specific business
 *   npm run zatca:sim-check -- --dry-run                         # build + sign the 6 documents, print hashes; no network, no DB
 *
 * Before a live run:
 *   1. In /app/business save a business whose VAT number is the one registered in the Fatoora portal, with the
 *      environment set to SIMULATION (the script refuses PRODUCTION).
 *   2. In the Fatoora portal (Simulation) generate an OTP (6 digits, valid 1 hour, one use).
 *   3. Run the command above. It must not have an EGS already onboarded for that business and environment.
 *
 * What it does: steps 2-4 of onboarding (key + CSR, compliance CSID, 6 documents). It stops before the production
 * CSID, then deletes the throwaway EGS row it created. Raw responses are written to
 * tools/zatca-sim-recordings/<timestamp>/ (gitignored; the `secret` field is blanked).
 *
 * Sandbox mode (dev-only, no DB, no real credentials): `npm run zatca:sandbox-check [-- --otp <6 digits>]`
 * Targets the public developer-portal sandbox (default OTP 123345) with a synthetic taxpayer, sends the 6 compliance
 * documents, then probes the production CSID, reporting and clearance endpoints (informational only).
 * Exit codes: 0 PASS, 1 failed or warnings, 2 usage error.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { assertLocalDatabase } from '../src/server/common/db-target';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const usage = (msg: string): never => {
  console.error(`${msg}\nUsage: npm run zatca:sim-check -- --otp <6 digits> [--business-id <id>] | --dry-run`);
  process.exit(2);
};

async function dryRun() {
  const { buildComplianceDocuments, buildCsr, generateKeyPair, verifySignedInvoice } = await import('../src/server/zatca');
  const { selfSignedCertificate } = await import('../src/server/zatca/__tests__/test-cert');
  const keys = generateKeyPair();
  buildCsr({
    ...keys,
    env: 'SIMULATION',
    commonName: 'Dry Run-EGS',
    serialNumber: '1-Fatoora|2-v2|3-00000000-0000-4000-8000-000000000000',
    vatNumber: '399999999900003',
    orgUnit: 'Riyadh Branch',
    orgName: 'Dry Run',
    registeredAddress: '1234 King Fahd Road, Al Olaya, Riyadh',
    businessCategory: 'Retail',
  });
  const docs = buildComplianceDocuments({
    seller: {
      name: 'شركة الاختبار',
      vatNumber: '399999999900003',
      idScheme: 'CRN',
      id: '1010010000',
      address: { street: 'King Fahd Road', buildingNumber: '1234', district: 'Al Olaya', city: 'Riyadh', postalCode: '12345', countryCode: 'SA' },
    },
    privateKeyPem: keys.privateKeyPem,
    certificatePem: selfSignedCertificate(keys).pem,
    now: new Date(),
  });
  console.log('ICV  Document                        Signature  Invoice hash');
  let ok = true;
  for (const d of docs) {
    const v = verifySignedInvoice(d.signedXml);
    const valid = v.hashValid && v.signedPropertiesValid && v.signatureValid && v.certificateDigestValid;
    ok &&= valid;
    console.log(`${d.icv}    ${d.label.padEnd(30)} ${(valid ? 'valid' : 'INVALID').padEnd(10)} ${d.invoiceHash}`);
  }
  console.log(ok ? '\nDry run OK (self-signed certificate, nothing sent to ZATCA).' : '\nDry run FAILED.');
  process.exit(ok ? 0 : 1);
}

const SANDBOX_SELLER = {
  name: 'شركة الاختبار المحدودة',
  vatNumber: '399999999900003',
  idScheme: 'CRN' as const,
  id: '1010010000',
  address: { street: 'King Fahd Road', buildingNumber: '1234', district: 'Al Olaya', city: 'Riyadh', postalCode: '12345', countryCode: 'SA' },
};

async function sandbox() {
  const otp = value('otp') ?? '123345';
  const z = await import('../src/server/zatca');
  const dir = path.join('tools', 'zatca-sim-recordings', `sandbox-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(dir, { recursive: true });
  const blank = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(blank) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'secret' || k === 'OTP' ? '[REDACTED]' : blank(x)]))
      : v;
  const rec = (name: string, req: unknown, res: { httpStatus: number; outcome: string; body: unknown }) =>
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ request: blank(req), httpStatus: res.httpStatus, outcome: res.outcome, body: blank(res.body) }, null, 2));
  const client = z.createZatcaClient('SANDBOX');
  const str = (b: unknown, k: string) => { const v = z.asRecord(b)[k]; return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''; };
  const show = (label: string, res: { httpStatus: number; outcome: string; body: unknown }) => {
    const s = z.summarizeValidation(res.body);
    console.log(`${label}: HTTP ${res.httpStatus} ${res.outcome} (status ${s.status ?? '-'}; ${s.errors} errors, ${s.warnings} warnings, ${s.infos} infos)`);
    for (const m of s.errorMessages) console.log(`    ERROR   ${m}`);
    for (const m of s.warningMessages) console.log(`    WARNING ${m}`);
    for (const m of s.infoMessages) console.log(`    INFO    ${m}`);
    if (!s.status && !s.errors) console.log(`    body: ${JSON.stringify(blank(res.body)).slice(0, 600)}`);
    return s;
  };

  const keys = z.generateKeyPair();
  const csr = z.buildCsr({
    ...keys,
    env: 'SANDBOX',
    commonName: 'Sandbox Check-EGS',
    serialNumber: '1-Fatoora|2-v2|3-00000000-0000-4000-8000-000000000001',
    vatNumber: SANDBOX_SELLER.vatNumber,
    orgUnit: 'Riyadh Branch',
    orgName: 'Sandbox Check Co',
    registeredAddress: '1234 King Fahd Road, Al Olaya, Riyadh',
    businessCategory: 'Retail',
  });
  const c = await client.requestComplianceCsid(otp, csr);
  rec('01-compliance', { csr }, c);
  console.log(`Raw recordings: ${dir}`);
  show('POST /compliance', c);
  const token = str(c.body, 'binarySecurityToken'), secret = str(c.body, 'secret'), requestId = str(c.body, 'requestID');
  if (c.outcome !== 'PASS' || !token || !secret) { console.log('STOP: no compliance CSID issued.'); process.exit(1); }
  const auth = { binarySecurityToken: token, secret };
  const build = (t: string) => z.buildComplianceDocuments({ seller: SANDBOX_SELLER, privateKeyPem: keys.privateKeyPem, certificatePem: z.certificateFromToken(t).pem, now: new Date() });

  let pass = true;
  for (const [i, d] of build(token).entries()) {
    const res = await client.checkCompliance(auth, d.payload);
    rec(`02-compliance-invoice-${i + 1}`, { ...d.payload, invoice: '<base64 xml>' }, res);
    writeFileSync(path.join(dir, `02-compliance-invoice-${i + 1}.xml`), d.signedXml);
    const s = show(d.label, res);
    pass &&= res.outcome === 'PASS' && s.errors === 0 && s.warnings === 0;
  }

  // Informational probes: the sandbox may not support these.
  console.log('--- informational: production CSID, reporting, clearance, duplicate ---');
  const p = await client.requestProductionCsid(auth, requestId);
  rec('03-production-csids', { compliance_request_id: requestId }, p);
  show('POST /production/csids', p);
  const pt = str(p.body, 'binarySecurityToken'), ps = str(p.body, 'secret');
  if (pt && ps) {
    const pauth = { binarySecurityToken: pt, secret: ps };
    const docs = build(pt);
    const r = await client.report(pauth, docs[1].payload);
    rec('04-reporting', { ...docs[1].payload, invoice: '<base64 xml>' }, r);
    show('reporting (simplified invoice)', r);
    const r2 = await client.report(pauth, docs[1].payload);
    rec('04b-reporting-duplicate', { ...docs[1].payload, invoice: '<base64 xml>' }, r2);
    show('reporting again (duplicate)', r2);
    const cl = await client.clear(pauth, docs[0].payload);
    rec('05-clearance', { ...docs[0].payload, invoice: '<base64 xml>' }, cl);
    show('clearance (standard invoice)', cl);
  } else console.log('No production CSID: reporting/clearance skipped.');

  console.log(pass ? 'PASS: 6/6 compliance documents, 0 errors, 0 warnings.' : 'FAIL: see the errors and warnings above.');
  process.exit(pass ? 0 : 1);
}

async function live() {
  const otp = value('otp');
  if (!otp || !/^\d{6}$/.test(otp)) usage('--otp must be exactly 6 digits.');
  assertLocalDatabase({ databaseUrl: process.env.DATABASE_URL, shadowUrl: process.env.SHADOW_DATABASE_URL, requireShadow: false });

  const { prisma } = await import('../src/lib/prisma');
  const { onboardingService } = await import('../src/server/zatca-onboarding/onboarding.service');
  const businessId = value('business-id');
  const business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId } })
    : await prisma.business.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!business) usage('No business found. Create one in /app/business first, or pass --business-id.');
  if (business!.zatcaEnvironment !== 'SIMULATION') usage('The business is set to PRODUCTION; switch it to SIMULATION first.');
  const existing = await prisma.egsUnit.findFirst({ where: { businessId: business!.id, environment: 'SIMULATION', status: { not: 'REVOKED' } } });
  if (existing) usage(`The business already has a Simulation EGS (${existing.status}). Use a business without one.`);

  const dir = path.join('tools', 'zatca-sim-recordings', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(dir, { recursive: true });
  let result;
  try {
    result = await onboardingService.onboard(business!.id, otp!, {
      stopAfterCompliance: true,
      recorder: (name, res) => {
        const body = res.body && typeof res.body === 'object' ? { ...(res.body as Record<string, unknown>) } : res.body;
        if (body && typeof body === 'object' && 'secret' in body) body.secret = '[REDACTED]';
        writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ httpStatus: res.httpStatus, outcome: res.outcome, body }, null, 2));
      },
    });
  } finally {
    // Throwaway: the compliance credentials are not kept.
    await prisma.egsUnit.deleteMany({ where: { businessId: business!.id, environment: 'SIMULATION', status: { not: 'ACTIVE' } } });
    await prisma.$disconnect();
  }

  console.log(`Business ${business!.nameEn} (VAT ${business!.vatNumber}), Simulation. Raw responses: ${dir}\n`);
  if (!result.results.length) console.log('No documents were sent (compliance CSID was not issued).');
  else {
    console.log('Document                       HTTP  Outcome   Errors  Warnings');
    for (const r of result.results) {
      console.log(`${r.label.padEnd(30)} ${String(r.httpStatus).padEnd(5)} ${r.outcome.padEnd(9)} ${String(r.errors).padEnd(7)} ${r.warnings}`);
      for (const m of r.messages) console.log(`    - ${m}`);
    }
  }
  for (const e of result.errors) console.log(`ERROR: ${e}`);
  const pass =
    result.results.length === 6 && result.results.every((r) => r.outcome === 'PASS' && r.errors === 0 && r.warnings === 0);
  console.log(pass ? '\nPASS: 6/6 documents, 0 errors, 0 warnings.' : '\nFAIL: see the errors and warnings above.');
  process.exit(pass ? 0 : 1);
}

(flag('sandbox') ? sandbox() : flag('dry-run') ? dryRun() : live()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
