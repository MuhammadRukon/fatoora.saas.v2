import { randomUUID } from 'node:crypto';
import type { Business, EgsStatus, EgsUnit } from '@prisma/client';

import { env } from '@/env';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/server/common/errors';
import { log } from '@/server/common/logger';
import {
  buildComplianceDocuments,
  buildCsr,
  certificateFromToken,
  certificateInfo,
  createZatcaClient,
  decrypt,
  encrypt,
  generateKeyPair,
  PIH_SEED,
  redactHeaders,
  summarizeValidation,
  type ZatcaAuth,
  type ZatcaOutcome,
  type ZatcaResponse,
} from '@/server/zatca';

export type OnboardOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Base64 32-byte key; defaults to env.ZATCA_ENCRYPTION_KEY. */
  encryptionKey?: string;
  /** Stop after the 6 compliance documents (no production CSID): used by the sim-check script. */
  stopAfterCompliance?: boolean;
  /** Receives every raw ZATCA response (name like "02-compliance-invoice-3"). */
  recorder?: (name: string, res: ZatcaResponse) => void;
};

export type OnboardResult = {
  /** The EGS status after the run. */
  status: EgsStatus;
  egsId: string;
  results: {
    label: string;
    httpStatus: number;
    outcome: ZatcaOutcome;
    infos: number;
    warnings: number;
    errors: number;
    messages: string[];
  }[];
  errors: string[];
};

const MAX_ERROR_CHARS = 2000;
/** A claimed onboarding older than this is considered dead (up to 8 ZATCA calls of 30 s each). */
const LEASE_MS = 5 * 60_000;
const field = (body: unknown, key: string): string | undefined => {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
};
const transient = (o: ZatcaOutcome) => o === 'SERVER_ERROR' || o === 'NETWORK_ERROR';
const errorTexts = (res: ZatcaResponse) => {
  const s = summarizeValidation(res.body);
  return s.errorMessages.length ? s.errorMessages : [`ZATCA responded HTTP ${res.httpStatus} (${res.outcome})`];
};

const sellerOf = (b: Business) => ({
  // Registration name in Arabic (legal name on the document). To be confirmed by the Simulation gate (AC6.4).
  name: b.nameAr,
  vatNumber: b.vatNumber,
  idScheme: b.sellerIdScheme === 'S700' ? '700' : b.sellerIdScheme,
  id: b.sellerIdValue,
  address: {
    street: b.street,
    buildingNumber: b.buildingNumber,
    additionalNumber: b.additionalNumber ?? undefined,
    district: b.district,
    city: b.city,
    postalCode: b.postalCode,
    countryCode: b.countryCode,
  },
});

export const onboardingService = {
  /** Status for the page: never any key material, tokens or secrets. */
  async getStatus(businessId: string) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { zatcaEnvironment: true } });
    if (!business) throw new NotFoundError('Business');
    const egs = await prisma.egsUnit.findFirst({
      where: { businessId, environment: business.zatcaEnvironment, status: { not: 'REVOKED' } },
      select: { status: true, serialNumber: true, certNotAfter: true, lastError: true },
    });
    return { environment: business.zatcaEnvironment, egs };
  },

  /**
   * Onboards the business's EGS in its current environment. Each stage is persisted before the next network call so
   * a crash leaves a resumable state: COMPLIANCE_ISSUED continues at the compliance documents with no new OTP.
   */
  async onboard(businessId: string, otp: string, opts: OnboardOptions = {}): Promise<OnboardResult> {
    const key = opts.encryptionKey ?? env.ZATCA_ENCRYPTION_KEY;
    const now = opts.now ?? new Date();
    // Businesses are complete by construction: every column the CSR and invoices need is NOT NULL.
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundError('Business');
    const environment = business.zatcaEnvironment;

    // Claim the unit: find-or-create plus the lease are atomic under a per-business advisory lock, and a second concurrent
    // run is refused (409) instead of overwriting the key. The network calls below run outside this transaction.
    const inProgress = () =>
      new ConflictError('An onboarding run is already in progress (ONBOARDING_IN_PROGRESS)', { code: 'ONBOARDING_IN_PROGRESS' });
    let egs = await prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${`onboard:${businessId}:${environment}`})) AS locked`;
      if (!locked) throw inProgress();
      const found = await tx.egsUnit.findFirst({ where: { businessId, environment, status: { not: 'REVOKED' } } });
      if (found?.status === 'ACTIVE') throw new ConflictError('This EGS unit is already onboarded');
      if (found?.onboardingSince && found.onboardingSince.getTime() > Date.now() - LEASE_MS) throw inProgress();
      const onboardingSince = new Date();
      return found
        ? tx.egsUnit.update({ where: { id: found.id }, data: { onboardingSince } })
        : tx.egsUnit.create({
            data: {
              businessId,
              environment,
              serialNumber: `1-Fatoora|2-v2|3-${randomUUID()}`,
              commonName: `${business.nameEn}-EGS`,
              onboardingSince,
            },
          });
    });
    const id = egs.id;
    const update = (data: Partial<EgsUnit>) => prisma.egsUnit.update({ where: { id }, data });

    const client = createZatcaClient(environment, opts.fetchImpl ?? fetch, {
      logger: (e) => log.info('zatca.request', { ...e, headers: redactHeaders(e.headers) }),
    });
    const results: OnboardResult['results'] = [];
    const finish = async (status: EgsStatus, errors: string[], persist = true): Promise<OnboardResult> => {
      const lastError = errors.length ? errors.join('\n').slice(0, MAX_ERROR_CHARS) : null;
      if (persist) await update({ status, lastError });
      return { status, egsId: id, results, errors };
    };
    const fail = (errors: string[]) => finish('FAILED', errors);

    try {
      // 1. Compliance CSID (new key + CSR + OTP). Skipped when resuming from COMPLIANCE_ISSUED.
      if (egs.status !== 'COMPLIANCE_ISSUED') {
        const { privateKeyPem, publicKeyPem } = generateKeyPair();
        const csr = buildCsr({
          privateKeyPem,
          publicKeyPem,
          env: environment,
          commonName: egs.commonName,
          serialNumber: egs.serialNumber,
          vatNumber: business.vatNumber,
          orgUnit: `${business.city} Branch`,
          orgName: business.nameEn,
          country: business.countryCode,
          functionalityMap: egs.functionalityMap,
          registeredAddress: `${business.buildingNumber} ${business.street}, ${business.district}, ${business.city}`,
          businessCategory: business.businessCategory,
        });
        await update({
          privateKeyEnc: encrypt(privateKeyPem, key),
          csrPem: Buffer.from(csr, 'base64').toString('utf8'),
          complianceRequestId: null,
          complianceCsidEnc: null,
          complianceSecretEnc: null,
          productionCsidEnc: null,
          productionSecretEnc: null,
          certificatePem: null,
          certNotAfter: null,
        });
        const res = await client.requestComplianceCsid(otp, csr);
        opts.recorder?.('01-compliance', res);
        const token = field(res.body, 'binarySecurityToken');
        const secret = field(res.body, 'secret');
        const requestId = field(res.body, 'requestID');
        if (res.outcome !== 'PASS' || !token || !secret || !requestId) {
          return fail(res.outcome === 'PASS' ? ['Unexpected response from ZATCA (missing credentials)'] : errorTexts(res));
        }
        egs = await update({
          complianceRequestId: requestId,
          complianceCsidEnc: encrypt(token, key),
          complianceSecretEnc: encrypt(secret, key),
          certificatePem: certificateFromToken(token).pem,
          status: 'COMPLIANCE_ISSUED',
          lastError: null,
        });
      }

      // 2. The 6 compliance documents, signed with the compliance certificate.
      const complianceAuth: ZatcaAuth = {
        binarySecurityToken: decrypt(egs.complianceCsidEnc!, key),
        secret: decrypt(egs.complianceSecretEnc!, key),
      };
      const docs = buildComplianceDocuments({
        seller: sellerOf(business),
        privateKeyPem: decrypt(egs.privateKeyEnc!, key),
        certificatePem: egs.certificatePem!,
        now,
      });
      const failures: string[] = [];
      let retryable = true;
      for (const [i, doc] of docs.entries()) {
        const res = await client.checkCompliance(complianceAuth, doc.payload);
        opts.recorder?.(`02-compliance-invoice-${i + 1}`, res);
        const s = summarizeValidation(res.body);
        results.push({
          label: doc.label,
          httpStatus: res.httpStatus,
          outcome: res.outcome,
          infos: s.infos,
          warnings: s.warnings,
          errors: s.errors,
          messages: [...s.errorMessages, ...s.warningMessages],
        });
        if ((res.outcome !== 'PASS' && res.outcome !== 'WARNING') || s.errors > 0) {
          retryable &&= transient(res.outcome);
          failures.push(...errorTexts(res).map((m) => `${doc.label}: ${m}`));
        }
      }
      if (failures.length) {
        // Only transport failures are worth retrying with the same credentials; a rejection needs a new OTP.
        return retryable ? finish('COMPLIANCE_ISSUED', failures) : fail(failures);
      }
      if (opts.stopAfterCompliance) return finish('COMPLIANCE_ISSUED', [], false);

      // 3. Production CSID.
      const res = await client.requestProductionCsid(complianceAuth, egs.complianceRequestId!);
      opts.recorder?.('03-production-csids', res);
      const token = field(res.body, 'binarySecurityToken');
      const secret = field(res.body, 'secret');
      if (res.outcome !== 'PASS' || !token || !secret) {
        const errors = res.outcome === 'PASS' ? ['Unexpected response from ZATCA (missing credentials)'] : errorTexts(res);
        return transient(res.outcome) ? finish('COMPLIANCE_ISSUED', errors) : fail(errors);
      }
      const { pem } = certificateFromToken(token);
      await update({
        productionCsidEnc: encrypt(token, key),
        productionSecretEnc: encrypt(secret, key),
        certificatePem: pem,
        certNotAfter: certificateInfo(pem).notAfter,
        // The compliance documents are not part of the real chain.
        lastIcv: 0,
        lastInvoiceHash: PIH_SEED,
        status: 'ACTIVE',
        lastError: null,
      });
      return { status: 'ACTIVE', egsId: id, results, errors: [] };
    } catch (err) {
      log.error('zatca.onboard_failed', { businessId, error: err instanceof Error ? err.message : String(err) });
      await update({ status: 'FAILED', lastError: 'Onboarding failed unexpectedly; request a new OTP and try again' });
      throw err;
    } finally {
      await prisma.egsUnit.updateMany({ where: { id }, data: { onboardingSince: null } });
    }
  },
};
